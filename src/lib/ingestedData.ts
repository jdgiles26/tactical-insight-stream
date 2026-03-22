/**
 * IngestedData — canonical data model for ingested intelligence products.
 *
 * TypeScript equivalent of the specification's Go IngestedData struct.
 * Used as the unified shape for data flowing through the ingestion pipeline.
 */
export interface IngestedData {
  /** Unique identifier (UUID) */
  id: string;
  /** Identifier of the originating data source */
  sourceId: string;
  /** Raw content / text body */
  content: string;
  /** Classification labels assigned during processing */
  labels: string[];
  /** Continuous priority score between 0 (routine) and 1 (critical) */
  priority: number;
  /** Military relevance score between 0 and 1 */
  militaryRelevance: number;
  /** Categorical threat level */
  threatLevel: "critical" | "high" | "medium" | "low" | "routine";
  /** ISO 8601 timestamp of ingestion */
  timestamp: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Named entities extracted from content */
  entities: string[];
  /** Sentiment classification of the content */
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  /** Whether this item links to a detail view */
  clickable: boolean;
  /** URL for detailed view / original source */
  detailURL: string;
}

/**
 * Maps a Supabase data_product row + detection results into the canonical IngestedData shape.
 */
export function toIngestedData(
  product: {
    id: string;
    source_identifier?: string | null;
    title?: string | null;
    content?: Record<string, unknown> | null;
    priority_score?: number | null;
    priority?: string | null;
    created_at?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  detectionLabels: string[] = [],
  entities: string[] = []
): IngestedData {
  const contentText =
    (product.content?.description as string) ||
    (product.content?.text as string) ||
    (product.content?.summary as string) ||
    product.title ||
    "";

  const priorityScore = product.priority_score ?? 0;

  return {
    id: product.id,
    sourceId: product.source_identifier || "",
    content: contentText,
    labels: detectionLabels,
    priority: priorityScore,
    militaryRelevance: computeMilitaryRelevance(contentText),
    threatLevel: mapThreatLevel(product.priority || "routine"),
    timestamp: product.created_at || new Date().toISOString(),
    lat: product.latitude ?? 0,
    lon: product.longitude ?? 0,
    entities,
    sentiment: analyzeSentiment(contentText),
    clickable: !!(product.content?.link || product.content?.url),
    detailURL:
      (product.content?.link as string) ||
      (product.content?.url as string) ||
      "",
  };
}

/** Compute military relevance score (0-1) from content text. */
function computeMilitaryRelevance(text: string): number {
  const lower = text.toLowerCase();
  const militaryTerms = [
    "military", "naval", "army", "navy", "air force", "marine",
    "defense", "defence", "weapon", "missile", "torpedo",
    "submarine", "warship", "destroyer", "frigate", "carrier",
    "patrol", "reconnaissance", "surveillance", "intelligence",
    "classified", "tactical", "strategic", "combat", "deployment",
  ];
  let matches = 0;
  for (const term of militaryTerms) {
    if (lower.includes(term)) matches++;
  }
  return Math.min(1, matches / 5);
}

/** Map priority string to threat level */
function mapThreatLevel(
  priority: string
): "critical" | "high" | "medium" | "low" | "routine" {
  switch (priority) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "routine";
  }
}

/** Simple sentiment analysis based on keyword presence */
function analyzeSentiment(
  text: string
): "positive" | "negative" | "neutral" | "mixed" {
  const lower = text.toLowerCase();
  const negativeTerms = [
    "threat", "attack", "hostile", "danger", "emergency",
    "crisis", "killed", "destroyed", "explosion", "casualties",
    "warning", "alert", "escalation", "conflict",
  ];
  const positiveTerms = [
    "peace", "agreement", "cooperation", "rescue", "saved",
    "stabilized", "resolved", "ceasefire", "aid", "humanitarian",
  ];

  let negScore = 0;
  let posScore = 0;
  for (const term of negativeTerms) {
    if (lower.includes(term)) negScore++;
  }
  for (const term of positiveTerms) {
    if (lower.includes(term)) posScore++;
  }

  if (negScore > 0 && posScore > 0) return "mixed";
  if (negScore > posScore) return "negative";
  if (posScore > negScore) return "positive";
  return "neutral";
}
