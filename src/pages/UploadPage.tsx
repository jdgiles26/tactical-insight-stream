import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Film, Loader2, CheckCircle, AlertTriangle, Cpu, Zap, Brain, Siren, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { processDocumentLocally } from "@/lib/localDocumentProcessor";
import { processVideoLocally } from "@/lib/localVideoProcessor";
import type { DocumentProcessorResult, Detection as DocDetection } from "@/lib/localDocumentProcessor";
import type { VideoProcessorResult, VideoDetection } from "@/lib/localVideoProcessor";
import { keySplitter, type KeySplitResult } from "@/lib/keySplitter";
import { ddilOptimizer, type TransportClassification } from "@/lib/ddilOptimizer";
import { KeySplitIndicator } from "@/components/KeySplitIndicator";
import { Badge as BadgeUI } from "@/components/ui/badge";

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
  sceneSummary?: string;
  sceneAvailable?: boolean;
  keySplit?: KeySplitResult;
  transport?: TransportClassification;
  nlpTags?: string[];
  documentCategory?: string;
  error?: string;
}

const DOC_MODEL_CHAIN = "NLP topic classifier + sentiment + keyphrase + NER";
const VIDEO_MODEL = "YOLOv8n SAR vessel ONNX + Qwen2.5-VL-7B scene analysis";
  detectionDetails?: VideoDetection[] | DocDetection[];
  keyElements?: Record<string, string>;
  error?: string;
}

const DOC_MODEL_CHAIN = "Rule-based NER + pattern matching";
const VIDEO_MODEL = "LFM2.5-VL-450M WebGPU in-browser vision-language analysis";

/** Collapsible detection snapshot showing each detection result */
function DetectionSnapshot({
  detections,
  keyElements,
  isVideo,
}: {
  detections: VideoDetection[] | DocDetection[];
  keyElements?: Record<string, string>;
  isVideo: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left rounded-md border border-accent/20 bg-accent/5 px-2 py-1.5 hover:bg-accent/10 transition-colors">
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-accent" />
        ) : (
          <ChevronRight className="h-3 w-3 text-accent" />
        )}
        <Eye className="h-3 w-3 text-accent" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent">
          Detection Snapshot ({detections.length} {isVideo ? "object" : "entit"}{detections.length !== 1 ? (isVideo ? "s" : "ies") : (isVideo ? "" : "y")})
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <div className="rounded-md border border-accent/20 bg-accent/5 p-2 space-y-1.5 max-h-60 overflow-y-auto">
          {/* Key Elements (for documents) */}
          {keyElements && Object.keys(keyElements).length > 0 && (
            <div className="mb-2 pb-1.5 border-b border-accent/10">
              <span className="text-[9px] font-mono uppercase text-accent/70 tracking-wider">Key Elements</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
                {Object.entries(keyElements).map(([key, value]) => (
                  <div key={key} className="flex gap-1 text-[10px]">
                    <span className="font-mono text-muted-foreground">{key.replace(/_/g, " ")}:</span>
                    <span className="text-foreground truncate">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Individual Detections */}
          {detections.map((det, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[10px] font-mono rounded px-1.5 py-0.5 bg-background/50"
            >
              <Badge
                variant="outline"
                className={`text-[8px] px-1 py-0 ${
                  det.confidence >= 0.85
                    ? "text-red-300 border-red-500/40"
                    : det.confidence >= 0.65
                    ? "text-orange-300 border-orange-500/40"
                    : "text-blue-300 border-blue-500/40"
                }`}
              >
                {(det.confidence * 100).toFixed(1)}%
              </Badge>
              <span className="text-foreground font-medium">{det.label.replace(/_/g, " ")}</span>
              {isVideo && "frame" in det && (
                <span className="text-muted-foreground ml-auto">frame {(det as VideoDetection).frame}</span>
              )}
              {isVideo && "bbox" in det && (det as VideoDetection).bbox.w > 0 && (
                <span className="text-muted-foreground">
                  [{(det as VideoDetection).bbox.x},{(det as VideoDetection).bbox.y} {(det as VideoDetection).bbox.w}×{(det as VideoDetection).bbox.h}]
                </span>
              )}
              {!isVideo && "raw_entity" in det && (det as DocDetection).raw_entity && (
                <span className="text-muted-foreground ml-auto truncate max-w-[200px]">
                  &ldquo;{(det as DocDetection).raw_entity}&rdquo;
                </span>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadLat, setUploadLat] = useState("");
  const [uploadLng, setUploadLng] = useState("");

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
          ...(uploadLat && uploadLng ? { latitude: parseFloat(uploadLat), longitude: parseFloat(uploadLng) } : {}),
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

      const updatedPriority = isEmergency ? "critical" : 
        (docResult?.urgency_level === "high" ? "high" : "medium");
      const updatedScore = isEmergency ? 0.95 : 
        (docResult?.urgency_level === "high" ? 0.8 : 0.6);

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
              nlp_tags: docResult.nlp_tags,
              topics: docResult.topics,
              sentiment: docResult.sentiment,
              key_phrases: docResult.key_phrases,
              document_category: docResult.document_category,
            } : {}),
            ...(vidResult ? {
              detection_details: vidResult.detection_details,
              model_source: vidResult.model_source,
              yolo_classes: vidResult.yolo_classes,
              ...(vidResult.scene_summary?.available ? {
                scene_summary: vidResult.scene_summary.summary,
                scene_objects: vidResult.scene_summary.objects,
                scene_activity: vidResult.scene_summary.activity,
                scene_environment: vidResult.scene_summary.environment,
                scene_tactical: vidResult.scene_summary.tactical_notes,
                scene_model: vidResult.scene_summary.model,
              } : {}),
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
            detector_type: "lfm-vl",
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

      // Step 5: Check for commander's intent matches
      const allDetections = [
        ...(docResult ? docResult.detection_details.slice(0, 10) : []),
        ...(vidResult ? vidResult.detection_details : []),
      ];
      try {
        const { data: intents } = await supabase
          .from("commander_intents").select("*").eq("is_active", true);
        if (intents?.length) {
          for (const intent of intents) {
            const term = (intent as any).term?.toLowerCase();
            if (!term) continue;
            for (const det of allDetections) {
              const label = det.label.toLowerCase();
              if (label.includes(term) || term.includes(label)) {
                await supabase.from("correlation_alerts").insert({
                  intent_id: (intent as any).id,
                  data_product_id: product.id,
                  match_type: label === term ? 'exact' : 'related',
                  match_score: det.confidence || 0.8,
                  matched_term: (intent as any).term,
                  matched_label: det.label,
                  acknowledged: false,
                } as any).catch(() => {});
              }
            }
          }
        }
      } catch (e) {
        console.warn('[UploadPage] Correlation matching failed:', e);
      }

      // Step 6: Create pipeline event for the upload
      await supabase.from("event_bus").insert({
        topic: 'mdg.ingestion',
        partition_key: sourceType,
        payload: { title: file.name, source_type: sourceType, product_id: product.id, detections: result.detections },
        status: 'completed',
        stage: 'ingestion',
        data_product_id: product.id,
        retry_count: 0,
        max_retries: 3,
        metadata: {},
      } as any).catch(() => {});

      // Step 7: Key-split classification and DDIL transport queue
      const keySplit = keySplitter.classify(product, allDetections);
      const enrichedProduct = {
        ...product,
        priority: updatedPriority,
        priority_score: updatedScore,
        content: { ...((product.content as any) || {}), emergency_detected: result.emergency_detected },
      };
      ddilOptimizer.enqueue(enrichedProduct);
      const transport = ddilOptimizer.classifyDataForTransport(enrichedProduct);

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
        sceneSummary: vidResult?.scene_summary?.available ? vidResult.scene_summary.summary : undefined,
        sceneAvailable: vidResult?.scene_summary?.available ?? false,
        keySplit,
        transport,
        nlpTags: docResult?.nlp_tags ?? undefined,
        documentCategory: docResult?.document_category?.category ?? undefined,
        detectionDetails: isVideo ? vidResult!.detection_details : docResult!.detection_details,
        keyElements: docResult?.key_elements,
      });

      // Toasts
      if (result.emergency_detected) {
        toast.error(
          `🚨 EMERGENCY DETECTED: ${(result.emergency_type ?? "unknown").replace("_", " ").toUpperCase()} — ${result.mission_groups_created ?? 0} mission group(s) created.`,
          { duration: 12000 }
        );
      } else {
        const modelInfo = isVideo
          ? vidResult?.onnx_enabled
            ? `YOLOv8n ONNX (${result.detections} real detections, ${vidResult.frames_analyzed} frames)`
            : `no model available (${vidResult?.frames_analyzed ?? 0} frames extracted, 0 detections)`
          : `rule-based (${result.detections} entities)`;
        toast.success(`Processed: ${file.name} — ${modelInfo}`);
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
          Documents via rule-based entity extraction, video via real YOLOv8n ONNX inference
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
          <span>ingestion → NLP classification → entity extraction → emergency detection → tagging → correlation</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Siren className="h-3.5 w-3.5 text-red-400" />
          <span className="text-foreground font-medium">Emergency triggers:</span>
          <span>OPORD · Mayday · Disaster · Illegal Activity · Injury · National Alert</span>
        </div>
      </div>

      {/* Optional Geo Coordinates */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 flex flex-wrap gap-4 items-end">
        <div>
          <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Latitude (optional)</label>
          <input
            type="number"
            step="any"
            value={uploadLat}
            onChange={e => setUploadLat(e.target.value)}
            placeholder="e.g. 34.0522"
            className="w-40 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Longitude (optional)</label>
          <input
            type="number"
            step="any"
            value={uploadLng}
            onChange={e => setUploadLng(e.target.value)}
            placeholder="e.g. -118.2437"
            className="w-40 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono">Attach geo-coordinates for map correlation</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Document Upload */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <FileText className="h-4 w-4" /> Document Upload
          </h3>
          <p className="mb-1 text-[10px] font-mono text-primary/70 uppercase tracking-wider">
            NLP Topic Classification · Sentiment Analysis · Key Phrase Extraction · NER
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
            YOLOv8n SAR vessel detection · Qwen2.5-VL scene summary · real inference
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload video for real vessel detection via YOLOv8n SAR ONNX model + AI scene summarization via Qwen2.5-VL. Frames are extracted and analyzed by both pipelines.
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
                      {upload.keySplit && <KeySplitIndicator result={upload.keySplit} />}
                      {upload.transport && (
                        <Badge variant="outline" className={`text-[8px] gap-1 ${
                          upload.transport.priority_class === 'flash' ? 'text-red-300 border-red-500/40' :
                          upload.transport.priority_class === 'immediate' ? 'text-orange-300 border-orange-500/40' :
                          'text-muted-foreground border-border'
                        }`}>
                          {upload.transport.transport_strategy.replace('_', ' ').toUpperCase()}
                        </Badge>
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
                    {upload.sceneSummary && upload.status === "done" && (
                      <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Eye className="h-3 w-3 text-primary" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">Qwen VL Scene Summary</span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">
                          {upload.sceneSummary}
                        </p>
                      </div>
                    )}
                    {upload.nlpTags && upload.nlpTags.length > 0 && upload.status === "done" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {upload.nlpTags.map((tag, tIdx) => (
                          <Badge key={tIdx} variant="outline" className={`text-[9px] font-mono ${
                            tag.startsWith('topic:') ? 'text-blue-300 border-blue-500/30' :
                            tag.startsWith('category:') ? 'text-emerald-300 border-emerald-500/30' :
                            tag.startsWith('tone:') ? 'text-amber-300 border-amber-500/30' :
                            tag.startsWith('entity:') ? 'text-purple-300 border-purple-500/30' :
                            tag.startsWith('urgency:') ? 'text-red-300 border-red-500/30' :
                            tag.startsWith('emergency:') ? 'text-red-400 border-red-500/40' :
                            'text-muted-foreground border-border'
                          }`}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    {/* Collapsible Detection Snapshot */}
                    {upload.status === "done" && upload.detectionDetails && upload.detectionDetails.length > 0 && (
                      <DetectionSnapshot
                        detections={upload.detectionDetails}
                        keyElements={upload.keyElements}
                        isVideo={upload.file.type.startsWith("video/")}
                      />
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
