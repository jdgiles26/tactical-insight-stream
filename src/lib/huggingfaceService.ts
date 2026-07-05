/**
 * HuggingFace Inference API service layer.
 *
 * Provides object detection (DETR) and depth estimation (DepthPro)
 * against live video frames, then maps results to the app's Detection
 * type and matches them against commander intents.
 */

import { type Detection, confidenceToPriority } from "./streamTypes";
import type { CommanderIntent } from "@/hooks/useCommanderIntents";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[HF Service]";

const HF_API_BASE = "https://api-inference.huggingface.co/models";
const OBJECT_DETECTION_MODEL = "facebook/detr-resnet-50";
const DEPTH_ESTIMATION_MODEL = "apple/DepthPro-hf";

const MAX_RETRIES = 3;
const DEFAULT_RETRY_WAIT_MS = 10_000; // fallback when API doesn't give estimated_time

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface HFDetection {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

export interface HFDepthResult {
  depthMapBase64: string; // base64-encoded PNG of the depth map
}

export interface VLMAnalysisResult {
  detections: Detection[];
  depthMapBase64?: string;
  matchedIntents: MatchedIntent[];
  sceneDescription: string;
  threatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  timestamp: number;
  frameBase64: string;
}

export interface MatchedIntent {
  intentId: string;
  intentTerm: string;
  detectionLabel: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

// ---------------------------------------------------------------------------
// Semantic alias map  (COCO label → domain terms it can match)
// ---------------------------------------------------------------------------

const SEMANTIC_ALIASES: Record<string, string[]> = {
  boat: ["vessel", "craft", "ship", "boat", "cargo_vessel", "fishing_vessel", "military_vessel", "small_craft", "speedboat"],
  person: ["person", "person_overboard", "crew", "swimmer", "operator"],
  car: ["vehicle", "car", "transport"],
  truck: ["cargo", "transport", "truck", "vehicle", "heavy_vehicle"],
  airplane: ["aircraft", "airplane", "plane", "jet"],
  bicycle: ["bicycle", "bike", "cycle"],
  motorcycle: ["motorcycle", "motorbike"],
  bus: ["bus", "transport", "vehicle"],
  train: ["train", "rail", "locomotive"],
  bird: ["bird", "uav", "drone"], // birds often confused with small drones
  dog: ["dog", "k9", "canine"],
  horse: ["horse", "mounted"],
  skateboard: ["skateboard"],
  surfboard: ["surfboard", "board"],
  kite: ["kite", "paraglider"],
  umbrella: ["umbrella", "shelter"],
  backpack: ["backpack", "pack", "bag"],
  suitcase: ["suitcase", "luggage", "bag"],
  knife: ["knife", "weapon", "blade"],
  scissors: ["scissors", "weapon"],
};

/** Category-level mapping: intent category → COCO labels that belong to it */
const CATEGORY_TO_COCO: Record<string, string[]> = {
  vessel: ["boat"],
  vehicle: ["car", "truck", "bus", "motorcycle"],
  person: ["person"],
  aircraft: ["airplane", "kite"],
  animal: ["bird", "dog", "horse", "cat", "cow", "sheep", "bear", "zebra", "giraffe", "elephant"],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Retrieve the API key from Vite env. */
function getApiKey(): string {
  const key = import.meta.env.VITE_HUGGINGFACE_API_KEY as string | undefined;
  if (!key) {
    console.warn(`${LOG_PREFIX} VITE_HUGGINGFACE_API_KEY is not set – API calls will fail.`);
    return "";
  }
  return key;
}

/**
 * Convert a base64 data-URI (or raw base64 string) to a binary Blob.
 * Accepts both "data:image/jpeg;base64,AAA..." and plain "AAA...".
 */
function base64ToBlob(base64: string): Blob {
  const raw = base64.includes(",") ? base64.split(",")[1] : base64;
  const byteChars = atob(raw);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes], { type: "image/jpeg" });
}

/**
 * Convert a Blob to a base64 data-URI string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Sleep helper for retry back-off.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST an image blob to a HuggingFace Inference API model endpoint.
 * Handles 503 "model loading" responses with exponential back-off.
 *
 * Returns the raw Response on success, or null after all retries are exhausted.
 */
async function hfPost(model: string, imageBlob: Blob): Promise<Response | null> {
  const apiKey = getApiKey();
  const url = `${HF_API_BASE}/${model}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // Content-Type is set implicitly by the Blob
        },
        body: imageBlob,
      });

      if (res.ok) return res;

      if (res.status === 503) {
        // Model is loading – the response body contains { estimated_time: <seconds> }
        let waitMs = DEFAULT_RETRY_WAIT_MS;
        try {
          const body = await res.json();
          if (body?.estimated_time) {
            waitMs = Math.min(body.estimated_time * 1000, 30_000);
          }
        } catch { /* ignore parse errors */ }

        if (attempt < MAX_RETRIES) {
          const backoff = waitMs * Math.pow(1.5, attempt);
          console.info(
            `${LOG_PREFIX} Model ${model} is loading. Retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoff / 1000)}s…`,
          );
          await sleep(backoff);
          continue;
        }
      }

      // Non-retryable error
      const errText = await res.text().catch(() => res.statusText);
      console.error(`${LOG_PREFIX} ${model} returned ${res.status}: ${errText}`);
      return null;
    } catch (err) {
      console.error(`${LOG_PREFIX} Network error calling ${model}:`, err);
      if (attempt < MAX_RETRIES) {
        await sleep(DEFAULT_RETRY_WAIT_MS * Math.pow(1.5, attempt));
        continue;
      }
      return null;
    }
  }

  return null;
}

/**
 * Generate a unique id (simple uuid-v4-ish without crypto dependency).
 */
function uid(): string {
  return "hf-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// 1. Object Detection
// ---------------------------------------------------------------------------

/**
 * Run object detection via DETR-ResNet-50 on a base64-encoded image.
 *
 * @param imageBase64 - JPEG/PNG image as a base64 string or data-URI.
 * @returns Array of raw HuggingFace detection results.
 */
export async function detectObjects(imageBase64: string): Promise<HFDetection[]> {
  try {
    const blob = base64ToBlob(imageBase64);
    const res = await hfPost(OBJECT_DETECTION_MODEL, blob);
    if (!res) {
      console.warn(`${LOG_PREFIX} detectObjects: no response from model.`);
      return [];
    }

    const data: unknown = await res.json();

    if (!Array.isArray(data)) {
      console.warn(`${LOG_PREFIX} detectObjects: unexpected response shape`, data);
      return [];
    }

    // The API returns objects with { score, label, box: { xmin, ymin, xmax, ymax } }
    return (data as HFDetection[]).filter((d) => d.score >= 0.45);
  } catch (err) {
    console.error(`${LOG_PREFIX} detectObjects failed:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. Depth Estimation
// ---------------------------------------------------------------------------

/**
 * Run monocular depth estimation via Apple DepthPro.
 *
 * @param imageBase64 - JPEG/PNG image as a base64 string or data-URI.
 * @returns Base64-encoded depth map PNG, or null if estimation fails.
 */
export async function estimateDepth(imageBase64: string): Promise<string | null> {
  try {
    const blob = base64ToBlob(imageBase64);
    const res = await hfPost(DEPTH_ESTIMATION_MODEL, blob);
    if (!res) {
      console.warn(`${LOG_PREFIX} estimateDepth: no response from model.`);
      return null;
    }

    // The depth estimation API returns a raw image blob (PNG/JPEG of the depth map).
    const contentType = res.headers.get("content-type") || "";

    if (contentType.startsWith("image/")) {
      const depthBlob = await res.blob();
      const depthBase64 = await blobToBase64(depthBlob);
      return depthBase64;
    }

    // Some models return JSON with a base64 image inside
    try {
      const json = await res.json();
      // Handle array format [{"label":..., "score":..., "mask":...}] or string
      if (typeof json === "string") return json;
      if (Array.isArray(json) && json[0]?.mask) return json[0].mask;
      if (json?.image) return json.image;
      if (json?.depth_map) return json.depth_map;
    } catch { /* not JSON */ }

    console.warn(`${LOG_PREFIX} estimateDepth: unexpected content-type "${contentType}".`);
    return null;
  } catch (err) {
    console.error(`${LOG_PREFIX} estimateDepth failed (non-breaking):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Intent Matching
// ---------------------------------------------------------------------------

/**
 * Determine whether a COCO detection label matches a commander intent term.
 * Uses exact match, substring match, semantic aliases, and category mapping.
 */
function matchesIntent(detectionLabel: string, intent: CommanderIntent): boolean {
  const det = detectionLabel.toLowerCase().trim();
  const term = intent.term.toLowerCase().trim();
  const category = (intent.category ?? "").toLowerCase().trim();

  // 1. Exact match
  if (det === term) return true;

  // 2. Substring: detection label appears inside intent term or vice-versa
  if (term.includes(det) || det.includes(term)) return true;

  // 3. Semantic alias: check if the detection's alias list contains the intent term
  const aliases = SEMANTIC_ALIASES[det];
  if (aliases) {
    for (const alias of aliases) {
      // full alias match
      if (alias === term) return true;
      // partial/substring
      if (term.includes(alias) || alias.includes(term)) return true;
    }
  }

  // 4. Category mapping: if intent has a category, check if the detection COCO label belongs
  if (category) {
    const cocoLabelsForCategory = CATEGORY_TO_COCO[category];
    if (cocoLabelsForCategory?.includes(det)) return true;
  }

  // 5. Reverse alias: iterate all alias entries and see if any alias list
  //    maps both the detection and the intent term.
  for (const [cocoLabel, aliasList] of Object.entries(SEMANTIC_ALIASES)) {
    if (cocoLabel === det || aliasList.includes(det)) {
      if (aliasList.includes(term)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// 4. Threat Level Assessment
// ---------------------------------------------------------------------------

function assessThreatLevel(
  matches: MatchedIntent[],
  detections: Detection[],
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (matches.length === 0) return "LOW";

  const maxConfidence = Math.max(...matches.map((m) => m.confidence));
  const highPriorityCount = detections.filter((d) => d.priority === "high").length;

  if (highPriorityCount >= 2 || (matches.length >= 3 && maxConfidence >= 0.85)) {
    return "CRITICAL";
  }
  if (highPriorityCount >= 1 || maxConfidence >= 0.8) {
    return "HIGH";
  }
  if (matches.length >= 1 && maxConfidence >= 0.6) {
    return "MEDIUM";
  }
  return "LOW";
}

// ---------------------------------------------------------------------------
// 5. Scene Description Generator
// ---------------------------------------------------------------------------

function generateSceneDescription(
  detections: Detection[],
  matches: MatchedIntent[],
): string {
  if (detections.length === 0) {
    return "No objects detected in the current frame.";
  }

  // Count by label
  const counts: Record<string, number> = {};
  for (const d of detections) {
    counts[d.label] = (counts[d.label] || 0) + 1;
  }

  const parts: string[] = [];
  for (const [label, count] of Object.entries(counts)) {
    parts.push(count > 1 ? `${count} ${label}s` : `1 ${label}`);
  }

  let desc = `Detected ${parts.join(", ")} in frame.`;

  if (matches.length > 0) {
    const intentLabels = [...new Set(matches.map((m) => m.intentTerm))];
    desc += ` Matched commander intents: ${intentLabels.join(", ")}.`;
  }

  return desc;
}

// ---------------------------------------------------------------------------
// 6. Normalize HF detection → app Detection
// ---------------------------------------------------------------------------

/**
 * Convert absolute pixel bounding boxes from HuggingFace into the app's
 * relative (0-1) bounding box format.
 *
 * DETR returns absolute pixel coords based on the original image dimensions.
 * We normalise them using canvas size (default 640×480 if unknown).
 */
function hfToDetection(
  hf: HFDetection,
  canvasWidth = 640,
  canvasHeight = 480,
): Detection {
  const x = hf.box.xmin / canvasWidth;
  const y = hf.box.ymin / canvasHeight;
  const w = (hf.box.xmax - hf.box.xmin) / canvasWidth;
  const h = (hf.box.ymax - hf.box.ymin) / canvasHeight;

  const label = hf.label;
  const confidence = Math.round(hf.score * 1000) / 1000;
  const priority = confidenceToPriority(confidence, label);

  return {
    id: uid(),
    label,
    confidence,
    bbox: {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      w: Math.max(0, Math.min(1, w)),
      h: Math.max(0, Math.min(1, h)),
    },
    priority,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 7. analyzeFrame — full orchestration
// ---------------------------------------------------------------------------

/**
 * Analyse a captured video frame end-to-end:
 * 1. Run object detection & depth estimation in parallel.
 * 2. Map raw detections to the app's Detection type.
 * 3. Match detections against active commander intents.
 * 4. Assess threat level and generate a scene description.
 *
 * @param frameBase64     - The captured frame as a base64 JPEG data-URI.
 * @param activeIntents   - Currently active commander intents to match against.
 * @param canvasWidth     - Width of the source canvas/video (for bbox normalisation).
 * @param canvasHeight    - Height of the source canvas/video (for bbox normalisation).
 */
export async function analyzeFrame(
  frameBase64: string,
  activeIntents: CommanderIntent[],
  canvasWidth = 640,
  canvasHeight = 480,
): Promise<VLMAnalysisResult> {
  const timestamp = Date.now();

  // --- Run detection + depth in parallel (depth is non-breaking) -----------
  const [hfDetections, depthMapBase64] = await Promise.all([
    detectObjects(frameBase64),
    estimateDepth(frameBase64).catch((err) => {
      console.warn(`${LOG_PREFIX} Depth estimation error (non-breaking):`, err);
      return null;
    }),
  ]);

  // --- Map to app Detection type ------------------------------------------
  const detections: Detection[] = hfDetections.map((hf) =>
    hfToDetection(hf, canvasWidth, canvasHeight),
  );

  // --- Match against commander intents ------------------------------------
  const matchedIntents: MatchedIntent[] = [];

  for (const detection of detections) {
    for (const intent of activeIntents) {
      if (!intent.is_active) continue;

      if (matchesIntent(detection.label, intent)) {
        matchedIntents.push({
          intentId: intent.id,
          intentTerm: intent.term,
          detectionLabel: detection.label,
          confidence: detection.confidence,
          bbox: { ...detection.bbox },
        });
      }
    }
  }

  // --- Assess threat & describe scene -------------------------------------
  const threatLevel = assessThreatLevel(matchedIntents, detections);
  const sceneDescription = generateSceneDescription(detections, matchedIntents);

  return {
    detections,
    depthMapBase64: depthMapBase64 ?? undefined,
    matchedIntents,
    sceneDescription,
    threatLevel,
    timestamp,
    frameBase64,
  };
}

// ---------------------------------------------------------------------------
// 8. captureVideoFrame
// ---------------------------------------------------------------------------

/**
 * Capture the current frame from a <video> element as a base64 JPEG data-URI.
 *
 * Handles tainted-canvas (cross-origin) gracefully by returning an empty
 * string rather than throwing.
 *
 * @param videoElement - The HTMLVideoElement to capture from.
 * @param quality      - JPEG quality (0-1). Default 0.8.
 * @returns Base64-encoded JPEG data-URI, or "" on failure.
 */
export function captureVideoFrame(
  videoElement: HTMLVideoElement,
  quality = 0.8,
): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth || videoElement.clientWidth || 640;
    canvas.height = videoElement.videoHeight || videoElement.clientHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error(`${LOG_PREFIX} captureVideoFrame: could not get 2d context.`);
      return "";
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // toDataURL may throw SecurityError on tainted canvas
    const dataUri = canvas.toDataURL("image/jpeg", quality);
    return dataUri;
  } catch (err) {
    console.error(`${LOG_PREFIX} captureVideoFrame failed (likely cross-origin):`, err);
    return "";
  }
}
