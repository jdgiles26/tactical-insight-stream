/**
 * Local (client-side) video processor.
 *
 * Performs REAL frame extraction from uploaded video files using
 * <video> + <canvas> browser APIs, then runs:
 *   1. ONNX Runtime Web inference with YOLOv8n SAR vessel detection model
 *   2. Qwen2.5-VL vision-language model for scene summarization
 *
 * If models are unavailable or inference fails, this module
 * returns ZERO detections and no scene summary — it never fabricates results.
 */
import * as ort from "onnxruntime-web";
import { analyzeVideoScene, type SceneSummary } from "./qwenVisionService";

// ---------------------------------------------------------------------------
// Model class labels — auto-detected from ONNX metadata at load time.
// Defaults to the SAR vessel detection model's single class.
// Falls back to COCO-80 when a general model is loaded without metadata.
// ---------------------------------------------------------------------------

/** COCO-80 class names used as fallback for general YOLOv8 models */
const COCO_80_LABELS: string[] = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
  "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
  "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
  "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
  "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
  "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
  "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
  "hair drier", "toothbrush",
];

let MODEL_LABELS: string[] = ["ship"];
let MODEL_NAME = "yolov8n-sar-vessel";

const CONFIDENCE_THRESHOLD = 0.35;
const MODEL_INPUT_SIZE = 640; // YOLOv8n expects 640x640
const MAX_FRAMES_TO_SAMPLE = 8; // Sample up to 8 frames from the video

/**
 * Resolves a class ID to a human-readable object name.
 * Uses the model's own labels when available (extracted from ONNX metadata).
 * Falls back to the COCO-80 label set for multi-class models without metadata.
 */
export function resolveClassLabel(classId: number): string {
  if (classId >= 0 && classId < MODEL_LABELS.length) {
    return MODEL_LABELS[classId];
  }
  // Fallback to COCO-80 if model labels don't cover this class ID
  if (classId >= 0 && classId < COCO_80_LABELS.length) {
    return COCO_80_LABELS[classId];
  }
  return `class_${classId}`;
}

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
  /** Execution provider used for ONNX inference: "webgpu" | "wasm" | "none" */
  execution_provider: string;
  yolo_model: string;
  yolo_classes: string[];
  confidence_threshold: number;
  detection_details: VideoDetection[];
  emergency_detected: boolean;
  emergency_type: string | null;
  mission_groups_created: number;
  frames_analyzed: number;
  /** Qwen2.5-VL scene summary (if available) */
  scene_summary?: SceneSummary;
}

// ---------------------------------------------------------------------------
// Frame extraction from video using browser APIs
// ---------------------------------------------------------------------------

/**
 * Extracts frames from a video file at evenly-spaced intervals.
 * Returns ImageData objects for each captured frame.
 */
async function extractFrames(
  file: File,
  maxFrames: number
): Promise<{ frames: ImageData[]; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const frames: ImageData[] = [];

    let duration = 0;
    let frameCount = 0;
    let seekIndex = 0;
    const seekTimes: number[] = [];

    video.onloadedmetadata = () => {
      duration = video.duration;
      if (!duration || !isFinite(duration) || duration <= 0) {
        // Can't seek — try to grab a single frame
        video.currentTime = 0;
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;

      // Compute evenly-spaced seek times (skip first and last 5%)
      const start = duration * 0.05;
      const end = duration * 0.95;
      frameCount = Math.min(maxFrames, Math.max(1, Math.floor(duration)));
      for (let i = 0; i < frameCount; i++) {
        seekTimes.push(start + (end - start) * (i / Math.max(1, frameCount - 1)));
      }
      seekIndex = 0;
      video.currentTime = seekTimes[0];
    };

    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

      seekIndex++;
      if (seekIndex < seekTimes.length) {
        video.currentTime = seekTimes[seekIndex];
      } else {
        URL.revokeObjectURL(url);
        resolve({ frames, width: canvas.width, height: canvas.height });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for frame extraction"));
    };

    // Timeout after 30s
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      if (frames.length > 0) {
        resolve({ frames, width: canvas.width, height: canvas.height });
      } else {
        reject(new Error("Video frame extraction timed out"));
      }
    }, 30000);

    video.addEventListener(
      "loadeddata",
      () => {
        // If metadata didn't fire seekTimes, grab at least one frame
        if (seekTimes.length === 0) {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 480;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          frames.push(ctx.getImageData(0, 0, w, h));
          URL.revokeObjectURL(url);
          clearTimeout(timeout);
          resolve({ frames, width: w, height: h });
        }
      },
      { once: true }
    );

    video.src = url;
  });
}

// ---------------------------------------------------------------------------
// Image preprocessing for YOLOv8n (640×640 RGB float32, 0-1 normalized)
// ---------------------------------------------------------------------------

function preprocessFrame(
  imageData: ImageData,
  targetSize: number
): Float32Array {
  // Resize to targetSize×targetSize using a temporary canvas
  const resizeCanvas = document.createElement("canvas");
  resizeCanvas.width = targetSize;
  resizeCanvas.height = targetSize;
  const ctx = resizeCanvas.getContext("2d")!;

  // Put original image onto a temp canvas first
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = imageData.width;
  srcCanvas.height = imageData.height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(imageData, 0, 0);

  // Letterbox resize (maintain aspect ratio, pad with gray)
  const scale = Math.min(targetSize / imageData.width, targetSize / imageData.height);
  const newW = Math.round(imageData.width * scale);
  const newH = Math.round(imageData.height * scale);
  const padX = (targetSize - newW) / 2;
  const padY = (targetSize - newH) / 2;

  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(srcCanvas, padX, padY, newW, newH);

  const resizedData = ctx.getImageData(0, 0, targetSize, targetSize);
  const { data } = resizedData;
  const pixels = targetSize * targetSize;

  // NCHW format: [1, 3, H, W] — R plane, G plane, B plane, normalized 0-1
  const tensor = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    tensor[i] = data[i * 4] / 255; // R
    tensor[pixels + i] = data[i * 4 + 1] / 255; // G
    tensor[2 * pixels + i] = data[i * 4 + 2] / 255; // B
  }

  return tensor;
}

// ---------------------------------------------------------------------------
// YOLOv8 output post-processing (NMS + bbox decoding)
// ---------------------------------------------------------------------------

interface RawDetection {
  x: number;
  y: number;
  w: number;
  h: number;
  classId: number;
  confidence: number;
}

/**
 * Parse YOLOv8 output tensor.
 * Auto-handles any number of classes — works for both single-class SAR
 * vessel models ([1, 5, 8400]) and multi-class COCO models ([1, 84, 8400]).
 */
function parseYoloOutput(
  output: Float32Array,
  numChannels: number, // total channels per detection (4 + numClasses)
  imgWidth: number,
  imgHeight: number,
  inputSize: number
): RawDetection[] {
  const numClasses = numChannels - 4;
  // Detect numDetections from tensor length
  const numDetections = Math.round(output.length / numChannels);
  const results: RawDetection[] = [];

  const scale = Math.min(inputSize / imgWidth, inputSize / imgHeight);
  const padX = (inputSize - imgWidth * scale) / 2;
  const padY = (inputSize - imgHeight * scale) / 2;

  for (let i = 0; i < numDetections; i++) {
    const cx = output[0 * numDetections + i];
    const cy = output[1 * numDetections + i];
    const w = output[2 * numDetections + i];
    const h = output[3 * numDetections + i];

    // Find best class
    let bestClass = 0;
    let bestConf = 0;
    for (let c = 0; c < numClasses; c++) {
      const conf = output[(4 + c) * numDetections + i];
      if (conf > bestConf) {
        bestConf = conf;
        bestClass = c;
      }
    }

    if (bestConf < CONFIDENCE_THRESHOLD) continue;

    // Convert from input coords back to original image coords
    const x1 = ((cx - w / 2) - padX) / scale;
    const y1 = ((cy - h / 2) - padY) / scale;
    const bw = w / scale;
    const bh = h / scale;

    results.push({
      x: Math.max(0, Math.round(x1)),
      y: Math.max(0, Math.round(y1)),
      w: Math.round(bw),
      h: Math.round(bh),
      classId: bestClass,
      confidence: bestConf,
    });
  }

  // NMS
  return nms(results, 0.45);
}

function iou(a: RawDetection, b: RawDetection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function nms(detections: RawDetection[], iouThreshold: number): RawDetection[] {
  detections.sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(detections[i]);
    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed.has(j)) continue;
      if (
        detections[i].classId === detections[j].classId &&
        iou(detections[i], detections[j]) > iouThreshold
      ) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}

// ---------------------------------------------------------------------------
// ONNX model loading
// ---------------------------------------------------------------------------

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let modelLoadFailed = false;
/** Records which execution provider was successfully used ("webgpu" | "wasm" | "none"). */
let activeExecutionProvider = "none";

/**
 * Returns true when the browser exposes a WebGPU adapter.
 * Used to choose the fastest ONNX execution provider at runtime.
 */
async function isWebGPUAvailable(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
    const adapter = await (navigator as any).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Attempts to load a YOLOv8 ONNX model.
 * Looks for /models/yolov8n.onnx in the public directory.
 * Prefers WebGPU execution for maximum throughput; falls back to WASM.
 * Auto-detects class labels from the ONNX metadata 'names' field.
 * Returns null if the model is not available.
 */
async function getSession(): Promise<ort.InferenceSession | null> {
  if (modelLoadFailed) return null;

  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        // Detect the best available execution provider
        const webgpu = await isWebGPUAvailable();
        const executionProviders: string[] = webgpu ? ["webgpu", "wasm"] : ["wasm"];

        if (!webgpu) {
          // WASM-only path: configure thread count
          ort.env.wasm.numThreads = 1;
        }

        console.log(`[VideoProcessor] Loading ONNX model with providers: [${executionProviders.join(", ")}]`);

        const session = await ort.InferenceSession.create("/models/yolov8n.onnx", {
          executionProviders,
          graphOptimizationLevel: "all",
        });

        // Record which backend was actually used (ORT picks the first available)
        activeExecutionProvider = webgpu ? "webgpu" : "wasm";

        // Auto-detect class labels from ONNX model metadata
        try {
          // Fetch the raw model to read metadata (ort doesn't expose it directly)
          const res = await fetch("/models/yolov8n.onnx");
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          // Search for the 'names' metadata string in the binary
          const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(-4096));
          const namesMatch = text.match(/names[^{]*({[^}]+})/);
          if (namesMatch) {
            // Parse Python-style dict: {0: 'ship'} or {0: 'person', 1: 'bicycle', ...}
            const rawDict = namesMatch[1];
            const entries: Array<[number, string]> = [];
            const entryRe = /(\d+):\s*'([^']+)'/g;
            let m;
            while ((m = entryRe.exec(rawDict)) !== null) {
              entries.push([parseInt(m[1]), m[2]]);
            }
            if (entries.length > 0) {
              entries.sort((a, b) => a[0] - b[0]);
              MODEL_LABELS = entries.map((e) => e[1]);
              console.log(`[VideoProcessor] Detected ${MODEL_LABELS.length} class(es): ${MODEL_LABELS.join(", ")}`);
            }
          }

          // If metadata extraction yielded no labels but the model has multiple
          // output channels (indicating a multi-class model), use COCO-80 as fallback.
          if (MODEL_LABELS.length <= 1) {
            const outputShape = session.outputNames.length > 0
              ? (session as any)?.handler?.outputNames ?? []
              : [];
            // Check if output suggests more than 1 class (channels > 5 means multi-class)
            // We'll verify this at inference time; set COCO fallback preemptively
            // only if the model was clearly not a single-class SAR model.
            const possibleMultiClass = !namesMatch;
            if (possibleMultiClass && MODEL_LABELS[0] === "ship") {
              MODEL_LABELS = [...COCO_80_LABELS];
              MODEL_NAME = "yolov8n-coco80";
              console.log(`[VideoProcessor] No metadata labels found — using COCO-80 fallback (${MODEL_LABELS.length} classes)`);
            }
          }

          // Try to extract model description
          const descMatch = text.match(/description[^A-Za-z]*(Ultralytics[^\x00]+)/);
          if (descMatch) {
            MODEL_NAME = MODEL_LABELS.length > 1 ? "yolov8n-coco80" : "yolov8n-sar-vessel";
          }
        } catch { /* metadata extraction is optional */ }

        // Determine output shape for logging
        const outputMeta = session.outputNames.map((name) => name);
        console.log(`[VideoProcessor] ONNX model loaded. Outputs: ${outputMeta.join(", ")}. Classes: [${MODEL_LABELS.join(", ")}]`);

        return session;
      } catch (err) {
        console.warn(
          "[VideoProcessor] ONNX model not available — video detection disabled.",
          "Place yolov8n.onnx in public/models/ to enable.",
          err
        );
        modelLoadFailed = true;
        sessionPromise = null;
        return null;
      }
    })();
  }

  return sessionPromise;
}

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

export async function processVideoLocally(
  file: File
): Promise<VideoProcessorResult> {
  const allDetections: VideoDetection[] = [];
  let framesAnalyzed = 0;
  let onnxEnabled = false;
  let modelSource = "none";
  const modelsUsed: string[] = [];

  let sceneSummary: SceneSummary | undefined;
  let extractedFrames: ImageData[] = [];

  try {
    // Step 1: Extract frames from video
    console.log(`[VideoProcessor] Extracting frames from ${file.name}...`);
    const { frames, width, height } = await extractFrames(file, MAX_FRAMES_TO_SAMPLE);
    console.log(`[VideoProcessor] Extracted ${frames.length} frames (${width}x${height})`);
    framesAnalyzed = frames.length;
    extractedFrames = frames;

    if (frames.length === 0) {
      console.warn("[VideoProcessor] No frames could be extracted from video");
      return makeEmptyResult(framesAnalyzed);
    }

    // Step 2: Try to load ONNX model for object detection
    const session = await getSession();

    if (session) {
      onnxEnabled = true;
      modelSource = `onnxruntime-web (${activeExecutionProvider})`;
      modelsUsed.push("yolov8n");

      // Step 3: Run YOLO inference on each frame
      for (let i = 0; i < frames.length; i++) {
        try {
          const tensor = preprocessFrame(frames[i], MODEL_INPUT_SIZE);
          const inputTensor = new ort.Tensor("float32", tensor, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

          const inputName = session.inputNames[0] || "images";
          const results = await session.run({ [inputName]: inputTensor });

          const outputName = session.outputNames[0] || "output0";
          const outputData = results[outputName].data as Float32Array;

          // Determine numChannels from output shape: total elements / numDetections
          // Output shape is [1, numChannels, numDetections] e.g. [1, 5, 8400]
          const outputShape = results[outputName].dims;
          const numChannels = outputShape.length >= 2
            ? Number(outputShape[outputShape.length - 2])
            : 4 + MODEL_LABELS.length;

          const rawDets = parseYoloOutput(outputData, numChannels, width, height, MODEL_INPUT_SIZE);

          for (const det of rawDets) {
            allDetections.push({
              label: resolveClassLabel(det.classId),
              confidence: Math.round(det.confidence * 1000) / 1000,
              bbox: { x: det.x, y: det.y, w: det.w, h: det.h },
              frame: i + 1,
            });
          }

          if (i === 0) {
            console.log(`[VideoProcessor] Frame 1: output shape [${outputShape.join(", ")}], ${rawDets.length} raw detections`);
          }
        } catch (frameErr) {
          console.warn(`[VideoProcessor] Frame ${i + 1} inference failed:`, frameErr);
        }
      }
    } else {
      console.warn(
        "[VideoProcessor] No ONNX model available — skipping object detection. " +
        "Place yolov8n.onnx in public/models/ to enable."
      );
    }
  } catch (err) {
    console.error("[VideoProcessor] Frame extraction/detection failed:", err);
  }

  // Step 4: Run Qwen2.5-VL scene analysis (parallel-safe, non-blocking)
  try {
    if (extractedFrames.length > 0) {
      console.log("[VideoProcessor] Running Qwen2.5-VL scene analysis...");
      sceneSummary = await analyzeVideoScene(extractedFrames);
      if (sceneSummary.available) {
        modelsUsed.push("Qwen2.5-VL-7B");
        console.log("[VideoProcessor] Qwen VL scene summary:", sceneSummary.summary);
      } else {
        console.warn("[VideoProcessor] Qwen VL unavailable:", sceneSummary.error);
      }
    }
  } catch (err) {
    console.warn("[VideoProcessor] Qwen VL analysis failed (non-blocking):", err);
  }

  // Deduplicate across frames (same label, similar position)
  const deduplicated = deduplicateAcrossFrames(allDetections);

  // Check for emergency conditions
  const emergencyResult = checkVideoEmergency(deduplicated);

  return {
    success: true,
    detections: deduplicated.length,
    alerts: emergencyResult.alerts,
    models_used: modelsUsed.length > 0 ? modelsUsed : ["none"],
    model_source: modelSource,
    onnx_enabled: onnxEnabled,
    execution_provider: onnxEnabled ? activeExecutionProvider : "none",
    yolo_model: onnxEnabled ? `${MODEL_NAME}.onnx (${MODEL_LABELS.length}-class: ${MODEL_LABELS.join(", ")})` : "none",
    yolo_classes: onnxEnabled ? MODEL_LABELS : [],
    confidence_threshold: CONFIDENCE_THRESHOLD,
    detection_details: deduplicated,
    emergency_detected: emergencyResult.detected,
    emergency_type: emergencyResult.type,
    mission_groups_created: emergencyResult.detected ? 1 : 0,
    frames_analyzed: framesAnalyzed,
    scene_summary: sceneSummary,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyResult(framesAnalyzed: number): VideoProcessorResult {
  return {
    success: true,
    detections: 0,
    alerts: 0,
    models_used: ["none"],
    model_source: "none (no ONNX model available)",
    onnx_enabled: false,
    execution_provider: "none",
    yolo_model: "none",
    yolo_classes: [],
    confidence_threshold: CONFIDENCE_THRESHOLD,
    detection_details: [],
    emergency_detected: false,
    emergency_type: null,
    mission_groups_created: 0,
    frames_analyzed: framesAnalyzed,
  };
}

/**
 * Deduplicate detections of the same object across multiple frames.
 * Keeps the highest-confidence instance per class per spatial region.
 */
function deduplicateAcrossFrames(detections: VideoDetection[]): VideoDetection[] {
  if (detections.length === 0) return [];

  // Group by label
  const byLabel = new Map<string, VideoDetection[]>();
  for (const det of detections) {
    const group = byLabel.get(det.label) || [];
    group.push(det);
    byLabel.set(det.label, group);
  }

  const result: VideoDetection[] = [];
  for (const [, group] of byLabel) {
    // Sort by confidence descending
    group.sort((a, b) => b.confidence - a.confidence);
    const kept: VideoDetection[] = [];

    for (const det of group) {
      // Check if spatially similar to an already kept detection
      const isDuplicate = kept.some((k) => {
        const cx1 = k.bbox.x + k.bbox.w / 2;
        const cy1 = k.bbox.y + k.bbox.h / 2;
        const cx2 = det.bbox.x + det.bbox.w / 2;
        const cy2 = det.bbox.y + det.bbox.h / 2;
        const dist = Math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2);
        return dist < Math.max(k.bbox.w, k.bbox.h) * 0.5;
      });

      if (!isDuplicate) {
        kept.push(det);
      }
    }

    result.push(...kept);
  }

  result.sort((a, b) => b.confidence - a.confidence);
  return result;
}

/**
 * Check for emergency conditions based on actual detections.
 * Only triggers on genuinely concerning patterns.
 */
function checkVideoEmergency(
  detections: VideoDetection[]
): { detected: boolean; type: string | null; alerts: number } {
  // Count persons detected (potential person overboard)
  const personCount = detections.filter((d) => d.label === "person").length;

  if (personCount >= 3) {
    return { detected: true, type: "multiple_persons_detected", alerts: personCount };
  }

  return { detected: false, type: null, alerts: 0 };
}
