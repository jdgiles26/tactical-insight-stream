import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface IngestPayload {
  source_id?: string;
  source_type: string;
  title: string;
  content?: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  priority?: string;
  source_identifier?: string;
  api_key?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: IngestPayload = await req.json();

    if (!payload.title || !payload.source_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, source_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If source_id provided, validate against data_sources and update heartbeat
    if (payload.source_id) {
      const { data: source, error: srcErr } = await supabase
        .from("data_sources")
        .select("id, auth_type, status")
        .eq("id", payload.source_id)
        .single();

      if (srcErr || !source) {
        return new Response(
          JSON.stringify({ error: "Unknown source_id" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update heartbeat and increment counter
      await supabase
        .from("data_sources")
        .update({
          last_heartbeat: new Date().toISOString(),
          status: "active",
          retry_count: 0,
          total_ingested: source.total_ingested + 1,
        })
        .eq("id", payload.source_id);
    }

    // Compute priority score
    const priorityScores: Record<string, number> = {
      critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1,
    };
    const priority = payload.priority || "routine";

    // Insert data product
    const { data: product, error: insertErr } = await supabase
      .from("data_products")
      .insert({
        title: payload.title,
        source_type: payload.source_type,
        source_identifier: payload.source_identifier || payload.source_id || null,
        content: payload.content || null,
        priority,
        priority_score: priorityScores[priority] || 0.1,
        confidence_score: 0.85,
        status: "ingested",
        latitude: payload.latitude || null,
        longitude: payload.longitude || null,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      // Update source with error if applicable
      if (payload.source_id) {
        await supabase
          .from("data_sources")
          .update({ last_error: insertErr.message, status: "error" })
          .eq("id", payload.source_id);
      }
      return new Response(
        JSON.stringify({ error: "Ingestion failed", details: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Queue for processing (legacy)
    await supabase.from("processing_queue").insert({
      data_product_id: product.id,
      step: "metadata_extraction",
      status: "pending",
    });

    // Publish to event bus pipeline
    await supabase.from("event_bus").insert({
      topic: "mdg.ingestion",
      stage: "ingestion",
      data_product_id: product.id,
      payload: { source_type: payload.source_type, priority },
      status: "pending",
      partition_key: payload.source_type,
    });

    return new Response(
      JSON.stringify({ success: true, product_id: product.id, title: product.title }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Ingest receiver error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
