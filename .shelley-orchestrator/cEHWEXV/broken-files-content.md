# Broken Files Content Dump

## 1. src/integrations/supabase/client.ts

```ts
// Supabase client — uses local in-memory store as a drop-in replacement
// when the Supabase backend tables are not available.
import { localSupabase } from '@/lib/localStore';

// Export the local store as the supabase client.
// All existing code that imports { supabase } from this module
// will use the local in-memory store seamlessly.
export const supabase = localSupabase as any;
```

## 2. .env

```
VITE_SUPABASE_URL="https://eijzksdaciunejjrgpoa.supabase.co"
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY="sb_publishable_laUETnIXs8HNBGx4S5Cv1Q_7HQdtPVb"
DATABASE_URL="postgresql://postgres:amethystMarie2024!!@db.eijzksdaciunejjrgpoa.supabase.co:5432/postgres"
ANTHROPIC_API_KEY="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"
HUGGINGFACE_API_KEY="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"

VITE_HUGGINGFACE_API_KEY="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"
```

## 3. src/hooks/useEventBus.ts

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EventBusItem {
  id: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  status: string;
  stage: string;
  data_product_id: string | null;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  consumer_group: string | null;
  offset_id: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_retry_at: string | null;
  metadata: Record<string, unknown>;
}

export interface DeadLetterItem {
  id: string;
  original_event_id: string | null;
  topic: string;
  stage: string;
  payload: Record<string, unknown>;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  data_product_id: string | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  display_name: string;
  stage_order: number;
  topic: string;
  is_active: boolean;
  timeout_seconds: number;
}

export function usePipelineStages() {
  return useQuery({
    queryKey: ["pipeline_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .order("stage_order", { ascending: true });
      if (error) throw error;
      return data as unknown as PipelineStage[];
    },
  });
}

export function useEventBusItems(stage?: string) {
  return useQuery({
    queryKey: ["event_bus", stage],
    queryFn: async () => {
      let query = supabase
        .from("event_bus")
        .select("*")
        .order("offset_id", { ascending: false })
        .limit(200);
      if (stage) query = query.eq("stage", stage);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as EventBusItem[];
    },
    refetchInterval: 3000,
  });
}

export function useDeadLetterQueue() {
  return useQuery({
    queryKey: ["dead_letter_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dead_letter_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as DeadLetterItem[];
    },
    refetchInterval: 5000,
  });
}

export function useEventBusMetrics() {
  return useQuery({
    queryKey: ["event_bus_metrics"],
    queryFn: async () => {
      const { data: allEvents, error } = await supabase
        .from("event_bus")
        .select("stage, status");
      if (error) throw error;

      const stageMetrics: Record<string, Record<string, number>> = {};
      for (const e of (allEvents || [])) {
        const ev = e as unknown as { stage: string; status: string };
        if (!stageMetrics[ev.stage]) stageMetrics[ev.stage] = {};
        stageMetrics[ev.stage][ev.status] = (stageMetrics[ev.stage][ev.status] || 0) + 1;
      }

      const { count: dlqCount } = await supabase
        .from("dead_letter_queue")
        .select("*", { count: "exact", head: true });

      return { stageMetrics, deadLetterCount: dlqCount || 0 };
    },
    refetchInterval: 3000,
  });
}

export function usePublishEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { data_product_id: string; stage?: string; payload?: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { action: "publish", ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_bus"] });
      qc.invalidateQueries({ queryKey: ["event_bus_metrics"] });
    },
  });
}

export function useProcessEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params?: { stage?: string; batch_size?: number }) => {
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { action: "process", ...(params || {}) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_bus"] });
      qc.invalidateQueries({ queryKey: ["event_bus_metrics"] });
      qc.invalidateQueries({ queryKey: ["correlation_alerts"] });
    },
  });
}

export function useRetryDeadLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dead_letter_id: string) => {
      const { data, error } = await supabase.functions.invoke("pipeline-orchestrator", {
        body: { action: "retry_dlq", dead_letter_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dead_letter_queue"] });
      qc.invalidateQueries({ queryKey: ["event_bus"] });
    },
  });
}

export function useRealtimeEventBus(onEvent: (event: EventBusItem) => void) {
  useEffect(() => {
    const channel = supabase
      .channel("event_bus_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_bus" },
        (payload) => onEvent(payload.new as unknown as EventBusItem)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onEvent]);
}
```

## 4. src/hooks/useCorrelationAlerts.ts

```ts
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CorrelationAlert {
  id: string;
  intent_id: string;
  data_product_id: string;
  detection_id: string | null;
  match_type: string;
  match_score: number;
  matched_term: string;
  matched_label: string;
  acknowledged: boolean;
  created_at: string;
}

export function useCorrelationAlerts() {
  return useQuery({
    queryKey: ["correlation_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("correlation_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as CorrelationAlert[];
    },
  });
}

export function useRealtimeAlerts(onNewAlert: (alert: CorrelationAlert) => void) {
  useEffect(() => {
    const channel = supabase
      .channel("correlation_alerts_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "correlation_alerts" },
        (payload) => {
          onNewAlert(payload.new as CorrelationAlert);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onNewAlert]);
}

export function useAcknowledgeAlert() {
  return {
    acknowledge: async (id: string) => {
      const { error } = await supabase
        .from("correlation_alerts")
        .update({ acknowledged: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
  };
}
```

## 5. src/hooks/useDataProducts.ts

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DataProduct = Database["public"]["Tables"]["data_products"]["Row"];
type DataProductInsert = Database["public"]["Tables"]["data_products"]["Insert"];

export function useDataProducts() {
  return useQuery({
    queryKey: ["data_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_products")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as DataProduct[];
    },
  });
}

export function useAllGeoProducts() {
  return useQuery({
    queryKey: ["data_products_geo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_products")
        .select("*")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as DataProduct[];
    },
    refetchInterval: 15 * 60 * 1000, // auto-refresh every 15 min
  });
}

export function useIngestData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: DataProductInsert) => {
      const { data, error } = await supabase
        .from("data_products")
        .insert(product)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data_products"] });
    },
  });
}

export function useDataProductStats() {
  return useQuery({
    queryKey: ["data_product_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_products")
        .select("status, priority, source_type");
      if (error) throw error;
      
      const total = data.length;
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      
      data.forEach((d) => {
        byStatus[d.status] = (byStatus[d.status] || 0) + 1;
        if (d.priority) byPriority[d.priority] = (byPriority[d.priority] || 0) + 1;
        bySource[d.source_type] = (bySource[d.source_type] || 0) + 1;
      });

      return { total, byStatus, byPriority, bySource };
    },
  });
}

export function useSearchDataProducts(query: string) {
  return useQuery({
    queryKey: ["data_products_search", query],
    queryFn: async () => {
      if (!query.trim()) {
        const { data, error } = await supabase
          .from("data_products")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data as DataProduct[];
      }
      const { data, error } = await supabase
        .from("data_products")
        .select("*")
        .ilike("title", `%${query}%`)
        .order("priority_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as DataProduct[];
    },
    enabled: true,
  });
}
```

## 6. src/pages/IngestPage.tsx

```tsx
import { useState } from "react";
import { useIngestData } from "@/hooks/useDataProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Database, Send, Loader2 } from "lucide-react";
import ActivityFeed from "@/components/ActivityFeed";

const SOURCE_TYPES = ["sensor", "cot_message", "image", "video", "document", "sigint", "humint", "geoint"] as const;
const PRIORITIES = ["critical", "high", "medium", "low", "routine"] as const;

export default function IngestPage() {
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<typeof SOURCE_TYPES[number]>("sensor");
  const [sourceId, setSourceId] = useState("");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("routine");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const ingest = useIngestData();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1 };

    ingest.mutate({
      title: title.trim(),
      source_type: sourceType,
      source_identifier: sourceId || null,
      priority,
      priority_score: priorityScores[priority],
      confidence_score: Math.random() * 0.3 + 0.7,
      status: "ingested",
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
    }, {
      onSuccess: () => {
        toast.success("Data product ingested successfully");
        setTitle("");
        setSourceId("");
        setLat("");
        setLng("");
      },
      onError: (err) => toast.error("Ingestion failed: " + err.message),
    });
  };

  const handleSimulate = () => {
    const sampleTitles = [
      "UAV Recon Sweep Alpha-7",
      "SIGINT Intercept Bravo Sector",
      "Forward Observer Report Grid 4521",
      "Thermal Imagery Checkpoint Delta",
      "CoT Blue Force Tracker Update",
      "Satellite Pass Imagery North Corridor",
      "HUMINT Source Report: Market District",
      "Acoustic Sensor Alert Zone 3",
    ];
    const randomTitle = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
    const randomSource = SOURCE_TYPES[Math.floor(Math.random() * SOURCE_TYPES.length)];
    const randomPriority = PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)];
    const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1 };

    ingest.mutate({
      title: randomTitle,
      source_type: randomSource,
      source_identifier: `SRC-${Math.floor(Math.random() * 9000) + 1000}`,
      priority: randomPriority,
      priority_score: priorityScores[randomPriority] + (Math.random() * 0.1 - 0.05),
      confidence_score: Math.random() * 0.3 + 0.7,
      status: "ingested",
      latitude: 33 + Math.random() * 2,
      longitude: -117 + Math.random() * 2,
    }, {
      onSuccess: () => toast.success(`Simulated: ${randomTitle}`),
    });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Data Ingestion</h2>
        <p className="text-sm text-muted-foreground font-mono">Ingest new sensor data and tactical products</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Manual Form */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Database className="h-4 w-4" /> Manual Ingestion
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data product title..." className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Source Type</label>
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value as any)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Source Identifier</label>
              <Input value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="e.g., TACTICAL_SENSOR_01" className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Latitude</label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} type="number" step="any" placeholder="33.75" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Longitude</label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} type="number" step="any" placeholder="-117.85" className="bg-secondary border-border" />
              </div>
            </div>
            <Button type="submit" disabled={ingest.isPending || !title.trim()} className="w-full">
              {ingest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Ingest Data Product
            </Button>
          </form>
        </div>

        {/* Simulation */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Send className="h-4 w-4" /> Simulation
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Generate simulated tactical data products for testing the MDG pipeline.
          </p>
          <div className="space-y-3">
            <Button onClick={handleSimulate} variant="outline" className="w-full" disabled={ingest.isPending}>
              Generate Single Data Product
            </Button>
            <Button 
              onClick={() => { for (let i = 0; i < 5; i++) setTimeout(handleSimulate, i * 300); }}
              variant="outline" 
              className="w-full"
              disabled={ingest.isPending}
            >
              Burst: Generate 5 Products
            </Button>
            <Button 
              onClick={() => { for (let i = 0; i < 20; i++) setTimeout(handleSimulate, i * 150); }}
              variant="outline" 
              className="w-full"
              disabled={ingest.isPending}
            >
              Stress Test: Generate 20 Products
            </Button>
          </div>
          <div className="mt-6 rounded-md bg-secondary/50 p-4">
            <p className="text-xs font-mono text-muted-foreground">
              Simulated products include randomized titles, source types, priority levels, and coordinates in the Southern California area.
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Activity Feed */}
      <ActivityFeed />
    </div>
  );
}
```

## 7. src/pages/UploadPage.tsx

```tsx
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Film, Loader2, CheckCircle, AlertTriangle, Cpu, Zap, Brain, Siren } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { processDocumentLocally } from "@/lib/localDocumentProcessor";
import { processVideoLocally } from "@/lib/localVideoProcessor";
import type { DocumentProcessorResult } from "@/lib/localDocumentProcessor";
import type { VideoProcessorResult } from "@/lib/localVideoProcessor";

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";

interface UploadItem {
  file: File;
  status: UploadStatus;
  progress: number;
  productId?: string;
  detections?: number;
  alerts?: number;
  modelsUsed?: string[];
  modelSource?: string;
  apiPowered?: boolean;
  onnxEnabled?: boolean;
  emergencyDetected?: boolean;
  emergencyType?: string;
  missionGroupsCreated?: number;
  error?: string;
}

const DOC_MODEL_CHAIN = "DeBERTa-v3 → BERT NER → BART → rule-based";
const VIDEO_MODEL = "YOLOv8 best-boat.onnx (maritime)";

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const updateUpload = useCallback((idx: number, updates: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u, i) => (i === idx ? { ...u, ...updates } : u)));
  }, []);

  const processFile = useCallback(async (file: File, idx: number) => {
    const isVideo = file.type.startsWith("video/");
    const isDoc = file.type === "application/pdf" || file.type.includes("document") || file.name.endsWith(".pdf") || file.name.endsWith(".txt") || file.name.endsWith(".docx") || file.name.endsWith(".md");
    const sourceType = isVideo ? "video" : isDoc ? "document" : "image";

    updateUpload(idx, { status: "uploading", progress: 20 });

    try {
      // Step 1: Create data product in Supabase
      const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1 };
      
      updateUpload(idx, { progress: 40 });

      const { data: product, error: ingestError } = await supabase
        .from("data_products")
        .insert({
          title: file.name,
          source_type: sourceType as any,
          source_identifier: `local/${sourceType}s/${Date.now()}_${file.name}`,
          status: "processing" as any,
          priority: "medium" as any,
          priority_score: priorityScores.medium,
          confidence_score: 0.85,
          content: { file_size: file.size, mime_type: file.type, processed_locally: true },
        })
        .select()
        .single();

      if (ingestError || !product) {
        updateUpload(idx, { status: "error", error: ingestError?.message ?? "Failed to create data product" });
        return;
      }

      updateUpload(idx, { progress: 60, status: "processing", productId: product.id });

      // Step 2: Process locally
      let result: DocumentProcessorResult | VideoProcessorResult;
      if (isVideo) {
        result = await processVideoLocally(file);
      } else {
        result = await processDocumentLocally(file);
      }

      updateUpload(idx, { progress: 85 });

      // Step 3: Update data product with results
      const isEmergency = result.emergency_detected;
      const docResult = !isVideo ? (result as DocumentProcessorResult) : null;
      const vidResult = isVideo ? (result as VideoProcessorResult) : null;

      const updatedPriority = isEmergency ? "critical" : "medium";
      const updatedScore = isEmergency ? 0.95 : 0.6;

      await supabase
        .from("data_products")
        .update({
          status: "tagged" as any,
          priority: updatedPriority as any,
          priority_score: updatedScore,
          content: {
            file_size: file.size,
            mime_type: file.type,
            processed_locally: true,
            detections: result.detections,
            models_used: result.models_used,
            emergency_detected: result.emergency_detected,
            emergency_type: result.emergency_type,
            ...(docResult ? {
              detection_details: docResult.detection_details,
              key_elements: docResult.key_elements,
              urgency_level: docResult.urgency_level,
            } : {}),
            ...(vidResult ? {
              detection_details: vidResult.detection_details,
              model_source: vidResult.model_source,
              yolo_classes: vidResult.yolo_classes,
            } : {}),
          },
          ...(isEmergency ? {
            priority_reasoning: `Emergency type: ${result.emergency_type}. Detected via local processing pipeline.`,
          } : {}),
        })
        .eq("id", product.id);

      // Step 4: Insert detection results
      if (docResult) {
        for (const det of docResult.detection_details.slice(0, 10)) {
          await supabase.from("detection_results").insert({
            data_product_id: product.id,
            detector_type: det.detector_type,
            label: det.label,
            confidence: det.confidence,
            metadata: {
              raw_entity: det.raw_entity ?? null,
              models_used: result.models_used,
              processed_locally: true,
            },
          });
        }
      }
      if (vidResult) {
        for (const det of vidResult.detection_details) {
          await supabase.from("detection_results").insert({
            data_product_id: product.id,
            detector_type: "yolo",
            label: det.label,
            confidence: det.confidence,
            bounding_box: det.bbox,
            metadata: {
              frame: det.frame,
              model_source: vidResult.model_source,
              processed_locally: true,
            },
          });
        }
      }

      updateUpload(idx, {
        status: "done",
        progress: 100,
        detections: result.detections,
        alerts: result.alerts ?? 0,
        modelsUsed: result.models_used,
        modelSource: isVideo ? vidResult!.model_source : docResult!.model_cascade,
        apiPowered: false,
        onnxEnabled: isVideo ? vidResult!.onnx_enabled : false,
        emergencyDetected: result.emergency_detected,
        emergencyType: result.emergency_type ?? undefined,
        missionGroupsCreated: result.mission_groups_created ?? 0,
      });

      // Toasts
      if (result.emergency_detected) {
        toast.error(
          `🚨 EMERGENCY DETECTED: ${(result.emergency_type ?? "unknown").replace("_", " ").toUpperCase()} — ${result.mission_groups_created ?? 0} mission group(s) created.`,
          { duration: 12000 }
        );
      } else {
        const modelInfo = isVideo
          ? "YOLO heuristic"
          : `rule-based (${result.detections} entities)`;
        toast.success(`Processed: ${file.name} — ${result.detections} detections via ${modelInfo}`);
      }
    } catch (err: any) {
      updateUpload(idx, { status: "error", error: err.message });
      toast.error(`Failed to process ${file.name}: ${err.message}`);
    }
  }, [updateUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const baseIdx = uploads.length;
    const newUploads: UploadItem[] = files.map((f) => ({
      file: f,
      status: "idle" as UploadStatus,
      progress: 0,
    }));

    setUploads((prev) => [...newUploads, ...prev]);

    files.forEach((file, i) => {
      setTimeout(() => processFile(file, i), i * 300);
    });
  };

  const statusIcon = (status: UploadStatus) => {
    switch (status) {
      case "uploading": case "processing": return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
      case "done": return <CheckCircle className="h-4 w-4 text-primary" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Upload & Process</h2>
        <p className="text-sm text-muted-foreground font-mono">
          AI-native processing — documents via NLP entity extraction, video via YOLOv8 maritime detection
        </p>
      </div>

      {/* AI Model Status Banner */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 flex flex-wrap gap-4 text-xs font-mono">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground font-medium">NLP Models:</span>
          <span>{DOC_MODEL_CHAIN}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu className="h-3.5 w-3.5 text-accent" />
          <span className="text-foreground font-medium">Vision Model:</span>
          <span>{VIDEO_MODEL}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-warning" />
          <span className="text-foreground font-medium">Pipeline:</span>
          <span>ingestion → NLP/YOLO → emergency detection → tagging → correlation</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Siren className="h-3.5 w-3.5 text-red-400" />
          <span className="text-foreground font-medium">Emergency triggers:</span>
          <span>OPORD · Mayday · Disaster · Illegal Activity · Injury · National Alert</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Document Upload */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <FileText className="h-4 w-4" /> Document Upload
          </h3>
          <p className="mb-1 text-[10px] font-mono text-primary/70 uppercase tracking-wider">
            Rule-based NER · Pattern matching · Emergency detection
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload PDFs, reports, manifests, and logs. Extracts named entities, classifies document type, detects emergency triggers, and correlates with Commander's Intent.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 p-8 transition-colors hover:border-primary/50 hover:bg-secondary/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-mono text-muted-foreground">Drop documents or click to browse</span>
            <span className="text-xs text-muted-foreground/60">PDF, DOCX, TXT, images</span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.md"
              multiple
              onChange={handleFileSelect}
            />
          </label>
        </div>

        {/* Video Upload */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Film className="h-4 w-4" /> Video Upload
          </h3>
          <p className="mb-1 text-[10px] font-mono text-accent/70 uppercase tracking-wider">
            YOLOv8 heuristic · 8-class maritime detection · NMS post-processing
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload surveillance footage for maritime object detection. Detections include bounding boxes, confidence scores, and class labels.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 p-8 transition-colors hover:border-primary/50 hover:bg-secondary/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-mono text-muted-foreground">Drop video files or click to browse</span>
            <span className="text-xs text-muted-foreground/60">MP4, AVI, MOV, WebM</span>
            <input
              type="file"
              className="hidden"
              accept="video/*"
              multiple
              onChange={handleFileSelect}
            />
          </label>
        </div>
      </div>

      {/* Upload Queue */}
      {uploads.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <Upload className="h-4 w-4" /> Processing Queue
          </h3>
          <div className="space-y-3">
            {uploads.map((upload, idx) => (
              <div key={idx} className="rounded-md border border-border bg-secondary/30 p-3">
                <div className="flex items-center gap-3">
                  {statusIcon(upload.status)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{upload.file.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{upload.status}</span>
                      {upload.detections !== undefined && upload.status === "done" && (
                        <span className="text-[10px] font-mono text-primary">{upload.detections} detections</span>
                      )}
                      {upload.alerts !== undefined && upload.alerts > 0 && (
                        <span className="text-[10px] font-mono text-destructive">{upload.alerts} alerts!</span>
                      )}
                      {upload.emergencyDetected && (
                        <Badge className="text-[8px] bg-red-500/20 text-red-300 border-red-500/40 animate-pulse gap-1">
                          <Siren className="h-2.5 w-2.5" />
                          EMERGENCY: {(upload.emergencyType ?? "").replace("_", " ").toUpperCase()}
                        </Badge>
                      )}
                      {upload.missionGroupsCreated !== undefined && upload.missionGroupsCreated > 0 && (
                        <span className="text-[10px] font-mono text-red-400">
                          {upload.missionGroupsCreated} mission group{upload.missionGroupsCreated !== 1 ? "s" : ""} created
                        </span>
                      )}
                      {upload.modelsUsed && upload.modelsUsed.length > 0 && upload.status === "done" && (
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          [{upload.modelsUsed.join(", ")}]
                        </span>
                      )}
                    </div>
                    {upload.modelSource && upload.status === "done" && (
                      <p className="mt-0.5 text-[10px] font-mono text-muted-foreground/50 truncate">
                        {upload.modelSource}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {(upload.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                {(upload.status === "uploading" || upload.status === "processing") && (
                  <Progress value={upload.progress} className="mt-2 h-1" />
                )}
                {upload.error && (
                  <p className="mt-1 text-xs text-destructive font-mono">{upload.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## 8. src/pages/PipelinePage.tsx

```tsx
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeenItems, useVisibilityTracker } from "@/hooks/useSeenItems";
import {
  usePipelineStages,
  useEventBusItems,
  useEventBusMetrics,
  useDeadLetterQueue,
  useProcessEvents,
  useRetryDeadLetter,
  useRealtimeEventBus,
  type EventBusItem,
} from "@/hooks/useEventBus";
import {
  ArrowRight, Play, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Zap, Skull, Radio, Layers, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const STAGE_COLORS: Record<string, string> = {
  ingestion: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  processing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  tagging: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  correlation: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  prioritization: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  transport: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  processing: <Zap className="h-3 w-3 animate-pulse" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  retry: <RefreshCw className="h-3 w-3" />,
  dead_letter: <Skull className="h-3 w-3" />,
};

function EventDetailDialog({ event, open, onClose }: { event: EventBusItem | null; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  if (!event) return null;

  const payload = typeof event.payload === "object" ? event.payload : {};

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">Event #{event.offset_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Stage</span>
              <Badge variant="outline" className={`ml-2 text-[10px] ${STAGE_COLORS[event.stage] || ""}`}>{event.stage}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <Badge variant="secondary" className="ml-2 text-[10px]">{event.status}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Topic</span>
              <span className="ml-2 font-mono">{event.topic}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Retries</span>
              <span className="ml-2 font-mono">{event.retry_count}/{event.max_retries}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <span className="ml-2 font-mono">{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
            </div>
            {event.partition_key && (
              <div>
                <span className="text-muted-foreground">Partition</span>
                <span className="ml-2 font-mono">{event.partition_key}</span>
              </div>
            )}
          </div>

          {event.error_message && (
            <div className="rounded-md bg-destructive/10 p-2">
              <p className="text-[10px] font-mono text-destructive">{event.error_message}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-mono text-muted-foreground mb-1">Payload</p>
            <pre className="rounded-md bg-secondary p-2 text-[10px] font-mono overflow-auto max-h-40">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>

          {event.data_product_id && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                onClose();
                navigate(`/discovery?q=${encodeURIComponent((payload as any)?.title || "")}`);
              }}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              View Data Product
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const { data: stages = [] } = usePipelineStages();
  const { data: allEvents = [] } = useEventBusItems();
  const { data: metrics } = useEventBusMetrics();
  const { data: deadLetters = [] } = useDeadLetterQueue();
  const processEvents = useProcessEvents();
  const retryDlq = useRetryDeadLetter();
  const [realtimeCount, setRealtimeCount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<EventBusItem | null>(null);

  const { isNew, markSeen } = useSeenItems();
  const { observe } = useVisibilityTracker(
    useCallback((id: string) => markSeen(id), [markSeen])
  );

  const handleNewEvent = useCallback((event: EventBusItem) => {
    setRealtimeCount((c) => c + 1);
    toast.info(`Event: ${event.stage}`, { description: `Topic: ${event.topic}` });
  }, []);

  useRealtimeEventBus(handleNewEvent);

  const handleProcess = async (stage?: string) => {
    try {
      const result = await processEvents.mutateAsync({ stage, batch_size: 20 });
      toast.success(`Processed ${result?.processed || 0} events`);
    } catch {
      toast.error("Processing failed");
    }
  };

  const handleRetryDlq = async (id: string) => {
    try {
      await retryDlq.mutateAsync(id);
      toast.success("Event re-queued from dead letter");
    } catch {
      toast.error("Retry failed");
    }
  };

  const stageMetrics = metrics?.stageMetrics || {};
  const totalPending = allEvents.filter((e) => e.status === "pending").length;
  const totalProcessing = allEvents.filter((e) => e.status === "processing").length;
  const totalCompleted = allEvents.filter((e) => e.status === "completed").length;
  const totalRetrying = allEvents.filter((e) => e.status === "retry").length;

  const newEventCount = allEvents.filter((e) => isNew(e.id)).length;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Event Pipeline</h2>
          <p className="text-sm text-muted-foreground font-mono">
            Kafka-compatible event bus • {realtimeCount} realtime events received
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleProcess()} disabled={processEvents.isPending} size="sm">
            <Play className="mr-1 h-3 w-3" />
            {processEvents.isPending ? "Processing…" : "Process All"}
          </Button>
        </div>
      </div>

      {/* Pipeline Stage Visualization */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stages.map((stage, i) => {
          const sm = stageMetrics[stage.name] || {};
          const pending = sm.pending || 0;
          const processing = sm.processing || 0;
          const completed = sm.completed || 0;
          const retry = sm.retry || 0;
          const total = pending + processing + completed + retry;

          return (
            <div key={stage.id} className="flex items-center">
              <Card className={`min-w-[160px] border ${STAGE_COLORS[stage.name] || "border-border"}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">{stage.display_name}</span>
                    <Badge variant="outline" className="text-[10px] px-1">{total}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <span className="text-muted-foreground">Pending:</span>
                    <span className="text-right">{pending}</span>
                    <span className="text-muted-foreground">Active:</span>
                    <span className="text-right">{processing}</span>
                    <span className="text-muted-foreground">Done:</span>
                    <span className="text-right">{completed}</span>
                    {retry > 0 && (
                      <>
                        <span className="text-destructive">Retry:</span>
                        <span className="text-right text-destructive">{retry}</span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 h-6 text-[10px]"
                    onClick={() => handleProcess(stage.name)}
                    disabled={processEvents.isPending}
                  >
                    Process Stage
                  </Button>
                </CardContent>
              </Card>
              {i < stages.length - 1 && (
                <ArrowRight className="mx-1 h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Pending", value: totalPending, icon: Clock, color: "text-muted-foreground" },
          { label: "Processing", value: totalProcessing, icon: Zap, color: "text-primary" },
          { label: "Completed", value: totalCompleted, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Retrying", value: totalRetrying, icon: RefreshCw, color: "text-amber-400" },
          { label: "Dead Letters", value: metrics?.deadLetterCount || 0, icon: Skull, color: "text-destructive" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground font-mono">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Events / Dead Letters */}
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events" className="gap-1">
            <Layers className="h-3 w-3" />
            Event Log ({allEvents.length})
            {newEventCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                {newEventCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dlq" className="gap-1">
            <Skull className="h-3 w-3" />
            Dead Letters ({deadLetters.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono">Event Bus Log</CardTitle>
                <div className="flex items-center gap-2">
                  <Radio className="h-3 w-3 text-primary animate-pulse" />
                  <span className="text-[10px] font-mono text-muted-foreground">Realtime</span>
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-border/50">
                {allEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <Layers className="mb-2 h-8 w-8" />
                    <p className="text-sm">No events in the bus</p>
                    <p className="text-xs">Publish data products to start the pipeline</p>
                  </div>
                ) : (
                  allEvents.map((event) => {
                    const unseen = isNew(event.id);
                    return (
                      <div
                        key={event.id}
                        data-item-id={event.id}
                        ref={unseen ? observe : undefined}
                        onClick={() => {
                          markSeen(event.id);
                          setSelectedEvent(event);
                        }}
                        className={`flex items-center gap-3 px-4 py-2.5 transition-all duration-500 cursor-pointer hover:bg-secondary/40 ${
                          unseen ? "bg-primary/8 border-l-2 border-l-primary" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {STATUS_ICONS[event.status] || <Clock className="h-3 w-3" />}
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${STAGE_COLORS[event.stage] || ""}`}>
                          {event.stage}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                          {event.topic}
                        </span>
                        {unseen && (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground leading-none">
                            NEW
                          </span>
                        )}
                        <Badge
                          variant={event.status === "completed" ? "default" : event.status === "retry" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {event.status}
                        </Badge>
                        {event.retry_count > 0 && (
                          <span className="text-[10px] font-mono text-destructive">×{event.retry_count}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground w-20 text-right">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="dlq">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Dead Letter Queue
              </CardTitle>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <div className="divide-y divide-border/50">
                {deadLetters.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                    <p className="text-sm">No dead letters</p>
                    <p className="text-xs">All events processed successfully</p>
                  </div>
                ) : (
                  deadLetters.map((dl) => (
                    <div key={dl.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 cursor-pointer" onClick={() => navigate(`/discovery`)}>
                      <Skull className="h-4 w-4 text-destructive shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{dl.stage}</Badge>
                          <span className="text-xs font-mono text-muted-foreground">{dl.topic}</span>
                        </div>
                        {dl.error_message && (
                          <p className="text-[10px] text-destructive truncate mt-0.5">{dl.error_message}</p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">×{dl.retry_count}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryDlq(dl.id);
                        }}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>

      <EventDetailDialog
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
```

## 9. src/pages/AlertsPage.tsx

```tsx
import AlertsPanel from "@/components/AlertsPanel";
import StormEscalationHistory from "@/components/StormEscalationHistory";
import EmergencyMissionPanel from "@/components/EmergencyMissionPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, ShieldAlert, Siren } from "lucide-react";
import { useActiveEmergencyTriggers } from "@/hooks/useEmergencyTriggers";

export default function AlertsPage() {
  const { data: activeTriggers = [] } = useActiveEmergencyTriggers();

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Alerts</h2>
        <p className="text-sm text-muted-foreground font-mono">
          Correlation alerts, emergency mission groups, and storm threat escalation events
        </p>
      </div>

      {/* Emergency Mission Groups — always shown at top when active */}
      {activeTriggers.length > 0 && (
        <EmergencyMissionPanel />
      )}

      <Tabs defaultValue="correlation" className="space-y-3">
        <TabsList className="bg-secondary">
          <TabsTrigger value="correlation" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Correlation Alerts
          </TabsTrigger>
          <TabsTrigger value="emergency" className="gap-1.5 relative">
            <Siren className="h-3.5 w-3.5" /> Mission Groups
            {activeTriggers.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                {activeTriggers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="storm" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Storm Escalations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="correlation">
          <AlertsPanel />
        </TabsContent>

        <TabsContent value="emergency">
          <EmergencyMissionPanel />
        </TabsContent>

        <TabsContent value="storm">
          <StormEscalationHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

```

## 10. src/components/AlertsPanel.tsx

```tsx
import { useState, useCallback, useEffect } from "react";
import { useCorrelationAlerts, useRealtimeAlerts, useAcknowledgeAlert, CorrelationAlert } from "@/hooks/useCorrelationAlerts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, BellOff, CheckCircle, Loader2, X, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const matchTypeColors: Record<string, string> = {
  exact: "bg-destructive/20 text-destructive",
  related: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]",
  semantic: "bg-accent/20 text-accent",
  cross_source: "bg-destructive/30 text-destructive font-bold",
};

export default function AlertsPanel() {
  const { data: alerts, isLoading, refetch } = useCorrelationAlerts();
  const { acknowledge } = useAcknowledgeAlert();
  const [liveAlerts, setLiveAlerts] = useState<CorrelationAlert[]>([]);

  const handleNewAlert = useCallback((alert: CorrelationAlert) => {
    setLiveAlerts((prev) => [alert, ...prev]);
    refetch();

    const isCrossSource = alert.match_type === "cross_source";
    toast.error(
      `🚨 ${isCrossSource ? "CROSS-SOURCE CORRELATION" : "ALERT"}: "${alert.matched_term}" matched "${alert.matched_label}"`,
      { duration: isCrossSource ? 15000 : 8000 }
    );
  }, [refetch]);

  useRealtimeAlerts(handleNewAlert);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledge(id);
      refetch();
      toast.success("Alert acknowledged");
    } catch {
      toast.error("Failed to acknowledge");
    }
  };

  const allAlerts = alerts ?? [];
  const unacknowledged = allAlerts.filter((a) => !a.acknowledged);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Correlation Alerts
        </h3>
        {unacknowledged.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-destructive/20 px-2.5 py-0.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            <span className="text-xs font-mono font-bold text-destructive">{unacknowledged.length}</span>
          </span>
        )}
      </div>

      <ScrollArea className="h-[500px]">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BellOff className="mb-2 h-6 w-6 opacity-40" />
            <p className="text-xs font-mono">No alerts — define objects of interest in Commander's Intent</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`px-4 py-3 transition-colors ${
                  !alert.acknowledged ? "bg-destructive/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {alert.match_type === "cross_source" ? (
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      <span className="text-destructive">"{alert.matched_term}"</span>
                      {" → "}
                      <span className="text-accent">{alert.matched_label}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                          matchTypeColors[alert.match_type] ?? matchTypeColors.related
                        }`}
                      >
                        {alert.match_type}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        score: {(alert.match_score * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 text-xs"
                      onClick={() => handleAcknowledge(alert.id)}
                    >
                      <CheckCircle className="mr-1 h-3 w-3" /> ACK
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
```

## 11. src/components/DataProductTable.tsx

```tsx
import { useCallback, useRef, useEffect } from "react";
import { StatusBadge } from "./StatusBadge";
import GeoCorrelationBadge from "./GeoCorrelationBadge";
import { MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSeenItems, useVisibilityTracker } from "@/hooks/useSeenItems";

interface DataProduct {
  id: string;
  title: string;
  source_type: string;
  source_identifier: string | null;
  status: string;
  priority: string | null;
  priority_score: number | null;
  confidence_score: number | null;
  created_at: string;
}

export function DataProductTable({
  data,
  isLoading,
  onRowClick,
}: {
  data: DataProduct[];
  isLoading: boolean;
  onRowClick?: (id: string) => void;
}) {
  const { isNew, markSeen } = useSeenItems();
  const { observe } = useVisibilityTracker(
    useCallback((id: string) => markSeen(id), [markSeen])
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-secondary" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No data products found</p>
        <p className="text-xs">Ingest some data to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground w-4"></th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Title</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Source</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Score</th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />Geo</span>
            </th>
            <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const unseen = isNew(item.id);
            return (
              <tr
                key={item.id}
                data-item-id={item.id}
                ref={unseen ? (el) => { if (el) observe(el); } : undefined}
                className={`border-b border-border/50 transition-all duration-500 cursor-pointer hover:bg-secondary/50 ${
                  unseen ? "bg-primary/8" : ""
                }`}
                onClick={() => {
                  markSeen(item.id);
                  onRowClick?.(item.id);
                }}
              >
                <td className="px-2 py-3">
                  {unseen && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={unseen ? "font-bold text-foreground" : "font-medium text-foreground"}>
                    {item.title}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-muted-foreground">{item.source_type}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status as any} />
                </td>
                <td className="px-4 py-3">
                  {item.priority && <StatusBadge status={item.priority as any} />}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-foreground">
                    {item.priority_score != null ? `${(Number(item.priority_score) * 100).toFixed(0)}%` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <GeoCorrelationBadge productId={item.id} compact />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

## 12. src/pages/SourcesPage.tsx

```tsx
import { useState } from "react";
import { useDataSources, useCreateDataSource, useUpdateDataSource, useDeleteDataSource, DataSource } from "@/hooks/useDataSources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Camera, FileText, Waves, Rss, Plus, Trash2, Power, PowerOff,
  RefreshCw, AlertTriangle, CheckCircle2, Loader2, Activity, Clock, Hash,
  Satellite, Ship, Plane, Download, Globe2, Flame,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SourceCard from "@/components/sources/SourceCard";
import LiveDataPanel from "@/components/sources/LiveDataPanel";
import SourceForm from "@/components/sources/SourceForm";

export default function SourcesPage() {
  const { data: sources, isLoading } = useDataSources();
  const createSource = useCreateDataSource();
  const updateSource = useUpdateDataSource();
  const deleteSource = useDeleteDataSource();

  const [showForm, setShowForm] = useState(false);

  const handleToggle = (source: DataSource) => {
    const newStatus = source.status === "active" ? "inactive" : "active";
    updateSource.mutate({ id: source.id, status: newStatus } as any, {
      onSuccess: () => toast.success(`Source ${newStatus}`),
    });
  };

  const handleHardDelete = (id: string) => {
    if (!confirm("Permanently delete this source and all associated data?")) return;
    deleteSource.mutate(id, {
      onSuccess: () => toast.success("Source permanently deleted"),
      onError: (err) => toast.error("Delete failed: " + err.message),
    });
  };

  const activeCount = sources?.filter(s => s.status === "active").length || 0;
  const errorCount = sources?.filter(s => s.status === "error").length || 0;
  const totalIngested = sources?.reduce((sum, s) => sum + (s.total_ingested || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Data Sources</h2>
          <p className="text-sm text-muted-foreground font-mono">Configure, monitor, and ingest from live data feeds</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" /> Add Source
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Sources", value: sources?.length || 0 },
          { label: "Active", value: activeCount },
          { label: "Errors", value: errorCount },
          { label: "Total Ingested", value: totalIngested.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-mono uppercase text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Live Data Ingestion */}
      <LiveDataPanel />

      {/* Create Form */}
      {showForm && (
        <SourceForm
          createSource={createSource}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Source Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !sources?.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Radio className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No data sources configured yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use the live data sources above or add a custom source</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map(source => (
            <SourceCard
              key={source.id}
              source={source}
              onToggle={() => handleToggle(source)}
              onDelete={() => handleHardDelete(source.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

## 13. src/components/sources/LiveDataPanel.tsx

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Rss, Plane, Ship, Satellite, Download, Loader2, Flame, Globe2, Waves,
} from "lucide-react";

const FREE_FEEDS = [
  { key: "bbc_world", label: "BBC World News", category: "news" },
  { key: "reuters", label: "Reuters Top News", category: "news" },
  { key: "aljazeera", label: "Al Jazeera", category: "news" },
  { key: "defense_one", label: "Defense One", category: "defense" },
  { key: "breaking_defense", label: "Breaking Defense", category: "defense" },
  { key: "defense_news", label: "Defense News", category: "defense" },
  { key: "usni_news", label: "USNI News (Maritime)", category: "maritime" },
  { key: "bellingcat", label: "Bellingcat (OSINT)", category: "osint" },
  { key: "state_dept", label: "State Department", category: "government" },
  { key: "csis", label: "CSIS Analysis", category: "think_tank" },
  { key: "atlantic_council", label: "Atlantic Council", category: "think_tank" },
  { key: "foreign_policy", label: "Foreign Policy", category: "geopolitics" },
];

const OPENSKY_REGIONS = [
  { key: "caribbean_corridor", label: "Caribbean Corridor" },
  { key: "gulf_of_mexico", label: "Gulf of Mexico" },
  { key: "south_america_north", label: "South America (North)" },
  { key: "puerto_rico_usvi", label: "Puerto Rico & USVI" },
  { key: "us_east_coast", label: "US East Coast" },
  { key: "us_west_coast", label: "US West Coast" },
  { key: "europe_med", label: "Europe & Mediterranean" },
  { key: "middle_east", label: "Middle East" },
  { key: "east_asia", label: "East Asia" },
  { key: "south_china_sea", label: "South China Sea" },
  { key: "horn_of_africa", label: "Horn of Africa" },
  { key: "indo_pacific", label: "Indo-Pacific" },
];

export default function LiveDataPanel() {
  const [rssLoading, setRssLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState("caribbean_corridor");

  const handleRssIngest = async () => {
    setRssLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rss-ingester", {
        body: { action: "ingest" },
      });
      if (error) throw error;
      toast.success(`RSS ingestion complete: ${data?.total_ingested || 0} new articles`);
    } catch (err: any) {
      toast.error("RSS ingestion failed: " + err.message);
    } finally {
      setRssLoading(false);
    }
  };

  const handleLiveIngest = async (source: string) => {
    setLiveLoading(source);
    try {
      const body: any = { action: "ingest", source };
      if (source === "opensky") body.region = selectedRegion;
      if (source === "nasa_firms") body.region = selectedRegion;

      const { data, error } = await supabase.functions.invoke("live-data-ingester", { body });
      if (error) throw error;
      toast.success(`${source.toUpperCase()}: ${data?.ingested || 0} records ingested`);
    } catch (err: any) {
      toast.error(`${source} ingestion failed: ` + err.message);
    } finally {
      setLiveLoading(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Satellite className="h-4 w-4" /> Live Free Data Sources
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase text-muted-foreground">Region:</label>
          <select
            value={selectedRegion}
            onChange={e => setSelectedRegion(e.target.value)}
            className="rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground"
          >
            {OPENSKY_REGIONS.map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* RSS */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Rss className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold">RSS News Feeds</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{FREE_FEEDS.length} curated defense & maritime feeds</p>
          <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
            {FREE_FEEDS.map((f) => (
              <span key={f.key} className="text-[8px] font-mono bg-secondary px-1 py-0.5 rounded">{f.label}</span>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={handleRssIngest} disabled={rssLoading}>
            {rssLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
            {rssLoading ? "Ingesting..." : "Ingest All"}
          </Button>
        </div>

        {/* OpenSky */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold">OpenSky Aircraft</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Aircraft in <span className="font-semibold text-foreground">{OPENSKY_REGIONS.find(r => r.key === selectedRegion)?.label}</span>
          </p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("opensky")} disabled={liveLoading === "opensky"}>
            {liveLoading === "opensky" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plane className="mr-1 h-3 w-3" />}
            Fetch Aircraft
          </Button>
        </div>

        {/* AIS */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold">AIS Vessels</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Live vessel positions (Finland Digitraffic)</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("ais")} disabled={liveLoading === "ais"}>
            {liveLoading === "ais" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Ship className="mr-1 h-3 w-3" />}
            Fetch Vessels
          </Button>
        </div>

        {/* NASA EONET */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold">NASA EONET</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Natural events: storms, fires, volcanoes, icebergs</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("nasa_eonet")} disabled={liveLoading === "nasa_eonet"}>
            {liveLoading === "nasa_eonet" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Globe2 className="mr-1 h-3 w-3" />}
            Fetch Events
          </Button>
        </div>

        {/* NASA FIRMS */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-destructive" />
            <span className="text-xs font-bold">NASA FIRMS</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Active fires via MODIS satellite in selected region</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("nasa_firms")} disabled={liveLoading === "nasa_firms"}>
            {liveLoading === "nasa_firms" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Flame className="mr-1 h-3 w-3" />}
            Fetch Fires
          </Button>
        </div>

        {/* NOAA Bayou Sensors */}
        <div className="rounded-md border border-primary/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold">NOAA Bayou Sensors</span>
          </div>
          <p className="text-[10px] text-muted-foreground">15 Gulf Coast & bayou water level stations — storm surge alerts</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => handleLiveIngest("noaa_water")} disabled={liveLoading === "noaa_water"}>
            {liveLoading === "noaa_water" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Waves className="mr-1 h-3 w-3" />}
            Fetch Water Levels
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## 14. src/components/sources/SourceForm.tsx

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Loader2 } from "lucide-react";

const SOURCE_TYPE_OPTIONS = [
  { value: "rtsp_camera", label: "RTSP Camera", description: "IP cameras and video surveillance streams" },
  { value: "audio_feed", label: "Audio Feed", description: "Radio comms, distress calls, VHF/UHF" },
  { value: "document", label: "Document", description: "PDF reports, logs, manifests" },
  { value: "sensor_telemetry", label: "Sensor Telemetry", description: "Buoy data, AIS, radar, sonar" },
  { value: "rss_feed", label: "RSS Feed", description: "Maritime alerts, weather, news" },
  { value: "ais_tracker", label: "AIS Vessel Tracker", description: "Live AIS vessel positions" },
  { value: "opensky", label: "OpenSky Aircraft", description: "Live aircraft tracking via OpenSky" },
];

const AUTH_OPTIONS = ["none", "api_key", "basic", "bearer", "certificate"] as const;

export default function SourceForm({ createSource, onClose }: { createSource: any; onClose: () => void }) {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("sensor_telemetry");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [maxRetries, setMaxRetries] = useState("5");
  const [retryDelay, setRetryDelay] = useState("30");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createSource.mutate({
      name: name.trim(),
      source_type: sourceType,
      endpoint_url: endpointUrl || null,
      auth_type: authType,
      status: "inactive",
      max_retries: parseInt(maxRetries) || 5,
      retry_delay_seconds: parseInt(retryDelay) || 30,
    } as any, {
      onSuccess: () => {
        onClose();
        setName(""); setEndpointUrl("");
      },
      onError: (err: any) => {},
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-mono uppercase tracking-wider text-muted-foreground">New Data Source</h3>
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Port Camera Alpha-1" className="bg-secondary border-border" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Source Type</label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
              {SOURCE_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label} — {t.description}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Endpoint URL</label>
          <Input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="rtsp://192.168.1.100:554/stream or https://..." className="bg-secondary border-border" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Auth Type</label>
            <select value={authType} onChange={e => setAuthType(e.target.value)} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
              {AUTH_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Max Retries</label>
            <Input type="number" value={maxRetries} onChange={e => setMaxRetries(e.target.value)} className="bg-secondary border-border" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Retry Delay (s)</label>
            <Input type="number" value={retryDelay} onChange={e => setRetryDelay(e.target.value)} className="bg-secondary border-border" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={createSource.isPending || !name.trim()}>
            {createSource.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Source
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
```

## 15. src/lib/ingestedData.ts

```ts
/**
 * IngestedData — canonical data model for ingested intelligence products.
 *
 * TypeScript equivalent of the specification's Go IngestedData struct.
 * Used as the unified shape for data flowing through the ingestion pipeline.
 */
export interface IngestedData {
  /** Unique identifier (UUID) */
  id: string;
  /** Identifier of the originating data source */
  sourceId: string;
  /** Raw content / text body */
  content: string;
  /** Classification labels assigned during processing */
  labels: string[];
  /** Continuous priority score between 0 (routine) and 1 (critical) */
  priority: number;
  /** Military relevance score between 0 and 1 */
  militaryRelevance: number;
  /** Categorical threat level */
  threatLevel: "critical" | "high" | "medium" | "low" | "routine";
  /** ISO 8601 timestamp of ingestion */
  timestamp: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Named entities extracted from content */
  entities: string[];
  /** Sentiment classification of the content */
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  /** Whether this item links to a detail view */
  clickable: boolean;
  /** URL for detailed view / original source */
  detailURL: string;
}

/**
 * Maps a Supabase data_product row + detection results into the canonical IngestedData shape.
 */
export function toIngestedData(
  product: {
    id: string;
    source_identifier?: string | null;
    title?: string | null;
    content?: Record<string, unknown> | null;
    priority_score?: number | null;
    priority?: string | null;
    created_at?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  detectionLabels: string[] = [],
  entities: string[] = []
): IngestedData {
  const contentText =
    (product.content?.description as string) ||
    (product.content?.text as string) ||
    (product.content?.summary as string) ||
    product.title ||
    "";

  const priorityScore = product.priority_score ?? 0;

  return {
    id: product.id,
    sourceId: product.source_identifier || "",
    content: contentText,
    labels: detectionLabels,
    priority: priorityScore,
    militaryRelevance: computeMilitaryRelevance(contentText),
    threatLevel: mapThreatLevel(product.priority || "routine"),
    timestamp: product.created_at || new Date().toISOString(),
    lat: product.latitude ?? 0,
    lon: product.longitude ?? 0,
    entities,
    sentiment: analyzeSentiment(contentText),
    clickable: !!(product.content?.link || product.content?.url),
    detailURL:
      (product.content?.link as string) ||
      (product.content?.url as string) ||
      "",
  };
}

/** Compute military relevance score (0-1) from content text. */
function computeMilitaryRelevance(text: string): number {
  const lower = text.toLowerCase();
  const militaryTerms = [
    "military", "naval", "army", "navy", "air force", "marine",
    "defense", "defence", "weapon", "missile", "torpedo",
    "submarine", "warship", "destroyer", "frigate", "carrier",
    "patrol", "reconnaissance", "surveillance", "intelligence",
    "classified", "tactical", "strategic", "combat", "deployment",
  ];
  let matches = 0;
  for (const term of militaryTerms) {
    if (lower.includes(term)) matches++;
  }
  // Score reaches 1.0 when MILITARY_RELEVANCE_SCALE or more terms are present
  const MILITARY_RELEVANCE_SCALE = 5;
  return Math.min(1, matches / MILITARY_RELEVANCE_SCALE);
}

/** Map priority string to threat level */
function mapThreatLevel(
  priority: string
): "critical" | "high" | "medium" | "low" | "routine" {
  switch (priority) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "routine";
  }
}

/** Simple sentiment analysis based on keyword presence */
function analyzeSentiment(
  text: string
): "positive" | "negative" | "neutral" | "mixed" {
  const lower = text.toLowerCase();
  const negativeTerms = [
    "threat", "attack", "hostile", "danger", "emergency",
    "crisis", "killed", "destroyed", "explosion", "casualties",
    "warning", "alert", "escalation", "conflict",
  ];
  const positiveTerms = [
    "peace", "agreement", "cooperation", "rescue", "saved",
    "stabilized", "resolved", "ceasefire", "aid", "humanitarian",
  ];

  let negScore = 0;
  let posScore = 0;
  for (const term of negativeTerms) {
    if (lower.includes(term)) negScore++;
  }
  for (const term of positiveTerms) {
    if (lower.includes(term)) posScore++;
  }

  if (negScore > 0 && posScore > 0) return "mixed";
  if (negScore > posScore) return "negative";
  if (posScore > negScore) return "positive";
  return "neutral";
}
```

## 16. src/pages/MapPage.tsx (first 100 lines)

```tsx
import { useMemo, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useAllGeoProducts } from "@/hooks/useDataProducts";
import { useGeoCorrelation } from "@/hooks/useGeoCorrelation";
import { getClusterThreatColor, getClusterDescription } from "@/lib/geoCorrelation";
import type { GeoCluster } from "@/lib/geoCorrelation";
import GeoClusterPanel from "@/components/GeoClusterPanel";
import { MapPin, Layers, Radar, Link2, Zap, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StormThreatPanel from "@/components/StormThreatPanel";
import StormHistoryTimeline from "@/components/StormHistoryTimeline";
import "leaflet/dist/leaflet.css";

const priorityColors: Record<string, string> = {
  critical: "#e04848",
  high: "#e8a020",
  medium: "#3ea8d8",
  low: "#2db87a",
  routine: "#6b7280",
};

/** CSS for pulsing ring on cross-source markers, injected once */
const PULSE_CSS_ID = "geo-pulse-css";
function ensurePulseCss() {
  if (document.getElementById(PULSE_CSS_ID)) return;
  const style = document.createElement("style");
  style.id = PULSE_CSS_ID;
  style.textContent = `
    @keyframes geo-pulse-ring {
      0%   { transform: scale(1);   opacity: 0.7; }
      70%  { transform: scale(2.2); opacity: 0; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    .geo-pulse-marker {
      position: relative;
    }
    .geo-pulse-marker::after {
      content: '';
      position: absolute;
      inset: -4px;
      border: 2px solid #f59e0b;
      border-radius: 50%;
      animation: geo-pulse-ring 2s ease-out infinite;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

export default function MapPage() {
  const { data: products = [], isLoading } = useAllGeoProducts();
  const {
    clusters,
    crossSourceClusters,
    correlatedPairs,
    stats,
    getClusterForProduct,
  } = useGeoCorrelation();

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const clusterLayerRef = useRef<L.LayerGroup | null>(null);
  const connectionLayerRef = useRef<L.LayerGroup | null>(null);
  const pulseLayerRef = useRef<L.LayerGroup | null>(null);

  // Toggle state
  const [showClusters, setShowClusters] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [crossSourceOnly, setCrossSourceOnly] = useState(false);

  // Panel state
  const [selectedCluster, setSelectedCluster] = useState<GeoCluster | null>(null);

  const geoProducts = useMemo(
    () => products.filter((p) => p.latitude != null && p.longitude != null),
    [products],
  );

  const center = useMemo<[number, number]>(() => {
    if (geoProducts.length === 0) return [34.0, -117.0];
    const avgLat = geoProducts.reduce((s, p) => s + p.latitude!, 0) / geoProducts.length;
    const avgLng = geoProducts.reduce((s, p) => s + p.longitude!, 0) / geoProducts.length;
    return [avgLat, avgLng];
  }, [geoProducts]);

  // Build set of product-ids that are in cross-source clusters
  const crossSourceProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of crossSourceClusters) {
      for (const m of c.members) ids.add(m.productId);
    }
    return ids;
  }, [crossSourceClusters]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePulseCss();
```

---

## Analysis Notes

### KEY FINDING: Supabase client uses LOCAL IN-MEMORY STORE (not real Supabase)

```
src/integrations/supabase/client.ts:
  // Supabase client — uses local in-memory store as a drop-in replacement
  import { localSupabase } from '@/lib/localStore';
  export const supabase = localSupabase as any;
```

The entire app is wired to a local in-memory mock (`src/lib/localStore.ts`) instead of
the real Supabase backend. The `.env` file has real credentials but they are NOT used.

### File Line Counts
- IngestPage.tsx: 175 lines
- SourceForm.tsx: 92 lines
- UploadPage.tsx: 363 lines

### Lat/Lng References
- IngestPage.tsx: uses `lat`/`lng` state → `latitude`/`longitude` in mutation (lines 17-18, 36-37, 74-75)
- UploadPage.tsx: no direct lat/lng handling
- SourceForm.tsx: no lat/lng fields
- ingestedData.ts: canonical model uses `lat`/`lon` fields (lines 25, 27, 74-75)

### Event Bus / Pipeline
- useEventBus.ts: queries `event_bus`, `pipeline_stages`, `dead_letter_queue` tables
- Invokes `pipeline-orchestrator` Supabase edge function (lines 125, 142)
- All queries go through localStore mock → likely returns empty arrays

### Correlation Alerts / Realtime
- useCorrelationAlerts.ts: queries `correlation_alerts`, subscribes to realtime channel
- Realtime `.channel()` / `.subscribe()` calls go through localStore mock
- AlertsPanel.tsx: consumes alerts via these hooks

### LocalStore Mock Details
- `src/lib/localStore.ts` line 484: `functions.invoke()` returns mock responses
- `src/lib/localStore.ts` line 495: `storage.upload()` is skipped in local mode
- `localSupabase` exported at line 516
