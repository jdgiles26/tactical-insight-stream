/**
 * Qwen2.5-VL Vision-Language scene analysis service.
 *
 * Sends extracted video frames to the Qwen2.5-VL-7B-Instruct model via
 * HuggingFace's Serverless Inference API (OpenAI-compatible chat completions)
 * to produce a structured tactical scene summary.
 *
 * The model receives up to 4 keyframes from the video and returns:
 *   - A natural-language scene summary
 *   - Identified objects/entities with descriptions
 *   - Activity/event classification
 *   - Tactical assessment (threat level, environment, notable features)
 *
 * If the API is unavailable or the key is invalid, returns a clear
 * "unavailable" result — never fabricates analysis.
 */

const LOG_PREFIX = "[QwenVL]";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const QWEN_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";
const HF_INFERENCE_BASE = "https://api-inference.huggingface.co/models";
const MAX_FRAMES_FOR_VLM = 4; // Send at most 4 keyframes to the VLM
const MAX_RETRIES = 2;
const RETRY_WAIT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 60_000; // 60s — VLMs can be slow

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneSummary {
  /** Whether the VLM analysis succeeded */
  available: boolean;
  /** Human-readable summary of the video scene */
  summary: string;
  /** Identified objects/entities in the scene */
  objects: string[];
  /** Classified activity or event type */
  activity: string;
  /** Environmental context (indoor/outdoor, weather, terrain, etc.) */
  environment: string;
  /** Tactical assessment notes */
  tactical_notes: string;
  /** Which model produced this analysis */
  model: string;
  /** Number of frames analyzed */
  frames_sent: number;
  /** Raw model response (for debugging) */
  raw_response?: string;
  /** Error message if analysis failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  return (import.meta.env.VITE_HUGGINGFACE_API_KEY as string) || "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Convert an ImageData (from canvas) to a base64 JPEG data URI.
 */
export function imageDataToBase64(imageData: ImageData, quality = 0.85): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Resize an ImageData to fit within maxDim while preserving aspect ratio.
 * VLMs don't need full-resolution frames; smaller frames = faster upload + inference.
 */
function resizeImageData(imageData: ImageData, maxDim = 768): ImageData {
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

// ---------------------------------------------------------------------------
// System prompt for tactical scene analysis
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a tactical intelligence analyst reviewing surveillance video frames. Analyze the provided frame(s) and produce a structured assessment.

Respond in this EXACT format (keep each section to 1-2 sentences):

SUMMARY: <overall scene description>
OBJECTS: <comma-separated list of identified objects/entities>
ACTIVITY: <what is happening in the scene>
ENVIRONMENT: <setting, weather, terrain, time of day if discernible>
TACTICAL: <any security-relevant observations, anomalies, or points of interest>

Be precise and factual. Only describe what you can actually see. Do not speculate or fabricate details not visible in the frames.`;

// ---------------------------------------------------------------------------
// Core API call
// ---------------------------------------------------------------------------

/**
 * Call Qwen2.5-VL via HuggingFace Inference API (OpenAI-compatible endpoint).
 */
async function callQwenVL(
  frameDataURIs: string[],
): Promise<{ success: boolean; text: string; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      text: "",
      error: "VITE_HUGGINGFACE_API_KEY is not configured",
    };
  }

  // Build the multimodal message content
  const content: Array<Record<string, unknown>> = [];

  // Add each frame as an image
  for (let i = 0; i < frameDataURIs.length; i++) {
    content.push({
      type: "image_url",
      image_url: { url: frameDataURIs[i] },
    });
  }

  // Add the analysis prompt
  const frameWord = frameDataURIs.length === 1 ? "frame" : `${frameDataURIs.length} frames`;
  content.push({
    type: "text",
    text: `Analyze ${frameWord} from this surveillance video. What do you see?`,
  });

  const body = {
    model: QWEN_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    max_tokens: 500,
    temperature: 0.3, // Low temp for factual analysis
  };

  const url = `${HF_INFERENCE_BASE}/${QWEN_MODEL}/v1/chat/completions`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const text =
          data?.choices?.[0]?.message?.content ||
          data?.generated_text ||
          "";
        if (text) {
          return { success: true, text };
        }
        return {
          success: false,
          text: "",
          error: `Unexpected response format: ${JSON.stringify(data).slice(0, 200)}`,
        };
      }

      // Handle 503 (model loading)
      if (res.status === 503 && attempt < MAX_RETRIES) {
        let waitMs = RETRY_WAIT_MS;
        try {
          const errBody = await res.json();
          if (errBody?.estimated_time) {
            waitMs = Math.min(errBody.estimated_time * 1000, 30_000);
          }
        } catch { /* ignore */ }
        console.info(
          `${LOG_PREFIX} Model loading, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs / 1000)}s...`,
        );
        await sleep(waitMs);
        continue;
      }

      // Other error
      const errText = await res.text().catch(() => res.statusText);
      return {
        success: false,
        text: "",
        error: `API error ${res.status}: ${errText.slice(0, 300)}`,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { success: false, text: "", error: "Request timed out (60s)" };
      }
      if (attempt < MAX_RETRIES) {
        console.warn(`${LOG_PREFIX} Network error, retrying...`, err.message);
        await sleep(RETRY_WAIT_MS);
        continue;
      }
      return {
        success: false,
        text: "",
        error: `Network error: ${err.message}`,
      };
    }
  }

  return { success: false, text: "", error: "All retries exhausted" };
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Parse the structured VLM response into typed fields.
 * Handles both well-formatted and free-form responses gracefully.
 */
function parseVLMResponse(text: string): {
  summary: string;
  objects: string[];
  activity: string;
  environment: string;
  tactical_notes: string;
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let summary = "";
  let objects: string[] = [];
  let activity = "";
  let environment = "";
  let tactical_notes = "";

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("SUMMARY:")) {
      summary = line.slice("SUMMARY:".length).trim();
    } else if (upper.startsWith("OBJECTS:")) {
      const raw = line.slice("OBJECTS:".length).trim();
      objects = raw
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (upper.startsWith("ACTIVITY:")) {
      activity = line.slice("ACTIVITY:".length).trim();
    } else if (upper.startsWith("ENVIRONMENT:")) {
      environment = line.slice("ENVIRONMENT:".length).trim();
    } else if (upper.startsWith("TACTICAL:")) {
      tactical_notes = line.slice("TACTICAL:".length).trim();
    }
  }

  // Fallback: if no structured fields found, use the whole response as summary
  if (!summary && !activity && objects.length === 0) {
    summary = text.trim();
  }

  return { summary, objects, activity, environment, tactical_notes };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze video frames using Qwen2.5-VL vision-language model.
 *
 * @param frames - Array of ImageData objects extracted from the video.
 *                 Up to MAX_FRAMES_FOR_VLM will be sent to the model.
 * @returns A SceneSummary with the model's analysis, or a clear
 *          "unavailable" result if the API call fails.
 */
export async function analyzeVideoScene(
  frames: ImageData[],
): Promise<SceneSummary> {
  if (frames.length === 0) {
    return makeUnavailable("No frames provided for analysis", 0);
  }

  // Select evenly-spaced keyframes
  const selectedFrames = selectKeyframes(frames, MAX_FRAMES_FOR_VLM);
  console.log(
    `${LOG_PREFIX} Sending ${selectedFrames.length} keyframe(s) to ${QWEN_MODEL}...`,
  );

  // Resize and convert to base64 data URIs
  const dataURIs: string[] = [];
  for (const frame of selectedFrames) {
    const resized = resizeImageData(frame, 768);
    const dataURI = imageDataToBase64(resized, 0.85);
    dataURIs.push(dataURI);
  }

  // Call the VLM
  const result = await callQwenVL(dataURIs);

  if (!result.success) {
    console.warn(`${LOG_PREFIX} Analysis failed:`, result.error);
    return makeUnavailable(result.error || "Unknown error", selectedFrames.length);
  }

  console.log(`${LOG_PREFIX} Analysis complete.`);

  // Parse the response
  const parsed = parseVLMResponse(result.text);

  return {
    available: true,
    summary: parsed.summary,
    objects: parsed.objects,
    activity: parsed.activity,
    environment: parsed.environment,
    tactical_notes: parsed.tactical_notes,
    model: QWEN_MODEL,
    frames_sent: selectedFrames.length,
    raw_response: result.text,
  };
}

/**
 * Analyze a single frame (convenience wrapper for image uploads or
 * single-frame analysis).
 */
export async function analyzeImageScene(
  imageData: ImageData,
): Promise<SceneSummary> {
  return analyzeVideoScene([imageData]);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeUnavailable(error: string, framesSent: number): SceneSummary {
  return {
    available: false,
    summary: "",
    objects: [],
    activity: "",
    environment: "",
    tactical_notes: "",
    model: QWEN_MODEL,
    frames_sent: framesSent,
    error,
  };
}

/**
 * Select up to `count` evenly-spaced frames from the array.
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
