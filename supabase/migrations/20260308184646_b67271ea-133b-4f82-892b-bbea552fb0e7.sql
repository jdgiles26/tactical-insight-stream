
-- Data sources configuration table for ingestion framework
CREATE TABLE public.data_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('rtsp_camera', 'audio_feed', 'document', 'sensor_telemetry', 'rss_feed')),
  endpoint_url TEXT,
  auth_type TEXT CHECK (auth_type IN ('none', 'api_key', 'basic', 'bearer', 'certificate')),
  auth_credentials JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'connecting')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  retry_delay_seconds INTEGER NOT NULL DEFAULT 30,
  last_heartbeat TIMESTAMPTZ,
  last_error TEXT,
  total_ingested BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (matching existing pattern)
CREATE POLICY "Anyone can read data_sources" ON public.data_sources FOR SELECT USING (true);
CREATE POLICY "Anyone can insert data_sources" ON public.data_sources FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update data_sources" ON public.data_sources FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete data_sources" ON public.data_sources FOR DELETE USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_sources;
