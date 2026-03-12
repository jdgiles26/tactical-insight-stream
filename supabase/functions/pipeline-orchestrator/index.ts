import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAGE_FLOW: Record<string, string | null> = {
  ingestion: "processing",
  processing: "tagging",
  tagging: "correlation",
  correlation: "prioritization",
  prioritization: "transport",
  transport: null,
};

const TOPIC_MAP: Record<string, string> = {
  ingestion: "mdg.ingestion",
  processing: "mdg.processing",
  tagging: "mdg.tagging",
  correlation: "mdg.correlation",
  prioritization: "mdg.prioritization",
  transport: "mdg.transport",
};

// HuggingFace Inference API
const HF_API = "https://api-inference.huggingface.co/models";

// ──────────────────────────────────────────────────────────────────────────────
// HuggingFace caller with cascade fallback
// ──────────────────────────────────────────────────────────────────────────────
async function hfCall(
  apiKey: string,
  models: string[],
  payload: Record<string, unknown>
): Promise<{ model: string; result: unknown } | null> {
  for (const model of models) {
    try {
      const res = await fetch(`${HF_API}/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 503) continue; // model loading
      if (!res.ok) continue;
      return { model, result: await res.json() };
    } catch { continue; }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Semantic similarity via sentence-transformers (cosine similarity of embeddings)
// ──────────────────────────────────────────────────────────────────────────────
async function semanticSimilarity(
  apiKey: string,
  sourceText: string,
  candidateTexts: string[]
): Promise<number[]> {
  if (!apiKey || candidateTexts.length === 0) return candidateTexts.map(() => 0);
  const resp = await hfCall(apiKey, ["sentence-transformers/all-MiniLM-L6-v2"], {
    inputs: { source_sentence: sourceText, sentences: candidateTexts },
  });
  if (!resp) return candidateTexts.map(() => 0);
  return Array.isArray(resp.result) ? (resp.result as number[]) : candidateTexts.map(() => 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Zero-shot classification for source-type tagging
// ──────────────────────────────────────────────────────────────────────────────
async function classifySourceType(
  apiKey: string,
  text: string
): Promise<{ label: string; score: number } | null> {
  const labels = [
    "threat intelligence", "vessel tracking", "weather event",
    "fire detection", "military activity", "geopolitical news",
    "maritime incident", "sensor anomaly", "person of interest",
  ];
  const resp = await hfCall(
    apiKey,
    ["cross-encoder/nli-deberta-v3-base", "facebook/bart-large-mnli"],
    { inputs: text, parameters: { candidate_labels: labels } }
  );
  if (!resp) return null;
  const r = resp.result as any;
  if (r.labels && r.scores) {
    return { label: r.labels[0], score: r.scores[0] };
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Anomaly detection: IQR-based outlier detection on priority_score history
// Returns { isAnomaly, zscore, direction }
// ──────────────────────────────────────────────────────────────────────────────
function detectAnomaly(
  value: number,
  history: number[]
): { isAnomaly: boolean; zscore: number; direction: "high" | "low" | "normal" } {
  if (history.length < 4) return { isAnomaly: false, zscore: 0, direction: "normal" };

  const sorted = [...history].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const std = Math.sqrt(history.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / history.length) || 1;
  const zscore = (value - mean) / std;

  const isAnomaly = value < lower || value > upper;
  const direction = value > upper ? "high" : value < lower ? "low" : "normal";
  return { isAnomaly, zscore: Math.round(zscore * 100) / 100, direction };
}

// ──────────────────────────────────────────────────────────────────────────────
// Trend prediction: simple linear regression over recent scores
// Returns { trend, predicted_next, r_squared }
// ──────────────────────────────────────────────────────────────────────────────
function predictTrend(
  values: number[]
): { trend: "rising" | "falling" | "stable"; predicted_next: number; r_squared: number } {
  if (values.length < 2) return { trend: "stable", predicted_next: values[0] ?? 0, r_squared: 0 };

  const n = values.length;
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = values.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  const predicted_next = Math.max(0, Math.min(1, slope * n + intercept));

  // R-squared
  const meanY = sumY / n;
  const ssTot = values.reduce((s, y) => s + Math.pow(y - meanY, 2), 0) || 1;
  const ssRes = values.reduce((s, y, i) => s + Math.pow(y - (slope * i + intercept), 2), 0);
  const r_squared = Math.max(0, 1 - ssRes / ssTot);

  const trend = slope > 0.02 ? "rising" : slope < -0.02 ? "falling" : "stable";
  return { trend, predicted_next: Math.round(predicted_next * 1000) / 1000, r_squared: Math.round(r_squared * 1000) / 1000 };
}

// ──────────────────────────────────────────────────────────────────────────────
// Composite ML priority score:
//   threat_weight × base_priority + alert_weight × alert_density
//   + novelty_weight × (1 - recency_decay) + source_reliability_weight
// ──────────────────────────────────────────────────────────────────────────────
function computeCompositePriority(params: {
  basePriority: string;
  priorityScore: number;
  alertCount: number;
  sourceReliability: number;
  recencyHours: number;
  anomalyScore: number;
}): number {
  const baseScores: Record<string, number> = {
    critical: 0.95, high: 0.80, medium: 0.60, low: 0.30, routine: 0.10,
  };
  const base = baseScores[params.basePriority] ?? params.priorityScore ?? 0.5;

  // Alert density contribution (capped at 0.25)
  const alertBoost = Math.min(0.25, params.alertCount * 0.05);

  // Recency decay: freshness bonus peaks at 0 hours, decays to 0 at 24h
  const recencyBonus = Math.max(0, 0.1 * (1 - params.recencyHours / 24));

  // Source reliability [0,1]
  const relBonus = params.sourceReliability * 0.1;

  // Anomaly boost: high-anomaly items get elevated
  const anomalyBoost = Math.abs(params.anomalyScore) > 2 ? 0.1 : 0;

  const composite = Math.min(1.0, base + alertBoost + recencyBonus + relBonus + anomalyBoost);
  return Math.round(composite * 1000) / 1000;
}

// ──────────────────────────────────────────────────────────────────────────────
// Generate AI-powered recommendations based on detections and intents
// ──────────────────────────────────────────────────────────────────────────────
function generateRecommendations(
  detections: any[],
  alerts: any[],
  sourceType: string
): string[] {
  const recs: string[] = [];
  const highConfDets = detections.filter((d) => d.confidence > 0.8);

  if (alerts.length > 2) {
    recs.push("ESCALATE: Multiple commander intent matches — recommend immediate review");
  }
  if (sourceType === "video" && highConfDets.some((d) => d.label === "military_vessel")) {
    recs.push("MONITOR: Military vessel detected — initiate tracking protocol");
  }
  if (sourceType === "video" && highConfDets.some((d) => d.label === "person_overboard")) {
    recs.push("URGENT: Person-overboard detection — coordinate SAR response");
  }
  if (sourceType === "document" && highConfDets.some((d) => d.label === "threat_indicator")) {
    recs.push("ASSESS: Threat indicator in document — cross-reference with SIGINT sources");
  }
  if (detections.some((d) => d.label === "submarine_periscope")) {
    recs.push("REPORT: Subsurface activity detected — notify ASW unit");
  }
  if (recs.length === 0 && highConfDets.length > 0) {
    recs.push(`ARCHIVE: ${highConfDets.length} high-confidence detections logged for historical correlation`);
  }

  return recs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Stage execution with AI/ML enrichment
// ──────────────────────────────────────────────────────────────────────────────
async function executeStage(supabase: ReturnType<typeof createClient>, event: any): Promise<Record<string, any>> {
  const stage = event.stage;
  const hfApiKey = Deno.env.get("HUGGINGFACE_API_KEY") || "";

  switch (stage) {
    // ── INGESTION ─────────────────────────────────────────────────────────────
    case "ingestion": {
      // Validate and normalise incoming data product
      if (!event.data_product_id) throw new Error("Missing data_product_id in ingestion event");

      const { data: product } = await supabase
        .from("data_products")
        .select("title, source_type, content, created_at")
        .eq("id", event.data_product_id)
        .single();

      const ingestionMeta: Record<string, any> = {
        ingested: true,
        normalized: true,
        source_type: product?.source_type ?? "unknown",
        has_content: !!(product?.content),
      };

      // Deduplication check: look for similar titles ingested in last 24 hours
      if (product?.title) {
        const since = new Date(Date.now() - 86400000).toISOString();
        const { data: similar } = await supabase
          .from("data_products")
          .select("id, title")
          .neq("id", event.data_product_id)
          .gte("created_at", since)
          .limit(20);

        const dupCount = (similar ?? []).filter((s: any) =>
          s.title?.toLowerCase().trim() === product.title?.toLowerCase().trim()
        ).length;

        ingestionMeta.potential_duplicate = dupCount > 0;
        ingestionMeta.duplicate_count = dupCount;
      }

      return ingestionMeta;
    }

    // ── PROCESSING ────────────────────────────────────────────────────────────
    case "processing": {
      if (!event.data_product_id) return { processed: true };

      const { data: product } = await supabase
        .from("data_products")
        .select("source_type, title, content")
        .eq("id", event.data_product_id)
        .single();

      const sourceType = product?.source_type ?? "unknown";
      const processingMeta: Record<string, any> = { processed: true, source_type: sourceType };

      // Route to appropriate processor function
      if (["video", "image"].includes(sourceType)) {
        const filePath = product?.content?.file_path;
        if (filePath) {
          try {
            const { data: result, error } = await supabase.functions.invoke("video-processor", {
              body: { data_product_id: event.data_product_id, file_path: filePath },
            });
            if (!error) {
              processingMeta.processor = "yolo:best-boat.onnx";
              processingMeta.detections_count = result?.detections ?? 0;
              processingMeta.onnx_enabled = result?.onnx_enabled ?? false;
            }
          } catch { /* non-fatal — pipeline continues */ }
        }
      } else if (["document", "image"].includes(sourceType)) {
        const filePath = product?.content?.file_path;
        if (filePath) {
          try {
            const { data: result, error } = await supabase.functions.invoke("document-processor", {
              body: { data_product_id: event.data_product_id, file_path: filePath },
            });
            if (!error) {
              processingMeta.processor = `nlp:${result?.model_cascade ?? "bert"}`;
              processingMeta.detections_count = result?.detections ?? 0;
              processingMeta.api_powered = result?.api_powered ?? false;
            }
          } catch { /* non-fatal */ }
        }
      } else {
        // Sensor / CoT / SIGINT / HUMINT — use zero-shot classification
        const text = [product?.title, product?.content?.description].filter(Boolean).join(". ");
        if (text && hfApiKey) {
          const classification = await classifySourceType(hfApiKey, text);
          if (classification) {
            processingMeta.ml_classification = classification.label;
            processingMeta.ml_classification_score = classification.score;
            processingMeta.processor = "deberta_zeroshot";
          }
        }
        processingMeta.detections_count = 0;
      }

      return processingMeta;
    }

    // ── TAGGING ───────────────────────────────────────────────────────────────
    case "tagging": {
      if (!event.data_product_id) return { tagged: true };

      const { data: product } = await supabase
        .from("data_products")
        .select("source_type, priority, title, content")
        .eq("id", event.data_product_id)
        .single();

      const tags: Array<{ tag_name: string; tag_value: string; tag_category: string; confidence: number }> = [];

      // Auto-tag: pipeline stage
      tags.push({ tag_name: "pipeline_stage", tag_value: "auto_tagged", tag_category: "system", confidence: 1.0 });

      // Auto-tag: source type
      if (product?.source_type) {
        tags.push({ tag_name: "source_type", tag_value: product.source_type, tag_category: "classification", confidence: 1.0 });
      }

      // Auto-tag: priority
      if (product?.priority) {
        tags.push({ tag_name: "priority_class", tag_value: product.priority, tag_category: "prioritization", confidence: 0.95 });
      }

      // AI-driven semantic tags via DeBERTa zero-shot
      const text = [product?.title, product?.content?.description].filter(Boolean).join(". ");
      if (text && hfApiKey) {
        const domainLabels = ["maritime", "aerial", "ground", "subsurface", "cyber", "human intelligence", "signals intelligence", "imagery intelligence"];
        const resp = await hfCall(
          hfApiKey,
          ["cross-encoder/nli-deberta-v3-base", "facebook/bart-large-mnli"],
          { inputs: text, parameters: { candidate_labels: domainLabels, multi_label: true } }
        );
        if (resp) {
          const r = resp.result as any;
          const labels: string[] = r.labels ?? [];
          const scores: number[] = r.scores ?? [];
          for (let i = 0; i < labels.length && i < 3; i++) {
            if (scores[i] > 0.35) {
              tags.push({
                tag_name: "domain",
                tag_value: labels[i].replace(/\s+/g, "_"),
                tag_category: "semantic",
                confidence: Math.round(scores[i] * 1000) / 1000,
              });
            }
          }
        }
      }

      // Insert all tags
      for (const tag of tags) {
        await supabase.from("metadata_tags").insert({
          data_product_id: event.data_product_id,
          ...tag,
        });
      }

      return { tagged: true, tags_applied: tags.length, semantic_tagging: !!hfApiKey };
    }

    // ── CORRELATION ───────────────────────────────────────────────────────────
    case "correlation": {
      if (!event.data_product_id) return { correlated: true, alerts_generated: 0 };

      const { data: intents } = await supabase
        .from("commander_intents")
        .select("*")
        .eq("is_active", true);

      const { data: detections } = await supabase
        .from("detection_results")
        .select("*")
        .eq("data_product_id", event.data_product_id);

      const alerts: any[] = [];
      const semanticMatches: Array<{ intent: any; det: any; simScore: number }> = [];

      if (intents && detections) {
        // 1. Exact / token-overlap matching
        for (const intent of intents) {
          const term = intent.term.toLowerCase();
          for (const det of detections) {
            const label = det.label.toLowerCase().replace(/_/g, " ");
            const rawEnt = (det.metadata?.raw_entity || "").toLowerCase();
            if (label.includes(term) || term.includes(label) || rawEnt.includes(term)) {
              alerts.push({
                intent_id: intent.id,
                data_product_id: event.data_product_id,
                detection_id: det.id,
                match_type: label === term ? "exact" : "related",
                match_score: det.confidence,
                matched_term: intent.term,
                matched_label: det.label,
              });
            } else {
              semanticMatches.push({ intent, det, simScore: 0 });
            }
          }
        }

        // 2. Semantic similarity via sentence-transformers
        if (hfApiKey && semanticMatches.length > 0) {
          const uniqueIntentTexts = [...new Set(semanticMatches.map((m) => m.intent.term))];
          const uniqueDetLabels = [...new Set(semanticMatches.map((m) => m.det.label.replace(/_/g, " ")))];

          for (const intentText of uniqueIntentTexts.slice(0, 5)) {
            const scores = await semanticSimilarity(hfApiKey, intentText, uniqueDetLabels.slice(0, 10));
            const intentId = semanticMatches.find((m) => m.intent.term === intentText)?.intent.id;
            for (let i = 0; i < scores.length; i++) {
              if (scores[i] > 0.6) {
                const matchedLabel = uniqueDetLabels[i];
                const matchedDet = detections.find((d) => d.label.replace(/_/g, " ") === matchedLabel);
                if (matchedDet && intentId) {
                  // Avoid duplicating exact-match alerts
                  const alreadyMatched = alerts.some(
                    (a) => a.intent_id === intentId && a.detection_id === matchedDet.id
                  );
                  if (!alreadyMatched) {
                    alerts.push({
                      intent_id: intentId,
                      data_product_id: event.data_product_id,
                      detection_id: matchedDet.id,
                      match_type: "semantic",
                      match_score: Math.round(scores[i] * 1000) / 1000,
                      matched_term: intentText,
                      matched_label: matchedDet.label,
                    });
                  }
                }
              }
            }
          }
        }
      }

      if (alerts.length > 0) {
        await supabase.from("correlation_alerts").insert(alerts);
      }

      return {
        correlated: true,
        alerts_generated: alerts.length,
        semantic_correlation: !!hfApiKey,
      };
    }

    // ── PRIORITIZATION ────────────────────────────────────────────────────────
    case "prioritization": {
      if (!event.data_product_id) return { prioritized: true };

      const { data: product } = await supabase
        .from("data_products")
        .select("priority, priority_score, source_type, created_at")
        .eq("id", event.data_product_id)
        .single();

      const { count: alertCount } = await supabase
        .from("correlation_alerts")
        .select("*", { count: "exact", head: true })
        .eq("data_product_id", event.data_product_id);

      // Gather recent priority scores for anomaly/trend analysis
      const { data: recentProducts } = await supabase
        .from("data_products")
        .select("priority_score, created_at")
        .eq("source_type", product?.source_type ?? "unknown")
        .order("created_at", { ascending: false })
        .limit(50);

      const scoreHistory = (recentProducts ?? [])
        .map((p: any) => parseFloat(p.priority_score) || 0)
        .filter((s: number) => s > 0);

      const recencyHours = product?.created_at
        ? (Date.now() - new Date(product.created_at).getTime()) / 3600000
        : 0;

      const anomaly = detectAnomaly(parseFloat(product?.priority_score ?? "0.5"), scoreHistory);
      const trend = predictTrend(scoreHistory.slice(0, 20).reverse());

      // Source reliability: use data age and source type as proxy
      const sourceReliabilityMap: Record<string, number> = {
        sensor: 0.9, cot_message: 0.85, sigint: 0.88, humint: 0.75,
        geoint: 0.82, video: 0.80, document: 0.78, image: 0.76,
      };
      const sourceReliability = sourceReliabilityMap[product?.source_type ?? ""] ?? 0.7;

      const compositeScore = computeCompositePriority({
        basePriority: product?.priority ?? "medium",
        priorityScore: parseFloat(product?.priority_score ?? "0.5"),
        alertCount: alertCount ?? 0,
        sourceReliability,
        recencyHours,
        anomalyScore: anomaly.zscore,
      });

      await supabase
        .from("data_products")
        .update({ priority_score: compositeScore, status: "prioritized" })
        .eq("id", event.data_product_id);

      // Insert priority metadata tag
      await supabase.from("metadata_tags").insert({
        data_product_id: event.data_product_id,
        tag_name: "composite_priority_score",
        tag_value: String(compositeScore),
        tag_category: "prioritization",
        confidence: 0.95,
      });

      return {
        prioritized: true,
        composite_score: compositeScore,
        alert_count: alertCount ?? 0,
        anomaly: anomaly,
        trend: trend,
        source_reliability: sourceReliability,
      };
    }

    // ── TRANSPORT ─────────────────────────────────────────────────────────────
    case "transport": {
      if (!event.data_product_id) return { transported: true };

      const { data: product } = await supabase
        .from("data_products")
        .select("source_type, priority, priority_score")
        .eq("id", event.data_product_id)
        .single();

      const { data: detections } = await supabase
        .from("detection_results")
        .select("label, confidence, detector_type")
        .eq("data_product_id", event.data_product_id);

      const { data: alerts } = await supabase
        .from("correlation_alerts")
        .select("matched_label, match_score, match_type")
        .eq("data_product_id", event.data_product_id);

      // Generate AI-driven recommendations
      const recommendations = generateRecommendations(
        detections ?? [],
        alerts ?? [],
        product?.source_type ?? "unknown"
      );

      // Persist recommendations as metadata tags
      for (const rec of recommendations) {
        await supabase.from("metadata_tags").insert({
          data_product_id: event.data_product_id,
          tag_name: "recommendation",
          tag_value: rec,
          tag_category: "automation",
          confidence: 0.85,
        });
      }

      // Gather recent products for outlier detection on final scores
      const { data: recentScores } = await supabase
        .from("data_products")
        .select("priority_score")
        .order("created_at", { ascending: false })
        .limit(100);

      const scoreHistory = (recentScores ?? [])
        .map((p: any) => parseFloat(p.priority_score) || 0)
        .filter((s: number) => s > 0);

      const currentScore = parseFloat(product?.priority_score ?? "0.5");
      const anomaly = detectAnomaly(currentScore, scoreHistory);
      const trend = predictTrend(scoreHistory.slice(0, 30).reverse());

      // Auto-escalate anomalous high-priority items
      if (anomaly.isAnomaly && anomaly.direction === "high" && currentScore > 0.8) {
        await supabase.from("metadata_tags").insert({
          data_product_id: event.data_product_id,
          tag_name: "auto_escalation",
          tag_value: `Anomalous priority score ${currentScore} (z=${anomaly.zscore}) — auto-escalated`,
          tag_category: "automation",
          confidence: 0.9,
        });
      }

      return {
        transported: true,
        transport_method: "metadata_first",
        recommendations,
        anomaly_detection: anomaly,
        trend_prediction: trend,
        detections_summary: (detections ?? []).slice(0, 5).map((d) => ({
          label: d.label,
          confidence: d.confidence,
          model: d.detector_type,
        })),
      };
    }

    default:
      return {};
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main request handler
// ──────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const action = body.action || "process";

    // ── ACTION: publish ────────────────────────────────────────────────────────
    if (action === "publish") {
      const { data_product_id, topic, payload, stage } = body;
      if (!data_product_id) return jsonResponse({ error: "data_product_id required" }, 400);

      const eventStage = stage || "ingestion";
      const eventTopic = topic || TOPIC_MAP[eventStage] || "mdg.ingestion";

      const { data: event, error } = await supabase
        .from("event_bus")
        .insert({
          topic: eventTopic,
          stage: eventStage,
          data_product_id,
          payload: payload || {},
          status: "pending",
          partition_key: body.partition_key || "default",
          consumer_group: body.consumer_group || null,
          metadata: body.metadata || {},
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, event_id: event.id, stage: eventStage }, 201);
    }

    // ── ACTION: process ────────────────────────────────────────────────────────
    if (action === "process") {
      const batchSize = body.batch_size || 10;
      const targetStage = body.stage || null;

      let query = supabase
        .from("event_bus")
        .select("*")
        .in("status", ["pending", "retry"])
        .order("offset_id", { ascending: true })
        .limit(batchSize);

      if (targetStage) query = query.eq("stage", targetStage);

      const { data: events, error: fetchErr } = await query;
      if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);

      const now = new Date();
      const eligibleEvents = (events || []).filter((e: any) => {
        if (e.status === "retry" && e.next_retry_at) return new Date(e.next_retry_at) <= now;
        return true;
      });

      const results = [];

      for (const event of eligibleEvents) {
        await supabase
          .from("event_bus")
          .update({ status: "processing", started_at: now.toISOString() })
          .eq("id", event.id);

        try {
          const stageResult = await executeStage(supabase, event);
          const nextStage = STAGE_FLOW[event.stage];

          if (nextStage) {
            await supabase
              .from("event_bus")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", event.id);

            await supabase.from("event_bus").insert({
              topic: TOPIC_MAP[nextStage],
              stage: nextStage,
              data_product_id: event.data_product_id,
              payload: { ...event.payload, ...stageResult },
              status: "pending",
              partition_key: event.partition_key,
              consumer_group: event.consumer_group,
              metadata: { previous_event_id: event.id, ...event.metadata },
            });

            const statusMap: Record<string, string> = {
              processing: "processing",
              tagging: "tagged",
              prioritization: "prioritized",
              transport: "transported",
            };
            if (statusMap[nextStage]) {
              await supabase
                .from("data_products")
                .update({ status: statusMap[nextStage] })
                .eq("id", event.data_product_id);
            }
          } else {
            await supabase
              .from("event_bus")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", event.id);
            await supabase
              .from("data_products")
              .update({ status: "transported" })
              .eq("id", event.data_product_id);
          }

          results.push({ event_id: event.id, stage: event.stage, result: "advanced", stage_output: stageResult });
        } catch (stageErr) {
          const retryCount = event.retry_count + 1;
          const errMsg = String(stageErr);

          if (retryCount >= event.max_retries) {
            await supabase.from("dead_letter_queue").insert({
              original_event_id: event.id,
              topic: event.topic,
              stage: event.stage,
              payload: event.payload,
              error_message: errMsg,
              retry_count: retryCount,
              data_product_id: event.data_product_id,
            });
            await supabase
              .from("event_bus")
              .update({ status: "dead_letter", error_message: errMsg, retry_count: retryCount })
              .eq("id", event.id);
            results.push({ event_id: event.id, stage: event.stage, result: "dead_letter" });
          } else {
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 300000);
            const nextRetry = new Date(Date.now() + backoffMs).toISOString();
            await supabase
              .from("event_bus")
              .update({ status: "retry", error_message: errMsg, retry_count: retryCount, next_retry_at: nextRetry })
              .eq("id", event.id);
            results.push({ event_id: event.id, stage: event.stage, result: "retry", retry_count: retryCount });
          }
        }
      }

      return jsonResponse({ success: true, processed: results.length, results });
    }

    // ── ACTION: status ─────────────────────────────────────────────────────────
    if (action === "status") {
      const { data_product_id } = body;
      if (!data_product_id) return jsonResponse({ error: "data_product_id required" }, 400);
      const { data: events } = await supabase
        .from("event_bus")
        .select("*")
        .eq("data_product_id", data_product_id)
        .order("offset_id", { ascending: true });
      return jsonResponse({ events: events || [] });
    }

    // ── ACTION: metrics ────────────────────────────────────────────────────────
    if (action === "metrics") {
      const { data: pending } = await supabase
        .from("event_bus")
        .select("stage, status", { count: "exact" })
        .in("status", ["pending", "processing", "retry"]);

      const { data: completed } = await supabase
        .from("event_bus")
        .select("stage", { count: "exact" })
        .eq("status", "completed");

      const { count: dlqCount } = await supabase
        .from("dead_letter_queue")
        .select("*", { count: "exact", head: true });

      const stageMetrics: Record<string, any> = {};
      for (const e of (pending || [])) {
        if (!stageMetrics[e.stage]) stageMetrics[e.stage] = { pending: 0, processing: 0, retry: 0, completed: 0 };
        stageMetrics[e.stage][e.status] = (stageMetrics[e.stage][e.status] || 0) + 1;
      }
      for (const e of (completed || [])) {
        if (!stageMetrics[e.stage]) stageMetrics[e.stage] = { pending: 0, processing: 0, retry: 0, completed: 0 };
        stageMetrics[e.stage].completed += 1;
      }

      return jsonResponse({ stage_metrics: stageMetrics, dead_letter_count: dlqCount || 0 });
    }

    // ── ACTION: retry_dlq ──────────────────────────────────────────────────────
    if (action === "retry_dlq") {
      const { dead_letter_id } = body;
      if (!dead_letter_id) return jsonResponse({ error: "dead_letter_id required" }, 400);
      const { data: dlq, error: dlqErr } = await supabase
        .from("dead_letter_queue")
        .select("*")
        .eq("id", dead_letter_id)
        .single();
      if (dlqErr || !dlq) return jsonResponse({ error: "Dead letter not found" }, 404);
      await supabase.from("event_bus").insert({
        topic: dlq.topic,
        stage: dlq.stage,
        data_product_id: dlq.data_product_id,
        payload: dlq.payload,
        status: "pending",
        metadata: { retried_from_dlq: dlq.id },
      });
      await supabase.from("dead_letter_queue").delete().eq("id", dead_letter_id);
      return jsonResponse({ success: true, message: "Event re-queued" });
    }

    return jsonResponse({ error: "Unknown action. Use: publish, process, status, metrics, retry_dlq" }, 400);
  } catch (err) {
    console.error("Pipeline orchestrator error:", err);
    return jsonResponse({ error: "Internal server error", details: String(err) }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Content-Type": "application/json",
    },
  });
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAGE_FLOW: Record<string, string | null> = {
  ingestion: "processing",
  processing: "tagging",
  tagging: "correlation",
  correlation: "prioritization",
  prioritization: "transport",
  transport: null, // terminal
};

const TOPIC_MAP: Record<string, string> = {
  ingestion: "mdg.ingestion",
  processing: "mdg.processing",
  tagging: "mdg.tagging",
  correlation: "mdg.correlation",
  prioritization: "mdg.prioritization",
  transport: "mdg.transport",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const action = body.action || "process";

    // ACTION: publish - Push a new event onto the bus
    if (action === "publish") {
      const { data_product_id, topic, payload, stage } = body;
      if (!data_product_id) {
        return jsonResponse({ error: "data_product_id required" }, 400);
      }

      const eventStage = stage || "ingestion";
      const eventTopic = topic || TOPIC_MAP[eventStage] || "mdg.ingestion";

      const { data: event, error } = await supabase
        .from("event_bus")
        .insert({
          topic: eventTopic,
          stage: eventStage,
          data_product_id,
          payload: payload || {},
          status: "pending",
          partition_key: body.partition_key || "default",
          consumer_group: body.consumer_group || null,
          metadata: body.metadata || {},
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, event_id: event.id, stage: eventStage }, 201);
    }

    // ACTION: process - Pick up pending events and advance them through stages
    if (action === "process") {
      const batchSize = body.batch_size || 10;
      const targetStage = body.stage || null;

      // Fetch pending events (optionally filtered by stage), including retries that are due
      let query = supabase
        .from("event_bus")
        .select("*")
        .in("status", ["pending", "retry"])
        .order("offset_id", { ascending: true })
        .limit(batchSize);

      if (targetStage) {
        query = query.eq("stage", targetStage);
      }

      // For retry events, only pick ones whose next_retry_at has passed
      const { data: events, error: fetchErr } = await query;
      if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);

      const now = new Date();
      const eligibleEvents = (events || []).filter((e: any) => {
        if (e.status === "retry" && e.next_retry_at) {
          return new Date(e.next_retry_at) <= now;
        }
        return true;
      });

      const results = [];

      for (const event of eligibleEvents) {
        // Mark as processing
        await supabase
          .from("event_bus")
          .update({ status: "processing", started_at: now.toISOString() })
          .eq("id", event.id);

        try {
          // Execute stage logic
          const stageResult = await executeStage(supabase, event);

          const nextStage = STAGE_FLOW[event.stage];

          if (nextStage) {
            // Mark current event as completed
            await supabase
              .from("event_bus")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", event.id);

            // Publish next stage event
            await supabase.from("event_bus").insert({
              topic: TOPIC_MAP[nextStage],
              stage: nextStage,
              data_product_id: event.data_product_id,
              payload: { ...event.payload, ...stageResult },
              status: "pending",
              partition_key: event.partition_key,
              consumer_group: event.consumer_group,
              metadata: { previous_event_id: event.id, ...event.metadata },
            });

            // Update data_product status to match stage
            const statusMap: Record<string, string> = {
              processing: "processing",
              tagging: "tagged",
              prioritization: "prioritized",
              transport: "transported",
            };
            if (statusMap[nextStage]) {
              await supabase
                .from("data_products")
                .update({ status: statusMap[nextStage] })
                .eq("id", event.data_product_id);
            }
          } else {
            // Terminal stage - mark completed
            await supabase
              .from("event_bus")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", event.id);

            await supabase
              .from("data_products")
              .update({ status: "transported" })
              .eq("id", event.data_product_id);
          }

          results.push({ event_id: event.id, stage: event.stage, result: "advanced" });
        } catch (stageErr) {
          const retryCount = event.retry_count + 1;
          const errMsg = String(stageErr);

          if (retryCount >= event.max_retries) {
            // Move to dead letter queue
            await supabase.from("dead_letter_queue").insert({
              original_event_id: event.id,
              topic: event.topic,
              stage: event.stage,
              payload: event.payload,
              error_message: errMsg,
              retry_count: retryCount,
              data_product_id: event.data_product_id,
            });

            await supabase
              .from("event_bus")
              .update({ status: "dead_letter", error_message: errMsg, retry_count: retryCount })
              .eq("id", event.id);

            results.push({ event_id: event.id, stage: event.stage, result: "dead_letter" });
          } else {
            // Schedule retry with exponential backoff
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 300000); // max 5 min
            const nextRetry = new Date(Date.now() + backoffMs).toISOString();

            await supabase
              .from("event_bus")
              .update({
                status: "retry",
                error_message: errMsg,
                retry_count: retryCount,
                next_retry_at: nextRetry,
              })
              .eq("id", event.id);

            results.push({ event_id: event.id, stage: event.stage, result: "retry", retry_count: retryCount });
          }
        }
      }

      return jsonResponse({
        success: true,
        processed: results.length,
        results,
      });
    }

    // ACTION: status - Get pipeline status for a data product
    if (action === "status") {
      const { data_product_id } = body;
      if (!data_product_id) return jsonResponse({ error: "data_product_id required" }, 400);

      const { data: events } = await supabase
        .from("event_bus")
        .select("*")
        .eq("data_product_id", data_product_id)
        .order("offset_id", { ascending: true });

      return jsonResponse({ events: events || [] });
    }

    // ACTION: metrics - Get aggregate pipeline metrics
    if (action === "metrics") {
      const { data: pending } = await supabase
        .from("event_bus")
        .select("stage, status", { count: "exact" })
        .in("status", ["pending", "processing", "retry"]);

      const { data: completed } = await supabase
        .from("event_bus")
        .select("stage", { count: "exact" })
        .eq("status", "completed");

      const { data: deadLetters, count: dlqCount } = await supabase
        .from("dead_letter_queue")
        .select("*", { count: "exact", head: true });

      // Group by stage
      const stageMetrics: Record<string, any> = {};
      for (const e of (pending || [])) {
        if (!stageMetrics[e.stage]) stageMetrics[e.stage] = { pending: 0, processing: 0, retry: 0, completed: 0 };
        stageMetrics[e.stage][e.status] = (stageMetrics[e.stage][e.status] || 0) + 1;
      }
      for (const e of (completed || [])) {
        if (!stageMetrics[e.stage]) stageMetrics[e.stage] = { pending: 0, processing: 0, retry: 0, completed: 0 };
        stageMetrics[e.stage].completed += 1;
      }

      return jsonResponse({
        stage_metrics: stageMetrics,
        dead_letter_count: dlqCount || 0,
      });
    }

    // ACTION: retry_dlq - Retry a dead letter event
    if (action === "retry_dlq") {
      const { dead_letter_id } = body;
      if (!dead_letter_id) return jsonResponse({ error: "dead_letter_id required" }, 400);

      const { data: dlq, error: dlqErr } = await supabase
        .from("dead_letter_queue")
        .select("*")
        .eq("id", dead_letter_id)
        .single();

      if (dlqErr || !dlq) return jsonResponse({ error: "Dead letter not found" }, 404);

      // Re-publish to event bus
      await supabase.from("event_bus").insert({
        topic: dlq.topic,
        stage: dlq.stage,
        data_product_id: dlq.data_product_id,
        payload: dlq.payload,
        status: "pending",
        metadata: { retried_from_dlq: dlq.id },
      });

      // Remove from DLQ
      await supabase.from("dead_letter_queue").delete().eq("id", dead_letter_id);

      return jsonResponse({ success: true, message: "Event re-queued" });
    }

    return jsonResponse({ error: "Unknown action. Use: publish, process, status, metrics, retry_dlq" }, 400);
  } catch (err) {
    console.error("Pipeline orchestrator error:", err);
    return jsonResponse({ error: "Internal server error", details: String(err) }, 500);
  }
});

// Stage execution stubs - replace with real external API calls
async function executeStage(supabase: any, event: any): Promise<Record<string, any>> {
  const stage = event.stage;

  switch (stage) {
    case "ingestion":
      // Validate and normalize the data product
      return { ingested: true, normalized: true };

    case "processing":
      // Invoke BERT/CLIP/YOLO depending on source type
      return { processed: true, detections_count: 0 };

    case "tagging":
      // Extract and apply metadata tags
      if (event.data_product_id) {
        await supabase.from("metadata_tags").insert({
          data_product_id: event.data_product_id,
          tag_name: "pipeline_stage",
          tag_value: "auto_tagged",
          tag_category: "system",
          confidence: 1.0,
        });
      }
      return { tagged: true };

    case "correlation":
      // Check against commander's intent
      if (event.data_product_id) {
        const { data: intents } = await supabase
          .from("commander_intents")
          .select("*")
          .eq("is_active", true);

        const { data: detections } = await supabase
          .from("detection_results")
          .select("*")
          .eq("data_product_id", event.data_product_id);

        const alerts: any[] = [];
        if (intents && detections) {
          for (const intent of intents) {
            const term = intent.term.toLowerCase();
            for (const det of detections) {
              const label = det.label.toLowerCase().replace(/_/g, " ");
              if (label.includes(term) || term.includes(label)) {
                alerts.push({
                  intent_id: intent.id,
                  data_product_id: event.data_product_id,
                  detection_id: det.id,
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

        return { correlated: true, alerts_generated: alerts.length };
      }
      return { correlated: true, alerts_generated: 0 };

    case "prioritization":
      // Score and rank
      if (event.data_product_id) {
        const { data: product } = await supabase
          .from("data_products")
          .select("priority, priority_score")
          .eq("id", event.data_product_id)
          .single();

        // Boost priority if alerts exist
        const { count: alertCount } = await supabase
          .from("correlation_alerts")
          .select("*", { count: "exact", head: true })
          .eq("data_product_id", event.data_product_id);

        if (alertCount && alertCount > 0 && product) {
          const boostedScore = Math.min(1.0, (Number(product.priority_score) || 0.1) + alertCount * 0.1);
          await supabase
            .from("data_products")
            .update({ priority_score: boostedScore, status: "prioritized" })
            .eq("id", event.data_product_id);
        }
      }
      return { prioritized: true };

    case "transport":
      // Stub: mark as ready for transport / metadata-first delivery
      return { transported: true, transport_method: "metadata_first" };

    default:
      return {};
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Content-Type": "application/json",
    },
  });
}
