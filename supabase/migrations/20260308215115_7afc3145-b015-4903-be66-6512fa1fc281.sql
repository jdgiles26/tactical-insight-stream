
-- Event bus table: Kafka-compatible event queue with topics, partitions, consumer groups
CREATE TABLE public.event_bus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  partition_key text DEFAULT 'default',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  stage text NOT NULL DEFAULT 'ingestion',
  data_product_id uuid REFERENCES public.data_products(id) ON DELETE CASCADE,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 5,
  error_message text,
  consumer_group text,
  offset_id bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Dead letter queue for permanently failed events
CREATE TABLE public.dead_letter_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid REFERENCES public.event_bus(id),
  topic text NOT NULL,
  stage text NOT NULL,
  payload jsonb NOT NULL,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  data_product_id uuid REFERENCES public.data_products(id) ON DELETE CASCADE
);

-- Pipeline stages definition
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  stage_order integer NOT NULL,
  topic text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  timeout_seconds integer NOT NULL DEFAULT 300,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default pipeline stages
INSERT INTO public.pipeline_stages (name, display_name, stage_order, topic) VALUES
  ('ingestion', 'Ingestion', 1, 'mdg.ingestion'),
  ('processing', 'Processing', 2, 'mdg.processing'),
  ('tagging', 'Metadata Tagging', 3, 'mdg.tagging'),
  ('correlation', 'Correlation', 4, 'mdg.correlation'),
  ('prioritization', 'Prioritization', 5, 'mdg.prioritization'),
  ('transport', 'Transport', 6, 'mdg.transport');

-- Indexes for event bus performance
CREATE INDEX idx_event_bus_status ON public.event_bus(status);
CREATE INDEX idx_event_bus_topic ON public.event_bus(topic);
CREATE INDEX idx_event_bus_stage ON public.event_bus(stage);
CREATE INDEX idx_event_bus_data_product ON public.event_bus(data_product_id);
CREATE INDEX idx_event_bus_next_retry ON public.event_bus(next_retry_at) WHERE status = 'retry';

-- RLS
ALTER TABLE public.event_bus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read event_bus" ON public.event_bus FOR SELECT USING (true);
CREATE POLICY "Anyone can insert event_bus" ON public.event_bus FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update event_bus" ON public.event_bus FOR UPDATE USING (true);

CREATE POLICY "Anyone can read dead_letter_queue" ON public.dead_letter_queue FOR SELECT USING (true);
CREATE POLICY "Anyone can insert dead_letter_queue" ON public.dead_letter_queue FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read pipeline_stages" ON public.pipeline_stages FOR SELECT USING (true);

-- Enable realtime for event bus
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_bus;
