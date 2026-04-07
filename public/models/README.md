# ONNX Models Directory

Place ONNX model files here for client-side inference.

## YOLOv8n (required for video detection)

Download the YOLOv8n ONNX model and place it here as `yolov8n.onnx`.

### Option 1: Export from Ultralytics

```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx imgsz=640
cp yolov8n.onnx public/models/
```

### Option 2: Download pre-exported

Pre-exported YOLOv8n ONNX models are available from the Ultralytics GitHub releases.

## Without the model

If no model is present, video uploads will still work but will report
**zero detections** — the system never fabricates results.
