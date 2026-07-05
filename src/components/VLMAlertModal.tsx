import { useEffect, useRef, useCallback } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateCommanderReport } from "@/lib/reportGenerator";
import type {
  VLMAlert,
  StreamDetectionState,
  MatchedIntent,
} from "@/types/vlm";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VLMAlertModalProps {
  alert: VLMAlert | null; // null = closed
  allAlerts: VLMAlert[];
  analysisHistory: VLMAlert[];
  onDismiss: () => void;
  streamDetections: Map<string, StreamDetectionState>;
}

// ---------------------------------------------------------------------------
// Threat-level colours
// ---------------------------------------------------------------------------

type ThreatLevel = VLMAlert["threatLevel"];

const THREAT_BADGE: Record<ThreatLevel, string> = {
  CRITICAL: "bg-red-600 text-white border-red-400",
  HIGH: "bg-orange-600 text-white border-orange-400",
  MEDIUM: "bg-yellow-600 text-white border-yellow-400",
  LOW: "bg-green-600 text-white border-green-400",
};

// ---------------------------------------------------------------------------
// Evidence frame with canvas bounding-box overlay
// ---------------------------------------------------------------------------

function EvidenceFrameWithBoxes({
  frameBase64,
  matchedIntents,
}: {
  frameBase64: string;
  matchedIntents: MatchedIntent[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    // bbox coords are 0-1 normalised → scale to pixel space
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    matchedIntents.forEach((mi) => {
      const px = mi.bbox.x * W;
      const py = mi.bbox.y * H;
      const pw = mi.bbox.w * W;
      const ph = mi.bbox.h * H;

      // Red rectangle
      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.lineWidth = Math.max(2, W / 300);
      ctx.strokeRect(px, py, pw, ph);

      // Label tag
      const label = `${mi.detectionLabel} ${(mi.confidence * 100).toFixed(0)}%`;
      const fontSize = Math.max(11, Math.round(W / 55));
      ctx.font = `bold ${fontSize}px monospace`;
      const tm = ctx.measureText(label);
      const tagH = fontSize + 4;
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
      ctx.fillRect(px, py - tagH, tm.width + 8, tagH);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, px + 4, py - 4);
    });
  }, [matchedIntents]);

  const src = frameBase64.startsWith("data:")
    ? frameBase64
    : `data:image/jpeg;base64,${frameBase64}`;

  return (
    <div className="relative w-full">
      <img
        ref={imgRef}
        src={src}
        alt="Evidence frame"
        className="hidden"
        onLoad={draw}
      />
      <canvas ref={canvasRef} className="w-full rounded border border-slate-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VLMAlertModal({
  alert,
  allAlerts,
  analysisHistory,
  onDismiss,
  streamDetections,
}: VLMAlertModalProps) {
  // ---- Print Report + dismiss -------------------------------------------
  const handlePrintReport = useCallback(async () => {
    try {
      await generateCommanderReport(allAlerts, analysisHistory, streamDetections);
    } catch (err) {
      console.error("Report generation failed:", err);
    }
    onDismiss();
  }, [allAlerts, analysisHistory, streamDetections, onDismiss]);

  // ---- Escape key → dismiss only (no PDF) --------------------------------
  useEffect(() => {
    if (!alert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [alert, onDismiss]);

  // ---- Lock body scroll -------------------------------------------------
  useEffect(() => {
    if (alert) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [alert]);

  if (!alert) return null;

  const threatBadge = THREAT_BADGE[alert.threatLevel] ?? THREAT_BADGE.LOW;
  const hasBoxes = alert.matchedIntents.length > 0 && alert.matchedIntents.some((mi) => mi.bbox);
  const hasFrame = !!alert.frameBase64;
  const hasDepth = !!alert.depthMapBase64;
  const ts = new Date(alert.timestamp);

  const imgSrc = (b64: string) =>
    b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;

  return (
    <>
      {/* ── Keyframe styles ── */}
      <style>{`
        @keyframes vlm-alertPulse {
          0%, 100% { border-color: rgb(239 68 68); box-shadow: 0 0 20px rgba(239,68,68,.5); }
          50%      { border-color: rgb(220 38 38); box-shadow: 0 0 40px rgba(220,38,38,.8); }
        }
        @keyframes vlm-alertFlash {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        @keyframes vlm-modalEnter {
          from { opacity: 0; transform: translate(-50%,-50%) scale(.9); }
          to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes vlm-backdropPulse {
          0%, 100% { background-color: rgba(127,29,29,.75); }
          50%      { background-color: rgba(127,29,29,.88); }
        }
        .vlm-backdrop  { animation: vlm-backdropPulse 2s ease-in-out infinite; }
        .vlm-container { animation: vlm-modalEnter .3s ease-out forwards, vlm-alertPulse 2s ease-in-out infinite; }
        .vlm-flash     { animation: vlm-alertFlash 1s ease-in-out infinite; }
      `}</style>

      {/* ── Backdrop ── */}
      <div
        className="vlm-backdrop fixed inset-0 z-[100] bg-red-900/80"
        onClick={onDismiss}
      />

      {/* ── Modal card ── */}
      <div
        className="vlm-container fixed left-1/2 top-1/2 z-[101] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-red-500 bg-slate-900 shadow-2xl"
        role="alertdialog"
        aria-label="VLM Threat Detection Alert"
      >
        <ScrollArea className="max-h-[85vh]">
          <div className="space-y-5 p-6">

            {/* ── Header ── */}
            <div className="space-y-2 text-center">
              <div className="flex items-center justify-center gap-3">
                <AlertTriangle className="vlm-flash h-8 w-8 text-red-500" />
                <h2 className="font-mono text-2xl font-bold tracking-wider text-red-500">
                  ⚠ THREAT DETECTED
                </h2>
                <AlertTriangle className="vlm-flash h-8 w-8 text-red-500" />
              </div>
              <div className="flex items-center justify-center gap-3 font-mono text-sm text-slate-400">
                <span className="text-slate-300">{alert.streamLabel}</span>
                <span>•</span>
                <span>{ts.toLocaleTimeString()}</span>
              </div>
            </div>

            {/* ── Detections + Threat level ── */}
            <div className="grid grid-cols-2 gap-4">
              {/* left: detected objects */}
              <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Detected Objects
                </p>
                <div className="space-y-1">
                  {alert.matchedIntents.length > 0
                    ? alert.matchedIntents.map((mi, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-red-400">"{mi.intentTerm}"</span>
                          <span className="text-slate-500">→</span>
                          <span className="text-cyan-400">{mi.detectionLabel}</span>
                          <span className="font-mono text-xs text-slate-500">
                            {(mi.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))
                    : alert.detections.slice(0, 6).map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-cyan-400">{d.label}</span>
                          <span className="font-mono text-xs text-slate-500">
                            {(d.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                </div>
              </div>

              {/* right: threat assessment */}
              <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Threat Assessment
                </p>
                <Badge className={`mb-2 border px-3 py-1 text-sm ${threatBadge}`}>
                  {alert.threatLevel}
                </Badge>
                <div className="space-y-0.5 font-mono text-xs text-slate-400">
                  <p>Objects: <span className="text-white">{alert.detections.length}</span></p>
                  <p>
                    Types:{" "}
                    <span className="text-white">
                      {[...new Set(alert.detections.map((d) => d.label))].join(", ") || "—"}
                    </span>
                  </p>
                  <p>Intents matched: <span className="text-white">{alert.matchedIntents.length}</span></p>
                </div>
              </div>
            </div>

            {/* ── Scene description ── */}
            <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Scene Description
              </p>
              <p className="text-sm leading-relaxed text-slate-300">
                {alert.sceneDescription}
              </p>
            </div>

            {/* ── Evidence frame + depth map ── */}
            {hasFrame && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Evidence Frame{hasDepth ? " & Depth Map" : ""}
                </p>
                <div className={`grid gap-2 ${hasDepth ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div>
                    {hasBoxes ? (
                      <EvidenceFrameWithBoxes
                        frameBase64={alert.frameBase64}
                        matchedIntents={alert.matchedIntents}
                      />
                    ) : (
                      <img
                        src={imgSrc(alert.frameBase64)}
                        alt="Evidence frame"
                        className="w-full rounded border border-slate-700"
                      />
                    )}
                    <p className="mt-1 text-center font-mono text-[9px] text-slate-500">
                      Frame captured — {alert.threatLevel} threat
                    </p>
                  </div>

                  {hasDepth && (
                    <div>
                      <img
                        src={imgSrc(alert.depthMapBase64!)}
                        alt="Depth map"
                        className="w-full rounded border border-slate-700"
                      />
                      <p className="mt-1 text-center font-mono text-[9px] text-slate-500">
                        Depth visualization
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Matched intents table ── */}
            {alert.matchedIntents.length > 0 && (
              <div className="overflow-hidden rounded-md border border-slate-700 bg-slate-800/60">
                <p className="px-3 pb-1.5 pt-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Matched Intents
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 font-mono text-[10px] uppercase text-slate-500">
                      <th className="px-3 py-1.5 text-left">Intent Term</th>
                      <th className="px-3 py-1.5 text-left">Detected Label</th>
                      <th className="px-3 py-1.5 text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alert.matchedIntents.map((mi, i) => (
                      <tr key={i} className="border-b border-slate-700/50 last:border-0">
                        <td className="px-3 py-1.5 font-medium text-red-400">
                          "{mi.intentTerm}"
                        </td>
                        <td className="px-3 py-1.5 text-cyan-400">{mi.detectionLabel}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-300">
                          {(mi.confidence * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Footer / print button ── */}
            <div className="space-y-2 border-t border-slate-700 pt-4 text-center">
              <Button
                onClick={handlePrintReport}
                className="h-12 border border-red-500 bg-red-600 px-8 text-base font-bold text-white shadow-lg shadow-red-900/50 transition-all hover:bg-red-700 hover:shadow-red-900/70"
              >
                <Printer className="mr-2 h-5 w-5" />
                🖨 PRINT REPORT
              </Button>
              <p className="font-mono text-[10px] text-slate-500">
                Dismiss alert and generate downloadable report
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
