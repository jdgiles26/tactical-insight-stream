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

export function usePipelineStages() {
  return useQuery({
    queryKey: ["pipeline_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .order("stage_order", { ascending: true });
      if (error) throw error;
      return data as unknown as PipelineStage[];
    },
  });
}

export function useEventBusItems(stage?: string) {
  return useQuery({
    queryKey: ["event_bus", stage],
    queryFn: async () => {
      let query = supabase
        .from("event_bus")
        .select("*")
        .order("offset_id", { ascending: false })
        .limit(200);
      if (stage) query = query.eq("stage", stage);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as EventBusItem[];
    },
    refetchInterval: 3000,
  });
}

export function useDeadLetterQueue() {
  return useQuery({
    queryKey: ["dead_letter_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dead_letter_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as DeadLetterItem[];
    },
    refetchInterval: 5000,
  });
}

export function useEventBusMetrics() {
  return useQuery({
    queryKey: ["event_bus_metrics"],
    queryFn: async () => {
      const { data: allEvents, error } = await supabase
        .from("event_bus")
        .select("stage, status");
      if (error) throw error;

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
