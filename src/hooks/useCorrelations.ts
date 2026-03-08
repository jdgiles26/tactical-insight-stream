import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ManualCorrelation {
  id: string;
  source_product_id: string;
  target_product_id: string;
  correlation_type: string;
  justification: string | null;
  confidence: number | null;
  created_at: string;
}

export interface DetectionResult {
  id: string;
  data_product_id: string;
  detector_type: string;
  label: string;
  confidence: number | null;
  bounding_box: any;
  metadata: any;
  created_at: string;
}

export function useDataProductCorrelations(productId: string | null) {
  return useQuery({
    queryKey: ["correlations", productId],
    enabled: !!productId,
    queryFn: async () => {
      if (!productId) return { alerts: [], detections: [], manualLinks: [], relatedProducts: [] };

      // Get correlation alerts for this product
      const { data: alerts } = await supabase
        .from("correlation_alerts")
        .select("*")
        .eq("data_product_id", productId)
        .order("match_score", { ascending: false });

      // Get detection results
      const { data: detections } = await supabase
        .from("detection_results")
        .select("*")
        .eq("data_product_id", productId);

      // Get manual correlations (both directions)
      const { data: manualFrom } = await supabase
        .from("manual_correlations")
        .select("*")
        .eq("source_product_id", productId);

      const { data: manualTo } = await supabase
        .from("manual_correlations")
        .select("*")
        .eq("target_product_id", productId);

      const manualLinks = [...(manualFrom || []), ...(manualTo || [])] as unknown as ManualCorrelation[];

      // Find related products via shared intent matches
      const intentIds = [...new Set((alerts || []).map((a: any) => a.intent_id))];
      let relatedProducts: any[] = [];
      if (intentIds.length > 0) {
        const { data: relatedAlerts } = await supabase
          .from("correlation_alerts")
          .select("data_product_id, matched_term, match_score")
          .in("intent_id", intentIds)
          .neq("data_product_id", productId)
          .limit(20);

        const relatedIds = [...new Set((relatedAlerts || []).map((a: any) => a.data_product_id))];
        if (relatedIds.length > 0) {
          const { data: products } = await supabase
            .from("data_products")
            .select("id, title, source_type, priority, created_at, source_identifier")
            .in("id", relatedIds);
          relatedProducts = (products || []).map((p: any) => ({
            ...p,
            shared_terms: (relatedAlerts || [])
              .filter((a: any) => a.data_product_id === p.id)
              .map((a: any) => ({ term: a.matched_term, score: a.match_score })),
          }));
        }
      }

      // Compute correlation percentages
      const totalSignals = (alerts?.length || 0) + (detections?.length || 0) + manualLinks.length;
      const breakdown = {
        auto_alerts: alerts?.length || 0,
        detections: detections?.length || 0,
        manual_links: manualLinks.length,
        total: totalSignals,
        auto_pct: totalSignals ? Math.round(((alerts?.length || 0) / totalSignals) * 100) : 0,
        detection_pct: totalSignals ? Math.round(((detections?.length || 0) / totalSignals) * 100) : 0,
        manual_pct: totalSignals ? Math.round((manualLinks.length / totalSignals) * 100) : 0,
      };

      return {
        alerts: alerts || [],
        detections: (detections || []) as unknown as DetectionResult[],
        manualLinks,
        relatedProducts,
        breakdown,
      };
    },
  });
}

export function useCreateManualCorrelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      source_product_id: string;
      target_product_id: string;
      justification?: string;
      correlation_type?: string;
    }) => {
      const { data, error } = await supabase
        .from("manual_correlations")
        .insert({
          source_product_id: params.source_product_id,
          target_product_id: params.target_product_id,
          justification: params.justification || null,
          correlation_type: params.correlation_type || "manual",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["correlations"] });
    },
  });
}

export function useDeleteManualCorrelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_correlations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correlations"] }),
  });
}

export function useDeleteDataProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete related data first
      await supabase.from("detection_results").delete().eq("data_product_id", id);
      await supabase.from("correlation_alerts").delete().eq("data_product_id", id);
      await supabase.from("processing_queue").delete().eq("data_product_id", id);
      await supabase.from("event_bus").delete().eq("data_product_id", id);
      await supabase.from("metadata_tags").delete().eq("data_product_id", id);
      // Then delete the product
      const { error } = await supabase.from("data_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data_products"] });
      qc.invalidateQueries({ queryKey: ["correlations"] });
    },
  });
}
