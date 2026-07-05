# Complete Features — Actionable Implementation Plan

This document breaks down all required features and capabilities into actionable plans.
Each item specifies what exists today, what must change, and the concrete steps to execute.

---

## 1. Multi-Source Data Ingestion

**Capability:** Ingest data from RSS feeds, live APIs (OpenSky, AIS, NASA, NOAA), and manual uploads, with content-based priority scoring, geospatial tagging, and background polling.

### Data Model

```typescript
// src/lib/ingestedData.ts — TypeScript equivalent of the IngestedData struct
export interface IngestedData {
  id: string;
  sourceId: string;
  content: string;
  labels: string[];
  priority: number;           // 0-1 continuous score
  militaryRelevance: number;  // 0-1 relevance to military/defense
  threatLevel: string;        // "critical" | "high" | "medium" | "low" | "routine"
  timestamp: string;          // ISO 8601
  lat: number;
  lon: number;
  entities: string[];         // extracted named entities
  sentiment: string;          // "positive" | "negative" | "neutral" | "mixed"
  clickable: boolean;
  detailURL: string;
}
```

### Actionable Steps

| # | Task | Status | Details |
|---|------|--------|---------|
| 1.1 | **Content-based priority scoring (0–1)** | ✅ Implemented | `src/lib/priorityScoring.ts` — Scores content against keyword dictionaries for threat, military, and urgency. Returns a continuous 0–1 float. Used by ingestion hooks and edge functions. |
| 1.2 | **Geospatial tagging (lat/lon)** | ✅ Exists | All ingestion edge functions (OpenSky, AIS, NASA, NOAA) already insert `latitude`/`longitude` into `data_products`. RSS ingester enriches articles with lat/lon when coordinates appear in content. |
| 1.3 | **Background ingestion loop (10 s interval)** | ✅ Implemented | `src/hooks/useBackgroundIngestion.ts` — React hook that polls all live data sources every 10 seconds in the background. Toggled on/off from the LiveDataPanel. |
| 1.4 | **IngestedData TypeScript interface** | ✅ Implemented | `src/lib/ingestedData.ts` — Mirrors the Go struct from the specification. Used as the canonical data shape for transformed pipeline output. |
| 1.5 | **RSS feed ingestion** | ✅ Exists | `supabase/functions/rss-ingester/` — 13 curated feeds (BBC, Reuters, Defense One, Bellingcat, etc.) with deduplication and keyword-based priority classification. |
| 1.6 | **Live API ingestion** | ✅ Exists | `supabase/functions/live-data-ingester/` — OpenSky (aircraft), AIS (vessels), NASA EONET (natural events), NASA FIRMS (fires), NOAA (water levels). |

### Fake Functionality Replaced

| Component | Was Fake | Replacement |
|-----------|----------|-------------|
| Priority scoring | Fixed constants per source (e.g., `0.8` for low-altitude aircraft) | Content-based scoring function analyzes text for threat, military, and urgency keywords, producing a continuous 0–1 score |
| Geospatial enrichment | Only set when API provides coords | RSS ingester now extracts lat/lon from content text via coordinate regex patterns |

---

## 2. Video Surveillance & Object Detection

**Capability:** Real-time camera feeds with AI-powered object detection.

### Implementation

- **5×5 Camera Grid**: 25 camera positions (0–24), configurable layouts (1×1, 2×2, 3×3, 2×5, 5×5)
- **Stream Support**: HLS, DASH, MP4, YouTube, RTSP Proxy, Iframe, USB (webcam via `getUserMedia`), Demo (built-in test streams)
- **Real Frame Capture**: FFmpeg integration for RTSP/HTTP streams (documented path for Cloud Run deployment)
- **YOLO ONNX Detection**: Real `onnxruntime-web` inference pipeline with `best-boat.onnx` maritime model
- **Heuristic Fallback**: When ONNX model is unavailable, file-path–based heuristic detection is used (clearly labeled)

### Actionable Steps

| # | Task | Status | Details |
|---|------|--------|---------|
| 2.1 | **5×5 Camera Grid UI** | ✅ Exists | `src/pages/MediaPlayerPage.tsx` — Supports 1×1 through 5×5 layouts with per-cell play/pause/mute/fullscreen controls. |
| 2.2 | **Stream protocol support** | ✅ Implemented | RTSP, HLS (.m3u8), HTTP, and HTTPS streams supported with auto-detection from URL. RTSP requires a proxy (go2rtc/mediamtx) for browser playback. |
| 2.3 | **Stream auto-detection** | ✅ Implemented | `detectProtocol()` in `src/lib/streamTypes.ts` auto-detects protocol from URL pattern (.m3u8 → HLS, rtsp:// → RTSP, etc.) |
| 2.4 | **Detection types & overlay** | ✅ Implemented | `src/lib/streamTypes.ts` — Detection interface with bbox, confidence, priority. `src/hooks/useDetectionResults.ts` — fetches real detection results from Supabase. |
| 2.5 | **YOLO ONNX inference pipeline** | ✅ Exists | `supabase/functions/video-processor/` — Loads `best-boat.onnx` from Supabase Storage, runs via `onnxruntime-web` WASM backend. Parses YOLOv8 output tensors with NMS. |
| 2.6 | **FFmpeg frame extraction** | 📋 Planned | Requires a sidecar service (e.g., Cloud Run container with ffmpeg) to decode RTSP/video frames into pixel buffers. The video processor is wired to call this service when available. |

### Fake Functionality Replaced

| Component | Was Fake | Replacement |
|-----------|----------|-------------|
| Heuristic detections | Generated mock bounding boxes from filename hash | Still used as labeled fallback when ONNX unavailable; video processor now correctly wires model loading before inference attempt |
| Stream type support | Only HLS/MP4 with embed fallbacks | Full RTSP/HLS/HTTP/HTTPS protocol support with auto-detection from URL |

---

## 3. Document Processing & NLP

**Capability:** Extract tactical entities from uploaded documents using AI/ML models.

### Actionable Steps

| # | Task | Status | Details |
|---|------|--------|---------|
| 3.1 | **HuggingFace model cascade** | ✅ Exists | BERT NER → DeBERTa zero-shot → BART → rule-based fallback. |
| 3.2 | **Rule-based extraction (fallback)** | ✅ Enhanced | Improved regex patterns extract real entities (coordinates, vessel names, dates) from document text, not just keyword presence. |
| 3.3 | **Entity extraction from text** | ✅ Enhanced | Rule-based fallback now extracts actual matched text as `raw_entity` values, providing real data instead of just labels. |

### Fake Functionality Replaced

| Component | Was Fake | Replacement |
|-----------|----------|-------------|
| Rule-based extraction | Only detected keyword presence (no extracted values) | Now extracts actual matched text spans as entity values |

---

## 4. Pipeline & Correlation Engine

**Capability:** 6-stage event-driven pipeline with Commander's Intent matching.

| # | Task | Status | Details |
|---|------|--------|---------|
| 4.1 | **Event bus (Kafka-like)** | ✅ Exists | PostgreSQL-backed event store with topics, partitions, offset tracking, and dead-letter queue. |
| 4.2 | **Commander's Intent matching** | ✅ Exists | Cross-source correlation with word overlap and token matching. |
| 4.3 | **Pipeline orchestrator** | ✅ Exists | 6-stage pipeline: ingestion → processing → tagging → correlation → prioritization → transport. |

---

## 5. Geospatial Visualization

| # | Task | Status | Details |
|---|------|--------|---------|
| 5.1 | **Leaflet map** | ✅ Exists | `src/pages/MapPage.tsx` — Plots all geo-tagged data products. |
| 5.2 | **Geo-filtered queries** | ✅ Exists | `useAllGeoProducts` hook fetches products with non-null lat/lon. |

---

## 6. Analytics & Dashboard

| # | Task | Status | Details |
|---|------|--------|---------|
| 6.1 | **Dashboard metrics** | ✅ Exists | Source type, priority, and status breakdowns via Recharts. |
| 6.2 | **Data product statistics** | ✅ Exists | `useDataProductStats` hook aggregates counts. |

---

## Summary of Changes Made

1. **`src/lib/streamTypes.ts`** — New: Stream protocol types (RTSP/HLS/HTTP/HTTPS), Detection interface, auto-detection, priority mapping
2. **`src/lib/ingestedData.ts`** — New: TypeScript `IngestedData` interface matching Go struct specification
3. **`src/lib/priorityScoring.ts`** — New: Content-based priority scoring function (0–1 continuous score)
4. **`src/hooks/useBackgroundIngestion.ts`** — New: 10-second background ingestion polling hook
5. **`src/hooks/useDetectionResults.ts`** — New: Fetches real detection results from Supabase with auto-refresh
6. **`src/components/sources/LiveDataPanel.tsx`** — Enhanced with background ingestion toggle
7. **`src/pages/MediaPlayerPage.tsx`** — Rewritten: RTSP/HLS/HTTP/HTTPS support, auto-detection, no demo data
8. **`supabase/functions/video-processor/index.ts`** — Fixed: proper model loading flow, frame extractor integration path
9. **`supabase/functions/document-processor/index.ts`** — Enhanced: rule-based extraction now extracts real entity values
10. **`COMPLETE_FEATURES.md`** — This document (actionable plan)
