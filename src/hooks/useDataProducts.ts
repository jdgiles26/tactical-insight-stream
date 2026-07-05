import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DataProduct = Database["public"]["Tables"]["data_products"]["Row"];
type DataProductInsert = Database["public"]["Tables"]["data_products"]["Insert"];

export function useDataProducts() {
  return useQuery({
    queryKey: ["data_products"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("data_products")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) { console.warn('[useDataProducts]', error.message); return []; }
        return data as DataProduct[];
      } catch (e) {
        console.warn('[useDataProducts] Failed:', e);
        return [];
      }
    },
    refetchInterval: 15_000, // refresh every 15 s for live tile counts
  });
}

export function useAllGeoProducts() {
  return useQuery({
    queryKey: ["data_products_geo"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("data_products")
          .select("*")
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) { console.warn('[useAllGeoProducts]', error.message); return []; }
        return data as DataProduct[];
      } catch (e) {
        console.warn('[useAllGeoProducts] Failed:', e);
        return [];
      }
    },
    refetchInterval: 15 * 60 * 1000, // auto-refresh every 15 min
  });
}

export function useIngestData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: DataProductInsert) => {
      const { data, error } = await supabase
        .from("data_products")
        .insert(product)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["data_products"] });
      queryClient.invalidateQueries({ queryKey: ["data_products_geo"] });
      // Create pipeline event
      if (data?.id) {
        supabase.from("event_bus").insert({
          topic: 'mdg.ingestion',
          partition_key: data.source_type || 'default',
          payload: { title: data.title, source_type: data.source_type, product_id: data.id },
          status: 'completed',
          stage: 'ingestion',
          data_product_id: data.id,
          retry_count: 0,
          max_retries: 3,
          metadata: {},
        } as any).then(({ error }) => {
          if (error) console.warn('[EventBus]', error.message);
        });
      }
    },
  });
}

export function useDataProductStats() {
  return useQuery({
    queryKey: ["data_product_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_products")
        .select("status, priority, source_type");
      if (error) { console.warn('[useDataProductStats]', error.message); return { total: 0, byStatus: {}, byPriority: {}, bySource: {} }; }
      
      const total = data.length;
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      
      data.forEach((d) => {
        byStatus[d.status] = (byStatus[d.status] || 0) + 1;
        if (d.priority) byPriority[d.priority] = (byPriority[d.priority] || 0) + 1;
        bySource[d.source_type] = (bySource[d.source_type] || 0) + 1;
      });

      return { total, byStatus, byPriority, bySource };
    },
  });
}

export function useSearchDataProducts(query: string) {
  return useQuery({
    queryKey: ["data_products_search", query],
    queryFn: async () => {
      if (!query.trim()) {
        const { data, error } = await supabase
          .from("data_products")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data as DataProduct[];
      }
      const { data, error } = await supabase
        .from("data_products")
        .select("*")
        .ilike("title", `%${query}%`)
        .order("priority_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as DataProduct[];
    },
    enabled: true,
  });
}
