
-- Commander's Intent: objects of interest that commanders want to track
CREATE TABLE public.commander_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.commander_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read commander_intents" ON public.commander_intents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert commander_intents" ON public.commander_intents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update commander_intents" ON public.commander_intents FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete commander_intents" ON public.commander_intents FOR DELETE USING (true);

-- Detection results from ML processing (YOLO, BERT, CLIP stubs)
CREATE TABLE public.detection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_product_id UUID REFERENCES public.data_products(id) ON DELETE CASCADE NOT NULL,
  detector_type TEXT NOT NULL, -- 'yolo', 'bert', 'clip'
  label TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0,
  bounding_box JSONB, -- {x, y, w, h} for YOLO
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.detection_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read detection_results" ON public.detection_results FOR SELECT USING (true);
CREATE POLICY "Anyone can insert detection_results" ON public.detection_results FOR INSERT WITH CHECK (true);

-- Correlation alerts: triggered when detections match commander's intent
CREATE TABLE public.correlation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID REFERENCES public.commander_intents(id) ON DELETE CASCADE NOT NULL,
  data_product_id UUID REFERENCES public.data_products(id) ON DELETE CASCADE NOT NULL,
  detection_id UUID REFERENCES public.detection_results(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL, -- 'exact', 'semantic', 'related'
  match_score NUMERIC DEFAULT 1.0,
  matched_term TEXT NOT NULL,
  matched_label TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.correlation_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read correlation_alerts" ON public.correlation_alerts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert correlation_alerts" ON public.correlation_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update correlation_alerts" ON public.correlation_alerts FOR UPDATE USING (true);

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.correlation_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.detection_results;

-- Storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true);

-- Storage policies
CREATE POLICY "Anyone can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "Anyone can read uploads" ON storage.objects FOR SELECT USING (bucket_id = 'uploads');

-- Trigger for updated_at on commander_intents
CREATE TRIGGER update_commander_intents_updated_at
  BEFORE UPDATE ON public.commander_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
