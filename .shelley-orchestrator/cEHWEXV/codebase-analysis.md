# Codebase Analysis: Tactical Insight Stream (MDG v2 — Mission Data Grid)

## Project Type & Framework

- **Type:** Tactical/military-style intelligence dashboard with live video surveillance, data ingestion, AI analysis, and alerting
- **Framework:** React 18 + TypeScript + Vite 5
- **UI Library:** shadcn/ui (Radix primitives + Tailwind CSS 3 + class-variance-authority)
- **State/Data:** TanStack React Query for server state; Supabase (PostgreSQL + Edge Functions + Realtime) as backend
- **Routing:** React Router DOM v6
- **Charts:** Recharts
- **Maps:** Leaflet
- **Video:** HLS.js for HLS streams, native `<video>` for HTTP/HTTPS; vidstack listed as dep but unused
- **Styling:** Tailwind CSS 3 with tailwindcss-animate, dark military theme
- **Testing:** Vitest + Testing Library
- **Build:** Vite 5 with SWC React plugin

---

## Directory Structure Overview

```
/
├── src/
│   ├── App.tsx                          # Root — routing + layout (sidebar + main)
│   ├── main.tsx                         # Entry point
│   ├── pages/
│   │   ├── Index.tsx                    # Operations Dashboard (metrics, charts, data table)
│   │   ├── MediaPlayerPage.tsx          # ★ Surveillance Grid — multi-feed video player
│   │   ├── CommanderIntentPage.tsx       # ★ Commander's Intent — watch list management
│   │   ├── AlertsPage.tsx               # Alerts hub (correlation, emergency, storm)
│   │   ├── MapPage.tsx                  # Leaflet map with geo-products + storm data
│   │   ├── IngestPage.tsx               # Manual data ingestion controls
│   │   ├── UploadPage.tsx               # File upload (video/doc) with local processing
│   │   ├── DiscoveryPage.tsx            # Search across data products
│   │   ├── AnalyticsPage.tsx            # Analytics charts
│   │   ├── QueuePage.tsx                # Processing queue viewer
│   │   ├── SourcesPage.tsx              # Data source management
│   │   ├── PipelinePage.tsx             # Event bus pipeline visualization
│   │   └── NotFound.tsx
│   ├── components/
│   │   ├── AppSidebar.tsx               # Fixed 240px left sidebar navigation
│   │   ├── AlertsPanel.tsx              # Correlation alerts list with realtime
│   │   ├── EmergencyMissionPanel.tsx    # Emergency triggers + mission groups + evidence
│   │   ├── StormThreatPanel.tsx         # Gulf Coast storm threat assessment
│   │   ├── StormEscalationHistory.tsx   # Storm escalation timeline
│   │   ├── StormHistoryTimeline.tsx     # Storm history chart
│   │   ├── CorrelationPanel.tsx         # Correlation analysis display
│   │   ├── AIInsightsPanel.tsx          # AI analysis results
│   │   ├── DataProductTable.tsx         # Data product listing table
│   │   ├── MetricCard.tsx               # Dashboard metric cards
│   │   ├── StatusBadge.tsx              # Priority/status badges
│   │   ├── sources/
│   │   │   ├── LiveDataPanel.tsx        # Live data fetch controls
│   │   │   ├── SourceCard.tsx
│   │   │   └── SourceForm.tsx
│   │   └── ui/                          # ~40 shadcn/ui primitives
│   ├── hooks/
│   │   ├── useCommanderIntents.ts       # ★ CRUD for commander's intent watch list
│   │   ├── useDetectionResults.ts       # ★ Fetches detection_results from Supabase
│   │   ├── useCorrelationAlerts.ts      # ★ Correlation alerts + realtime subscription
│   │   ├── useCorrelationAnalysis.ts    # AI-powered correlation trigger
│   │   ├── useEmergencyTriggers.ts      # Emergency triggers + mission groups + evidence
│   │   ├── useStormHistory.ts           # Storm threat snapshots
│   │   ├── useDataProducts.ts           # Core data product CRUD + stats + search
│   │   ├── useDataSources.ts            # Data source management
│   │   ├── useBackgroundIngestion.ts    # Background polling (disabled by default)
│   │   ├── useEventBus.ts              # Event pipeline stages + dead letter queue
│   │   └── useSeenItems.ts             # Read/unread tracking
│   ├── lib/
│   │   ├── streamTypes.ts               # ★ Stream/detection types + helpers
│   │   ├── priorityScoring.ts           # Content-based priority scoring (keyword analysis)
│   │   ├── ingestedData.ts              # Canonical IngestedData model + mappers
│   │   ├── localVideoProcessor.ts       # ★ Client-side heuristic video detection
│   │   ├── localDocumentProcessor.ts    # Client-side document processing
│   │   └── utils.ts                     # Tailwind merge utility
│   └── integrations/supabase/
│       ├── client.ts                    # Supabase client init
│       └── types.ts                     # Full DB type definitions (auto-generated)
├── supabase/
│   ├── functions/                       # Edge Functions (Deno runtime)
│   │   ├── video-processor/index.ts     # ★ YOLO detection + correlation engine
│   │   ├── ai-analysis-agent/index.ts   # Claude API analysis for all content types
│   │   ├── document-processor/index.ts  # Document processing pipeline
│   │   ├── live-data-ingester/index.ts  # Live data polling (OpenSky, AIS, NOAA)
│   │   ├── pipeline-orchestrator/index.ts
│   │   ├── ingest-receiver/index.ts
│   │   ├── rss-ingester/index.ts
│   │   └── cache-manager/index.ts       # Redis-like caching via Supabase storage
│   └── migrations/                      # PostgreSQL migrations
├── best-boat.onnx                       # YOLOv8 maritime detection model
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── .env                                 # Supabase URL/key, Anthropic key, HuggingFace key
```

---

## How Live Feeds / Screens Are Implemented

### Surveillance Grid — `src/pages/MediaPlayerPage.tsx` (route: `/media`)

This is the primary live video viewing page.

**Layout system:**
- Configurable grid: 1×1, 2×2, 3×3, 2×5, 5×5 (up to 25 simultaneous feeds)
- Layout and stream URLs persisted in localStorage (`surveillance_streams_v3`, `surveillance_layout_v1`)

**VideoCell component** (defined inline in MediaPlayerPage.tsx, ~100 lines):
- Renders a `<video>` element per slot
- Uses **HLS.js** for `.m3u8` streams (Safari native fallback)
- Direct `video.src` for HTTP/HTTPS streams
- RTSP: browsers can't play natively — users must provide a proxy endpoint (go2rtc, mediamtx)
- Per-cell controls: play/pause, mute/unmute, fullscreen, remove
- Status dots: connecting (yellow pulse), active (green), error (red), inactive (gray)
- Error overlay with protocol-specific guidance text

**Stream management UI:**
- "Add Stream" form: label, URL, auto-detected protocol
- `detectProtocol(url)` in `streamTypes.ts` auto-selects protocol from URL pattern

**IMPORTANT LIMITATION:** There are **NO detection overlays on live video feeds**. VideoCell renders raw video only — no bounding boxes, no real-time annotations. Detection currently only happens on uploaded videos via the backend video-processor Edge Function.

### Stream Types — `src/lib/streamTypes.ts`

Core type definitions:
- `StreamProtocol`: `"rtsp" | "hls" | "http" | "https"`
- `StreamSource`: `{ id, label, url, protocol }`
- `StreamStatus`: `"connecting" | "active" | "error" | "inactive"`
- `Detection`: `{ id, label, confidence, bbox: {x,y,w,h}, priority, timestamp }`
- `confidenceToPriority(confidence, label)` — maps to high/medium/low/none
- High-priority labels: `person_overboard`, `military_vessel`, `submarine_periscope`, `speedboat`

---

## Detection & Alert Systems

### 1. Video Object Detection (Backend) — `supabase/functions/video-processor/index.ts`

- **Model:** `best-boat.onnx` (YOLOv8 maritime)
- **8 classes:** cargo_vessel, small_craft, person_overboard, buoy, submarine_periscope, fishing_vessel, speedboat, military_vessel
- **Confidence threshold:** 0.45 (env-configurable)
- **Pipeline:**
  1. Load ONNX model from Supabase Storage or YOLO_MODEL_URL
  2. If FRAME_EXTRACTOR_URL set → real ONNX inference on extracted frames
  3. Otherwise → **heuristic fallback** (filename-based pseudo-detections)
- **Post-detection:**
  1. Insert into `detection_results` table
  2. Register in `silent_object_registry` (deduplicated tracking, no alerts)
  3. Call `ai-analysis-agent` for scene understanding (Claude API)
  4. Match against active `commander_intents` → create `correlation_alerts` (only when emergency triggers active)
  5. Cross-source correlation if same intent matched across multiple products
  6. Retrospective matching against `emergency_triggers` → create `mission_groups` + `group_evidence`

**Client-side fallback:** `src/lib/localVideoProcessor.ts` mirrors the heuristic logic for uploads when Edge Functions unavailable.

### 2. Detection Results Hook — `src/hooks/useDetectionResults.ts`

- Fetches from `detection_results` table, auto-refreshes every 5s
- Maps rows to `Detection` interface with priority classification
- **Not connected to live video feeds** — only shows results from processed uploads

### 3. Correlation Alerts — `src/hooks/useCorrelationAlerts.ts` + `src/components/AlertsPanel.tsx`

- Fetches from `correlation_alerts` table
- **Realtime WebSocket** via Supabase Postgres Changes (INSERT events)
- Alert types: exact, related, semantic, cross_source
- Cross-source alerts: 15s toast; others: 8s toast
- Acknowledge button per alert; pulsing red badge for unacknowledged count

### 4. Emergency Triggers & Mission Groups — `src/hooks/useEmergencyTriggers.ts` + `src/components/EmergencyMissionPanel.tsx`

- Trigger types: mayday, opord, disaster, illegal, injury, national_alert
- Mission groups: correlated evidence linked to triggers (confidence, risk_level, prediction)
- Group evidence: document, yolo_detection, live_track, audio, image
- Auto-refresh every 10-15s; collapsible drill-down UI

### 5. Storm Threat Assessment — `src/components/StormThreatPanel.tsx`

- Analyzes NOAA bayou water level sensor data
- Composite threat score 0-100; levels: MINIMAL → GUARDED → ELEVATED → HIGH → SEVERE
- Escalation/de-escalation toast notifications
- Records snapshots to storm_history for timeline

### 6. Priority Scoring — `src/lib/priorityScoring.ts`

- Content-based 0-1 scoring using keyword dictionaries
- Weights: threat keywords 50%, military keywords 30%, urgency keywords 20%
- Score mapping: ≥0.85 critical, ≥0.65 high, ≥0.4 medium, ≥0.2 low, else routine

---

## Commander's Intent Feature — FULLY IMPLEMENTED

**Page:** `src/pages/CommanderIntentPage.tsx` (route: `/intent`)
**Hook:** `src/hooks/useCommanderIntents.ts`
**DB table:** `commander_intents`

**Schema:**
```typescript
interface CommanderIntent {
  id: string;
  term: string;           // Keyword to watch for
  description: string | null;
  category: string | null; // vessel, person, weapon, cargo, activity, location, general
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

**UI:** Add form (term, description, category) + watch list with active/inactive toggle + delete. Active count badge.

**How intents drive detection:**
- In `video-processor`: active intents matched against YOLO detection labels (exact, substring, word overlap)
- Matches → `correlation_alerts` (**only when active emergency_triggers exist** — "trigger-gated")
- Cross-source correlation when same intent hits multiple data products
- Silent object registry tracks all detections regardless of trigger state

---

## Database Tables (Supabase PostgreSQL)

| Table | Purpose |
|---|---|
| `data_products` | Core intelligence products (title, content, source_type, priority, geo, status) |
| `commander_intents` | Watch list terms for automated detection matching |
| `correlation_alerts` | Alerts from intent↔detection matches |
| `detection_results` | YOLO detection outputs (label, confidence, bounding_box) |
| `silent_object_registry` | Deduplicated object tracking (object_uid, seen_count, is_matched) |
| `emergency_triggers` | Active emergency situations (trigger_type, urgency, key_elements) |
| `mission_groups` | Correlated evidence groups linked to triggers |
| `group_evidence` | Individual evidence items per mission group |
| `data_sources` | Configured data sources |
| `processing_queue` | Pipeline step tracking |
| `event_bus` | Event pipeline items |
| `api_cache` | Redis-like API response cache with TTL |
| `system_metrics` | System performance metrics |
| `storm_history` | Storm threat snapshots for timeline |

**Enums:**
- `data_status`: ingested → processing → tagged → prioritized → transported → archived
- `priority_level`: critical, high, medium, low, routine
- `source_type`: sensor, cot_message, image, video, document, sigint, humint, geoint

---

## Key Dependencies

| Dependency | Purpose |
|---|---|
| `hls.js` | HLS stream playback |
| `@supabase/supabase-js` | Backend (DB, auth, realtime, edge functions, storage) |
| `@tanstack/react-query` | Server state management |
| `leaflet` | Interactive map |
| `recharts` | Charts |
| `react-resizable-panels` | Resizable layouts |
| `react-router-dom` | Routing |
| `lucide-react` | Icons |
| `date-fns` | Date formatting |
| `sonner` | Toast notifications |
| `zod` | Schema validation |
| `best-boat.onnx` | YOLOv8 maritime detection model (in repo root) |

---

## Key Files for Modification

### Adding detection overlays on live video feeds:
- `src/pages/MediaPlayerPage.tsx` — VideoCell needs canvas/SVG overlay for bounding boxes
- `src/lib/streamTypes.ts` — Detection types already defined and ready
- `src/hooks/useDetectionResults.ts` — Already fetches detections; needs connection to stream slots

### Adding real-time detection on live streams:
- Would need a new pipeline capturing frames from live streams → running detection
- `supabase/functions/video-processor/index.ts` — Has YOLO pipeline but only for uploaded files
- May need WebSocket/SSE for streaming detection results to UI

### Modifying alert behavior:
- `src/hooks/useCorrelationAlerts.ts` — Alert fetching + realtime
- `src/components/AlertsPanel.tsx` — Alert display
- `src/hooks/useCommanderIntents.ts` — Intent management
- `supabase/functions/video-processor/index.ts` — Trigger-gated correlation logic

### Modifying navigation/layout:
- `src/App.tsx` — Route definitions
- `src/components/AppSidebar.tsx` — Sidebar nav items

### Modifying the dashboard:
- `src/pages/Index.tsx` — Main dashboard
- `src/components/MetricCard.tsx` + `DataProductTable.tsx`

---

## Notable Design Patterns

1. **Trigger-gated alerting:** Silent object registry tracks everything; correlation alerts only fire when emergency triggers are active — prevents alert fatigue
2. **Heuristic fallback:** YOLO detection falls back to filename-based heuristics when ONNX model or frame extractor unavailable
3. **On-demand ingestion:** No automatic background polling by default; manual fetch buttons
4. **Local processing:** Client-side document/video processing when Edge Functions unavailable
5. **Realtime subscriptions:** Supabase Postgres Changes WebSocket for live alert push
6. **localStorage persistence:** Surveillance grid layout and stream configs persist locally
