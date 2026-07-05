-- ============================================================
-- Mission Intelligence Engine: Silent Registry, Emergency Triggers,
-- Mission Groups & Paired Evidence
-- ============================================================

-- Silent Object Registry
-- YOLO detections accumulate here WITHOUT generating alerts.
-- Objects are deduplicated by (label, data_product_id window).
-- Alerts are only generated when an emergency trigger is active.
CREATE TABLE public.silent_object_registry (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  object_uid        TEXT        NOT NULL,   -- stable deduplicated key: label + source bucket
  label             TEXT        NOT NULL,
  confidence        NUMERIC(4,2),
  bounding_box      JSONB       DEFAULT '{}'::jsonb,
  source_type       TEXT        NOT NULL DEFAULT 'video',
  data_product_id   UUID        REFERENCES public.data_products(id) ON DELETE SET NULL,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count        INTEGER     NOT NULL DEFAULT 1,
  frame_metadata    JSONB       DEFAULT '{}'::jsonb,
  is_matched        BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.silent_object_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage silent_object_registry"
  ON public.silent_object_registry FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_silent_registry_label    ON public.silent_object_registry (label);
CREATE INDEX idx_silent_registry_last_seen ON public.silent_object_registry (last_seen_at DESC);
CREATE INDEX idx_silent_registry_uid      ON public.silent_object_registry (object_uid);

-- Emergency Triggers
-- Created when an ingested document/audio/text is classified as an emergency:
-- OPORD, Mayday, natural disaster, illegal activity, injury, or national alert.
CREATE TABLE public.emergency_triggers (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_product_id   UUID        REFERENCES public.data_products(id) ON DELETE CASCADE,
  trigger_type      TEXT        NOT NULL, -- opord | mayday | disaster | illegal | injury | national_alert
  sentiment_score   NUMERIC(4,2) DEFAULT 0,
  urgency_level     TEXT        NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  key_elements      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  commander_intent  TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  raw_text_excerpt  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at    TIMESTAMPTZ
);

ALTER TABLE public.emergency_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage emergency_triggers"
  ON public.emergency_triggers FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_emergency_triggers_active
  ON public.emergency_triggers (is_active, created_at DESC);
CREATE INDEX idx_emergency_triggers_product
  ON public.emergency_triggers (data_product_id);

-- Mission Groups
-- Pairs of evidence found by the retrospective correlation engine after
-- an emergency trigger fires.  One group = one correlation cluster.
CREATE TABLE public.mission_groups (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_name        TEXT        NOT NULL,
  trigger_id        UUID        REFERENCES public.emergency_triggers(id) ON DELETE CASCADE,
  confidence        TEXT        NOT NULL DEFAULT 'Medium',  -- Low | Medium | High | Critical
  risk_level        TEXT        NOT NULL DEFAULT 'Medium',
  correlation_method TEXT       DEFAULT 'semantic',
  summary           TEXT,
  prediction        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mission_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage mission_groups"
  ON public.mission_groups FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_mission_groups_trigger ON public.mission_groups (trigger_id);

-- Group Evidence
-- Individual pieces of evidence that belong to a mission group.
CREATE TABLE public.group_evidence (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id          UUID        NOT NULL REFERENCES public.mission_groups(id) ON DELETE CASCADE,
  evidence_type     TEXT        NOT NULL, -- document | yolo_detection | live_track | audio | image
  source_ref        TEXT,
  data_product_id   UUID        REFERENCES public.data_products(id) ON DELETE SET NULL,
  registry_entry_id UUID        REFERENCES public.silent_object_registry(id) ON DELETE SET NULL,
  description       TEXT,
  timestamp_ref     TIMESTAMPTZ,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage group_evidence"
  ON public.group_evidence FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_group_evidence_group   ON public.group_evidence (group_id);
CREATE INDEX idx_group_evidence_product ON public.group_evidence (data_product_id);
