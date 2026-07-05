/**
 * LiquidAI LFM2.5-VL-450M Vision-Language service.
 *
 * Runs the LFM2.5-VL-450M model entirely in-browser using WebGPU via
 * @huggingface/transformers. Provides:
 *   - Scene description / summarization of video frames
 *   - Object identification from visual content
 *   - Tactical assessment for surveillance scenarios
 *
 * No server required — all inference happens client-side with GPU acceleration.
 */

const LOG_PREFIX = "[LFM-VL]";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MODEL_ID = "onnx-community/LFM2.5-VL-450M-ONNX";
const MAX_FRAMES_FOR_VLM = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LFMSceneSummary {
  /** Whether the VLM analysis succeeded */
  available: boolean;
  /** Human-readable summary of the video scene */
  summary: string;
  /** Identified objects/entities in the scene */
  objects: string[];
  /** Classified activity or event type */
  activity: string;
  /** Environmental context */
  environment: string;
  /** Tactical assessment notes */
  tactical_notes: string;
  /** Which model produced this analysis */
  model: string;
  /** Number of frames analyzed */
  frames_sent: number;
  /** Raw model response */
  raw_response?: string;
  /** Error message if analysis failed */
  error?: string;
}

export interface LFMProcessorResult {
  success: boolean;
  detections: number;
  alerts: number;
  models_used: string[];
  model_source: string;
  execution_provider: string;
  detection_details: LFMDetection[];
  emergency_detected: boolean;
  emergency_type: string | null;
  mission_groups_created: number;
  frames_analyzed: number;
  scene_summary?: LFMSceneSummary;
}

export interface LFMDetection {
  label: string;
  confidence: number;
  frame: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Model loading state
// ---------------------------------------------------------------------------

let pipelineInstance: any = null;
let pipelineLoading: Promise<any> | null = null;
let loadError: string | null = null;

export type ModelLoadStatus = "idle" | "loading" | "ready" | "error";

let statusListeners: Array<(status: ModelLoadStatus, progress?: number) => void> = [];

export function onModelStatusChange(listener: (status: ModelLoadStatus, progress?: number) => void) {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

function notifyStatus(status: ModelLoadStatus, progress?: number) {
  for (const listener of statusListeners) {
    listener(status, progress);
  }
}

export function getModelLoadError(): string | null {
  return loadError;
}

/**
 * Load the LFM2.5-VL pipeline. Uses dynamic import to avoid bundling
 * the large transformers library until needed.
 */
export async function loadLFMPipeline(): Promise<any> {
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoading) return pipelineLoading;

  loadError = null;
  notifyStatus("loading", 0);

  pipelineLoading = (async () => {
    try {
      console.log(`${LOG_PREFIX} Loading @huggingface/transformers...`);
      const { pipeline, env } = await import("@huggingface/transformers");

      // Allow loading from HuggingFace hub
      env.allowLocalModels = false;

      console.log(`${LOG_PREFIX} Creating image-to-text pipeline with model: ${MODEL_ID}`);
      notifyStatus("loading", 20);

      const pipe = await pipeline("image-to-text", MODEL_ID, {
        device: "webgpu",
        dtype: "q4",
        progress_callback: (progress: any) => {
          if (progress?.progress) {
            notifyStatus("loading", Math.round(progress.progress));
          }
        },
      });

      pipelineInstance = pipe;
      notifyStatus("ready");
      console.log(`${LOG_PREFIX} Model loaded successfully with WebGPU acceleration`);
      return pipe;
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} WebGPU failed, trying WASM fallback...`, err.message);

      try {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.allowLocalModels = false;

        const pipe = await pipeline("image-to-text", MODEL_ID, {
          device: "wasm",
          dtype: "q4",
          progress_callback: (progress: any) => {
            if (progress?.progress) {
              notifyStatus("loading", Math.round(progress.progress));
            }
          },
        });

        pipelineInstance = pipe;
        notifyStatus("ready");
        console.log(`${LOG_PREFIX} Model loaded with WASM fallback`);
        return pipe;
      } catch (fallbackErr: any) {
        loadError = fallbackErr.message || "Failed to load model";
        notifyStatus("error");
        console.error(`${LOG_PREFIX} Model load failed:`, fallbackErr);
        pipelineLoading = null;
        throw fallbackErr;
      }
    }
  })();

  return pipelineLoading;
}

// ---------------------------------------------------------------------------
// Frame extraction from video
// ---------------------------------------------------------------------------

/**
 * Extracts frames from a video file at evenly-spaced intervals.
 */
export async function extractVideoFrames(
  file: File,
  maxFrames = 8
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

    let seekIndex = 0;
    const seekTimes: number[] = [];

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration) || duration <= 0) {
        video.currentTime = 0;
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const start = duration * 0.05;
      const end = duration * 0.95;
      const frameCount = Math.min(maxFrames, Math.max(1, Math.floor(duration)));
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
// Image helpers
// ---------------------------------------------------------------------------

/**
 * Convert ImageData to a base64 JPEG data URI.
 */
export function imageDataToDataURI(imageData: ImageData, quality = 0.85): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Convert ImageData to a Blob for pipeline input.
 */
export function imageDataToBlob(imageData: ImageData, quality = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob(
      (blob) => resolve(blob!),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Resize ImageData to fit within maxDim while preserving aspect ratio.
 */
function resizeImageData(imageData: ImageData, maxDim = 512): ImageData {
  const { width, height } = imageData;
  if (width <= maxDim && height <= maxDim) return imageData;

  const scale = Math.min(maxDim / width, maxDim / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = width;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(imageData, 0, 0);

  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = newW;
  dstCanvas.height = newH;
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.drawImage(srcCanvas, 0, 0, newW, newH);

  return dstCtx.getImageData(0, 0, newW, newH);
}

/**
 * Select up to `count` evenly-spaced frames.
 */
function selectKeyframes(frames: ImageData[], count: number): ImageData[] {
  if (frames.length <= count) return [...frames];
  const selected: ImageData[] = [];
  const step = (frames.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    selected.push(frames[Math.round(i * step)]);
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a single frame using LFM2.5-VL model.
 */
async function analyzeFrame(
  imageData: ImageData,
  frameIndex: number
): Promise<{ text: string; frame: number }> {
  const pipe = await loadLFMPipeline();
  const resized = resizeImageData(imageData, 512);
  const dataURI = imageDataToDataURI(resized, 0.85);

  try {
    const result = await pipe(dataURI, {
      max_new_tokens: 256,
    });

    const text = Array.isArray(result)
      ? result[0]?.generated_text || ""
      : (result as any)?.generated_text || "";

    return { text, frame: frameIndex + 1 };
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Frame ${frameIndex + 1} analysis failed:`, err.message);
    return { text: "", frame: frameIndex + 1 };
  }
}

/**
 * Parse VLM response into structured fields.
 */
function parseResponse(text: string): {
  summary: string;
  objects: string[];
  activity: string;
  environment: string;
  tactical_notes: string;
} {
  // Extract objects from the description
  const objectPatterns = [
    /(?:shows?|contains?|depicts?|features?|includes?)\s+(.+?)(?:\.|$)/gi,
    /(?:there (?:is|are))\s+(.+?)(?:\.|$)/gi,
  ];

  const objects: string[] = [];
  for (const pattern of objectPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const items = match[1].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
      objects.push(...items);
    }
  }

  // Simple heuristic categorization
  const lowerText = text.toLowerCase();
  let activity = "static scene";
  if (lowerText.includes("moving") || lowerText.includes("walking") || lowerText.includes("running")) {
    activity = "motion detected";
  } else if (lowerText.includes("vehicle") || lowerText.includes("driving") || lowerText.includes("boat")) {
    activity = "vehicle/vessel activity";
  }

  let environment = "unknown";
  if (lowerText.includes("outdoor") || lowerText.includes("sky") || lowerText.includes("water") || lowerText.includes("ocean")) {
    environment = "outdoor";
  } else if (lowerText.includes("indoor") || lowerText.includes("room") || lowerText.includes("building")) {
    environment = "indoor";
  }

  const tactical_notes = objects.length > 0
    ? `${objects.length} distinct element(s) identified in scene`
    : "No specific tactical elements identified";

  return {
    summary: text.trim(),
    objects: [...new Set(objects)].slice(0, 10),
    activity,
    environment,
    tactical_notes,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a video file using LFM2.5-VL-450M model.
 * Extracts frames, analyzes each with the vision-language model,
 * and produces a comprehensive scene summary.
 */
export async function processVideoWithLFM(
  file: File,
  onProgress?: (stage: string, percent: number) => void
): Promise<LFMProcessorResult> {
  const modelsUsed: string[] = [];
  let framesAnalyzed = 0;
  const allDetections: LFMDetection[] = [];

  try {
    // Step 1: Extract frames
    onProgress?.("Extracting video frames...", 10);
    console.log(`${LOG_PREFIX} Extracting frames from ${file.name}...`);
    const { frames } = await extractVideoFrames(file, 8);
    framesAnalyzed = frames.length;
    console.log(`${LOG_PREFIX} Extracted ${frames.length} frames`);

    if (frames.length === 0) {
      return makeEmptyResult(0, "No frames could be extracted");
    }

    // Step 2: Load model
    onProgress?.("Loading LFM2.5-VL model...", 20);
    await loadLFMPipeline();
    modelsUsed.push("LFM2.5-VL-450M");

    // Step 3: Analyze keyframes
    const keyframes = selectKeyframes(frames, MAX_FRAMES_FOR_VLM);
    const frameResults: Array<{ text: string; frame: number }> = [];

    for (let i = 0; i < keyframes.length; i++) {
      const percent = 30 + Math.round((i / keyframes.length) * 50);
      onProgress?.(`Analyzing frame ${i + 1}/${keyframes.length}...`, percent);

      const result = await analyzeFrame(keyframes[i], i);
      frameResults.push(result);

      if (result.text) {
        const parsed = parseResponse(result.text);
        for (const obj of parsed.objects) {
          allDetections.push({
            label: obj,
            confidence: 0.75, // VLM doesn't give per-object confidence
            frame: result.frame,
            description: result.text,
          });
        }
      }
    }

    // Step 4: Build scene summary
    onProgress?.("Generating summary...", 85);
    const combinedText = frameResults
      .map((r) => r.text)
      .filter(Boolean)
      .join(" ");

    const parsed = parseResponse(combinedText);
    const sceneSummary: LFMSceneSummary = {
      available: combinedText.length > 0,
      summary: parsed.summary || "Scene analysis complete - no detailed description available",
      objects: parsed.objects,
      activity: parsed.activity,
      environment: parsed.environment,
      tactical_notes: parsed.tactical_notes,
      model: MODEL_ID,
      frames_sent: keyframes.length,
      raw_response: combinedText,
    };

    // Emergency detection based on content
    const emergencyResult = checkEmergency(combinedText, allDetections);

    onProgress?.("Complete", 100);

    return {
      success: true,
      detections: allDetections.length,
      alerts: emergencyResult.alerts,
      models_used: modelsUsed,
      model_source: "LFM2.5-VL-450M (WebGPU in-browser)",
      execution_provider: pipelineInstance ? "webgpu" : "wasm",
      detection_details: allDetections,
      emergency_detected: emergencyResult.detected,
      emergency_type: emergencyResult.type,
      mission_groups_created: emergencyResult.detected ? 1 : 0,
      frames_analyzed: framesAnalyzed,
      scene_summary: sceneSummary,
    };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Processing failed:`, err);
    return makeEmptyResult(framesAnalyzed, err.message);
  }
}

/**
 * Analyze a single image using LFM2.5-VL.
 */
export async function analyzeImageWithLFM(
  imageData: ImageData
): Promise<LFMSceneSummary> {
  try {
    await loadLFMPipeline();
    const result = await analyzeFrame(imageData, 0);

    if (!result.text) {
      return makeUnavailableSummary("No response from model", 1);
    }

    const parsed = parseResponse(result.text);
    return {
      available: true,
      summary: parsed.summary,
      objects: parsed.objects,
      activity: parsed.activity,
      environment: parsed.environment,
      tactical_notes: parsed.tactical_notes,
      model: MODEL_ID,
      frames_sent: 1,
      raw_response: result.text,
    };
  } catch (err: any) {
    return makeUnavailableSummary(err.message, 1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyResult(framesAnalyzed: number, error?: string): LFMProcessorResult {
  return {
    success: false,
    detections: 0,
    alerts: 0,
    models_used: ["none"],
    model_source: "none",
    execution_provider: "none",
    detection_details: [],
    emergency_detected: false,
    emergency_type: null,
    mission_groups_created: 0,
    frames_analyzed: framesAnalyzed,
    scene_summary: error ? makeUnavailableSummary(error, 0) : undefined,
  };
}

function makeUnavailableSummary(error: string, framesSent: number): LFMSceneSummary {
  return {
    available: false,
    summary: "",
    objects: [],
    activity: "",
    environment: "",
    tactical_notes: "",
    model: MODEL_ID,
    frames_sent: framesSent,
    error,
  };
}

function checkEmergency(
  text: string,
  detections: LFMDetection[]
): { detected: boolean; type: string | null; alerts: number } {
  const lower = text.toLowerCase();

  // Check for emergency keywords
  const emergencyKeywords = [
    "fire", "explosion", "weapon", "gun", "knife",
    "person overboard", "emergency", "danger", "threat",
    "suspicious", "intruder", "breach",
  ];

  const foundKeywords = emergencyKeywords.filter((k) => lower.includes(k));

  if (foundKeywords.length >= 2) {
    return {
      detected: true,
      type: `threat_indicators: ${foundKeywords.join(", ")}`,
      alerts: foundKeywords.length,
    };
  }

  if (detections.length >= 5) {
    return { detected: true, type: "high_activity_scene", alerts: 1 };
  }

  return { detected: false, type: null, alerts: 0 };
}
