
-- Add manual_correlations table for human-in-the-loop linking
CREATE TABLE public.manual_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES public.data_products(id) ON DELETE CASCADE,
  target_product_id uuid NOT NULL REFERENCES public.data_products(id) ON DELETE CASCADE,
  correlation_type text NOT NULL DEFAULT 'manual',
  justification text,
  confidence numeric DEFAULT 0.9,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_product_id, target_product_id)
);

ALTER TABLE public.manual_correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read manual_correlations" ON public.manual_correlations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert manual_correlations" ON public.manual_correlations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete manual_correlations" ON public.manual_correlations FOR DELETE USING (true);

-- Allow delete on data_products for hard delete
CREATE POLICY "Anyone can delete data_products" ON public.data_products FOR DELETE USING (true);

-- Allow delete on data_sources cascade + related data
CREATE POLICY "Anyone can delete detection_results" ON public.detection_results FOR DELETE USING (true);

-- Enable realtime for manual_correlations
ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_correlations;
