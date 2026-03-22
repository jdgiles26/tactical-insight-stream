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
): Array<{ label: string; confidence: number; detector_type: string; raw_entity?: string }> {
  const combinedText = text + " " + filePath;
  const lowerText = combinedText.toLowerCase();
  const detections: Array<{ label: string; confidence: number; detector_type: string; raw_entity?: string }> = [];

  // Patterns that extract actual entity values from text
  const extractionPatterns: Array<{
    regex: RegExp;
    label: string;
    confidence: number;
  }> = [
    { regex: /\b((?:USS|HMS|USNS|MV|MT|SS)\s+[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})\b/g, label: "vessel_name", confidence: 0.88 },
    { regex: /\b(port\s+(?:of\s+)?[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})\b/gi, label: "port_of_origin", confidence: 0.82 },
    { regex: /(-?\d{1,3}\.\d{2,6})[,\s]+(-?\d{1,3}\.\d{2,6})/g, label: "coordinates", confidence: 0.90 },
    { regex: /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi, label: "date_time_group", confidence: 0.85 },
    { regex: /\b((?:Captain|Admiral|Commander|Lt|Sgt|Col|Gen)\s+[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})\b/g, label: "personnel_identifier", confidence: 0.78 },
  ];

  // Extract actual entity values using capturing groups
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

  // Keyword-presence patterns (fallback when no extraction match)
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

  // Always include a document type classification
  if (/\.pdf$/i.test(filePath) || /document|report|manifest/i.test(lowerText)) {
    if (!existingLabels.has("maritime_document")) {
      detections.push({ label: "maritime_document", confidence: 0.91, detector_type: "rule_based" });
    }
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
          ? "DeBERTa-v3 → BERT NER → BART (zero-shot) → rule-based"
          : "rule-based (set HUGGINGFACE_API_KEY to enable DeBERTa/BERT)",
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

