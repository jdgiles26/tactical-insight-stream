import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EventBusItem {
  id: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  status: string;
  stage: string;
  data_product_id: string | null;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  consumer_group: string | null;
  offset_id: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_retry_at: string | null;
  metadata: Record<string, unknown>;
}

export interface DeadLetterItem {
  id: string;
  original_event_id: string | null;
  topic: string;
  stage: string;
  payload: Record<string, unknown>;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  data_product_id: string | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  display_name: string;
  stage_order: number;
  topic: string;
  is_active: boolean;
  timeout_seconds: number;
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: '1', name: 'ingestion', display_name: 'Ingestion', stage_order: 1, topic: 'mdg.ingestion', is_active: true, timeout_seconds: 300 },
  { id: '2', name: 'processing', display_name: 'Processing', stage_order: 2, topic: 'mdg.processing', is_active: true, timeout_seconds: 600 },
  { id: '3', name: 'enrichment', display_name: 'Enrichment', stage_order: 3, topic: 'mdg.enrichment', is_active: true, timeout_seconds: 300 },
  { id: '4', name: 'correlation', display_name: 'Correlation', stage_order: 4, topic: 'mdg.correlation', is_active: true, timeout_seconds: 300 },
  { id: '5', name: 'dissemination', display_name: 'Dissemination', stage_order: 5, topic: 'mdg.dissemination', is_active: true, timeout_seconds: 300 },
];

export function usePipelineStages() {
  return useQuery({
    queryKey: ["pipeline_stages"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("pipeline_stages")
          .select("*")
          .order("stage_order", { ascending: true });
        if (error) { console.warn('[usePipelineStages]', error.message); return DEFAULT_STAGES; }
        return (data as unknown as PipelineStage[]).length ? data as unknown as PipelineStage[] : DEFAULT_STAGES;
      } catch (e) {
        console.warn('[usePipelineStages] Failed:', e);
        return DEFAULT_STAGES;
      }
    },
  });
}

export function useEventBusItems(stage?: string) {
  return useQuery({
    queryKey: ["event_bus", stage],
    queryFn: async () => {
      try {
        let query = supabase
          .from("event_bus")
          .select("*")
          .order("offset_id", { ascending: false })
          .limit(200);
        if (stage) query = query.eq("stage", stage);
        const { data, error } = await query;
        if (error) { console.warn('[useEventBusItems]', error.message); return []; }
        return data as unknown as EventBusItem[];
      } catch (e) {
        console.warn('[useEventBusItems] Failed:', e);
        return [];
      }
    },
    refetchInterval: 3000,
  });
}

export function useDeadLetterQueue() {
  return useQuery({
    queryKey: ["dead_letter_queue"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("dead_letter_queue")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) { console.warn('[useDeadLetterQueue]', error.message); return []; }
        return data as unknown as DeadLetterItem[];
      } catch (e) {
        console.warn('[useDeadLetterQueue] Failed:', e);
        return [];
      }
    },
    refetchInterval: 5000,
  });
}

export function useEventBusMetrics() {
  return useQuery({
    queryKey: ["event_bus_metrics"],
    queryFn: async () => {
      try {
        const { data: allEvents, error } = await supabase
          .from("event_bus")
          .select("stage, status");
        if (error) { console.warn('[useEventBusMetrics]', error.message); return { stageMetrics: {}, deadLetterCount: 0 }; }

        const stageMetrics: Record<string, Record<string, number>> = {};
        for (const e of (allEvents || [])) {
          const ev = e as unknown as { stage: string; status: string };
          if (!stageMetrics[ev.stage]) stageMetrics[ev.stage] = {};
          stageMetrics[ev.stage][ev.status] = (stageMetrics[ev.stage][ev.status] || 0) + 1;
        }

        const { count: dlqCount } = await supabase
          .from("dead_letter_queue")
          .select("*", { count: "exact", head: true });

        return { stageMetrics, deadLetterCount: dlqCount || 0 };
      } catch (e) {
        console.warn('[useEventBusMetrics] Failed:', e);
        return { stageMetrics: {}, deadLetterCount: 0 };
      }
    },
    refetchInterval: 3000,
  });
}

export function usePublishEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { data_product_id: string; stage?: string; payload?: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { action: "publish", ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_bus"] });
      qc.invalidateQueries({ queryKey: ["event_bus_metrics"] });
    },
  });
}

export function useProcessEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params?: { stage?: string; batch_size?: number }) => {
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { action: "process", ...(params || {}) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_bus"] });
      qc.invalidateQueries({ queryKey: ["event_bus_metrics"] });
      qc.invalidateQueries({ queryKey: ["correlation_alerts"] });
    },
  });
}

export function useRetryDeadLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dead_letter_id: string) => {
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { action: "retry_dlq", dead_letter_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dead_letter_queue"] });
      qc.invalidateQueries({ queryKey: ["event_bus"] });
    },
  });
}

export function useRealtimeEventBus(onEvent: (event: EventBusItem) => void) {
  useEffect(() => {
    const channel = supabase
      .channel("event_bus_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_bus" },
        (payload) => onEvent(payload.new as unknown as EventBusItem)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onEvent]);
}
