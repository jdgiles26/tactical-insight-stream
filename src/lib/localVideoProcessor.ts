/**
 * Local (client-side) video processor.
 *
 * Performs REAL frame extraction from uploaded video files using
 * <video> + <canvas> browser APIs, then runs:
 *   LiquidAI LFM2.5-VL-450M vision-language model for object detection
 *   and scene summarization via WebGPU in-browser inference.
 *
 * If the model is unavailable or inference fails, this module
 * returns ZERO detections and no scene summary — it never fabricates results.
 */
import {
  processVideoWithLFM,
  type LFMProcessorResult,
  type LFMDetection,
  type LFMSceneSummary,
} from "./lfmVisionService";

// Re-export the SceneSummary type for backward compatibility
export type { LFMSceneSummary as SceneSummary } from "./lfmVisionService";

// ---------------------------------------------------------------------------
// Public types (backward-compatible with existing consumers)
// ---------------------------------------------------------------------------

export interface VideoDetection {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  frame: number;
}

export interface VideoProcessorResult {
  success: boolean;
  detections: number;
  alerts: number;
  models_used: string[];
  model_source: string;
  onnx_enabled: boolean;
  /** Execution provider: "webgpu" | "wasm" | "none" */
  execution_provider: string;
  yolo_model: string;
  yolo_classes: string[];
  confidence_threshold: number;
  detection_details: VideoDetection[];
  emergency_detected: boolean;
  emergency_type: string | null;
  mission_groups_created: number;
  frames_analyzed: number;
  /** LFM2.5-VL scene summary */
  scene_summary?: LFMSceneSummary;
}

// ---------------------------------------------------------------------------
// Backward-compatible resolveClassLabel (still exported for tests)
// ---------------------------------------------------------------------------

const COMMON_LABELS = [
  "person", "vehicle", "vessel", "aircraft", "building",
  "water", "road", "vegetation", "animal", "object",
];

/**
 * Resolves a class ID to a human-readable label.
 * Maintained for backward compatibility with existing tests.
 */
export function resolveClassLabel(classId: number): string {
  if (classId >= 0 && classId < COMMON_LABELS.length) {
    return COMMON_LABELS[classId];
  }
  return `class_${classId}`;
}

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

/**
 * Process a video file locally using LFM2.5-VL-450M.
 * Maintains the same interface as the previous YOLO-based processor.
 */
export async function processVideoLocally(
  file: File
): Promise<VideoProcessorResult> {
  try {
    const lfmResult: LFMProcessorResult = await processVideoWithLFM(file);

    // Convert LFM detections to VideoDetection format (with dummy bbox)
    const videoDetections: VideoDetection[] = lfmResult.detection_details.map((det: LFMDetection) => ({
      label: det.label,
      confidence: det.confidence,
      bbox: { x: 0, y: 0, w: 0, h: 0 }, // VLM doesn't provide bounding boxes
      frame: det.frame,
    }));

    return {
      success: lfmResult.success,
      detections: lfmResult.detections,
      alerts: lfmResult.alerts,
      models_used: lfmResult.models_used,
      model_source: lfmResult.model_source,
      onnx_enabled: false, // No longer using ONNX directly
      execution_provider: lfmResult.execution_provider,
      yolo_model: "none (replaced by LFM2.5-VL-450M)",
      yolo_classes: [],
      confidence_threshold: 0.5,
      detection_details: videoDetections,
      emergency_detected: lfmResult.emergency_detected,
      emergency_type: lfmResult.emergency_type,
      mission_groups_created: lfmResult.mission_groups_created,
      frames_analyzed: lfmResult.frames_analyzed,
      scene_summary: lfmResult.scene_summary,
    };
  } catch (err: any) {
    console.error("[VideoProcessor] LFM processing failed:", err);
    return {
      success: false,
      detections: 0,
      alerts: 0,
      models_used: ["none"],
      model_source: "none",
      onnx_enabled: false,
      execution_provider: "none",
      yolo_model: "none",
      yolo_classes: [],
      confidence_threshold: 0.5,
      detection_details: [],
      emergency_detected: false,
      emergency_type: null,
      mission_groups_created: 0,
      frames_analyzed: 0,
    };
  }
}
