import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface DataSource {
  id: string;
  name: string;
  source_type: string;
  endpoint_url: string | null;
  auth_type: string | null;
  auth_credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  status: string;
  retry_count: number;
  max_retries: number;
  retry_delay_seconds: number;
  last_heartbeat: string | null;
  last_error: string | null;
  total_ingested: number;
  created_at: string;
  updated_at: string;
}

type DataSourceInsert = Omit<DataSource, "id" | "created_at" | "updated_at" | "total_ingested" | "retry_count">;

export function useDataSources() {
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("data_sources_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "data_sources" }, () => {
        queryClient.invalidateQueries({ queryKey: ["data_sources"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["data_sources"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("data_sources")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) { console.warn('[useDataSources]', error.message); return []; }
        return data as unknown as DataSource[];
      } catch (e) {
        console.warn('[useDataSources] Failed:', e);
        return [];
      }
    },
  });
}

export function useCreateDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: Partial<DataSourceInsert> & { name: string; source_type: string }) => {
      const { data, error } = await supabase
        .from("data_sources")
        .insert(source as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["data_sources"] }),
  });
}

export function useUpdateDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<DataSource>) => {
      const { data, error } = await supabase
        .from("data_sources")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["data_sources"] }),
  });
}

export function useDeleteDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("data_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["data_sources"] }),
  });
}
