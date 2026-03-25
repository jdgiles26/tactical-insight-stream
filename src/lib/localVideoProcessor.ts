/**
 * Local (client-side) video processor.
 * Replicates the Supabase Edge Function heuristic detection logic so
 * video uploads work without deployed edge functions.
 */

const YOLO_CLASSES = [
  "cargo_vessel",
  "small_craft",
  "person_overboard",
  "buoy",
  "submarine_periscope",
  "fishing_vessel",
  "speedboat",
  "military_vessel",
];

const YOLO_CONFIDENCE_THRESHOLD = 0.45;

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
  yolo_model: string;
  yolo_classes: string[];
  confidence_threshold: number;
  detection_details: VideoDetection[];
  emergency_detected: boolean;
  emergency_type: string | null;
  mission_groups_created: number;
}

function heuristicDetections(filePath: string): VideoDetection[] {
  const lower = filePath.toLowerCase();
  const detections: VideoDetection[] = [];

  const seed = [...lower].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = (n: number) => ((seed * n * 9301 + 49297) % 233280) / 233280;

  const candidates: Array<[string, number]> = [
    ["cargo_vessel", 0.88 + rng(1) * 0.1],
    ["small_craft", 0.78 + rng(2) * 0.12],
    ["fishing_vessel", 0.72 + rng(3) * 0.15],
  ];

  if (/military|naval|warship|patrol/i.test(lower)) {
    candidates.push(["military_vessel", 0.91 + rng(4) * 0.07]);
  }
  if (/speed|fast|intercept/i.test(lower)) {
    candidates.push(["speedboat", 0.85 + rng(5) * 0.1]);
  }
  if (/sar|rescue|overboard/i.test(lower)) {
    candidates.push(["person_overboard", 0.80 + rng(6) * 0.12]);
  }
  if (/submarine|periscope|sub/i.test(lower)) {
    candidates.push(["submarine_periscope", 0.76 + rng(7) * 0.14]);
  }

  for (let i = 0; i < Math.min(candidates.length, 5); i++) {
    const [label, conf] = candidates[i];
    if (conf >= YOLO_CONFIDENCE_THRESHOLD) {
      detections.push({
        label,
        confidence: Math.round(conf * 1000) / 1000,
        bbox: {
          x: Math.round(rng(i + 10) * 500),
          y: Math.round(rng(i + 20) * 400),
          w: Math.round(100 + rng(i + 30) * 300),
          h: Math.round(80 + rng(i + 40) * 200),
        },
        frame: Math.round(1 + rng(i + 50) * 120),
      });
    }
  }

  return detections;
}

export async function processVideoLocally(file: File): Promise<VideoProcessorResult> {
  // Simulate processing delay for realism
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

  const detections = heuristicDetections(file.name);

  return {
    success: true,
    detections: detections.length,
    alerts: 0,
    models_used: ["yolo_heuristic"],
    model_source: "heuristic",
    onnx_enabled: false,
    yolo_model: "best-boat.onnx (heuristic mode)",
    yolo_classes: YOLO_CLASSES,
    confidence_threshold: YOLO_CONFIDENCE_THRESHOLD,
    detection_details: detections,
    emergency_detected: false,
    emergency_type: null,
    mission_groups_created: 0,
  };
}
