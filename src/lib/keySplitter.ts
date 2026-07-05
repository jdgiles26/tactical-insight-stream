/**
 * Key-Splitting Pipeline — True Hot Key Detection
 *
 * Classifies incoming data products into "hot keys" (critical intelligence
 * requiring fast-path processing) vs "cold keys" (bulk data for normal
 * processing pipelines).
 */

import type { Database } from "@/integrations/supabase/types";
import type { Detection } from "@/lib/streamTypes";

type DataProduct = Database["public"]["Tables"]["data_products"]["Row"];
type CommanderIntent = Database["public"]["Tables"]["commander_intents"]["Row"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HotKeyReason =
  | "emergency_trigger"
  | "commander_intent_match"
  | "high_confidence_threat"
  | "critical_entity_detected"
  | "flash_traffic";

export interface KeySplitResult {
  is_hot_key: boolean;
  hot_key_reason: HotKeyReason | null;
  fast_path_stage: string | null;
  cold_key_deferral_minutes: number;
  priority_boost: number;
  classification_confidence: number;
}

export interface HotKeyStats {
  total_classified: number;
  hot_keys: number;
  cold_keys: number;
  hot_key_rate: number;
  by_reason: Record<string, number>;
}

interface HotKeyRecord {
  product_id: string;
  title: string;
  reason: HotKeyReason;
  fast_path_stage: string | null;
  classified_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMERGENCY_TERMS = [
  "emergency",
  "mayday",
  "sos",
  "evacuate",
  "mass casualty",
  "troops in contact",
  "tic",
  "broken arrow",
];

const THREAT_INDICATORS = [
  "weapon",
  "hostile",
  "attack",
  "missile",
  "ambush",
  "ied",
  "explosion",
  "sniper",
  "torpedo",
  "bomb",
  "mine",
  "chemical",
  "biological",
  "nuclear",
  "radiological",
];

/**
 * Alias expansion map: when a commander intent uses one of these terms,
 * we also match against the aliases.
 */
const ALIAS_MAP: Record<string, string[]> = {
  vessel: ["boat", "ship", "craft", "barge", "tanker", "freighter", "yacht"],
  weapon: ["gun", "missile", "ordnance", "munition", "rifle", "launcher", "mortar"],
  aircraft: ["plane", "jet", "helicopter", "drone", "uav", "rotary"],
  vehicle: ["truck", "car", "humvee", "tank", "apc", "convoy"],
  personnel: ["person", "combatant", "soldier", "fighter", "operative", "individual"],
  submarine: ["sub", "u-boat", "undersea"],
  radar: ["emitter", "signal", "transmission"],
};

const FAST_PATH_MAP: Record<HotKeyReason, string> = {
  emergency_trigger: "alert_dissemination",
  commander_intent_match: "intent_correlation",
  high_confidence_threat: "threat_assessment",
  critical_entity_detected: "entity_extraction",
  flash_traffic: "immediate_relay",
};

// ---------------------------------------------------------------------------
// KeySplitter
// ---------------------------------------------------------------------------

export class KeySplitter {
  private hotCount = 0;
  private coldCount = 0;
  private reasonCounts: Record<string, number> = {};
  private recentHotKeys: HotKeyRecord[] = [];

  /**
   * Classify a data product as hot or cold key.
   *
   * @param product    The data product to classify
   * @param detections Optional detection results associated with the product
   * @param intents    Optional list of active commander intents
   */
  classify(
    product: DataProduct,
    detections?: Detection[],
    intents?: CommanderIntent[]
  ): KeySplitResult {
    const contentText = this.extractContentText(product).toLowerCase();
    const priority = product.priority ?? "routine";
    const score = product.priority_score ?? 0;
    const sourceType = product.source_type;

    // Collect all detection labels (lower-cased)
    const detectionLabels = (detections ?? []).map((d) =>
      d.label.toLowerCase()
    );

    // Active intents only
    const activeIntents = (intents ?? []).filter((i) => i.is_active);

    // ------------------------------------------------------------------
    // Hot key checks (ordered by severity)
    // ------------------------------------------------------------------

    // 1. Emergency detected in content
    for (const term of EMERGENCY_TERMS) {
      if (contentText.includes(term)) {
        return this.buildHot(product, "emergency_trigger", 0.95, 0.5);
      }
    }

    // 2. Flash traffic (sigint source or content mention)
    if (
      sourceType === "sigint" ||
      contentText.includes("flash traffic")
    ) {
      return this.buildHot(product, "flash_traffic", 0.88, 0.4);
    }

    // 3. Commander's intent match (semantic)
    for (const intent of activeIntents) {
      if (this.matchesIntent(intent.term, contentText, detectionLabels)) {
        return this.buildHot(product, "commander_intent_match", 0.90, 0.45);
      }
    }

    // 4. Critical priority with high confidence score
    if (priority === "critical" && score > 0.9) {
      return this.buildHot(product, "high_confidence_threat", 0.92, 0.35);
    }

    // 5. Threat indicators in content
    for (const indicator of THREAT_INDICATORS) {
      if (contentText.includes(indicator)) {
        return this.buildHot(product, "critical_entity_detected", 0.78, 0.25);
      }
    }

    // ------------------------------------------------------------------
    // Cold key
    // ------------------------------------------------------------------
    return this.buildCold(priority);
  }

  // ---- Stats -------------------------------------------------------------

  getHotKeyStats(): HotKeyStats {
    const total = this.hotCount + this.coldCount;
    return {
      total_classified: total,
      hot_keys: this.hotCount,
      cold_keys: this.coldCount,
      hot_key_rate: total > 0 ? Math.round((this.hotCount / total) * 1000) / 1000 : 0,
      by_reason: { ...this.reasonCounts },
    };
  }

  getRecentHotKeys(limit = 20): HotKeyRecord[] {
    return this.recentHotKeys.slice(-limit).reverse();
  }

  // ---- Internal ----------------------------------------------------------

  private buildHot(
    product: DataProduct,
    reason: HotKeyReason,
    confidence: number,
    boost: number
  ): KeySplitResult {
    this.hotCount++;
    this.reasonCounts[reason] = (this.reasonCounts[reason] || 0) + 1;
    this.recentHotKeys.push({
      product_id: product.id,
      title: product.title,
      reason,
      fast_path_stage: FAST_PATH_MAP[reason],
      classified_at: new Date().toISOString(),
    });
    // Keep a bounded history
    if (this.recentHotKeys.length > 500) {
      this.recentHotKeys = this.recentHotKeys.slice(-500);
    }

    return {
      is_hot_key: true,
      hot_key_reason: reason,
      fast_path_stage: FAST_PATH_MAP[reason],
      cold_key_deferral_minutes: 0,
      priority_boost: boost,
      classification_confidence: confidence,
    };
  }

  private buildCold(
    priority: string
  ): KeySplitResult {
    this.coldCount++;

    let deferral: number;
    if (priority === "low" || priority === "routine") {
      // Defer 5–15 minutes
      deferral = 5 + Math.floor(Math.random() * 11);
    } else if (priority === "medium") {
      // Defer 0–2 minutes
      deferral = Math.round(Math.random() * 2 * 10) / 10;
    } else {
      deferral = 0;
    }

    return {
      is_hot_key: false,
      hot_key_reason: null,
      fast_path_stage: null,
      cold_key_deferral_minutes: deferral,
      priority_boost: 0,
      classification_confidence: 0.6 + Math.random() * 0.2,
    };
  }

  /**
   * Semantic matching for commander's intent.
   *
   * Checks:
   *  1. Direct substring match in content
   *  2. Alias expansion (e.g. "vessel" also matches "boat", "ship")
   *  3. Detection label matches
   */
  private matchesIntent(
    intentTerm: string,
    contentText: string,
    detectionLabels: string[]
  ): boolean {
    const term = intentTerm.toLowerCase().trim();

    // 1. Direct match in content
    if (contentText.includes(term)) return true;

    // 2. Check detection labels for direct match
    for (const label of detectionLabels) {
      if (label.includes(term) || term.includes(label)) return true;
    }

    // 3. Alias expansion
    const aliases = this.expandAliases(term);
    for (const alias of aliases) {
      if (contentText.includes(alias)) return true;
      for (const label of detectionLabels) {
        if (label.includes(alias) || alias.includes(label)) return true;
      }
    }

    return false;
  }

  /**
   * Expand a term to its aliases. Works bidirectionally:
   * - If the term is a key in ALIAS_MAP, return all its aliases.
   * - If the term appears as a value, return the key + sibling aliases.
   */
  private expandAliases(term: string): string[] {
    const result: string[] = [];

    // Term is a canonical key
    if (ALIAS_MAP[term]) {
      result.push(...ALIAS_MAP[term]);
    }

    // Term appears as an alias value
    for (const [canonical, aliases] of Object.entries(ALIAS_MAP)) {
      if (aliases.includes(term)) {
        result.push(canonical);
        result.push(...aliases.filter((a) => a !== term));
      }
    }

    return result;
  }

  private extractContentText(product: DataProduct): string {
    if (!product.content) return product.title ?? "";
    const c = product.content as Record<string, unknown>;
    return (
      (c.description as string) ||
      (c.text as string) ||
      (c.summary as string) ||
      (product.title ?? "")
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const keySplitter = new KeySplitter();
