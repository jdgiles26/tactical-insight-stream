/**
 * useVLMMonitor — React hook for VLM-based monitoring of live video feeds.
 *
 * Periodically captures frames from registered HTMLVideoElements, sends them
 * to HuggingFace for object detection + depth estimation via the service at
 * `src/lib/huggingfaceService.ts`, matches results against the commander's
 * active intents, and maintains per-stream detection state with an alert
 * and deduplication system.
 *
 * Key behaviours:
 * - Staggered analysis: streams are analysed in round-robin, offset by
 *   `intervalMs / streamCount` so the API is never hit with a burst.
 * - Ref + state pattern: mutable refs prevent stale closures inside the
 *   polling callback, while companion `useState` values drive React renders.
 * - 60-second dedup window per `streamId-intentTerm` pair.
 * - Analysis history capped at 100 entries for report generation.
 * - No API calls when there are zero active intents.
 * - Graceful error handling — a single failed analysis never breaks the loop.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Detection } from "@/lib/streamTypes";
import { useCommanderIntents } from "@/hooks/useCommanderIntents";
import type { CommanderIntent } from "@/hooks/useCommanderIntents";
import {
  captureVideoFrame,
  analyzeFrame,
} from "@/lib/huggingfaceService";
import type { MatchedIntent, VLMAnalysisResult } from "@/lib/huggingfaceService";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StreamDetectionState {
  streamId: string;
  streamLabel: string;
  detections: Detection[];
  depthMapBase64?: string;
  matchedIntents: MatchedIntent[];
  sceneDescription: string;
  threatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastAnalyzedAt: number;
  frameBase64: string;
  isAnalyzing: boolean;
}

export interface VLMAlert {
  id: string;
  streamId: string;
  streamLabel: string;
  matchedIntents: MatchedIntent[];
  detections: Detection[];
  threatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sceneDescription: string;
  frameBase64: string;
  depthMapBase64?: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface UseVLMMonitorOptions {
  /** Polling interval in ms. Default: 10 000 (10 s). */
  intervalMs?: number;
  /** Whether monitoring is enabled. Default: true. */
  enabled?: boolean;
  /** Minimum detection confidence to keep. Default: 0.5. */
  confidenceThreshold?: number;
}

export interface UseVLMMonitorReturn {
  /** Per-stream detection state. */
  streamDetections: Map<string, StreamDetectionState>;
  /** Active (unacknowledged) alerts. */
  alerts: VLMAlert[];
  /** Acknowledge a single alert by id. */
  acknowledgeAlert: (alertId: string) => void;
  /** Dismiss (acknowledge) every active alert at once. */
  dismissAllAlerts: () => void;
  /** Full history of all alerts ever raised, capped at 100. */
  analysisHistory: VLMAlert[];
  /** Whether the monitor loop is currently running. */
  isMonitoring: boolean;
  /** Toggle the monitor on / off. */
  toggleMonitoring: () => void;
  /** Force an immediate analysis of a specific stream. */
  analyzeNow: (streamId: string) => Promise<void>;
  /** Register (or unregister when `el` is null) a video element. */
  registerVideoRef: (
    streamId: string,
    label: string,
    el: HTMLVideoElement | null,
  ) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALERT_DEDUP_COOLDOWN_MS = 60_000; // 60 s
const MAX_HISTORY = 100;
const MIN_TICK_MS = 2_000; // never fire analyses faster than 2 s apart
const INITIAL_DELAY_MS = 1_000; // wait 1 s before first analysis

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAlertId(): string {
  return `vlm-alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A video element is "analysable" only when it is actively playing, has
 * decoded at least one frame (readyState ≥ 2), has non-zero intrinsic
 * dimensions, and has a valid source.
 */
function isVideoPlayable(el: HTMLVideoElement): boolean {
  return (
    !el.paused &&
    el.readyState >= 2 &&
    el.videoWidth > 0 &&
    el.videoHeight > 0 &&
    !!el.currentSrc
  );
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useVLMMonitor(
  options: UseVLMMonitorOptions = {},
): UseVLMMonitorReturn {
  const {
    intervalMs = 10_000,
    enabled: enabledOption = true,
    confidenceThreshold = 0.5,
  } = options;

  // -- Commander intents (react-query) ------------------------------------
  const { data: intents } = useCommanderIntents();
  const intentsRef = useRef<CommanderIntent[]>([]);
  useEffect(() => {
    intentsRef.current = intents ?? [];
  }, [intents]);

  // -- Video element registry  Map<streamId, {el, label}> -----------------
  const videoRegistryRef = useRef<
    Map<string, { el: HTMLVideoElement; label: string }>
  >(new Map());

  // -- Per-stream detection state (ref + state) ---------------------------
  const [streamDetections, setStreamDetections] = useState<
    Map<string, StreamDetectionState>
  >(new Map());
  const streamDetectionsRef = useRef<Map<string, StreamDetectionState>>(
    new Map(),
  );

  // -- Active alerts (ref + state) ----------------------------------------
  const [alerts, setAlerts] = useState<VLMAlert[]>([]);
  const alertsRef = useRef<VLMAlert[]>([]);

  // -- Full alert history (ref + state, capped) ---------------------------
  const [analysisHistory, setAnalysisHistory] = useState<VLMAlert[]>([]);
  const analysisHistoryRef = useRef<VLMAlert[]>([]);

  // -- Alert dedup cooldown: `${streamId}-${intentTerm}` → last ts --------
  const dedupMapRef = useRef<Map<string, number>>(new Map());

  // -- Monitoring toggle (ref + state) ------------------------------------
  const [isMonitoring, setIsMonitoring] = useState(enabledOption);
  const isMonitoringRef = useRef(enabledOption);

  // Keep ref in sync with state
  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  // Re-sync when the `enabled` prop changes
  useEffect(() => {
    setIsMonitoring(enabledOption);
    isMonitoringRef.current = enabledOption;
  }, [enabledOption]);

  const toggleMonitoring = useCallback(() => {
    setIsMonitoring((prev) => {
      const next = !prev;
      isMonitoringRef.current = next;
      return next;
    });
  }, []);

  // -- Register / unregister video elements -------------------------------

  const registerVideoRef = useCallback(
    (streamId: string, label: string, el: HTMLVideoElement | null) => {
      if (el) {
        videoRegistryRef.current.set(streamId, { el, label });
      } else {
        videoRegistryRef.current.delete(streamId);
        // Also evict stale detection state
        streamDetectionsRef.current.delete(streamId);
        setStreamDetections((prev) => {
          const next = new Map(prev);
          next.delete(streamId);
          return next;
        });
      }
    },
    [],
  );

  // -- Analyse a single stream -------------------------------------------

  const analyzeSingleStream = useCallback(
    async (streamId: string): Promise<void> => {
      const entry = videoRegistryRef.current.get(streamId);
      if (!entry) return;
      const { el, label } = entry;

      // Guard: video must be actively playing with decoded frames
      if (!isVideoPlayable(el)) return;

      // Guard: don't burn API quota when there's nothing to look for
      const activeIntents = intentsRef.current.filter((i) => i.is_active);
      if (activeIntents.length === 0) return;

      // Helper: update the `isAnalyzing` flag in both ref and state
      const patchAnalyzing = (analyzing: boolean) => {
        const existing = streamDetectionsRef.current.get(streamId);
        const patched: StreamDetectionState = existing
          ? { ...existing, isAnalyzing: analyzing }
          : {
              streamId,
              streamLabel: label,
              detections: [],
              matchedIntents: [],
              sceneDescription: "",
              threatLevel: "LOW" as const,
              lastAnalyzedAt: 0,
              frameBase64: "",
              isAnalyzing: analyzing,
            };
        streamDetectionsRef.current.set(streamId, patched);
        setStreamDetections((prev) => new Map(prev).set(streamId, patched));
      };

      patchAnalyzing(true);

      try {
        // 1. Capture current video frame
        const frameBase64 = captureVideoFrame(el);
        if (!frameBase64) {
          patchAnalyzing(false);
          return; // cross-origin or empty canvas
        }

        // 2. Run the HuggingFace analysis pipeline (detection + depth + matching)
        const canvasW = el.videoWidth || el.clientWidth || 640;
        const canvasH = el.videoHeight || el.clientHeight || 480;
        const result: VLMAnalysisResult = await analyzeFrame(
          frameBase64,
          activeIntents,
          canvasW,
          canvasH,
        );

        const now = Date.now();

        // 3. Filter detections below the caller's confidence threshold
        const filteredDetections = result.detections.filter(
          (d) => d.confidence >= confidenceThreshold,
        );

        // 4. Persist per-stream state
        const state: StreamDetectionState = {
          streamId,
          streamLabel: label,
          detections: filteredDetections,
          depthMapBase64: result.depthMapBase64,
          matchedIntents: result.matchedIntents,
          sceneDescription: result.sceneDescription,
          threatLevel: result.threatLevel,
          lastAnalyzedAt: now,
          frameBase64: result.frameBase64,
          isAnalyzing: false,
        };
        streamDetectionsRef.current.set(streamId, state);
        setStreamDetections((prev) => new Map(prev).set(streamId, state));

        // 5. Create alerts for matched intents (with 60 s dedup)
        if (result.matchedIntents.length > 0) {
          // Determine which intent matches pass the dedup window
          const freshKeys = new Set<string>();
          for (const mi of result.matchedIntents) {
            const key = `${streamId}-${mi.intentTerm}`;
            const lastTs = dedupMapRef.current.get(key) ?? 0;
            if (now - lastTs >= ALERT_DEDUP_COOLDOWN_MS) {
              freshKeys.add(key);
            }
          }

          if (freshKeys.size > 0) {
            // Stamp cooldown
            for (const key of freshKeys) {
              dedupMapRef.current.set(key, now);
            }

            // Build one alert per analysis cycle (may contain multiple intents)
            const alert: VLMAlert = {
              id: generateAlertId(),
              streamId,
              streamLabel: label,
              matchedIntents: result.matchedIntents,
              detections: filteredDetections,
              threatLevel: result.threatLevel,
              sceneDescription: result.sceneDescription,
              frameBase64: result.frameBase64,
              depthMapBase64: result.depthMapBase64,
              timestamp: now,
              acknowledged: false,
            };

            // Push to active alerts
            alertsRef.current = [...alertsRef.current, alert];
            setAlerts([...alertsRef.current]);

            // Push to history (capped)
            analysisHistoryRef.current = [
              ...analysisHistoryRef.current,
              alert,
            ].slice(-MAX_HISTORY);
            setAnalysisHistory([...analysisHistoryRef.current]);
          }
        }
      } catch (err) {
        // Graceful: log and move on — the loop must not break.
        console.error(
          `[useVLMMonitor] Error analysing stream "${streamId}":`,
          err,
        );
        patchAnalyzing(false);
      }
    },
    [confidenceThreshold],
  );

  // -- Public: force-analyse a single stream now --------------------------

  const analyzeNow = useCallback(
    async (streamId: string): Promise<void> => {
      await analyzeSingleStream(streamId);
    },
    [analyzeSingleStream],
  );

  // -- Alert management ---------------------------------------------------

  const acknowledgeAlert = useCallback((alertId: string) => {
    // Remove from active list
    alertsRef.current = alertsRef.current.filter((a) => a.id !== alertId);
    setAlerts([...alertsRef.current]);

    // Mark as acknowledged in history
    analysisHistoryRef.current = analysisHistoryRef.current.map((a) =>
      a.id === alertId ? { ...a, acknowledged: true } : a,
    );
    setAnalysisHistory([...analysisHistoryRef.current]);
  }, []);

  const dismissAllAlerts = useCallback(() => {
    // Mark every active alert as acknowledged in history
    const activeIds = new Set(alertsRef.current.map((a) => a.id));
    analysisHistoryRef.current = analysisHistoryRef.current.map((a) =>
      activeIds.has(a.id) ? { ...a, acknowledged: true } : a,
    );
    setAnalysisHistory([...analysisHistoryRef.current]);

    // Clear active alerts
    alertsRef.current = [];
    setAlerts([]);
  }, []);

  // -- Staggered polling loop ---------------------------------------------
  //
  // We use recursive setTimeout (not setInterval) so the tick period can
  // adapt dynamically as streams are added / removed.  Each tick analyses
  // the *next* stream in a round-robin queue; the tick period is
  // `intervalMs / streamCount` (floored at MIN_TICK_MS) so a full cycle
  // completes in roughly `intervalMs`.
  // ---------------------------------------------------------------------

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundRobinRef = useRef(0);

  useEffect(() => {
    // Tear down any existing timer before (re-)starting
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isMonitoring) return;

    /** One tick of the monitor loop. */
    const tick = () => {
      if (!isMonitoringRef.current) return;

      const ids = Array.from(videoRegistryRef.current.keys());
      if (ids.length === 0) return;

      const idx = roundRobinRef.current % ids.length;
      roundRobinRef.current = idx + 1;

      // Fire-and-forget — errors are caught inside analyzeSingleStream
      analyzeSingleStream(ids[idx]);
    };

    /** Schedule the next tick, adapting to the current stream count. */
    const scheduleNext = () => {
      if (!isMonitoringRef.current) return;
      const count = Math.max(videoRegistryRef.current.size, 1);
      const tickMs = Math.max(Math.floor(intervalMs / count), MIN_TICK_MS);
      timerRef.current = setTimeout(() => {
        tick();
        scheduleNext();
      }, tickMs);
    };

    // Kick off after a short initial delay
    timerRef.current = setTimeout(() => {
      tick();
      scheduleNext();
    }, INITIAL_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isMonitoring, intervalMs, analyzeSingleStream]);

  // -- Cleanup on unmount -------------------------------------------------
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  // -- Return -------------------------------------------------------------
  return {
    streamDetections,
    alerts,
    acknowledgeAlert,
    dismissAllAlerts,
    analysisHistory,
    isMonitoring,
    toggleMonitoring,
    analyzeNow,
    registerVideoRef,
  };
}

// Re-export types that consuming UI components will need
export type { MatchedIntent, VLMAnalysisResult } from "@/lib/huggingfaceService";
export type { Detection } from "@/lib/streamTypes";
export type { CommanderIntent } from "@/hooks/useCommanderIntents";
