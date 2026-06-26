/**
 * Local (client-side) document processor.
 * Replicates the Supabase Edge Function logic so uploads work without
 * deployed edge functions or storage buckets.
 */

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

  // Location references (grid refs, sectors, ports, coordinates)
  const locMatch = text.match(/\b(sector\s+\w+|grid\s+[A-Z0-9]+|zone\s+\w+|reef\s+\w+|port\s+\w+|grid\s+ref\w*|area\s+\w+|position\s+\w+|lat(?:itude)?\s*[:=]?\s*-?\d+\.?\d*|lon(?:gitude)?\s*[:=]?\s*-?\d+\.?\d*)\b/i);
  if (locMatch) elements.location = locMatch[0];

  // Coordinate pairs (e.g., "34.0522, -118.2437" or "N34°05'13")
  const coordMatch = text.match(/(-?\d{1,3}\.\d{2,6})[,\s]+(-?\d{1,3}\.\d{2,6})/);
  if (coordMatch) elements.coordinates = `${coordMatch[1]}, ${coordMatch[2]}`;

  const vehicleMatch = text.match(/\b((?:rusty|blue|red|white|black|grey|gray|green|dark|large|small)\s+(?:trawler|vessel|boat|truck|vehicle|craft|ship|tanker|frigate|destroyer|carrier|submarine|helicopter|aircraft))\b/i);
  if (vehicleMatch) elements.target_vehicle = vehicleMatch[0];

  // Named vessels (USS, HMS, etc.)
  const vesselMatch = text.match(/\b((?:USS|HMS|USNS|MV|MT|SS)\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/);
  if (vesselMatch && !elements.target_vehicle) elements.target_vehicle = vesselMatch[0];

  const eventMatch = text.match(/\b(illegal\s+\w+|offload|interdiction|attack|incursion|evacuation|rescue|intercept|deployment|patrol|surveillance|boarding|seizure)\b/i);
  if (eventMatch) elements.event = eventMatch[0];

  const timeMatch = text.match(/\b(\d{4}Z|\d{2}:\d{2}\s*(UTC|local|Z)?|(\d+)\s*hours?\s*(ago|from now)?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
  if (timeMatch) elements.time_ref = timeMatch[0];

  const intentMatch = text.match(/(?:commander(?:'s)?\s+intent|mission\s+objective|task(?:ing)?|purpose|end\s*state)[:\s]+([^.!?\n]{10,120})/i);
  if (intentMatch) elements.commander_intent = intentMatch[1].trim();

  const personMatch = text.match(/\b(?:Col|Capt|Lt|Sgt|Cdr|Admiral|General|LCDR|CPT|CDR|RADM|VADM|PO1|PO2|PO3)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/);
  if (personMatch) elements.personnel = personMatch[0];

  // Organization / unit references
  const orgMatch = text.match(/\b(\d+(?:st|nd|rd|th)\s+(?:Fleet|Division|Brigade|Squadron|Battalion|Regiment|Company|Platoon)|(?:NATO|CENTCOM|PACOM|EUCOM|AFRICOM|SOUTHCOM|INDOPACOM))\b/i);
  if (orgMatch) elements.organization = orgMatch[0];

  // Classification level
  const classMatch = text.match(/\b(TOP\s+SECRET|SECRET|CONFIDENTIAL|UNCLASSIFIED|FOUO|NOFORN|REL\s+TO)\b/i);
  if (classMatch) elements.classification = classMatch[0];

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
  // For plain text, markdown, or similar text-based documents, read actual content
  if (
    file.type.startsWith("text/") ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".csv") ||
    file.name.endsWith(".json") ||
    file.name.endsWith(".xml") ||
    file.name.endsWith(".html")
  ) {
    return await file.text();
  }

  // For PDFs: attempt to extract readable text from the raw binary.
  // This approach looks for text streams in the PDF structure without pdf.js.
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

      // Extract text between BT/ET markers (PDF text objects)
      const textChunks: string[] = [];
      const btEtRegex = /BT\s([\s\S]*?)ET/g;
      let match;
      while ((match = btEtRegex.exec(rawText)) !== null) {
        // Extract text within parentheses (Tj/TJ operators)
        const tjMatches = match[1].matchAll(/\(([^)]*)\)/g);
        for (const tj of tjMatches) {
          const cleaned = tj[1]
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "")
            .replace(/\\([()])/g, "$1")
            .trim();
          if (cleaned.length > 0) {
            textChunks.push(cleaned);
          }
        }
      }

      // Also try to find readable ASCII strings in the raw PDF
      const readableStrings = rawText.match(/[\x20-\x7E]{8,}/g) || [];
      const filteredStrings = readableStrings.filter(
        (s) => !/^[%\/\[\]<>{}()*&^$#@!]+$/.test(s) && !/^\d+\s+\d+\s+obj/.test(s)
      );

      const pdfText = textChunks.length > 0
        ? textChunks.join(" ")
        : filteredStrings.slice(0, 200).join(" ");

      // Combine with filename for additional context
      const fileNameText = file.name.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, "");
      return `${fileNameText} ${pdfText}`.trim();
    } catch {
      // If binary read fails, fall back to filename
      return file.name.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, "");
    }
  }

  // For DOCX: extract text from the XML content within the ZIP structure
  if (file.name.endsWith(".docx") || file.type.includes("document")) {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

      // DOCX is a ZIP; look for XML text content between <w:t> tags
      const textChunks: string[] = [];
      const wtRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
      let match;
      while ((match = wtRegex.exec(rawText)) !== null) {
        if (match[1].trim().length > 0) {
          textChunks.push(match[1]);
        }
      }

      if (textChunks.length > 0) {
        const fileNameText = file.name.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, "");
        return `${fileNameText} ${textChunks.join(" ")}`.trim();
      }
    } catch {
      // Fall through to filename
    }
    return file.name.replace(/[_\-/]/g, " ").replace(/\.[^.]+$/, "");
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
  }

  // Commander's Intent correlation — match detections against key elements
  const alerts = Object.values(keyElements).length;

  return {
    success: true,
    detections: allDetections.length,
    alerts,
    models_used: ["rule_based"],
    api_powered: false,
    model_cascade: "rule-based entity extraction → emergency detection → correlation",
    emergency_detected: !!emergencyResult,
    emergency_type: emergencyResult?.trigger_type ?? null,
    emergency_trigger_id: null,
    mission_groups_created: missionGroupsCreated,
    detection_details: allDetections,
    key_elements: keyElements,
    urgency_level: urgencyLevel,
  };
}
