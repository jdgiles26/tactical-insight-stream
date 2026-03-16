# Tactical Insight Stream — MDG v2

**Mission Data Grid v2** is an AI-native tactical intelligence aggregation and real-time correlation platform. It ingests multi-source data (documents, video, sensor feeds, RSS, live APIs), processes it through a 6-stage event-driven pipeline powered by state-of-the-art open-source AI/ML models, and surfaces correlated intelligence through a React dashboard.

---

## Architecture

```
External Sources (OpenSky ADS-B, AIS vessels, NASA EONET/FIRMS, NOAA, RSS, manual upload)
        │
        ▼
Ingest Receiver (HTTP endpoint — validates, prioritizes, queues)
        │
        ▼
6-Stage Event Pipeline (pipeline-orchestrator)
  ingestion → processing → tagging → correlation → prioritization → transport
        │              │
        │    ┌─────────┴──────────────────────────┐
        │    │  AI/ML Models invoked on-the-fly:   │
        │    │  • DeBERTa-v3 (text classification) │
        │    │  • BERT NER (entity extraction)      │
        │    │  • BigBird (long-document analysis)  │
        │    │  • CLIP (visual-text matching)        │
        │    │  • YOLOv8 best-boat.onnx (maritime)  │
        │    │  • Sentence-Transformers (similarity) │
        │    │  • Zero-shot classification (BART)    │
        │    └────────────────────────────────────┘
        │
        ▼
Detection Results + Correlation Alerts + Commander's Intent matching
        │
        ▼
React Dashboard (12 pages — Alerts, Pipeline, Analytics, Map, Media Player, …)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn-ui |
| State | TanStack React Query v5 |
| Backend | Supabase PostgreSQL + Deno Edge Functions |
| AI/NLP | HuggingFace Inference API — DeBERTa-v3, BERT NER, BigBird, BART |
| Vision | YOLOv8 maritime ONNX model (`best-boat.onnx`) via onnxruntime-web |
| Video | HLS.js, Vidstack |
| Maps | Leaflet |
| Charts | Recharts |
| Live APIs | OpenSky, AIS (Digitraffic), NASA EONET/FIRMS, NOAA Water Levels |

---

## Quick Start

```sh
# 1. Clone
git clone <YOUR_GIT_URL>
cd tactical-insight-stream

# 2. Install dependencies
npm install

# 3. Configure environment (see Configuration section below)
cp .env.example .env
# Edit .env with your Supabase and HuggingFace credentials

# 4. Start development server
npm run dev
```

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

### Supabase Edge Function Secrets

Set these in your Supabase project under **Settings → Edge Functions → Secrets**:

| Secret | Description | Required |
|--------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ✅ |
| `HUGGINGFACE_API_KEY` | HuggingFace Inference API key | Recommended |
| `YOLO_MODEL_URL` | Public URL to `best-boat.onnx` in Supabase Storage | Recommended |

> **Without `HUGGINGFACE_API_KEY`**: Document processor falls back to lightweight rule-based extraction.  
> **Without `YOLO_MODEL_URL`**: Video processor uses heuristic maritime detection with realistic confidence scores.

---

## AI/ML Models

### Document Processing

The document processor selects the strongest available model at runtime:

1. **DeBERTa-v3-base** (`cross-encoder/nli-deberta-v3-base`) — zero-shot classification for maritime entities
2. **BERT NER** (`dslim/bert-base-NER`) — named entity recognition for vessel names, ports, organisations
3. **BigBird** (`google/bigbird-roberta-base`) — long-document semantic analysis (up to 4096 tokens)
4. **BART zero-shot** (`facebook/bart-large-mnli`) — intent-label matching fallback
5. **Rule-based extraction** — final fallback when API is unavailable

### Video/Image Processing

- **YOLOv8 maritime** (`best-boat.onnx`) — custom-trained ONNX model for maritime vessel detection
  - Classes: `cargo_vessel`, `small_craft`, `person_overboard`, `buoy`, `submarine_periscope`, `fishing_vessel`, `speedboat`, `military_vessel`
  - Runtime: `onnxruntime-web` (WASM backend, runs in Deno edge functions)
  - Confidence threshold: 0.45 (configurable via `YOLO_CONFIDENCE_THRESHOLD` env var)

### Pipeline AI Enrichment (on-the-fly)

Each pipeline stage may invoke additional open-source models:

| Stage | Models Used |
|-------|------------|
| ingestion | Schema validation, deduplication |
| processing | DeBERTa + BERT NER + YOLO (based on source type) |
| tagging | Sentence-Transformers for semantic tag generation |
| correlation | Embedding cosine-similarity, Commander's Intent matching |
| prioritization | Composite ML score: threat × novelty × source reliability |
| transport | Anomaly detection (IQR-based), trend/outlier prediction |

---

## Uploading the YOLO Model to Supabase Storage

To enable live ONNX inference in the video processor:

```sh
# 1. Upload best-boat.onnx to Supabase Storage bucket "models"
supabase storage cp best-boat.onnx supabase/models/best-boat.onnx

# 2. Get the public URL and set it as a secret
supabase secrets set YOLO_MODEL_URL="https://<project>.supabase.co/storage/v1/object/public/models/best-boat.onnx"
```

---

## Deployment

```sh
# Deploy Supabase Edge Functions
supabase functions deploy document-processor
supabase functions deploy video-processor
supabase functions deploy pipeline-orchestrator
supabase functions deploy ingest-receiver
supabase functions deploy rss-ingester
supabase functions deploy live-data-ingester

# Build frontend
npm run build
```

---

## Database Migrations

```sh
supabase db push
```

All migrations are in `supabase/migrations/`.

---

## License

Proprietary — Mission Data Grid v2. All rights reserved.
