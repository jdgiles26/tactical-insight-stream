import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CorrelationResult {
  source_id: string;
  correlation_type: string;
  confidence: number;
  description: string;
}

export interface CorrelationAnalysis {
  priority_score: number;
  threat_level: string;
  correlations: CorrelationResult[];
  summary: string;
}

/**
 * Hook for triggering AI-powered correlation analysis between data sources.
 * Finds spatial, temporal, and thematic relationships across ingested data.
 */
export function useCorrelationAnalysis() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CorrelationAnalysis | null>(null);

  const analyzeCorrelations = async (productId?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-analysis-agent", {
        body: {
          type: "correlation",
          content: productId ? { product_id: productId } : {},
          context: ["spatial", "temporal", "thematic"],
        },
      });

      if (error) throw error;

      if (data?.analysis) {
        setAnalysis(data.analysis);
        toast.success(`Found ${data.analysis.correlations?.length || 0} correlations`);
        return data.analysis;
      }

      toast.info("No correlations found");
      return null;
    } catch (err: any) {
      console.error("Correlation analysis error:", err);
      toast.error(`Correlation analysis failed: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    analysis,
    analyzeCorrelations,
  };
}
