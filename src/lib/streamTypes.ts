/**
 * Core types for video surveillance and object detection.
 *
 * These types define the data structures used across the surveillance grid,
 * detection overlay, and integration with the YOLO-based backend processor.
 */

/** Supported stream protocols */
export type StreamProtocol = "rtsp" | "hls" | "http" | "https";

/** A configured video stream source */
export interface StreamSource {
  id: string;
  label: string;
  url: string;
  protocol: StreamProtocol;
}

/** Stream connection status */
export type StreamStatus = "connecting" | "active" | "error" | "inactive";

/** A single object detection result (matches backend detection_results table) */
export interface Detection {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  priority: "high" | "medium" | "low" | "none";
  timestamp: string;
}

/** Stream configuration for adding/editing streams */
export interface StreamConfig {
  url: string;
  protocol: StreamProtocol;
  label: string;
}

/**
 * Auto-detect the stream protocol from a URL.
 * - .m3u8 → HLS
 * - rtsp:// → RTSP
 * - https:// → HTTPS
 * - http:// → HTTP
 */
export function detectProtocol(url: string): StreamProtocol {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.includes(".m3u8")) return "hls";
  if (trimmed.startsWith("rtsp://")) return "rtsp";
  if (trimmed.startsWith("https://")) return "https";
  return "http";
}

/** Map detection confidence to a priority level */
export function confidenceToPriority(
  confidence: number,
  label: string
): Detection["priority"] {
  const highPriorityLabels = [
    "person_overboard",
    "military_vessel",
    "submarine_periscope",
    "speedboat",
  ];

  if (highPriorityLabels.includes(label) && confidence >= 0.6) return "high";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.65) return "medium";
  if (confidence >= 0.45) return "low";
  return "none";
}

/** Color for a given priority level (used for border/overlay rendering) */
export function priorityColor(priority: Detection["priority"]): string {
  switch (priority) {
    case "high":
      return "rgb(239, 68, 68)";
    case "medium":
      return "rgb(245, 158, 11)";
    case "low":
      return "rgb(59, 130, 246)";
    default:
      return "rgb(156, 163, 175)";
  }
}
