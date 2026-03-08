import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CorrelationAlert {
  id: string;
  intent_id: string;
  data_product_id: string;
  detection_id: string | null;
  match_type: string;
  match_score: number;
  matched_term: string;
  matched_label: string;
  acknowledged: boolean;
  created_at: string;
}

export function useCorrelationAlerts() {
  return useQuery({
    queryKey: ["correlation_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("correlation_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as CorrelationAlert[];
    },
  });
}

export function useRealtimeAlerts(onNewAlert: (alert: CorrelationAlert) => void) {
  useEffect(() => {
    const channel = supabase
      .channel("correlation_alerts_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "correlation_alerts" },
        (payload) => {
          onNewAlert(payload.new as CorrelationAlert);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onNewAlert]);
}

export function useAcknowledgeAlert() {
  return {
    acknowledge: async (id: string) => {
      const { error } = await supabase
        .from("correlation_alerts")
        .update({ acknowledged: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
  };
}
