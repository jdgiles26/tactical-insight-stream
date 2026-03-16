import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIngestData } from "@/hooks/useDataProducts";
import { toast } from "sonner";
import { Upload, FileText, Film, Loader2, CheckCircle, AlertTriangle, Cpu, Zap, Brain } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
  error?: string;
}

const DOC_MODEL_CHAIN = "DeBERTa-v3 → BERT NER → BART → rule-based";
const VIDEO_MODEL = "YOLOv8 best-boat.onnx (maritime)";

export default function UploadPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const ingest = useIngestData();

  const updateUpload = (idx: number, updates: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u, i) => (i === idx ? { ...u, ...updates } : u)));
  };

  const processFile = useCallback(async (file: File, idx: number) => {
    const isVideo = file.type.startsWith("video/");
    const isDoc = file.type === "application/pdf" || file.type.includes("document") || file.name.endsWith(".pdf");
    const sourceType = isVideo ? "video" : isDoc ? "document" : "image";

    updateUpload(idx, { status: "uploading", progress: 30 });

    // Upload to storage
    const filePath = `${sourceType}s/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, file);

    if (uploadError) {
      updateUpload(idx, { status: "error", error: uploadError.message });
      return;
    }

    updateUpload(idx, { progress: 60 });

    // Create data product
    const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1 };
    const { data: product, error: ingestError } = await supabase
      .from("data_products")
      .insert({
        title: file.name,
        source_type: sourceType as any,
        source_identifier: filePath,
        status: "ingested" as any,
        priority: "medium" as any,
        priority_score: priorityScores.medium,
        confidence_score: 0.85,
        content: { file_path: filePath, file_size: file.size, mime_type: file.type },
      })
      .select()
      .single();

    if (ingestError || !product) {
      updateUpload(idx, { status: "error", error: ingestError?.message ?? "Ingestion failed" });
      return;
    }

    updateUpload(idx, { progress: 80, status: "processing", productId: product.id });

    // Call appropriate processor
    const fnName = isVideo ? "video-processor" : "document-processor";
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(fnName, {
        body: { data_product_id: product.id, file_path: filePath },
      });

      if (fnError) {
        updateUpload(idx, { status: "error", error: fnError.message });
        return;
      }

      updateUpload(idx, {
        status: "done",
        progress: 100,
        detections: result?.detections ?? 0,
        alerts: result?.alerts ?? 0,
        modelsUsed: result?.models_used ?? [],
        modelSource: result?.model_source ?? result?.model_cascade,
        apiPowered: result?.api_powered ?? result?.onnx_enabled ?? false,
        onnxEnabled: result?.onnx_enabled ?? false,
      });

      if (result?.alerts > 0) {
        toast.warning(`⚠️ ${result.alerts} correlation alert(s) triggered for ${file.name}`, {
          duration: 8000,
        });
      } else {
        const modelInfo = isVideo
          ? (result?.onnx_enabled ? "ONNX:best-boat.onnx" : "YOLO heuristic")
          : (result?.api_powered ? `BERT/DeBERTa (${result?.models_used?.length ?? 0} models)` : "rule-based");
        toast.success(`Processed: ${file.name} — ${result?.detections ?? 0} detections via ${modelInfo}`);
      }
    } catch (err: any) {
      updateUpload(idx, { status: "error", error: err.message });
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const newUploads: UploadItem[] = files.map((f) => ({
      file: f,
      status: "idle" as UploadStatus,
      progress: 0,
    }));

    setUploads((prev) => [...newUploads, ...prev]);

    files.forEach((file, i) => {
      setTimeout(() => processFile(file, i), i * 500);
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
          AI-native processing — documents via DeBERTa/BERT NER, video via YOLOv8 maritime ONNX model
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
          <span>ingestion → NLP/YOLO → tagging → correlation → prioritization → transport</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Document Upload */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground">
            <FileText className="h-4 w-4" /> Document Upload
          </h3>
          <p className="mb-1 text-[10px] font-mono text-primary/70 uppercase tracking-wider">
            DeBERTa-v3 · BERT NER · BigBird · BART zero-shot
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload PDFs, reports, manifests, and logs. AI models extract named entities, classify document type, and match against Commander's Intent via semantic similarity.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 p-8 transition-colors hover:border-primary/50 hover:bg-secondary/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-mono text-muted-foreground">Drop documents or click to browse</span>
            <span className="text-xs text-muted-foreground/60">PDF, DOCX, TXT, images</span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
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
            YOLOv8 best-boat.onnx · 8-class maritime detection · NMS post-processing
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload surveillance footage for frame-by-frame YOLOv8 maritime object detection. Detections include bounding boxes, confidence scores, and cross-source correlation.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 p-8 transition-colors hover:border-primary/50 hover:bg-secondary/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-mono text-muted-foreground">Drop video files or click to browse</span>
            <span className="text-xs text-muted-foreground/60">MP4, AVI, MOV (max 20MB)</span>
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
                      {upload.detections !== undefined && (
                        <span className="text-[10px] font-mono text-primary">{upload.detections} detections</span>
                      )}
                      {upload.alerts !== undefined && upload.alerts > 0 && (
                        <span className="text-[10px] font-mono text-destructive">{upload.alerts} alerts!</span>
                      )}
                      {upload.onnxEnabled && (
                        <span className="text-[10px] font-mono text-accent">ONNX ✓</span>
                      )}
                      {upload.apiPowered && !upload.onnxEnabled && (
                        <span className="text-[10px] font-mono text-accent">HF API ✓</span>
                      )}
                      {upload.modelsUsed && upload.modelsUsed.length > 0 && (
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
                {upload.status !== "idle" && upload.status !== "done" && upload.status !== "error" && (
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

