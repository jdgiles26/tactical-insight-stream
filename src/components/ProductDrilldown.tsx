/**
 * ProductDrilldown — full extraction drilldown for a data product.
 *
 * Shows every key element, detection, extracted verbiage, bounding box,
 * emergency trigger, and model chain — broken out by media type.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { KeySplitIndicator } from "@/components/KeySplitIndicator";
import { keySplitter } from "@/lib/keySplitter";
import { formatDistanceToNow } from "date-fns";
import {
  FileText, Film, Image, AlertTriangle, Crosshair, Tag,
  Brain, Box, Scan, Quote, MapPin, Clock, Flame, Shield,
  Cpu, Hash, Layers, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DetectionResult } from "@/hooks/useCorrelations";

// ---------------------------------------------------------------------------
// Types for content stored in data_products.content JSON
// ---------------------------------------------------------------------------

interface DocDetection {
  label: string;
  confidence: number;
  detector_type: string;
  raw_entity?: string;
}

interface VideoDetection {
  label: string;
  confidence: number;
  bbox?: { x: number; y: number; w: number; h: number };
  frame?: number;
}

interface ProductContent {
  file_size?: number;
  mime_type?: string;
  processed_locally?: boolean;
  detections?: number;
  models_used?: string[];
  emergency_detected?: boolean;
  emergency_type?: string;
  // Document-specific
  detection_details?: (DocDetection | VideoDetection)[];
  key_elements?: Record<string, string>;
  urgency_level?: string;
  // Video-specific
  model_source?: string;
  yolo_classes?: string[];
  // generic
  [key: string]: unknown;
}

interface DataProduct {
  id: string;
  title: string;
  source_type: string;
  source_identifier: string | null;
  status: string;
  priority: string | null;
  priority_score: number | null;
  confidence_score: number | null;
  priority_reasoning: string | null;
  latitude: number | null;
  longitude: number | null;
  content: unknown;
  created_at: string;
  updated_at: string;
}

interface Props {
  product: DataProduct;
  /** Detections from detection_results table (optional, enriches view) */
  detectionResults?: DetectionResult[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEDIA_ICON: Record<string, React.ReactNode> = {
  document: <FileText className="h-4 w-4" />,
  video: <Film className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
};

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  low: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

function confidenceBar(conf: number) {
  const pct = Math.round(conf * 100);
  const color =
    pct >= 90 ? "bg-emerald-500" :
    pct >= 75 ? "bg-primary" :
    pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono w-8 text-right">{pct}%</span>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProductDrilldown({ product, detectionResults = [], onClose }: Props) {
  const content = (product.content ?? {}) as ProductContent;
  const isVideo = product.source_type === "video";
  const isDoc = product.source_type === "document";
  const keySplit = useMemo(() => keySplitter.classify(product as any), [product]);

  const detectionDetails: (DocDetection | VideoDetection)[] = content.detection_details ?? [];
  const keyElements: Record<string, string> = content.key_elements ?? {};
  const keyElementEntries = Object.entries(keyElements);
  const modelsUsed = content.models_used ?? [];
  const yoloClasses = content.yolo_classes ?? [];

  // Merge detection_results table rows for richer metadata
  const detResultsMap = useMemo(() => {
    const m = new Map<string, DetectionResult>();
    for (const dr of detectionResults) m.set(dr.label, dr);
    return m;
  }, [detectionResults]);

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[580px] border-l border-border bg-card shadow-xl flex flex-col animate-slide-in">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
          {MEDIA_ICON[product.source_type] || <Layers className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold truncate">{product.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={product.status as any} />
            {product.priority && <StatusBadge status={product.priority as any} />}
            <KeySplitIndicator result={keySplit} compact />
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">

          {/* ── Metadata Overview ───────────────────────── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="h-3 w-3" /> ID
            </div>
            <span className="font-mono truncate text-foreground">{product.id}</span>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="h-3 w-3" /> Source Type
            </div>
            <span className="font-mono text-foreground">{product.source_type}</span>

            {content.mime_type && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="h-3 w-3" /> MIME
                </div>
                <span className="font-mono text-foreground">{content.mime_type}</span>
              </>
            )}

            {content.file_size != null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Box className="h-3 w-3" /> Size
                </div>
                <span className="font-mono text-foreground">{formatBytes(content.file_size)}</span>
              </>
            )}

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" /> Ingested
            </div>
            <span className="font-mono text-foreground">
              {formatDistanceToNow(new Date(product.created_at), { addSuffix: true })}
            </span>

            {product.priority_score != null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Shield className="h-3 w-3" /> Priority Score
                </div>
                <span className="font-mono text-foreground">
                  {(Number(product.priority_score) * 100).toFixed(0)}%
                </span>
              </>
            )}

            {(product.latitude != null && product.longitude != null) && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Coordinates
                </div>
                <span className="font-mono text-foreground">
                  {Number(product.latitude).toFixed(4)}, {Number(product.longitude).toFixed(4)}
                </span>
              </>
            )}

            {product.source_identifier && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Scan className="h-3 w-3" /> Source
                </div>
                <span className="font-mono text-foreground truncate">{product.source_identifier}</span>
              </>
            )}
          </div>

          {/* ── Emergency / Priority Reasoning ──────────── */}
          {(content.emergency_detected || product.priority_reasoning) && (
            <Card className={content.emergency_detected
              ? "border-red-500/40 bg-red-500/5"
              : "border-border"
            }>
              <CardContent className="p-3 space-y-1.5">
                {content.emergency_detected && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-300 uppercase">
                      Emergency Detected: {(content.emergency_type ?? "unknown").replace(/_/g, " ")}
                    </span>
                    {content.urgency_level && (
                      <Badge className={`text-[9px] ml-auto ${
                        URGENCY_COLORS[content.urgency_level] || URGENCY_COLORS.low
                      }`}>
                        {content.urgency_level.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                )}
                {product.priority_reasoning && (
                  <p className="text-[11px] text-foreground leading-relaxed">
                    {product.priority_reasoning}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Model Chain ─────────────────────────────── */}
          {modelsUsed.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                  <Brain className="h-3 w-3 text-primary" /> Processing Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="flex flex-wrap items-center gap-1">
                  {modelsUsed.map((m, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px] font-mono">{m}</Badge>
                      {i < modelsUsed.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  ))}
                </div>
                {content.model_source && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    Model source: {content.model_source}
                  </p>
                )}
                {yoloClasses.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-mono text-muted-foreground mb-1">YOLO Classes:</p>
                    <div className="flex flex-wrap gap-1">
                      {yoloClasses.map((c, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] font-mono">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Key Elements Extracted ──────────────────── */}
          {keyElementEntries.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                  <Crosshair className="h-3 w-3 text-amber-400" />
                  Key Elements Extracted ({keyElementEntries.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {keyElementEntries.map(([key, value]) => (
                  <div key={key} className="rounded-md border border-border bg-secondary/30 p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Tag className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
                        {key.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed pl-[18px]">
                      <Quote className="inline h-3 w-3 text-muted-foreground mr-1 -mt-0.5" />
                      {value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Detection Results ───────────────────────── */}
          {detectionDetails.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                  <Scan className="h-3 w-3 text-accent" />
                  Detections ({detectionDetails.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {detectionDetails.map((det, i) => {
                  const docDet = det as DocDetection;
                  const vidDet = det as VideoDetection;
                  // Try to find enriched row from detection_results table
                  const dbRow = detResultsMap.get(det.label);
                  const meta = (dbRow?.metadata ?? {}) as Record<string, any>;

                  return (
                    <div key={i} className="rounded-md border border-border bg-secondary/20 p-2.5 space-y-1.5">
                      {/* Header: label + detector + confidence */}
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px] font-mono bg-primary/20 text-primary border-primary/30">
                          {det.label.replace(/_/g, " ")}
                        </Badge>
                        {docDet.detector_type && (
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {docDet.detector_type}
                          </Badge>
                        )}
                        <div className="ml-auto">
                          {confidenceBar(det.confidence)}
                        </div>
                      </div>

                      {/* Extracted verbiage (raw_entity) */}
                      {(docDet.raw_entity || meta.raw_entity) && (
                        <div className="rounded bg-background/60 border border-border/50 px-2.5 py-1.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Quote className="h-2.5 w-2.5 text-muted-foreground" />
                            <span className="text-[9px] font-mono uppercase text-muted-foreground">Extracted Text</span>
                          </div>
                          <p className="text-[11px] text-foreground font-medium leading-relaxed">
                            {docDet.raw_entity || meta.raw_entity}
                          </p>
                        </div>
                      )}

                      {/* Bounding box (video) */}
                      {vidDet.bbox && (
                        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                          <Box className="h-3 w-3 shrink-0" />
                          <span>BBox: x={vidDet.bbox.x} y={vidDet.bbox.y} w={vidDet.bbox.w} h={vidDet.bbox.h}</span>
                        </div>
                      )}

                      {/* Frame number (video) */}
                      {(vidDet.frame != null || meta.frame != null) && (
                        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                          <Film className="h-3 w-3 shrink-0" />
                          <span>Frame #{vidDet.frame ?? meta.frame}</span>
                        </div>
                      )}

                      {/* Extra metadata from detection_results row */}
                      {meta.models_used && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Cpu className="h-3 w-3 shrink-0" />
                          <span>Models: {Array.isArray(meta.models_used) ? meta.models_used.join(", ") : meta.models_used}</span>
                        </div>
                      )}
                      {meta.model_source && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Brain className="h-3 w-3 shrink-0" />
                          <span>Source: {meta.model_source}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* ── Raw Content JSON (collapsed) ────────────── */}
          {content && Object.keys(content).length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                Raw Content Payload
              </summary>
              <pre className="mt-2 rounded-md border border-border bg-secondary/30 p-3 text-[10px] font-mono overflow-auto max-h-60 text-muted-foreground">
                {JSON.stringify(content, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
