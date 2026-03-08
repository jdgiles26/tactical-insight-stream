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
