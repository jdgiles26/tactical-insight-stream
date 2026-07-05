import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Detection } from "@/lib/streamTypes";
import { confidenceToPriority } from "@/lib/streamTypes";

/**
 * Fetches the latest detection results from the detection_results table.
 * Maps raw DB rows into the Detection interface used by the UI.
 *
 * @param limit - Maximum number of detection results to return (default: 100)
 * @param refetchInterval - Auto-refetch interval in ms (default: 5000 = 5s)
 */
export function useDetectionResults(limit = 100, refetchInterval = 5000) {
  return useQuery({
    queryKey: ["detection_results", limit],
    queryFn: async (): Promise<Detection[]> => {
      const { data, error } = await supabase
        .from("detection_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!data) return [];

      return data.map((row: Record<string, unknown>) => {
        const label = (row.label as string) || "unknown";
        const confidence = typeof row.confidence === "number" ? row.confidence : 0;
        const bbox =
          row.bounding_box && typeof row.bounding_box === "object"
            ? (row.bounding_box as { x: number; y: number; w: number; h: number })
            : { x: 0, y: 0, w: 0, h: 0 };

        return {
          id: row.id as string,
          label,
          confidence,
          bbox,
          priority: confidenceToPriority(confidence, label),
          timestamp: (row.created_at as string) || new Date().toISOString(),
        };
      });
    },
    refetchInterval,
  });
}
