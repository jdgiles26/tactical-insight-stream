/**
 * Local (client-side) document processor.
 * Replicates the Supabase Edge Function logic so uploads work without
 * deployed edge functions or storage buckets.
 *
 * Performs NLP-style analysis including:
 * - Named entity extraction (NER via patterns)
 * - Topic classification (multi-label)
 * - Sentiment / tone analysis
 * - Key phrase extraction (TF-IDF inspired)
 * - Document categorization
 */

// Maritime / tactical entity labels for zero-shot classification
const ENTITY_LABELS = [
  "vessel_name", "port_of_origin", "cargo_manifest", "crew_roster",
  "maritime_document", "official_stamp", "military_order", "intelligence_report",
  "coordinates", "threat_indicator", "weapon_system", "personnel_identifier",
  "organisation", "date_time_group", "mission_reference",
];

// ── NLP Topic Classification ────────────────────────────────────────────

interface TopicScore {
  topic: string;
  score: number;
  keywords_matched: string[];
}

const TOPIC_TAXONOMY: Record<string, { keywords: string[]; weight: number }> = {
  "military_operations": {
    keywords: ["military", "operation", "deploy", "battalion", "brigade", "regiment", "platoon", "squad", "mission", "tactical", "strategic", "combat", "offensive", "defensive", "maneuver", "sortie", "airstrike", "ground forces"],
    weight: 1.0,
  },
  "maritime_security": {
    keywords: ["vessel", "ship", "maritime", "naval", "port", "harbor", "coast guard", "piracy", "smuggling", "shipping lane", "strait", "sea", "ocean", "fleet", "submarine", "destroyer", "frigate", "carrier"],
    weight: 1.0,
  },
  "intelligence_analysis": {
    keywords: ["intelligence", "classified", "sigint", "humint", "osint", "imint", "elint", "surveillance", "reconnaissance", "espionage", "counterintelligence", "analysis", "assessment", "brief", "report"],
    weight: 1.0,
  },
  "threat_assessment": {
    keywords: ["threat", "hostile", "enemy", "adversary", "danger", "risk", "vulnerability", "attack", "terrorism", "insurgency", "asymmetric", "ied", "wmd", "chemical", "biological", "nuclear", "radiological"],
    weight: 1.2,
  },
  "humanitarian": {
    keywords: ["humanitarian", "aid", "relief", "refugee", "displaced", "evacuation", "medical", "rescue", "disaster", "earthquake", "flood", "hurricane", "famine", "crisis", "ngo", "red cross"],
    weight: 0.9,
  },
  "geopolitics": {
    keywords: ["government", "policy", "diplomatic", "sanctions", "treaty", "alliance", "nato", "un", "bilateral", "multilateral", "sovereignty", "territory", "border", "annexation", "independence"],
    weight: 0.9,
  },
  "cybersecurity": {
    keywords: ["cyber", "hack", "malware", "ransomware", "phishing", "breach", "vulnerability", "zero-day", "apt", "ddos", "encryption", "firewall", "intrusion", "exploit", "botnet"],
    weight: 1.0,
  },
  "logistics_supply": {
    keywords: ["logistics", "supply", "cargo", "transport", "fuel", "ammunition", "provisions", "convoy", "route", "warehouse", "inventory", "procurement", "distribution", "airlift", "sealift"],
    weight: 0.8,
  },
  "weather_environment": {
    keywords: ["weather", "storm", "hurricane", "typhoon", "tornado", "flood", "drought", "climate", "temperature", "wind", "precipitation", "forecast", "satellite", "wildfire", "seismic"],
    weight: 0.7,
  },
  "law_enforcement": {
    keywords: ["police", "arrest", "investigation", "crime", "suspect", "evidence", "warrant", "prosecution", "narcotics", "trafficking", "organized crime", "cartel", "gang", "fraud", "corruption"],
    weight: 0.9,
  },
};

function classifyTopics(text: string): TopicScore[] {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  const wordCount = words.length || 1;
  const scores: TopicScore[] = [];

  for (const [topic, { keywords, weight }] of Object.entries(TOPIC_TAXONOMY)) {
    const matched: string[] = [];
    let hitCount = 0;

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      // Count occurrences for multi-word keywords
      if (kwLower.includes(" ")) {
        const occurrences = lowerText.split(kwLower).length - 1;
        if (occurrences > 0) {
          matched.push(kw);
          hitCount += occurrences;
        }
      } else {
        const occurrences = words.filter((w) => w === kwLower || w.startsWith(kwLower)).length;
        if (occurrences > 0) {
          matched.push(kw);
          hitCount += occurrences;
        }
      }
    }

    if (matched.length > 0) {
      // Score combines keyword density and coverage breadth
      const density = hitCount / wordCount;
      const coverage = matched.length / keywords.length;
      const rawScore = (density * 0.4 + coverage * 0.6) * weight;
      const normalizedScore = Math.min(rawScore * 5, 0.99); // Scale up, cap at 0.99
      scores.push({ topic, score: parseFloat(normalizedScore.toFixed(3)), keywords_matched: matched });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 5); // Top 5 topics
}

// ── Sentiment / Tone Analysis ──────────────────────────────────────────

type SentimentLabel = "urgent" | "neutral" | "analytical" | "directive" | "informational";

interface SentimentResult {
  label: SentimentLabel;
  score: number;
  indicators: string[];
}

function analyzeSentiment(text: string): SentimentResult {
  const lowerText = text.toLowerCase();

  const urgentWords = ["immediately", "urgent", "critical", "asap", "emergency", "now", "priority", "alert", "warning", "danger", "imminent"];
  const directiveWords = ["must", "shall", "will", "order", "command", "direct", "instruct", "execute", "comply", "report to", "proceed"];
  const analyticalWords = ["analysis", "assessment", "evaluate", "determine", "probability", "likelihood", "estimate", "intelligence", "conclude", "evidence suggests"];
  const informationalWords = ["report", "update", "summary", "status", "overview", "brief", "notification", "advisory", "bulletin", "communique"];

  const urgentHits = urgentWords.filter((w) => lowerText.includes(w));
  const directiveHits = directiveWords.filter((w) => lowerText.includes(w));
  const analyticalHits = analyticalWords.filter((w) => lowerText.includes(w));
  const informationalHits = informationalWords.filter((w) => lowerText.includes(w));

  const scores: Array<{ label: SentimentLabel; count: number; indicators: string[] }> = [
    { label: "urgent", count: urgentHits.length * 2, indicators: urgentHits },
    { label: "directive", count: directiveHits.length * 1.5, indicators: directiveHits },
    { label: "analytical", count: analyticalHits.length * 1.2, indicators: analyticalHits },
    { label: "informational", count: informationalHits.length, indicators: informationalHits },
  ];

  scores.sort((a, b) => b.count - a.count);
  const best = scores[0];

  if (best.count === 0) {
    return { label: "neutral", score: 0.5, indicators: [] };
  }

  const maxPossible = Math.max(urgentWords.length, directiveWords.length, analyticalWords.length, informationalWords.length) * 2;
  const confidence = Math.min(best.count / maxPossible + 0.4, 0.95);

  return { label: best.label, score: parseFloat(confidence.toFixed(3)), indicators: best.indicators };
}

// ── Key Phrase Extraction (TF-IDF inspired) ─────────────────────────────

function extractKeyPhrases(text: string): string[] {
  const STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "because", "but", "and", "or", "if", "while", "about", "this",
    "that", "these", "those", "it", "its", "he", "she", "they", "them",
    "his", "her", "their", "we", "you", "i", "me", "my", "your", "our",
    "which", "what", "who", "whom", "whose",
  ]);

  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Count word frequencies
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  // Extract bigrams
  const bigrams: Record<string, number> = {};
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
  }

  // Combine: prefer bigrams with count > 1, then top unigrams
  const phrases: Array<{ phrase: string; score: number }> = [];

  for (const [bigram, count] of Object.entries(bigrams)) {
    if (count >= 2) {
      phrases.push({ phrase: bigram, score: count * 2 });
    }
  }

  for (const [word, count] of Object.entries(freq)) {
    if (count >= 2) {
      phrases.push({ phrase: word, score: count });
    }
  }

  phrases.sort((a, b) => b.score - a.score);
  return phrases.slice(0, 10).map((p) => p.phrase);
}

// ── Document Category Classification ────────────────────────────────────

type DocumentCategory =
  | "operations_order"
  | "intelligence_report"
  | "situation_report"
  | "after_action_report"
  | "manifest_log"
  | "communications_transcript"
  | "policy_directive"
  | "research_analysis"
  | "news_article"
  | "general_document";

function classifyDocumentCategory(text: string, fileName: string): { category: DocumentCategory; confidence: number } {
  const lowerText = (text + " " + fileName).toLowerCase();

  const categoryPatterns: Array<{ category: DocumentCategory; patterns: RegExp[]; weight: number }> = [
    {
      category: "operations_order",
      patterns: [/\bop(eration)?\s*order\b/, /\bopord\b/, /\bfrago\b/, /\bwarnord\b/, /\bmission\s*(statement|objective)\b/, /\btask\s*organ/],
      weight: 0.92,
    },
    {
      category: "intelligence_report",
      patterns: [/\bintel(ligence)?\s*report\b/, /\bintsum\b/, /\bassessment\b/, /\bthreat\s*analysis\b/, /\bsigint\b/, /\bhumint\b/],
      weight: 0.90,
    },
    {
      category: "situation_report",
      patterns: [/\bsitrep\b/, /\bsituation\s*report\b/, /\bstatus\s*update\b/, /\bcurrent\s*situation\b/],
      weight: 0.88,
    },
    {
      category: "after_action_report",
      patterns: [/\bafter\s*action\b/, /\baar\b/, /\blesson(s)?\s*learn/i, /\bhotwash\b/, /\bdebrief\b/],
      weight: 0.87,
    },
    {
      category: "manifest_log",
      patterns: [/\bmanifest\b/, /\bcargo\s*list\b/, /\bcrew\s*roster\b/, /\bpassenger\s*list\b/, /\blog\s*entry\b/, /\bdeck\s*log\b/],
      weight: 0.85,
    },
    {
      category: "communications_transcript",
      patterns: [/\btranscript\b/, /\bradio\s*log\b/, /\bcomms?\b.*\blog\b/, /\bintercept\b/, /\bsignal\b/],
      weight: 0.84,
    },
    {
      category: "policy_directive",
      patterns: [/\bpolicy\b/, /\bdirective\b/, /\bregulation\b/, /\bguidance\b/, /\bmemorandum\b/, /\bexecutive\s*order\b/],
      weight: 0.82,
    },
    {
      category: "research_analysis",
      patterns: [/\bresearch\b/, /\bstudy\b/, /\bwhite\s*paper\b/, /\banalysis\b/, /\bfindings\b/, /\bmethodology\b/],
      weight: 0.80,
    },
    {
      category: "news_article",
      patterns: [/\breported\b/, /\baccording to\b/, /\bsources say\b/, /\bnews\b/, /\bpress\s*release\b/, /\bbreaking\b/],
      weight: 0.75,
    },
  ];

  let bestCategory: DocumentCategory = "general_document";
  let bestScore = 0;

  for (const { category, patterns, weight } of categoryPatterns) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) matchCount++;
    }
    if (matchCount > 0) {
      const score = (matchCount / patterns.length) * weight;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
  }

  return { category: bestCategory, confidence: bestScore > 0 ? Math.min(bestScore + 0.3, 0.95) : 0.3 };
}

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

export interface Detection {
  label: string;
  confidence: number;
  detector_type: string;
  raw_entity?: string;
}

export interface DocumentProcessorResult {
  success: boolean;
  detections: number;
  alerts: number;
  models_used: string[];
  api_powered: boolean;
  model_cascade: string;
  emergency_detected: boolean;
  emergency_type: string | null;
  emergency_trigger_id: string | null;
  mission_groups_created: number;
  detection_details: Detection[];
  key_elements: Record<string, string>;
  urgency_level: string;
  // NLP tagging results
  topics: TopicScore[];
  sentiment: SentimentResult;
  key_phrases: string[];
  document_category: { category: string; confidence: number };
  nlp_tags: string[];
}

function detectEmergencyType(text: string): { trigger_type: string; confidence: number } | null {
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

function extractKeyElements(text: string): Record<string, string> {
  const elements: Record<string, string> = {};

  const locMatch = text.match(/\b(sector\s+\w+|grid\s+[A-Z0-9]+|zone\s+\w+|reef\s+\w+|port\s+\w+|grid\s+ref\w*)\b/i);
  if (locMatch) elements.location = locMatch[0];

  const vehicleMatch = text.match(/\b((?:rusty|blue|red|white|black|grey|gray|green)\s+(?:trawler|vessel|boat|truck|vehicle|craft|ship))\b/i);
  if (vehicleMatch) elements.target_vehicle = vehicleMatch[0];

  const eventMatch = text.match(/\b(illegal\s+\w+|offload|interdiction|attack|incursion|evacuation|rescue|intercept)\b/i);
  if (eventMatch) elements.event = eventMatch[0];

  const timeMatch = text.match(/\b(\d{4}Z|\d{2}:\d{2}\s*(UTC|local|Z)?(\d+)\s*hours?\s*(ago|from now)?)\b/i);
  if (timeMatch) elements.time_ref = timeMatch[0];

  const intentMatch = text.match(/(?:commander(?:'s)?\s+intent|mission\s+objective|task(?:ing)?)[:\s]+([^.!?\n]{10,120})/i);
  if (intentMatch) elements.commander_intent = intentMatch[1].trim();

  const personMatch = text.match(/\b(?:Col|Capt|Lt|Sgt|Cdr|Admiral|General|LCDR|CPT)\s+[A-Z][a-z]+\b/);
  if (personMatch) elements.personnel = personMatch[0];

  return elements;
}

function ruleBasedExtraction(text: string, filePath: string): Detection[] {
  const combinedText = text + " " + filePath;
  const lowerText = combinedText.toLowerCase();
  const detections: Detection[] = [];

  const extractionPatterns: Array<{ regex: RegExp; label: string; confidence: number }> = [
    { regex: /\b((?:USS|HMS|USNS|MV|MT|SS)\s+[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})\b/g, label: "vessel_name", confidence: 0.88 },
    { regex: /\b(port\s+(?:of\s+)?[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})\b/gi, label: "port_of_origin", confidence: 0.82 },
    { regex: /(-?\d{1,3}\.\d{2,6})[,\s]+(-?\d{1,3}\.\d{2,6})/g, label: "coordinates", confidence: 0.90 },
    { regex: /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi, label: "date_time_group", confidence: 0.85 },
    { regex: /\b((?:Captain|Admiral|Commander|Lt|Sgt|Col|Gen)\s+[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})\b/g, label: "personnel_identifier", confidence: 0.78 },
  ];

  for (const { regex, label, confidence } of extractionPatterns) {
    const matches = combinedText.matchAll(regex);
    for (const match of matches) {
      detections.push({
        label,
        confidence,
        detector_type: "rule_based",
        raw_entity: match[1] || match[0],
      });
    }
  }

  const presencePatterns: Array<[RegExp, string, number]> = [
    [/vessel|ship|boat|craft|tanker|frigate|destroyer|carrier/i, "vessel_name", 0.72],
    [/port|harbor|harbour|anchorage|berth|pier|dock/i, "port_of_origin", 0.68],
    [/cargo|manifest|freight|load|tonnage|container/i, "cargo_manifest", 0.75],
    [/crew|personnel|sailor|officer|captain|admiral/i, "crew_roster", 0.72],
    [/official|stamp|seal|certified|signed|authoris/i, "official_stamp", 0.68],
    [/intel|intelligence|classified|report|assessment|analysis/i, "intelligence_report", 0.80],
    [/coordinates|latitude|longitude|position|gps|location/i, "coordinates", 0.75],
    [/threat|hostile|enemy|warning|alert|danger/i, "threat_indicator", 0.88],
    [/weapon|missile|gun|torpedo|ordnance|munition/i, "weapon_system", 0.84],
    [/order|command|directive|mission|objective|task/i, "military_order", 0.76],
  ];

  const existingLabels = new Set(detections.map((d) => d.label));
  for (const [regex, label, conf] of presencePatterns) {
    if (!existingLabels.has(label) && regex.test(lowerText)) {
      detections.push({ label, confidence: conf, detector_type: "rule_based" });
      existingLabels.add(label);
    }
  }

  if (/\.pdf$/i.test(filePath) || /document|report|manifest/i.test(lowerText)) {
    if (!existingLabels.has("maritime_document")) {
      detections.push({ label: "maritime_document", confidence: 0.91, detector_type: "rule_based" });
    }
  }

  return detections;
}

/** Read text content from a File object */
async function readFileText(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    // For PDF, just use the filename as proxy — real PDF parsing would need pdf.js
    return file.name.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, "");
  }
  if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
    return await file.text();
  }
  // For other document types, use filename
  return file.name.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, "");
}

export async function processDocumentLocally(file: File): Promise<DocumentProcessorResult> {
  const text = await readFileText(file);
  const filePath = file.name;

  // Run rule-based extraction
  const allDetections = ruleBasedExtraction(text, filePath);
  allDetections.sort((a, b) => b.confidence - a.confidence);

  // NLP Topic Classification
  const topics = classifyTopics(text);

  // Sentiment / Tone Analysis
  const sentiment = analyzeSentiment(text);

  // Key Phrase Extraction
  const key_phrases = extractKeyPhrases(text);

  // Document Category Classification
  const document_category = classifyDocumentCategory(text, filePath);

  // Generate consolidated NLP tags
  const nlp_tags: string[] = [];
  // Add top topics as tags
  for (const t of topics.slice(0, 3)) {
    nlp_tags.push(`topic:${t.topic}`);
  }
  // Add document category as tag
  nlp_tags.push(`category:${document_category.category}`);
  // Add sentiment as tag
  nlp_tags.push(`tone:${sentiment.label}`);
  // Add entity-based tags from detections
  const entityTags = new Set<string>();
  for (const det of allDetections.slice(0, 5)) {
    entityTags.add(`entity:${det.label}`);
  }
  nlp_tags.push(...entityTags);
  // Add key phrases as tags (top 3)
  for (const phrase of key_phrases.slice(0, 3)) {
    nlp_tags.push(`phrase:${phrase}`);
  }

  // Emergency detection
  const emergencyResult = detectEmergencyType(text);
  const keyElements = extractKeyElements(text);
  let urgencyLevel = "low";
  let missionGroupsCreated = 0;

  if (emergencyResult) {
    urgencyLevel =
      emergencyResult.confidence >= 0.9 ? "critical" :
      emergencyResult.confidence >= 0.75 ? "high" :
      emergencyResult.confidence >= 0.5 ? "medium" : "low";
    missionGroupsCreated = 1;
    nlp_tags.push(`urgency:${urgencyLevel}`);
    nlp_tags.push(`emergency:${emergencyResult.trigger_type}`);
  }

  // Override urgency based on sentiment if urgent tone detected
  if (sentiment.label === "urgent" && urgencyLevel === "low") {
    urgencyLevel = "medium";
  }

  // Commander's Intent correlation — match detections against key elements
  const alerts = Object.values(keyElements).length;

  return {
    success: true,
    detections: allDetections.length,
    alerts,
    models_used: ["nlp_topic_classifier", "sentiment_analyzer", "keyphrase_extractor", "rule_based_ner"],
    api_powered: false,
    model_cascade: "NLP topic classification → sentiment analysis → key phrase extraction → NER → emergency detection → categorization",
    emergency_detected: !!emergencyResult,
    emergency_type: emergencyResult?.trigger_type ?? null,
    emergency_trigger_id: null,
    mission_groups_created: missionGroupsCreated,
    detection_details: allDetections,
    key_elements: keyElements,
    urgency_level: urgencyLevel,
    topics,
    sentiment,
    key_phrases,
    document_category,
    nlp_tags,
  };
}
