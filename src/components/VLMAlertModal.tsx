import { useEffect, useRef, useCallback } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateCommanderReport } from "@/lib/reportGenerator";
import type { VLMAlert, ThreatLevel, StreamDetectionState } from "@/types/vlm";

// ─────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────

export interface VLMAlertModalProps {
  alert: VLMAlert | null;                          // null = modal closed
  allAlerts: VLMAlert[];                           // full history for report
  analysisHistory: VLMAlert[];                     // all analyses for detailed report
  onDismiss: () => void;                           // called after print report
  streamDetections: Map<string, StreamDetectionState>;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const THREAT_COLORS: Record<ThreatLevel, { badge: string; text: string }> = {
  CRITICAL: { badge: "bg-red-600 text-white border-red-500",           text: "text-red-400" },
  HIGH:     { badge: "bg-orange-600 text-white border-orange-500",     text: "text-orange-400" },
  MEDIUM:   { badge: "bg-yellow-600 text-white border-yellow-500",     text: "text-yellow-400" },
  LOW:      { badge: "bg-green-600 text-white border-green-500",       text: "text-green-400" },
};

function formatTimestamp(ts: number): string {
  return `${ts.toFixed(1)}s`;
}

function formatConfidence(c: number): string {
  return `${(c * 100).toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────
// Canvas overlay — draws bounding boxes on the evidence frame
// ─────────────────────────────────────────────────────────

function EvidenceFrameWithBoxes({
  frameBase64,
  detections,
}: {
  frameBase64: string;
  detections: VLMAlert["detections"];
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

    // Draw bounding boxes
    detections.forEach((det) => {
      if (!det.boundingBox) return;
      const { x, y, width, height, label } = det.boundingBox;

      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Label background
      const labelText = `${label} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 12px monospace";
      const metrics = ctx.measureText(labelText);
      const labelH = 16;
      ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
      ctx.fillRect(x, y - labelH, metrics.width + 8, labelH);
      ctx.fillStyle = "#fff";
      ctx.fillText(labelText, x + 4, y - 4);
    });
  }, [detections]);

  const src = frameBase64.startsWith("data:") ? frameBase64 : `data:image/jpeg;base64,${frameBase64}`;

  return (
    <div className="relative w-full">
      {/* Hidden image just for loading */}
      <img
        ref={imgRef}
        src={src}
        alt="Evidence frame"
        className="hidden"
        onLoad={draw}
      />
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-slate-700"
      />
      {/* Fallback if canvas doesn't render (no bounding boxes) */}
      {detections.every((d) => !d.boundingBox) && (
        <img
          src={src}
          alt="Evidence frame"
          className="w-full rounded border border-slate-700"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────

export default function VLMAlertModal({
  alert,
  allAlerts,
  analysisHistory,
  onDismiss,
  streamDetections,
}: VLMAlertModalProps) {
  // Trap focus / escape key
  useEffect(() => {
    if (!alert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handlePrintReport();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert]);

  // Prevent body scroll while modal open
  useEffect(() => {
    if (alert) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [alert]);

  const handlePrintReport = async () => {
    try {
      await generateCommanderReport(allAlerts, analysisHistory, streamDetections);
    } catch (err) {
      console.error("Report generation failed:", err);
    }
    onDismiss();
  };

  if (!alert) return null;

  const threatStyle = THREAT_COLORS[alert.threatLevel] ?? THREAT_COLORS.LOW;
  const hasBoundingBoxes = alert.detections.some((d) => d.boundingBox);
  const frameAvailable = !!alert.frameBase64;
  const depthAvailable = !!alert.depthMapBase64;

  return (
    <>
      {/* Custom keyframe styles */}
      <style>{`
        @keyframes alertPulse {
          0%, 100% { border-color: rgb(239 68 68); box-shadow: 0 0 20px rgba(239, 68, 68, 0.5); }
          50% { border-color: rgb(220 38 38); box-shadow: 0 0 40px rgba(220, 38, 38, 0.8); }
        }
        @keyframes alertFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes modalEnter {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes backdropPulse {
          0%, 100% { background-color: rgba(127, 29, 29, 0.75); }
          50%      { background-color: rgba(127, 29, 29, 0.85); }
        }
        .alert-modal-backdrop {
          animation: backdropPulse 2s ease-in-out infinite;
        }
        .alert-modal-container {
          animation: modalEnter 0.3s ease-out forwards, alertPulse 2s ease-in-out infinite;
        }
        .alert-icon-flash {
          animation: alertFlash 1s ease-in-out infinite;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="alert-modal-backdrop fixed inset-0 z-[100] bg-red-900/80"
        onClick={handlePrintReport}
      />

      {/* Modal */}
      <div
        className="alert-modal-container fixed left-1/2 top-1/2 z-[101] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-red-500 bg-slate-900 shadow-2xl"
        role="alertdialog"
        aria-label="VLM Threat Detection Alert"
      >
        <ScrollArea className="max-h-[85vh]">
          <div className="p-6 space-y-5">
            {/* ─── Header ─── */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-3">
                <AlertTriangle className="alert-icon-flash h-8 w-8 text-red-500" />
                <h2 className="text-2xl font-bold text-red-500 tracking-wider font-mono">
                  ⚠ THREAT DETECTED
                </h2>
                <AlertTriangle className="alert-icon-flash h-8 w-8 text-red-500" />
              </div>
              <div className="flex items-center justify-center gap-3 text-sm text-slate-400 font-mono">
                <span className="text-slate-300">{alert.streamName}</span>
                <span>•</span>
                <span>{formatTimestamp(alert.timestamp)}</span>
                <span>•</span>
                <span>{new Date(alert.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* ─── Detected Object & Threat Level ─── */}
            <div className="grid grid-cols-2 gap-4">
              {/* Detected objects */}
              <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                  Detected Objects
                </p>
                <div className="space-y-1">
                  {alert.matchedIntents.length > 0 ? (
                    alert.matchedIntents.map((mi, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-red-400 font-semibold text-sm">"{mi.term}"</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-cyan-400 text-sm">{mi.label}</span>
                        <span className="text-slate-500 text-xs font-mono">
                          {formatConfidence(mi.confidence)}
                        </span>
                      </div>
                    ))
                  ) : (
                    alert.detections.slice(0, 5).map((det, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-cyan-400 text-sm">{det.label}</span>
                        <span className="text-slate-500 text-xs font-mono">
                          {formatConfidence(det.confidence)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Threat level */}
              <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                  Threat Assessment
                </p>
                <div className="space-y-2">
                  <Badge className={`text-sm px-3 py-1 border ${threatStyle.badge}`}>
                    {alert.threatLevel}
                  </Badge>
                  <div className="text-xs text-slate-400 font-mono space-y-0.5">
                    <p>Objects: <span className="text-white">{alert.objectCount}</span></p>
                    <p>Types: <span className="text-white">{alert.objectTypes.join(", ")}</span></p>
                    <p>Confidence: <span className="text-white">{formatConfidence(alert.confidence)}</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Scene Description ─── */}
            <div className="rounded-md border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                Scene Description
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {alert.sceneDescription}
              </p>
            </div>

            {/* ─── Evidence Frame + Depth Map ─── */}
            {frameAvailable && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  Evidence Frame{depthAvailable ? " & Depth Map" : ""}
                </p>
                <div className={`grid gap-2 ${depthAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
                  {/* Main evidence frame with bounding boxes */}
                  <div>
                    {hasBoundingBoxes ? (
                      <EvidenceFrameWithBoxes
                        frameBase64={alert.frameBase64!}
                        detections={alert.detections}
                      />
                    ) : (
                      <img
                        src={
                          alert.frameBase64!.startsWith("data:")
                            ? alert.frameBase64!
                            : `data:image/jpeg;base64,${alert.frameBase64!}`
                        }
                        alt="Evidence frame"
                        className="w-full rounded border border-slate-700"
                      />
                    )}
                    <p className="text-[9px] text-center text-slate-500 font-mono mt-1">
                      Frame at {formatTimestamp(alert.timestamp)} — {alert.threatLevel} threat
                    </p>
                  </div>

                  {/* Depth map */}
                  {depthAvailable && (
                    <div>
                      <img
                        src={
                          alert.depthMapBase64!.startsWith("data:")
                            ? alert.depthMapBase64!
                            : `data:image/jpeg;base64,${alert.depthMapBase64!}`
                        }
                        alt="Depth map"
                        className="w-full rounded border border-slate-700"
                      />
                      <p className="text-[9px] text-center text-slate-500 font-mono mt-1">
                        Depth visualization
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Matched Intents Table ─── */}
            {alert.matchedIntents.length > 0 && (
              <div className="rounded-md border border-slate-700 bg-slate-800/60 overflow-hidden">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 pt-3 pb-1.5">
                  Matched Intents
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-[10px] font-mono uppercase text-slate-500">
                      <th className="text-left px-3 py-1.5">Intent Term</th>
                      <th className="text-left px-3 py-1.5">Detected Label</th>
                      <th className="text-left px-3 py-1.5">Match Type</th>
                      <th className="text-right px-3 py-1.5">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alert.matchedIntents.map((mi, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-slate-700/50 last:border-0"
                      >
                        <td className="px-3 py-1.5 text-red-400 font-medium">"{mi.term}"</td>
                        <td className="px-3 py-1.5 text-cyan-400">{mi.label}</td>
                        <td className="px-3 py-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              mi.matchType === "exact"
                                ? "border-red-500/50 text-red-400"
                                : mi.matchType === "semantic"
                                ? "border-cyan-500/50 text-cyan-400"
                                : "border-yellow-500/50 text-yellow-400"
                            }`}
                          >
                            {mi.matchType}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-300">
                          {formatConfidence(mi.confidence)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── Footer ─── */}
            <div className="border-t border-slate-700 pt-4 text-center space-y-2">
              <Button
                onClick={handlePrintReport}
                className="h-12 px-8 text-base font-bold bg-red-600 hover:bg-red-700 text-white border border-red-500 shadow-lg shadow-red-900/50 transition-all hover:shadow-red-900/70"
              >
                <Printer className="mr-2 h-5 w-5" />
                🖨 PRINT REPORT
              </Button>
              <p className="text-[10px] font-mono text-slate-500">
                Dismiss alert and generate downloadable report
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
