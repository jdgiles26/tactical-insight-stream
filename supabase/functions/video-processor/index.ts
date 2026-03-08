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

    // Update status
    await supabase
      .from("data_products")
      .update({ status: "processing" })
      .eq("id", data_product_id);

    await supabase.from("processing_queue").insert({
      data_product_id,
      step: "video_yolo_detection",
      status: "processing",
      started_at: new Date().toISOString(),
    });

    // ========================================================
    // STUB: External YOLO API integration point
    // In production, replace with actual calls to:
    //   - YOLOv8 endpoint for real-time object detection
    //   - Frame extraction service
    //   - Custom maritime model endpoint
    //
    // Expected external API pattern:
    // const yoloResponse = await fetch(YOLO_API_URL, {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${YOLO_API_KEY}` },
    //   body: JSON.stringify({
    //     video_url: publicUrl,
    //     model: "yolov8-maritime",
    //     confidence_threshold: 0.5,
    //     frame_interval: 30, // every 30 frames
    //   }),
    // });
    // ========================================================

    // Simulated YOLO detection results for maritime objects
    const maritimeDetections = [
      { label: "cargo_vessel", confidence: 0.96, bbox: { x: 120, y: 80, w: 340, h: 180 }, frame: 1 },
      { label: "small_craft", confidence: 0.89, bbox: { x: 450, y: 200, w: 120, h: 80 }, frame: 1 },
      { label: "person_overboard", confidence: 0.73, bbox: { x: 580, y: 310, w: 40, h: 60 }, frame: 15 },
      { label: "buoy", confidence: 0.91, bbox: { x: 200, y: 350, w: 30, h: 40 }, frame: 30 },
      { label: "submarine_periscope", confidence: 0.62, bbox: { x: 700, y: 180, w: 15, h: 45 }, frame: 45 },
      { label: "fishing_vessel", confidence: 0.88, bbox: { x: 50, y: 150, w: 200, h: 120 }, frame: 60 },
      { label: "speedboat", confidence: 0.94, bbox: { x: 350, y: 100, w: 150, h: 90 }, frame: 90 },
      { label: "military_vessel", confidence: 0.82, bbox: { x: 10, y: 50, w: 400, h: 200 }, frame: 120 },
    ];

    // Insert detections
    for (const det of maritimeDetections) {
      await supabase.from("detection_results").insert({
        data_product_id,
        detector_type: "yolo",
        label: det.label,
        confidence: det.confidence,
        bounding_box: det.bbox,
        metadata: { file_path, frame: det.frame, simulated: true },
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
        for (const det of maritimeDetections) {
          const label = det.label.toLowerCase().replace(/_/g, " ");
          if (label.includes(term) || term.includes(label) || wordOverlap(term, label)) {
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

    // Also check for multi-source correlation: if same intents matched across different data products
    if (intents && alerts.length > 0) {
      for (const alert of alerts) {
        const { data: relatedAlerts } = await supabase
          .from("correlation_alerts")
          .select("id, data_product_id")
          .eq("intent_id", alert.intent_id)
          .neq("data_product_id", data_product_id)
          .limit(5);

        if (relatedAlerts && relatedAlerts.length > 0) {
          // Insert a cross-source correlation alert
          await supabase.from("correlation_alerts").insert({
            intent_id: alert.intent_id,
            data_product_id,
            match_type: "cross_source",
            match_score: alert.match_score,
            matched_term: alert.matched_term,
            matched_label: `${alert.matched_label} (correlated across ${relatedAlerts.length + 1} sources)`,
          });
        }
      }
    }

    await supabase
      .from("data_products")
      .update({ status: "tagged" })
      .eq("id", data_product_id);

    await supabase
      .from("processing_queue")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("data_product_id", data_product_id)
      .eq("step", "video_yolo_detection");

    return new Response(
      JSON.stringify({
        success: true,
        detections: maritimeDetections.length,
        alerts: alerts.length,
        stub: true,
        message: "Video processed via YOLO stub. Replace with external YOLOv8 API for production.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Video processor error:", err);
    return new Response(
      JSON.stringify({ error: "Processing failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function wordOverlap(a: string, b: string): boolean {
  const wa = a.split(/[\s_]+/);
  const wb = b.split(/[\s_]+/);
  return wa.some((w) => w.length > 2 && wb.includes(w));
}
