/**
 * Vision Analysis service — in-browser object detection & scene captioning.
 *
 * Uses supported @huggingface/transformers models:
 *   - Xenova/vit-gpt2-image-captioning: scene description / summarization
 *   - Xenova/owlvit-base-patch32: open-vocabulary object detection with bounding boxes
 *
 * No server required — all inference happens client-side.
 */

const LOG_PREFIX = "[Vision]";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CAPTION_MODEL = "Xenova/vit-gpt2-image-captioning";
const OWL_MODEL = "Xenova/owlvit-base-patch32";
const MAX_FRAMES_FOR_VLM = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LFMSceneSummary {
  available: boolean;
  summary: string;
  objects: string[];
  activity: string;
  environment: string;
  tactical_notes: string;
  model: string;
  frames_sent: number;
  raw_response?: string;
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
  frame_thumbnails?: string[];
}

export interface LFMDetection {
  label: string;
  confidence: number;
  frame: number;
  description: string;
  box?: { xmin: number; ymin: number; xmax: number; ymax: number };
}

// ---------------------------------------------------------------------------
// Model loading state
// ---------------------------------------------------------------------------

let captionPipeline: any = null;
let owlPipeline: any = null;
let captionLoading: Promise<any> | null = null;
let owlLoading: Promise<any> | null = null;
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
 * Load the image captioning pipeline.
 */
export async function loadCaptionPipeline(): Promise<any> {
  if (captionPipeline) return captionPipeline;
  if (captionLoading) return captionLoading;

  captionLoading = (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      console.log(`${LOG_PREFIX} Loading caption model: ${CAPTION_MODEL}`);
      const pipe = await pipeline("image-to-text", CAPTION_MODEL, {
        progress_callback: (progress: any) => {
          if (progress?.progress) {
            notifyStatus("loading", Math.round(progress.progress));
          }
        },
      });
      captionPipeline = pipe;
      console.log(`${LOG_PREFIX} Caption model loaded`);
      return pipe;
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Caption model failed:`, err);
      captionLoading = null;
      throw err;
    }
  })();

  return captionLoading;
}

/**
 * Load the open-vocabulary object detection pipeline (OWL-ViT).
 */
export async function loadOwlPipeline(): Promise<any> {
  if (owlPipeline) return owlPipeline;
  if (owlLoading) return owlLoading;

  owlLoading = (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      console.log(`${LOG_PREFIX} Loading OWL-ViT model: ${OWL_MODEL}`);
      const pipe = await pipeline("zero-shot-object-detection", OWL_MODEL, {
        progress_callback: (progress: any) => {
          if (progress?.progress) {
            notifyStatus("loading", Math.round(progress.progress));
          }
        },
      });
      owlPipeline = pipe;
      console.log(`${LOG_PREFIX} OWL-ViT model loaded`);
      return pipe;
    } catch (err: any) {
      console.error(`${LOG_PREFIX} OWL-ViT model failed:`, err);
      owlLoading = null;
      throw err;
    }
  })();

  return owlLoading;
}

/**
 * Load all models (combined preload). This is the "loadLFMPipeline" replacement.
 */
export async function loadLFMPipeline(): Promise<void> {
  loadError = null;
  notifyStatus("loading", 0);

  try {
    await Promise.all([loadCaptionPipeline(), loadOwlPipeline()]);
    notifyStatus("ready");
  } catch (err: any) {
    loadError = err.message || "Failed to load models";
    notifyStatus("error");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Frame extraction from video
// ---------------------------------------------------------------------------

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

export function imageDataToDataURI(imageData: ImageData, quality = 0.85): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

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
 * Caption a single frame using the image-to-text model.
 */
async function captionFrame(
  imageData: ImageData,
  frameIndex: number
): Promise<{ text: string; frame: number }> {
  const pipe = await loadCaptionPipeline();
  const resized = resizeImageData(imageData, 384);
  const dataURI = imageDataToDataURI(resized, 0.85);

  try {
    const result = await pipe(dataURI, { max_new_tokens: 128 });
    const text = Array.isArray(result)
      ? result[0]?.generated_text || ""
      : (result as any)?.generated_text || "";
    return { text, frame: frameIndex + 1 };
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Frame ${frameIndex + 1} captioning failed:`, err.message);
    return { text: "", frame: frameIndex + 1 };
  }
}

/**
 * Detect objects using open-vocabulary OWL-ViT model.
 */
export async function detectObjects(
  imageData: ImageData,
  labels: string[],
  frameIndex: number,
  confidenceThreshold = 0.1
): Promise<LFMDetection[]> {
  const pipe = await loadOwlPipeline();
  const resized = resizeImageData(imageData, 768);
  const dataURI = imageDataToDataURI(resized, 0.9);

  try {
    const results = await pipe(dataURI, labels, { threshold: confidenceThreshold });
    const detections: LFMDetection[] = [];

    for (const det of results) {
      detections.push({
        label: det.label || "unknown",
        confidence: det.score || 0,
        frame: frameIndex + 1,
        description: `Detected "${det.label}" with ${(det.score * 100).toFixed(1)}% confidence`,
        box: det.box ? {
          xmin: det.box.xmin,
          ymin: det.box.ymin,
          xmax: det.box.xmax,
          ymax: det.box.ymax,
        } : undefined,
      });
    }

    return detections;
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} OWL-ViT detection failed frame ${frameIndex + 1}:`, err.message);
    return [];
  }
}

/**
 * Parse caption response into structured fields.
 */
function parseResponse(text: string): {
  summary: string;
  objects: string[];
  activity: string;
  environment: string;
  tactical_notes: string;
} {
  const objectPatterns = [
    /(?:shows?|contains?|depicts?|features?|includes?)\s+(.+?)(?:\.|$)/gi,
    /(?:there (?:is|are))\s+(.+?)(?:\.|$)/gi,
    /(?:a|an|the)\s+(\w+(?:\s+\w+)?)/gi,
  ];

  const objects: string[] = [];
  for (const pattern of objectPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const items = match[1].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
      objects.push(...items);
    }
  }

  const lowerText = text.toLowerCase();
  let activity = "static scene";
  if (lowerText.includes("moving") || lowerText.includes("walking") || lowerText.includes("running")) {
    activity = "motion detected";
  } else if (lowerText.includes("vehicle") || lowerText.includes("driving") || lowerText.includes("boat")) {
    activity = "vehicle/vessel activity";
  } else if (lowerText.includes("sitting") || lowerText.includes("standing")) {
    activity = "persons present";
  }

  let environment = "unknown";
  if (lowerText.includes("outdoor") || lowerText.includes("sky") || lowerText.includes("water") || lowerText.includes("ocean") || lowerText.includes("street") || lowerText.includes("road")) {
    environment = "outdoor";
  } else if (lowerText.includes("indoor") || lowerText.includes("room") || lowerText.includes("building") || lowerText.includes("office")) {
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
 * Process a video/image file with captioning + optional open-vocab detection.
 */
export async function processVideoWithLFM(
  file: File,
  onProgress?: (stage: string, percent: number) => void,
  objectLabels?: string[]
): Promise<LFMProcessorResult> {
  const modelsUsed: string[] = [];
  let framesAnalyzed = 0;
  const allDetections: LFMDetection[] = [];
  const frameThumbnails: string[] = [];

  try {
    // Step 1: Extract frames (or handle image directly)
    let frames: ImageData[];
    let width: number;
    let height: number;

    if (file.type.startsWith("video/")) {
      onProgress?.("Extracting video frames...", 10);
      console.log(`${LOG_PREFIX} Extracting frames from ${file.name}...`);
      const result = await extractVideoFrames(file, 8);
      frames = result.frames;
      width = result.width;
      height = result.height;
    } else {
      // Image file
      onProgress?.("Loading image...", 10);
      const imgData = await loadImageFile(file);
      frames = [imgData.imageData];
      width = imgData.width;
      height = imgData.height;
    }

    framesAnalyzed = frames.length;
    console.log(`${LOG_PREFIX} Got ${frames.length} frames`);

    if (frames.length === 0) {
      return makeEmptyResult(0, "No frames could be extracted");
    }

    // Generate thumbnails for scene clips display
    const keyframes = selectKeyframes(frames, MAX_FRAMES_FOR_VLM);
    for (const kf of keyframes) {
      frameThumbnails.push(imageDataToDataURI(resizeImageData(kf, 256), 0.7));
    }

    // Step 2: Load caption model
    onProgress?.("Loading captioning model...", 20);
    await loadCaptionPipeline();
    modelsUsed.push("vit-gpt2-image-captioning");

    // Step 3: Caption keyframes
    const frameResults: Array<{ text: string; frame: number }> = [];

    for (let i = 0; i < keyframes.length; i++) {
      const percent = 30 + Math.round((i / keyframes.length) * 30);
      onProgress?.(`Captioning frame ${i + 1}/${keyframes.length}...`, percent);

      const result = await captionFrame(keyframes[i], i);
      frameResults.push(result);
    }

    // Step 4: Open-vocab object detection (if labels provided)
    if (objectLabels && objectLabels.length > 0) {
      onProgress?.("Loading detection model...", 62);
      await loadOwlPipeline();
      modelsUsed.push("owlvit-base-patch32");

      for (let i = 0; i < keyframes.length; i++) {
        const percent = 65 + Math.round((i / keyframes.length) * 20);
        onProgress?.(`Detecting objects in frame ${i + 1}/${keyframes.length}...`, percent);

        const dets = await detectObjects(keyframes[i], objectLabels, i, 0.1);
        allDetections.push(...dets);
      }
    }

    // Step 5: Build scene summary from captions
    onProgress?.("Generating summary...", 90);
    const combinedText = frameResults
      .map((r) => r.text)
      .filter(Boolean)
      .join(". ");

    const parsed = parseResponse(combinedText);

    // Add detection labels to objects list
    const detLabels = [...new Set(allDetections.map((d) => d.label))];
    const allObjects = [...new Set([...parsed.objects, ...detLabels])].slice(0, 15);

    const sceneSummary: LFMSceneSummary = {
      available: combinedText.length > 0 || allDetections.length > 0,
      summary: combinedText || "Scene analysis complete — upload a video or image to see results.",
      objects: allObjects,
      activity: parsed.activity,
      environment: parsed.environment,
      tactical_notes: allDetections.length > 0
        ? `${allDetections.length} objects detected via open-vocabulary model. ${parsed.tactical_notes}`
        : parsed.tactical_notes,
      model: modelsUsed.join(" + "),
      frames_sent: keyframes.length,
      raw_response: combinedText,
    };

    const emergencyResult = checkEmergency(combinedText, allDetections);

    onProgress?.("Complete", 100);

    return {
      success: true,
      detections: allDetections.length,
      alerts: emergencyResult.alerts,
      models_used: modelsUsed,
      model_source: "In-browser (transformers.js)",
      execution_provider: "wasm",
      detection_details: allDetections,
      emergency_detected: emergencyResult.detected,
      emergency_type: emergencyResult.type,
      mission_groups_created: emergencyResult.detected ? 1 : 0,
      frames_analyzed: framesAnalyzed,
      scene_summary: sceneSummary,
      frame_thumbnails: frameThumbnails,
    };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Processing failed:`, err);
    return makeEmptyResult(framesAnalyzed, err.message);
  }
}

/**
 * Analyze a single image using captioning model.
 */
export async function analyzeImageWithLFM(
  imageData: ImageData
): Promise<LFMSceneSummary> {
  try {
    await loadCaptionPipeline();
    const result = await captionFrame(imageData, 0);

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
      model: CAPTION_MODEL,
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

async function loadImageFile(file: File): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ imageData, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

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
    frame_thumbnails: [],
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
    model: CAPTION_MODEL,
    frames_sent: framesSent,
    error,
  };
}

function checkEmergency(
  text: string,
  detections: LFMDetection[]
): { detected: boolean; type: string | null; alerts: number } {
  const lower = text.toLowerCase();
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
