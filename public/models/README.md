# ONNX Models Directory

Contains ONNX model files for client-side inference.

## YOLOv8n SAR Vessel Detection

**Model:** `yolov8n.onnx`  
**Source:** [MeWan2808/yolov8n-sar-vessel-detection](https://huggingface.co/MeWan2808/yolov8n-sar-vessel-detection)  
**Input:** `[1, 3, 640, 640]` (RGB, normalized 0-1)  
**Output:** `[1, 5, 8400]` (4 bbox coords + 1 class confidence × 8400 predictions)  
**Classes:** `{0: 'ship'}`  
**Type:** Quantized ONNX  
**Size:** ~12 MB  

The model is auto-detected at runtime — class labels are extracted from ONNX metadata.

## Without the model

If no model is present, video uploads will still work but will report
**zero detections** — the system never fabricates results.
