import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Add processing queue entry
    await supabase.from("processing_queue").insert({
      data_product_id,
      step: "document_analysis",
      status: "processing",
      started_at: new Date().toISOString(),
    });

    // ========================================================
    // STUB: External BERT/CLIP API integration point
    // In production, replace with actual calls to:
    //   - BERT endpoint for text entity extraction & NER
    //   - CLIP endpoint for image-text similarity matching
    // ========================================================
    // Example external call pattern:
    // const bertResponse = await fetch(BERT_API_URL, {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${BERT_API_KEY}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ file_url: publicUrl, tasks: ["ner", "classification"] }),
    // });

    // Simulated BERT extraction results
    const simulatedEntities = [
      { label: "vessel_name", confidence: 0.92, detector_type: "bert" },
      { label: "port_of_origin", confidence: 0.88, detector_type: "bert" },
      { label: "cargo_manifest", confidence: 0.85, detector_type: "bert" },
      { label: "crew_roster", confidence: 0.79, detector_type: "bert" },
    ];

    // Simulated CLIP visual-text matching
    const simulatedClipResults = [
      { label: "maritime_document", confidence: 0.94, detector_type: "clip" },
      { label: "official_stamp", confidence: 0.72, detector_type: "clip" },
    ];

    const allDetections = [...simulatedEntities, ...simulatedClipResults];

    // Insert detection results
    for (const det of allDetections) {
      await supabase.from("detection_results").insert({
        data_product_id,
        detector_type: det.detector_type,
        label: det.label,
        confidence: det.confidence,
        metadata: { file_path, simulated: true },
      });
    }

    // Check commander's intent for correlations
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
          if (label.includes(term) || term.includes(label) || levenshteinSimilar(term, label)) {
            alerts.push({
              intent_id: intent.id,
              data_product_id,
              match_type: label.includes(term) ? "exact" : "related",
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

    // Complete queue entry
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
        stub: true,
        message: "Document processed via BERT/CLIP stubs. Replace with external API calls for production.",
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

// Simple similarity check
function levenshteinSimilar(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const words_a = a.split(/\s+/);
  const words_b = b.split(/\s+/);
  return words_a.some((wa) => words_b.some((wb) => wa === wb || (wa.length > 3 && wb.includes(wa)) || (wb.length > 3 && wa.includes(wb))));
}
