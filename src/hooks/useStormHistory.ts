import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StormSnapshot {
  id: string;
  threat_level: string;
  score: number;
  sensor_count: number;
  critical_count: number;
  high_count: number;
  avg_water_level: number | null;
  max_water_level: number | null;
  details: string[];
  recorded_at: string;
}

export function useStormHistory(hours = 48) {
  return useQuery({
    queryKey: ["storm_threat_history", hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("storm_threat_history")
        .select("*")
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as StormSnapshot[];
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRecordStormSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (snapshot: Omit<StormSnapshot, "id" | "recorded_at">) => {
      const { error } = await supabase.from("storm_threat_history").insert({
        threat_level: snapshot.threat_level,
        score: snapshot.score,
        sensor_count: snapshot.sensor_count,
        critical_count: snapshot.critical_count,
        high_count: snapshot.high_count,
        avg_water_level: snapshot.avg_water_level,
        max_water_level: snapshot.max_water_level,
        details: snapshot.details as any,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storm_threat_history"] }),
  });
}
