import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmergencyTrigger {
  id: string;
  data_product_id: string | null;
  trigger_type: string;
  sentiment_score: number | null;
  urgency_level: string;
  key_elements: Record<string, string>;
  commander_intent: string | null;
  is_active: boolean;
  raw_text_excerpt: string | null;
  created_at: string;
  deactivated_at: string | null;
}

export interface MissionGroup {
  id: string;
  group_name: string;
  trigger_id: string;
  confidence: string;
  risk_level: string;
  correlation_method: string | null;
  summary: string | null;
  prediction: Record<string, string>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GroupEvidence {
  id: string;
  group_id: string;
  evidence_type: string;
  source_ref: string | null;
  data_product_id: string | null;
  registry_entry_id: string | null;
  description: string | null;
  timestamp_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useEmergencyTriggers() {
  return useQuery({
    queryKey: ["emergency_triggers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emergency_triggers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as EmergencyTrigger[];
    },
    refetchInterval: 15000,
  });
}

export function useActiveEmergencyTriggers() {
  return useQuery({
    queryKey: ["emergency_triggers", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emergency_triggers")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as EmergencyTrigger[];
    },
    refetchInterval: 10000,
  });
}

export function useMissionGroups(triggerId?: string | null) {
  return useQuery({
    queryKey: ["mission_groups", triggerId],
    queryFn: async () => {
      let query = supabase
        .from("mission_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (triggerId) query = query.eq("trigger_id", triggerId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as MissionGroup[];
    },
    refetchInterval: 15000,
  });
}

export function useGroupEvidence(groupId?: string | null) {
  return useQuery({
    queryKey: ["group_evidence", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_evidence")
        .select("*")
        .eq("group_id", groupId!)
        .order("timestamp_ref", { ascending: true });
      if (error) throw error;
      return data as unknown as GroupEvidence[];
    },
  });
}

export function useDeactivateTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("emergency_triggers")
        .update({ is_active: false, deactivated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergency_triggers"] });
    },
  });
}
