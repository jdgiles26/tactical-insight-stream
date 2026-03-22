import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Default polling interval in milliseconds (10 seconds). */
const DEFAULT_INTERVAL_MS = 10_000;

/** Sources to poll in each background cycle. */
const BACKGROUND_SOURCES = [
  { source: "opensky", label: "OpenSky Aircraft" },
  { source: "ais", label: "AIS Vessels" },
  { source: "noaa_water", label: "NOAA Water Levels" },
] as const;

export interface BackgroundIngestionState {
  /** Whether the background loop is currently active. */
  running: boolean;
  /** Total records ingested across all cycles. */
  totalIngested: number;
  /** Number of completed polling cycles. */
  cycleCount: number;
  /** ISO timestamp of the last successful poll. */
  lastPollTime: string | null;
  /** Any error from the most recent cycle. */
  lastError: string | null;
}

/**
 * Hook that runs a background ingestion loop, polling live data sources
 * at a configurable interval (default: 10 seconds).
 *
 * Returns controls to start/stop the loop and observe its state.
 */
export function useBackgroundIngestion(intervalMs = DEFAULT_INTERVAL_MS) {
  const [state, setState] = useState<BackgroundIngestionState>({
    running: false,
    totalIngested: 0,
    cycleCount: 0,
    lastPollTime: null,
    lastError: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  const pollOnce = useCallback(async () => {
    if (!runningRef.current) return;

    let cycleIngested = 0;
    let cycleError: string | null = null;

    for (const { source, label } of BACKGROUND_SOURCES) {
      try {
        const { data, error } = await supabase.functions.invoke(
          "live-data-ingester",
          { body: { action: "ingest", source } }
        );

        if (error) {
          console.warn(`Background ingestion error (${label}):`, error.message);
          cycleError = error.message;
          continue;
        }

        cycleIngested += typeof data?.ingested === "number" ? data.ingested : 0;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Background ingestion fetch error (${label}):`, msg);
        cycleError = msg;
      }
    }

    setState((prev) => ({
      ...prev,
      totalIngested: prev.totalIngested + cycleIngested,
      cycleCount: prev.cycleCount + 1,
      lastPollTime: new Date().toISOString(),
      lastError: cycleError,
    }));

    if (cycleIngested > 0) {
      toast.info(`Background ingestion: ${cycleIngested} new records`, {
        duration: 3000,
      });
    }
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState((prev) => ({ ...prev, running: true, lastError: null }));

    // Immediate first poll
    pollOnce();

    // Then poll at interval
    intervalRef.current = setInterval(pollOnce, intervalMs);
  }, [intervalMs, pollOnce]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return { ...state, start, stop };
}
