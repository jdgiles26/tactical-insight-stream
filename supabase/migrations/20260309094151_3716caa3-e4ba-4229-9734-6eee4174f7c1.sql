CREATE TABLE public.storm_threat_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  threat_level TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  sensor_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  avg_water_level NUMERIC,
  max_water_level NUMERIC,
  details JSONB DEFAULT '[]'::jsonb,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.storm_threat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read storm_threat_history" ON public.storm_threat_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert storm_threat_history" ON public.storm_threat_history FOR INSERT WITH CHECK (true);

CREATE INDEX idx_storm_threat_history_recorded_at ON public.storm_threat_history (recorded_at DESC);