import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HuggingFace Inference API base URL
const HF_API = "https://api-inference.huggingface.co/models";

// NLP model cascade — strongest first, fallback to lighter models
const NLP_MODELS = {
  ner: [
    "dslim/bert-large-NER",          // BERT large NER (strongest)
    "dslim/bert-base-NER",           // BERT base NER
    "dbmdz/bert-large-cased-finetuned-conll03-english", // CoNLL-trained BERT
  ],
  classification: [
    "cross-encoder/nli-deberta-v3-base",   // DeBERTa-v3 zero-shot (strongest)
    "facebook/bart-large-mnli",            // BART zero-shot
    "typeform/distilbert-base-uncased-mnli", // DistilBERT fallback
  ],
  sentiment: [
    "cardiffnlp/twitter-roberta-base-sentiment-latest", // Urgency/crisis sentiment
    "distilbert-base-uncased-finetuned-sst-2-english",  // DistilBERT fallback
  ],
  similarity: [
    "sentence-transformers/all-MiniLM-L6-v2",  // Fast sentence embeddings
  ],
};

// Maritime / tactical entity labels for zero-shot classification
const ENTITY_LABELS = [
  "vessel_name", "port_of_origin", "cargo_manifest", "crew_roster",
  "maritime_document", "official_stamp", "military_order", "intelligence_report",
  "coordinates", "threat_indicator", "weapon_system", "personnel_identifier",
  "organisation", "date_time_group", "mission_reference",
];

// Emergency trigger categories and their detection patterns
const EMERGENCY_PATTERNS: Array<[RegExp, string, number]> = [
  [/\b(mayday|pan-?pan|sos|distress|man overboard|emergency|help!)/i, "mayday", 0.95],
  [/\b(opord|operation order|fragmentary order|frago|warning order|warnord)\b/i, "opord", 0.90],
  [/\b(earthquake|hurricane|tornado|flood|tsunami|wildfire|eruption|disaster)\b/i, "disaster", 0.88],
  [/\b(illegal (fishing|activity|offload|trafficking)|poaching|smuggling|contraband)\b/i, "illegal", 0.87],
  [/\b(injured|casualty|casualties|wounded|medical emergency|mass casualty)\b/i, "injury", 0.86],
  [/\b(national (alert|emergency)|civil emergency|amber alert|silver alert|evacuation order)\b/i, "national_alert", 0.85],
  [/\b(hostile|enemy|threat|attack|imminent|critical incident|security breach)\b/i, "opord", 0.80],
];

// ──────────────────────────────────────────────────────────────────────────────
// HuggingFace API caller with model cascade fallback
// ──────────────────────────────────────────────────────────────────────────────
async function callHuggingFace(
  apiKey: string,
  models: string[],
  payload: Record<string, unknown>
): Promise<{ model: string; result: unknown } | null> {
  for (const model of models) {
    try {
      const res = await fetch(`${HF_API}/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 503) {
        // Model is loading — skip to next
        console.warn(`Model ${model} is loading, trying next in cascade`);
        continue;
      }
      if (!res.ok) {
        console.warn(`Model ${model} returned ${res.status}, trying next`);
        continue;
      }

      const result = await res.json();
      return { model, result };
    } catch (err) {
      console.warn(`Model ${model} call failed:`, err);
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Emergency Detection: rule-based pattern matching
// Returns the detected trigger type and confidence, or null
// ──────────────────────────────────────────────────────────────────────────────
function detectEmergencyType(
  text: string
): { trigger_type: string; confidence: number } | null {
  let best: { trigger_type: string; confidence: number } | null = null;
  for (const [pattern, type, confidence] of EMERGENCY_PATTERNS) {
    if (pattern.test(text)) {
      if (!best || confidence > best.confidence) {
        best = { trigger_type: type, confidence };
      }
    }
  }
  return best;
}

// ──────────────────────────────────────────────────────────────────────────────
// Sentiment Analysis via HuggingFace (Cardiff NLP twitter-roberta)
// Returns a 0–1 urgency score (0=neutral/positive, 1=critical/negative)
// ──────────────────────────────────────────────────────────────────────────────
async function runSentimentAnalysis(
  apiKey: string,
  text: string
): Promise<{ urgency_score: number; label: string }> {
  if (!apiKey) return { urgency_score: 0, label: "NEUTRAL" };
  const response = await callHuggingFace(apiKey, NLP_MODELS.sentiment, { inputs: text.slice(0, 512) });
  if (!response) return { urgency_score: 0, label: "NEUTRAL" };

  const results = Array.isArray(response.result) ? response.result as any[] : [];
  // Twitter-RoBERTa returns [{label: "LABEL_0/1/2", score}]  0=negative, 1=neutral, 2=positive
  // Some models return named labels ("negative", "neutral", "positive") directly
  const flat = results.flat ? results.flat() : results;
  // Match any negative/urgency label regardless of format
  const negEntry = flat.find((r: any) =>
    r.label === "LABEL_0" ||
    r.label === "negative" ||
    r.label?.toLowerCase()?.includes("neg") ||
    r.label === "NEGATIVE"
  );
  const urgency_score = negEntry ? Math.round(negEntry.score * 1000) / 1000 : 0;
  return { urgency_score, label: negEntry ? "NEGATIVE" : "NEUTRAL" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Key Element Extraction: heuristic extraction of mission-critical metadata
// Supplements BERT NER with tactical-domain patterns
// ──────────────────────────────────────────────────────────────────────────────
function extractKeyElements(text: string): Record<string, string> {
  const elements: Record<string, string> = {};

  // Location / sector
  const locMatch = text.match(/\b(sector\s+\w+|grid\s+[A-Z0-9]+|zone\s+\w+|reef\s+\w+|port\s+\w+|grid\s+ref\w*)\b/i);
  if (locMatch) elements.location = locMatch[0];

  // Target vehicle / vessel / object
  const vehicleMatch = text.match(/\b((?:rusty|blue|red|white|black|grey|gray|green)\s+(?:trawler|vessel|boat|truck|vehicle|craft|ship))\b/i);
  if (vehicleMatch) elements.target_vehicle = vehicleMatch[0];

  // Event type
  const eventMatch = text.match(/\b(illegal\s+\w+|offload|interdiction|attack|incursion|evacuation|rescue|intercept)\b/i);
  if (eventMatch) elements.event = eventMatch[0];

  // Time references
  const timeMatch = text.match(/\b(\d{4}Z|\d{2}:\d{2}\s*(UTC|local|Z)?|(\d+)\s*hours?\s*(ago|from now)?)\b/i);
  if (timeMatch) elements.time_ref = timeMatch[0];

  // Commander's intent (look for explicit intent statements)
  const intentMatch = text.match(/(?:commander(?:'s)?\s+intent|mission\s+objective|task(?:ing)?)[:\s]+([^.!?\n]{10,120})/i);
  if (intentMatch) elements.commander_intent = intentMatch[1].trim();

  // Named person
  const personMatch = text.match(/\b(?:Col|Capt|Lt|Sgt|Cdr|Admiral|General|LCDR|CPT)\s+[A-Z][a-z]+\b/);
  if (personMatch) elements.personnel = personMatch[0];

  return elements;
}

// ──────────────────────────────────────────────────────────────────────────────
// Retrospective Correlation: search silent_object_registry for label matches
// Returns list of registry entries matching trigger key elements
// ──────────────────────────────────────────────────────────────────────────────
async function findRetroMatches(
  supabase: ReturnType<typeof createClient>,
  keyElements: Record<string, string>,
  nerEntities: Array<{ label: string; raw_entity?: string }>
): Promise<Array<{ id: string; label: string; confidence: number; data_product_id: string | null; last_seen_at: string }>> {
  // Build search terms from key elements + NER entities
  const terms = new Set<string>();
  Object.values(keyElements).forEach((v) => {
    v.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2).forEach((t) => terms.add(t));
  });
  nerEntities.forEach((e) => {
    if (e.raw_entity && e.raw_entity.length > 2) terms.add(e.raw_entity.toLowerCase());
  });

  if (terms.size === 0) return [];

  // Query registry for labels matching any term
  const lookback = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // 72h
  const { data: registryEntries } = await supabase
    .from("silent_object_registry")
    .select("id, label, confidence, data_product_id, last_seen_at")
    .gte("last_seen_at", lookback)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (!registryEntries) return [];

  // Filter by term overlap
  return (registryEntries as any[]).filter((entry) => {
    const entryLabel = entry.label.toLowerCase().replace(/_/g, " ");
    return [...terms].some((t) => entryLabel.includes(t) || t.includes(entryLabel.split(" ")[0]));
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Build predictive assessment for a correlation group
// ──────────────────────────────────────────────────────────────────────────────
function buildDocPrediction(
  triggerType: string,
  keyElements: Record<string, string>,
  matchCount: number
): Record<string, string> {
  const riskPct = Math.min(95, 50 + matchCount * 10);
  return {
    risk: `${riskPct}% probability of continued activity based on ${matchCount} correlated detection(s)`,
    trajectory: keyElements.location
      ? `Activity centered near ${keyElements.location} — monitor for movement`
      : "Monitor for geographic movement pattern changes",
    recommended_action: triggerType === "mayday" || triggerType === "injury"
      ? "IMMEDIATE: Dispatch response. Confirm last known position."
      : triggerType === "illegal"
      ? "INTERCEPT: Coordinate with enforcement. Track vessel heading."
      : triggerType === "opord"
      ? "EXECUTE: Engage per OPORD. Update commander's intent."
      : "ESCALATE: Notify command. Increase sensor coverage.",
    eta_note: keyElements.time_ref
      ? `Time reference detected: ${keyElements.time_ref}`
      : "No ETA data — continue monitoring",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Extract text snippet from the file content or product metadata
// ──────────────────────────────────────────────────────────────────────────────
async function extractTextFromProduct(
  supabase: ReturnType<typeof createClient>,
  data_product_id: string,
  file_path: string
): Promise<string> {
  // Try to get content stored in data_products
  const { data: product } = await supabase
    .from("data_products")
    .select("title, content")
    .eq("id", data_product_id)
    .single();

  const parts: string[] = [];
  if (product?.title) parts.push(product.title);
  if (product?.content?.description) parts.push(product.content.description);
  if (product?.content?.summary) parts.push(product.content.summary);
  if (product?.content?.text) parts.push(product.content.text);

  // Use file_path as fallback context
  if (parts.length === 0) {
    parts.push(file_path.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, ""));
  }

  return parts.join(". ").slice(0, 2048); // HuggingFace API accepts up to 512 tokens; 2048 chars is a safe upper bound
}

// ──────────────────────────────────────────────────────────────────────────────
// Run NER (Named Entity Recognition) via BERT models
// ──────────────────────────────────────────────────────────────────────────────
async function runNER(
  apiKey: string,
  text: string
): Promise<Array<{ label: string; confidence: number; detector_type: string; raw_entity?: string }>> {
  const response = await callHuggingFace(apiKey, NLP_MODELS.ner, { inputs: text });
  if (!response) return [];

  const entities: Array<{ label: string; confidence: number; detector_type: string; raw_entity?: string }> = [];
  const seen = new Set<string>();

  const rawEntities = Array.isArray(response.result) ? response.result as any[] : [];
  for (const ent of rawEntities) {
    // BERT NER returns {entity_group, score, word, start, end}
    const entityGroup = ent.entity_group || ent.entity || "MISC";
    const word = ent.word || "";
    const score = ent.score || 0.5;

    // Map standard NER tags to tactical labels
    const labelMap: Record<string, string> = {
      "PER": "personnel_identifier",
      "ORG": "organisation",
      "LOC": "port_of_origin",
      "MISC": "mission_reference",
    };
    const mappedLabel = labelMap[entityGroup] || entityGroup.toLowerCase();

    const key = `${mappedLabel}:${word}`;
    if (!seen.has(key) && score > 0.5) {
      seen.add(key);
      entities.push({
        label: mappedLabel,
        confidence: Math.round(score * 1000) / 1000,
        detector_type: `bert_ner:${response.model}`,
        raw_entity: word,
      });
    }
  }

  return entities;
}

// ──────────────────────────────────────────────────────────────────────────────
// Run zero-shot classification via DeBERTa / BART
// ──────────────────────────────────────────────────────────────────────────────
async function runZeroShot(
  apiKey: string,
  text: string
): Promise<Array<{ label: string; confidence: number; detector_type: string }>> {
  const response = await callHuggingFace(apiKey, NLP_MODELS.classification, {
    inputs: text,
    parameters: {
      candidate_labels: ENTITY_LABELS,
      multi_label: true,
    },
  });
  if (!response) return [];

  const detections: Array<{ label: string; confidence: number; detector_type: string }> = [];
  const res = response.result as any;

  // DeBERTa/BART returns {labels: string[], scores: number[]}
  const labels: string[] = res.labels || [];
  const scores: number[] = res.scores || [];

  for (let i = 0; i < labels.length; i++) {
    if (scores[i] > 0.4) {
      detections.push({
        label: labels[i],
        confidence: Math.round(scores[i] * 1000) / 1000,
        detector_type: `deberta_zeroshot:${response.model}`,
      });
    }
  }

  // Return top 6 by confidence
  return detections.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

// ──────────────────────────────────────────────────────────────────────────────
// Rule-based fallback extraction (no API key required)
// ──────────────────────────────────────────────────────────────────────────────
function ruleBasedExtraction(
  text: string,
  filePath: string
): Array<{ label: string; confidence: number; detector_type: string }> {
  const lowerText = (text + " " + filePath).toLowerCase();
  const detections: Array<{ label: string; confidence: number; detector_type: string }> = [];

  const patterns: Array<[RegExp, string, number]> = [
    [/vessel|ship|boat|craft|tanker|frigate|destroyer|carrier/i, "vessel_name", 0.82],
    [/port|harbor|harbour|anchorage|berth|pier|dock/i, "port_of_origin", 0.78],
    [/cargo|manifest|freight|load|tonnage|container/i, "cargo_manifest", 0.75],
    [/crew|personnel|sailor|officer|captain|admiral/i, "crew_roster", 0.72],
    [/official|stamp|seal|certified|signed|authoris/i, "official_stamp", 0.68],
    [/intel|intelligence|classified|report|assessment|analysis/i, "intelligence_report", 0.80],
    [/coordinates|latitude|longitude|position|gps|location/i, "coordinates", 0.85],
    [/threat|hostile|enemy|warning|alert|danger/i, "threat_indicator", 0.88],
    [/weapon|missile|gun|torpedo|ordnance|munition/i, "weapon_system", 0.84],
    [/order|command|directive|mission|objective|task/i, "military_order", 0.76],
  ];

  for (const [regex, label, conf] of patterns) {
    if (regex.test(lowerText)) {
      detections.push({ label, confidence: conf, detector_type: "rule_based" });
    }
  }

  // Always include a document type classification
  if (/\.pdf$/i.test(filePath) || /document|report|manifest/i.test(lowerText)) {
    detections.push({ label: "maritime_document", confidence: 0.91, detector_type: "rule_based" });
  }

  return detections;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data_product_id, file_path } = await req.json();

    if (!data_product_id || !file_path) {
      return new Response(
        JSON.stringify({ error: "Missing data_product_id or file_path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("data_products")
      .update({ status: "processing" })
      .eq("id", data_product_id);

    await supabase.from("processing_queue").insert({
      data_product_id,
      step: "document_analysis",
      status: "processing",
      started_at: new Date().toISOString(),
    });

    // ──────────────────────────────────────────────────────────────
    // AI/ML Model Selection and Inference
    // Priority: DeBERTa/BERT (via HuggingFace API) → rule-based fallback
    // ──────────────────────────────────────────────────────────────
    const hfApiKey = Deno.env.get("HUGGINGFACE_API_KEY") || "";
    const hasApiKey = hfApiKey.length > 0;

    const documentText = await extractTextFromProduct(supabase, data_product_id, file_path);

    let allDetections: Array<{
      label: string;
      confidence: number;
      detector_type: string;
      raw_entity?: string;
    }> = [];

    let modelsUsed: string[] = [];

    if (hasApiKey) {
      // Run NER with BERT model cascade
      const nerResults = await runNER(hfApiKey, documentText);
      if (nerResults.length > 0) {
        allDetections.push(...nerResults);
        modelsUsed.push("bert_ner");
      }

      // Run zero-shot classification with DeBERTa / BART cascade
      const classResults = await runZeroShot(hfApiKey, documentText);
      if (classResults.length > 0) {
        allDetections.push(...classResults);
        modelsUsed.push("deberta_zeroshot");
      }
    }

    // Always supplement / fallback with rule-based extraction
    const ruleResults = ruleBasedExtraction(documentText, file_path);
    // Merge: only add rule-based results not already found by ML models
    const existingLabels = new Set(allDetections.map((d) => d.label));
    for (const r of ruleResults) {
      if (!existingLabels.has(r.label)) {
        allDetections.push(r);
        existingLabels.add(r.label);
      }
    }
    if (!hasApiKey || modelsUsed.length === 0) {
      modelsUsed.push("rule_based");
    }

    // Sort by confidence descending
    allDetections.sort((a, b) => b.confidence - a.confidence);

    // Insert detection results
    for (const det of allDetections) {
      await supabase.from("detection_results").insert({
        data_product_id,
        detector_type: det.detector_type,
        label: det.label,
        confidence: det.confidence,
        metadata: {
          file_path,
          raw_entity: det.raw_entity ?? null,
          models_used: modelsUsed,
          api_powered: hasApiKey,
        },
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Commander's Intent correlation
    // ──────────────────────────────────────────────────────────────
    const { data: intents } = await supabase
      .from("commander_intents")
      .select("*")
      .eq("is_active", true);

    const alerts: any[] = [];
    if (intents) {
      for (const intent of intents) {
        const term = intent.term.toLowerCase();
        for (const det of allDetections) {
          const label = det.label.toLowerCase().replace(/_/g, " ");
          const rawEnt = (det.raw_entity || "").toLowerCase();
          const matchLabel = label.includes(term) || term.includes(label) || tokenOverlap(term, label);
          const matchRaw = rawEnt.length > 2 && (rawEnt.includes(term) || term.includes(rawEnt));
          if (matchLabel || matchRaw) {
            alerts.push({
              intent_id: intent.id,
              data_product_id,
              match_type: label === term ? "exact" : "related",
              match_score: det.confidence,
              matched_term: intent.term,
              matched_label: det.label,
            });
          }
        }
      }
    }

    if (alerts.length > 0) {
      await supabase.from("correlation_alerts").insert(alerts);
    }

    // ──────────────────────────────────────────────────────────────
    // EMERGENCY DETECTION & MISSION INTELLIGENCE ENGINE
    // 1. Detect emergency type via pattern matching + sentiment NLP
    // 2. Extract key mission elements (location, target, event, etc.)
    // 3. If emergency: create emergency_trigger, update commanders intent
    // 4. Retrospective correlation: scan silent_object_registry
    // 5. Build mission_groups with paired evidence + predictions
    // ──────────────────────────────────────────────────────────────
    const emergencyResult = detectEmergencyType(documentText);
    const nerEntitiesForRetro = allDetections.filter((d) => d.raw_entity);
    let emergencyTriggerId: string | null = null;
    let missionGroupsCreated = 0;

    if (emergencyResult) {
      // Run sentiment analysis to measure urgency (supplements rule-based detection)
      const sentiment = await runSentimentAnalysis(hfApiKey, documentText);
      const urgencyScore = Math.max(emergencyResult.confidence, sentiment.urgency_score);
      const urgencyLevel =
        urgencyScore >= 0.9 ? "critical" :
        urgencyScore >= 0.75 ? "high" :
        urgencyScore >= 0.5 ? "medium" : "low";

      // Extract key mission metadata elements
      const keyElements = extractKeyElements(documentText);
      // Supplement with top NER entities
      for (const det of allDetections.slice(0, 5)) {
        if (det.raw_entity && !Object.values(keyElements).includes(det.raw_entity)) {
          keyElements[det.label] = det.raw_entity;
        }
      }

      const commanderIntent =
        keyElements.commander_intent ||
        `${emergencyResult.trigger_type.toUpperCase()}: ${keyElements.event || "Emergency event"} at ${keyElements.location || "unknown location"}`;

      // Create emergency trigger record
      const { data: triggerRow } = await supabase
        .from("emergency_triggers")
        .insert({
          data_product_id,
          trigger_type: emergencyResult.trigger_type,
          sentiment_score: urgencyScore,
          urgency_level: urgencyLevel,
          key_elements: keyElements,
          commander_intent: commanderIntent,
          is_active: true,
          raw_text_excerpt: documentText.slice(0, 500),
        } as any)
        .select("id")
        .single();

      emergencyTriggerId = triggerRow?.id ?? null;

      // Elevate this document's priority in data_products
      const priorityMap: Record<string, string> = {
        critical: "critical", high: "critical", medium: "high", low: "high",
      };
      await supabase
        .from("data_products")
        .update({
          priority: priorityMap[urgencyLevel] as any,
          priority_score: urgencyScore,
          priority_reasoning: `Emergency type: ${emergencyResult.trigger_type}. Commander's intent: ${commanderIntent}`,
        })
        .eq("id", data_product_id);

      // Retrospective correlation: scan 72h of silent object registry
      if (emergencyTriggerId) {
        const retroMatches = await findRetroMatches(supabase, keyElements, nerEntitiesForRetro);

        if (retroMatches.length > 0) {
          // Group matches by label to create cohesive mission groups
          const grouped: Record<string, typeof retroMatches> = {};
          for (const match of retroMatches) {
            if (!grouped[match.label]) grouped[match.label] = [];
            grouped[match.label].push(match);
          }

          for (const [matchLabel, matches] of Object.entries(grouped)) {
            const topMatch = matches[0];
            const prediction = buildDocPrediction(emergencyResult.trigger_type, keyElements, matches.length);
            const { data: newGroup } = await supabase
              .from("mission_groups")
              .insert({
                group_name: `${emergencyResult.trigger_type.toUpperCase()}: ${matchLabel.replace(/_/g, " ")} — ${matches.length} detection(s)`,
                trigger_id: emergencyTriggerId,
                confidence: topMatch.confidence > 0.8 ? "High" : topMatch.confidence > 0.6 ? "Medium" : "Low",
                risk_level: urgencyLevel === "critical" ? "Critical" : urgencyLevel === "high" ? "High" : "Medium",
                correlation_method: "keyword+bert+retro",
                summary: `Retrospective match: ${matchLabel.replace(/_/g, " ")} was detected ${matches.length} time(s) in the last 72h. Emergency trigger: ${commanderIntent}.`,
                prediction,
                metadata: {
                  trigger_type: emergencyResult.trigger_type,
                  urgency_level: urgencyLevel,
                  key_elements: keyElements,
                  match_count: matches.length,
                },
              } as any)
              .select("id")
              .single();

            if (newGroup?.id) {
              missionGroupsCreated++;

              // Add trigger document as evidence
              await supabase.from("group_evidence").insert({
                group_id: newGroup.id,
                evidence_type: "document",
                data_product_id,
                description: `Emergency trigger document (${emergencyResult.trigger_type}): ${commanderIntent}`,
                timestamp_ref: new Date().toISOString(),
                metadata: { key_elements: keyElements, urgency_score: urgencyScore },
              } as any);

              // Add each matched registry entry as evidence
              for (const match of matches.slice(0, 10)) {
                await supabase.from("group_evidence").insert({
                  group_id: newGroup.id,
                  evidence_type: "yolo_detection",
                  data_product_id: match.data_product_id ?? null,
                  registry_entry_id: match.id,
                  description: `${matchLabel.replace(/_/g, " ")} last seen ${new Date(match.last_seen_at).toLocaleString()}`,
                  timestamp_ref: match.last_seen_at,
                  metadata: { label: match.label, confidence: match.confidence },
                } as any);

                // Mark registry entry as matched
                await supabase
                  .from("silent_object_registry")
                  .update({ is_matched: true } as any)
                  .eq("id", match.id);
              }
            }
          }
        }

        // Also auto-create commander's intent entries for the key elements
        for (const [elemKey, elemValue] of Object.entries(keyElements)) {
          if (elemKey === "commander_intent" || !elemValue) continue;
          const { data: existingIntent } = await supabase
            .from("commander_intents")
            .select("id")
            .ilike("term", elemValue.slice(0, 50))
            .maybeSingle();
          if (!existingIntent) {
            await supabase.from("commander_intents").insert({
              term: elemValue.slice(0, 100),
              description: `Auto-extracted from emergency trigger (${emergencyResult.trigger_type})`,
              category: elemKey,
              is_active: true,
            } as any);
          }
        }
      }
    }

    // Update product status
    await supabase
      .from("data_products")
      .update({ status: "tagged" })
      .eq("id", data_product_id);

    await supabase
      .from("processing_queue")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("data_product_id", data_product_id)
      .eq("step", "document_analysis");

    return new Response(
      JSON.stringify({
        success: true,
        detections: allDetections.length,
        alerts: alerts.length,
        models_used: modelsUsed,
        api_powered: hasApiKey,
        model_cascade: hasApiKey
          ? "DeBERTa-v3 → BERT NER → BART (zero-shot) → sentiment → rule-based"
          : "rule-based + sentiment patterns (set HUGGINGFACE_API_KEY to enable DeBERTa/BERT)",
        emergency_detected: !!emergencyResult,
        emergency_type: emergencyResult?.trigger_type ?? null,
        emergency_trigger_id: emergencyTriggerId,
        mission_groups_created: missionGroupsCreated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Document processor error:", err);
    return new Response(
      JSON.stringify({ error: "Processing failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Token overlap similarity for label matching
function tokenOverlap(a: string, b: string): boolean {
  const ta = a.split(/[\s_]+/).filter((w) => w.length > 3);
  const tb = new Set(b.split(/[\s_]+/).filter((w) => w.length > 3));
  return ta.some((w) => tb.has(w));
}

