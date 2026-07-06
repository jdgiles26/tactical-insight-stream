import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Upload, Film, Loader2, CheckCircle, AlertTriangle,
  Brain, Eye, ChevronDown, ChevronRight, Cpu, Zap, Search,
  Image as ImageIcon, FileVideo, Plus, X,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  processVideoWithLFM,
  loadLFMPipeline,
  onModelStatusChange,
  getModelLoadError,
  type LFMProcessorResult,
  type LFMDetection,
  type LFMSceneSummary,
  type ModelLoadStatus,
} from "@/lib/visionService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisItem {
  file: File;
  status: "idle" | "processing" | "done" | "error";
  progress: number;
  progressStage: string;
  result?: LFMProcessorResult;
  error?: string;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VisionAnalysisPage() {
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [objectLabels, setObjectLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen to model load status
  useEffect(() => {
    const unsub = onModelStatusChange((status, progress) => {
      setModelStatus(status);
      if (progress !== undefined) setModelProgress(progress);
    });
    return unsub;
  }, []);

  const updateItem = useCallback((idx: number, updates: Partial<AnalysisItem>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }, []);

  const processFile = useCallback(async (file: File, idx: number) => {
    const thumbnailUrl = URL.createObjectURL(file);
    updateItem(idx, { status: "processing", progress: 5, progressStage: "Starting...", thumbnailUrl });

    try {
      const result = await processVideoWithLFM(
        file,
        (stage, percent) => {
          updateItem(idx, { progress: percent, progressStage: stage });
        },
        objectLabels.length > 0 ? objectLabels : undefined
      );

      updateItem(idx, {
        status: "done",
        progress: 100,
        progressStage: "Complete",
        result,
      });

      if (result.success) {
        toast.success(`Analysis complete: ${result.detections} objects detected`);
      } else {
        toast.warning("Analysis completed with limited results");
      }
    } catch (err: any) {
      updateItem(idx, {
        status: "error",
        error: err.message || "Analysis failed",
        progressStage: "Error",
      });
      toast.error(`Analysis failed: ${err.message}`);
    }
  }, [updateItem, objectLabels]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("image/")
    );

    if (fileArray.length === 0) {
      toast.error("Please upload video or image files");
      return;
    }

    const startIdx = items.length;
    const newItems: AnalysisItem[] = fileArray.map((file) => ({
      file,
      status: "idle" as const,
      progress: 0,
      progressStage: "Queued",
    }));

    setItems((prev) => [...prev, ...newItems]);

    fileArray.forEach((file, i) => {
      setTimeout(() => processFile(file, startIdx + i), i * 500);
    });
  }, [items.length, processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handlePreloadModel = useCallback(async () => {
    try {
      toast.info("Loading vision models... This may take a moment.");
      await loadLFMPipeline();
      toast.success("Models loaded and ready!");
    } catch (err: any) {
      toast.error(`Model load failed: ${err.message}`);
    }
  }, []);

  const addLabel = useCallback(() => {
    const trimmed = labelInput.trim().toLowerCase();
    if (trimmed && !objectLabels.includes(trimmed)) {
      setObjectLabels((prev) => [...prev, trimmed]);
    }
    setLabelInput("");
  }, [labelInput, objectLabels]);

  const removeLabel = useCallback((label: string) => {
    setObjectLabels((prev) => prev.filter((l) => l !== label));
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-400" />
            Vision Analysis
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            In-browser inference • Open-vocabulary object detection • Scene captioning
          </p>
        </div>

        {/* Model Status Badge */}
        <div className="flex items-center gap-2">
          {modelStatus === "idle" && (
            <button
              onClick={handlePreloadModel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-mono hover:bg-purple-600/30 transition-colors"
            >
              <Cpu className="h-3.5 w-3.5" />
              Pre-load Models
            </button>
          )}
          {modelStatus === "loading" && (
            <Badge variant="outline" className="text-yellow-300 border-yellow-500/40 animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Loading {modelProgress}%
            </Badge>
          )}
          {modelStatus === "ready" && (
            <Badge variant="outline" className="text-green-300 border-green-500/40">
              <Zap className="h-3 w-3 mr-1" />
              Models Ready
            </Badge>
          )}
          {modelStatus === "error" && (
            <Badge variant="outline" className="text-red-300 border-red-500/40">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {getModelLoadError()?.slice(0, 40) || "Load Error"}
            </Badge>
          )}
        </div>
      </div>

      {/* Open Vocabulary Object Detection Input */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium">Open Vocabulary Object Detection</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter objects to detect in your uploaded media. The OWL-ViT model will find and draw bounding boxes around matching objects.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
            placeholder="e.g. person, vehicle, boat, weapon..."
            className="flex-1 rounded-md border border-accent/30 bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <button
            onClick={addLabel}
            disabled={!labelInput.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-mono hover:bg-blue-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
        {objectLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {objectLabels.map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="text-xs px-2 py-0.5 text-blue-300 border-blue-500/40 cursor-pointer hover:bg-blue-500/10"
                onClick={() => removeLabel(label)}
              >
                {label}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
        {objectLabels.length === 0 && (
          <p className="text-[10px] text-muted-foreground/70 italic">
            No detection labels set — scene captioning will still run. Add labels above for targeted object detection with bounding boxes.
          </p>
        )}
      </div>

      {/* Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? "border-purple-400 bg-purple-500/10"
            : "border-muted-foreground/30 hover:border-purple-400/50 hover:bg-accent/5"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <Upload className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
        <p className="text-sm font-medium">
          Drop video or image files here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Supported: MP4, WebM, MOV, AVI, JPEG, PNG • All processing happens in your browser
        </p>
      </div>

      {/* Results */}
      {items.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="h-5 w-5 text-purple-400" />
            Analysis Results
          </h2>

          {items.map((item, idx) => (
            <AnalysisCard key={idx} item={item} />
          ))}
        </div>
      )}

      {/* Info Panel */}
      {items.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <InfoCard
            icon={<Brain className="h-5 w-5 text-purple-400" />}
            title="Scene Captioning"
            description="ViT-GPT2 generates natural language descriptions of scenes, identifying objects, activities, and environment."
          />
          <InfoCard
            icon={<Search className="h-5 w-5 text-blue-400" />}
            title="Open-Vocab Detection"
            description="OWL-ViT detects any object you describe in free text — no fixed categories. Enter what to find and get bounding boxes."
          />
          <InfoCard
            icon={<Zap className="h-5 w-5 text-green-400" />}
            title="100% In-Browser"
            description="All inference runs locally via transformers.js. No data leaves your device — complete privacy guaranteed."
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-medium text-sm">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function AnalysisCard({ item }: { item: AnalysisItem }) {
  const isVideo = item.file.type.startsWith("video/");

  return (
    <div className="rounded-lg border border-accent/20 bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {isVideo ? (
            <FileVideo className="h-8 w-8 text-purple-400" />
          ) : (
            <ImageIcon className="h-8 w-8 text-blue-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {(item.file.size / (1024 * 1024)).toFixed(1)} MB • {item.file.type}
          </p>
        </div>
        <div>
          {item.status === "processing" && (
            <Badge variant="outline" className="text-yellow-300 border-yellow-500/40">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Processing
            </Badge>
          )}
          {item.status === "done" && (
            <Badge variant="outline" className="text-green-300 border-green-500/40">
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
          {item.status === "error" && (
            <Badge variant="outline" className="text-red-300 border-red-500/40">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          )}
        </div>
      </div>

      {/* Progress */}
      {item.status === "processing" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{item.progressStage}</span>
            <span className="text-muted-foreground">{item.progress}%</span>
          </div>
          <Progress value={item.progress} className="h-1.5" />
        </div>
      )}

      {/* Error */}
      {item.status === "error" && item.error && (
        <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
          {item.error}
        </p>
      )}

      {/* Results */}
      {item.status === "done" && item.result && (
        <ResultDisplay result={item.result} />
      )}
    </div>
  );
}

function ResultDisplay({ result }: { result: LFMProcessorResult }) {
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [detectionsOpen, setDetectionsOpen] = useState(true);
  const [clipsOpen, setClipsOpen] = useState(true);

  return (
    <div className="space-y-3 pt-2 border-t border-accent/10">
      {/* Stats Row */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-xs">
          <Eye className="h-3 w-3 mr-1" />
          {result.detections} objects
        </Badge>
        <Badge variant="secondary" className="text-xs">
          <Film className="h-3 w-3 mr-1" />
          {result.frames_analyzed} frames
        </Badge>
        <Badge variant="secondary" className="text-xs">
          <Cpu className="h-3 w-3 mr-1" />
          {result.execution_provider}
        </Badge>
        {result.emergency_detected && (
          <Badge variant="destructive" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {result.emergency_type}
          </Badge>
        )}
      </div>

      {/* Model Info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="h-3.5 w-3.5 text-purple-400" />
        <span className="font-mono">{result.models_used.join(" + ")}</span>
        <span className="text-accent/50">|</span>
        <span>{result.model_source}</span>
      </div>

      {/* Scene Clips / Frame Thumbnails */}
      {result.frame_thumbnails && result.frame_thumbnails.length > 0 && (
        <Collapsible open={clipsOpen} onOpenChange={setClipsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 hover:bg-green-500/10 transition-colors">
            {clipsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Film className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-medium">Scene Clips ({result.frame_thumbnails.length} frames)</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {result.frame_thumbnails.map((thumb, i) => (
                <div key={i} className="relative rounded-md overflow-hidden border border-accent/20 bg-black">
                  <img
                    src={thumb}
                    alt={`Frame ${i + 1}`}
                    className="w-full h-auto object-cover"
                  />
                  <span className="absolute bottom-1 left-1 text-[9px] font-mono bg-black/70 text-white px-1 rounded">
                    Frame {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Scene Summary */}
      {result.scene_summary?.available && (
        <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left rounded-md border border-purple-500/20 bg-purple-500/5 px-3 py-2 hover:bg-purple-500/10 transition-colors">
            {summaryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Brain className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs font-medium">Scene Summary</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <SceneSummaryDisplay summary={result.scene_summary} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Detection Details with Bounding Boxes */}
      {result.detection_details.length > 0 && (
        <Collapsible open={detectionsOpen} onOpenChange={setDetectionsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left rounded-md border border-accent/20 bg-accent/5 px-3 py-2 hover:bg-accent/10 transition-colors">
            {detectionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Eye className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium">
              Detected Objects ({result.detection_details.length})
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <DetectionList detections={result.detection_details} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function SceneSummaryDisplay({ summary }: { summary: LFMSceneSummary }) {
  return (
    <div className="rounded-md border border-purple-500/20 bg-purple-500/5 p-3 space-y-2 text-xs">
      {summary.summary && (
        <div>
          <span className="font-mono text-purple-300 uppercase text-[10px]">Summary</span>
          <p className="text-foreground mt-0.5">{summary.summary}</p>
        </div>
      )}
      {summary.objects.length > 0 && (
        <div>
          <span className="font-mono text-purple-300 uppercase text-[10px]">Objects</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {summary.objects.map((obj, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                {obj}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {summary.activity && (
        <div>
          <span className="font-mono text-purple-300 uppercase text-[10px]">Activity</span>
          <p className="text-foreground mt-0.5">{summary.activity}</p>
        </div>
      )}
      {summary.environment && (
        <div>
          <span className="font-mono text-purple-300 uppercase text-[10px]">Environment</span>
          <p className="text-foreground mt-0.5">{summary.environment}</p>
        </div>
      )}
      {summary.tactical_notes && (
        <div>
          <span className="font-mono text-purple-300 uppercase text-[10px]">Tactical</span>
          <p className="text-foreground mt-0.5">{summary.tactical_notes}</p>
        </div>
      )}
      <div className="pt-1 border-t border-purple-500/10 text-[10px] text-muted-foreground">
        Model: {summary.model} • Frames analyzed: {summary.frames_sent}
      </div>
    </div>
  );
}

function DetectionList({ detections }: { detections: LFMDetection[] }) {
  return (
    <div className="rounded-md border border-accent/20 bg-accent/5 p-2 space-y-1 max-h-80 overflow-y-auto">
      {detections.map((det, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-[11px] font-mono rounded px-2 py-1.5 bg-background/50 border border-accent/10"
        >
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 text-purple-300 border-purple-500/40"
          >
            {(det.confidence * 100).toFixed(0)}%
          </Badge>
          <span className="text-foreground font-medium">{det.label}</span>
          {det.box && (
            <span className="text-muted-foreground text-[9px]">
              [{Math.round(det.box.xmin)},{Math.round(det.box.ymin)}→{Math.round(det.box.xmax)},{Math.round(det.box.ymax)}]
            </span>
          )}
          <span className="text-muted-foreground ml-auto">frame {det.frame}</span>
        </div>
      ))}
    </div>
  );
}
