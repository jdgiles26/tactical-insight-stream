/**
 * Re-exports of VLM monitoring types from the canonical sources.
 *
 * Components should import from here rather than reaching into hook/service
 * internals.  The types are re-exported so that the modal and report
 * generator work whether or not the consumer has the hook wired up yet.
 */

export type {
  VLMAlert,
  StreamDetectionState,
} from "@/hooks/useVLMMonitor";

export type {
  MatchedIntent,
  VLMAnalysisResult,
} from "@/lib/huggingfaceService";

export type { Detection } from "@/lib/streamTypes";
