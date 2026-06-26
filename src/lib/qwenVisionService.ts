/**
 * Vision-Language scene analysis service.
 *
 * Previously used Qwen2.5-VL, now delegates to LFM2.5-VL-450M
 * for in-browser WebGPU inference. This module is kept for
 * backward compatibility with existing imports.
 */

import {
  analyzeImageWithLFM,
  processVideoWithLFM,
  extractVideoFrames,
  imageDataToDataURI,
  type LFMSceneSummary,
} from "./lfmVisionService";

// Re-export the SceneSummary type with the old name
export type SceneSummary = LFMSceneSummary;

// Re-export imageDataToBase64 for backward compatibility
export const imageDataToBase64 = imageDataToDataURI;

/**
 * Analyze video frames using LFM2.5-VL vision-language model.
 * Backward-compatible wrapper around the new LFM service.
 */
export async function analyzeVideoScene(
  frames: ImageData[],
): Promise<SceneSummary> {
  if (frames.length === 0) {
    return {
      available: false,
      summary: "",
      objects: [],
      activity: "",
      environment: "",
      tactical_notes: "",
      model: "LFM2.5-VL-450M",
      frames_sent: 0,
      error: "No frames provided",
    };
  }

  // Use the first frame for single-image analysis
  return analyzeImageWithLFM(frames[0]);
}

/**
 * Analyze a single image frame.
 */
export async function analyzeImageScene(
  imageData: ImageData,
): Promise<SceneSummary> {
  return analyzeImageWithLFM(imageData);
}
