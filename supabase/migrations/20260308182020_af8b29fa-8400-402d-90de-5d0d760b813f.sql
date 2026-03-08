
-- Create enum for data source types
CREATE TYPE public.source_type AS ENUM ('sensor', 'cot_message', 'image', 'video', 'document', 'sigint', 'humint', 'geoint');

-- Create enum for priority levels
CREATE TYPE public.priority_level AS ENUM ('critical', 'high', 'medium', 'low', 'routine');

-- Create enum for data status
CREATE TYPE public.data_status AS ENUM ('ingested', 'processing', 'tagged', 'prioritized', 'transported', 'archived');

-- Create data_products table
CREATE TABLE public.data_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    source_type source_type NOT NULL DEFAULT 'sensor',
    source_identifier TEXT,
    content JSONB,
    status data_status NOT NULL DEFAULT 'ingested',
    priority priority_level DEFAULT 'routine',
    priority_score NUMERIC(4,2) DEFAULT 0,
    confidence_score NUMERIC(4,2) DEFAULT 0,
    priority_reasoning TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create metadata_tags table
CREATE TABLE public.metadata_tags (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    data_product_id UUID NOT NULL REFERENCES public.data_products(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    tag_value TEXT NOT NULL,
    tag_category TEXT DEFAULT 'general',
    confidence NUMERIC(4,2) DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create processing_queue table
CREATE TABLE public.processing_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    data_product_id UUID NOT NULL REFERENCES public.data_products(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create system_metrics table for dashboard
CREATE TABLE public.system_metrics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    unit TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.data_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;

-- Anon access for demo
CREATE POLICY "Anyone can read data_products" ON public.data_products FOR SELECT USING (true);
CREATE POLICY "Anyone can insert data_products" ON public.data_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update data_products" ON public.data_products FOR UPDATE USING (true);

CREATE POLICY "Anyone can read metadata_tags" ON public.metadata_tags FOR SELECT USING (true);
CREATE POLICY "Anyone can insert metadata_tags" ON public.metadata_tags FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read processing_queue" ON public.processing_queue FOR SELECT USING (true);
CREATE POLICY "Anyone can insert processing_queue" ON public.processing_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update processing_queue" ON public.processing_queue FOR UPDATE USING (true);

CREATE POLICY "Anyone can read system_metrics" ON public.system_metrics FOR SELECT USING (true);
CREATE POLICY "Anyone can insert system_metrics" ON public.system_metrics FOR INSERT WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_data_products_status ON public.data_products(status);
CREATE INDEX idx_data_products_priority ON public.data_products(priority);
CREATE INDEX idx_data_products_source ON public.data_products(source_type);
CREATE INDEX idx_data_products_created ON public.data_products(created_at DESC);
CREATE INDEX idx_metadata_tags_product ON public.metadata_tags(data_product_id);
CREATE INDEX idx_metadata_tags_name ON public.metadata_tags(tag_name);
CREATE INDEX idx_processing_queue_product ON public.processing_queue(data_product_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_data_products_updated_at
    BEFORE UPDATE ON public.data_products
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
