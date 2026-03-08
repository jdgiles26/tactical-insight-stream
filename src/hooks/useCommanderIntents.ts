import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommanderIntent {
  id: string;
  term: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCommanderIntents() {
  return useQuery({
    queryKey: ["commander_intents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commander_intents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CommanderIntent[];
    },
  });
}

export function useCreateIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (intent: { term: string; description?: string; category?: string }) => {
      const { data, error } = await supabase
        .from("commander_intents")
        .insert(intent as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commander_intents"] }),
  });
}

export function useToggleIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("commander_intents")
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commander_intents"] }),
  });
}

export function useDeleteIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commander_intents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commander_intents"] }),
  });
}
