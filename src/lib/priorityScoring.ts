/**
 * Content-based priority scoring — produces a continuous 0–1 score
 * by analyzing text content for threat indicators, military relevance,
 * and urgency signals.
 *
 * This replaces the fixed per-source priority constants with a real
 * content-aware scoring function.
 */

/** Keyword dictionaries with per-term weights */
const THREAT_KEYWORDS: Record<string, number> = {
  attack: 0.95, missile: 0.93, explosion: 0.92, nuclear: 0.98,
  hostile: 0.88, invasion: 0.95, war: 0.90, casualties: 0.91,
  killed: 0.90, terror: 0.94, bombing: 0.93, strike: 0.85,
  ambush: 0.88, sniper: 0.87, ied: 0.90, assassination: 0.92,
  chemical: 0.91, biological: 0.89, radiological: 0.90,
};

const MILITARY_KEYWORDS: Record<string, number> = {
  military: 0.70, naval: 0.65, submarine: 0.75, destroyer: 0.72,
  frigate: 0.68, carrier: 0.70, warship: 0.72, weapon: 0.74,
  torpedo: 0.73, drone: 0.65, reconnaissance: 0.60, surveillance: 0.58,
  intelligence: 0.62, patrol: 0.55, deployment: 0.60, convoy: 0.63,
  artillery: 0.70, infantry: 0.60, special_forces: 0.72, radar: 0.58,
};

const URGENCY_KEYWORDS: Record<string, number> = {
  emergency: 0.90, critical: 0.85, urgent: 0.82, immediate: 0.80,
  breaking: 0.78, alert: 0.75, warning: 0.72, escalation: 0.80,
  imminent: 0.85, mayday: 0.92, sos: 0.88, evacuate: 0.85,
};

/**
 * Compute a content-based priority score in the range [0, 1].
 *
 * The score is a weighted combination of:
 *  - Threat keyword density (50% weight)
 *  - Military relevance (30% weight)
 *  - Urgency indicators (20% weight)
 *
 * @param text - The content text to analyze
 * @returns A number between 0 and 1
 */
export function computePriorityScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  const lower = text.toLowerCase();

  const threatScore = scoreAgainstDictionary(lower, THREAT_KEYWORDS);
  const militaryScore = scoreAgainstDictionary(lower, MILITARY_KEYWORDS);
  const urgencyScore = scoreAgainstDictionary(lower, URGENCY_KEYWORDS);

  // Weighted combination
  const composite =
    threatScore * 0.5 + militaryScore * 0.3 + urgencyScore * 0.2;

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, composite));
}

/**
 * Categorise a numeric priority score into a threat level string.
 */
export function scoreToPriorityLevel(
  score: number
): "critical" | "high" | "medium" | "low" | "routine" {
  if (score >= 0.85) return "critical";
  if (score >= 0.65) return "high";
  if (score >= 0.4) return "medium";
  if (score >= 0.2) return "low";
  return "routine";
}

/** Score text against a keyword dictionary, returning max-match score */
function scoreAgainstDictionary(
  text: string,
  dictionary: Record<string, number>
): number {
  let maxScore = 0;
  let totalMatches = 0;
  let weightedSum = 0;

  for (const [keyword, weight] of Object.entries(dictionary)) {
    if (text.includes(keyword)) {
      totalMatches++;
      weightedSum += weight;
      if (weight > maxScore) maxScore = weight;
    }
  }

  if (totalMatches === 0) return 0;

  // Combine max-match with density: more matches increase score
  const avgWeight = weightedSum / totalMatches;
  const densityBonus = Math.min(0.15, totalMatches * 0.03);
  return Math.min(1, avgWeight + densityBonus);
}
