# Implementation Plan: VLM-Based Object Detection on Live Video Feeds

## Overview

Add real-time VLM (Vision Language Model) object detection to the tactical surveillance grid. The system captures frames from live video feeds, sends them to Claude's vision API along with active commander's intents, overlays bounding boxes on detections, triggers red alert modals on intent matches, and generates downloadable PDF commander's reports.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  MediaPlayerPage.tsx                                            │
│  ┌──────────────────────────────────────┐                       │
│  │ VideoCell (per stream slot)          │                       │
│  │  ┌──────────┐  ┌──────────────────┐  │                       │
│  │  │ <video>  │  │ <canvas> overlay │  │  ← DetectionOverlay   │
│  │  │ ref={..} │  │ (absolute pos)   │  │    component          │
│  │  └──────────┘  └──────────────────┘  │                       │
│  └──────────┬───────────────────────────┘                       │
│             │ videoRef                                          │
│             ▼                                                   │
│  ┌──────────────────────┐    ┌───────────────────────────────┐  │
│  │ useVLMMonitor hook   │───▶│ vlmAnalyzeFrame() service     │  │
│  │ - captures frames    │    │ - base64 encode frame         │  │
│  │ - manages intervals  │    │ - POST to Anthropic API       │  │
│  │ - stores detections  │    │ - parse structured response   │  │
│  │   per stream in state│    └───────────────────────────────┘  │
│  └──────────┬───────────┘                                       │
│             │ onIntentMatch callback                            │
│             ▼                                                   │
│  ┌──────────────────────┐    ┌───────────────────────────────┐  │
│  │ RedAlertModal        │───▶│ generateCommanderReport()     │  │
│  │ - pulsing red overlay│    │ - jsPDF client-side PDF       │  │
│  │ - detection details  │    │ - title page + exec summary   │  │
│  │ - "Print Report" btn │    │ - evidence frames + actions   │  │
│  └──────────────────────┘    └───────────────────────────────┘  │
│             │                                                   │
│             ▼ (persist intent matches)                          │
│  ┌──────────────────────┐                                       │
│  │ Supabase             │                                       │
│  │ - detection_results  │                                       │
│  │ - correlation_alerts │                                       │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Existing Code Reference (DO NOT MODIFY unless specified)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/pages/MediaPlayerPage.tsx` | Surveillance grid page with `VideoCell` component (currently internal) | `MediaPlayerPage` (default), `VideoCell` (internal function) |
| `src/hooks/useCommanderIntents.ts` | CRUD for commander intents via Supabase | `useCommanderIntents()`, `CommanderIntent` interface |
| `src/lib/streamTypes.ts` | Type definitions for streams & detections | `Detection`, `StreamSource`, `StreamStatus`, `priorityColor()`, `confidenceToPriority()` |
| `src/hooks/useDetectionResults.ts` | Reads `detection_results` table | `useDetectionResults()` |
| `src/hooks/useCorrelationAlerts.ts` | Reads/subscribes `correlation_alerts` table | `useCorrelationAlerts()`, `useRealtimeAlerts()` |
| `src/integrations/supabase/client.ts` | Supabase client instance | `supabase` |
| `.env` | Contains `ANTHROPIC_API_KEY` (server-side key, also has `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`) |

### Existing DB Schema (from `src/integrations/supabase/types.ts`)

**`detection_results` table:**
```typescript
{
  id: string;              // UUID, auto-generated
  data_product_id: string; // FK to data_products (required)
  detector_type: string;   // e.g. "vlm_claude"
  label: string;           // detection label
  confidence: number | null;
  bounding_box: Json | null; // {x, y, w, h}
  metadata: Json | null;   // additional context
  created_at: string;
}
```

**`correlation_alerts` table:**
```typescript
{
  id: string;
  intent_id: string;       // FK to commander_intents
  data_product_id: string; // FK to data_products
  detection_id: string | null; // FK to detection_results
  match_type: string;
  match_score: number;
  matched_term: string;
  matched_label: string;
  acknowledged: boolean;
  created_at: string;
}
```

**`data_products` table** (needed as FK target for detection_results):
```typescript
{
  id: string;
  title: string;
  source_type: source_type_enum;
  status: data_status_enum;
  content: Json | null;
  // ... other fields
}
```

### Existing `Detection` Interface (from `src/lib/streamTypes.ts`)
```typescript
export interface Detection {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  priority: "high" | "medium" | "low" | "none";
  timestamp: string;
}
```

---

## Task Breakdown (4 Independent Workstreams)

---

### TASK 1: VLM Frame Analysis Service & Hook

**Files to create:**
- `src/lib/vlmService.ts` — Anthropic API call logic
- `src/hooks/useVLMMonitor.ts` — React hook orchestrating frame capture & analysis

**Files to modify:**
- `vite.config.ts` — Add proxy for Anthropic API to avoid CORS (the `ANTHROPIC_API_KEY` is a server key, not a `VITE_` prefixed key, so it must NOT be exposed to the browser; route through a Vite dev proxy or Supabase Edge Function)

#### 1a. Anthropic API Proxy (`vite.config.ts` modification)

The `ANTHROPIC_API_KEY` in `.env` is NOT prefixed with `VITE_` so it's not exposed to the browser. We need a server-side proxy. **Two options** (implement option A for simplicity):

**Option A — Vite dev server proxy + custom middleware:**

Create `src/lib/vlmProxy.ts` as a Vite plugin that intercepts `/api/vlm/analyze` and forwards to Anthropic, injecting the API key server-side.

Alternatively, for the simplest approach: **Add `VITE_ANTHROPIC_API_KEY` to `.env`** so the key is available client-side (acceptable for a dev/tactical tool, not for production). Then call the Anthropic API directly from the browser.

**Recommended approach: Supabase Edge Function.** But for speed of implementation, use direct client-side calls with the key exposed as `VITE_ANTHROPIC_API_KEY`.

**Action:** Add `VITE_ANTHROPIC_API_KEY` to `.env` with the same value as `ANTHROPIC_API_KEY`. The VLM service reads `import.meta.env.VITE_ANTHROPIC_API_KEY`.

#### 1b. VLM Service (`src/lib/vlmService.ts`)

```typescript
// src/lib/vlmService.ts

export interface VLMDetection {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number }; // normalized 0-1
  description: string;
  matchedIntents: string[]; // intent term(s) this detection matches
}

export interface VLMAnalysisResult {
  detections: VLMDetection[];
  summary: string;
  timestamp: string;
  frameDataUrl: string; // the base64 frame that was analyzed (kept for PDF report)
}

export interface VLMAnalysisRequest {
  frameBase64: string;       // base64-encoded JPEG (no data: prefix)
  intents: { term: string; description: string | null; category: string | null }[];
  streamLabel: string;
}

export async function vlmAnalyzeFrame(request: VLMAnalysisRequest): Promise<VLMAnalysisResult>
```

**Implementation details:**

1. Build prompt that includes:
   - System prompt: "You are a military tactical surveillance analyst. Analyze this video frame and identify objects, people, vehicles, and activities. Pay special attention to the following commander's intents: [list intents with descriptions]. Return your analysis as JSON."
   - The structured output schema to request from Claude:
   ```json
   {
     "detections": [
       {
         "label": "string - what was detected",
         "confidence": "number 0-1",
         "bbox": { "x": "0-1 normalized", "y": "0-1 normalized", "w": "0-1 normalized", "h": "0-1 normalized" },
         "description": "string - brief description",
         "matched_intents": ["intent_term_1"]
       }
     ],
     "summary": "string - overall scene description"
   }
   ```
2. Call `https://api.anthropic.com/v1/messages` with:
   - `model: "claude-sonnet-4-20250514"` (good balance of speed/quality for real-time)
   - `max_tokens: 1024`
   - `messages` containing an image content block (`type: "image"`, `source.type: "base64"`, `source.media_type: "image/jpeg"`)
   - Headers: `x-api-key`, `anthropic-version: "2023-06-01"`, `content-type: "application/json"`
   - **Important:** Also send `anthropic-dangerous-direct-browser-access: true` header (required for browser-direct calls)
3. Parse the JSON from Claude's text response (extract JSON from markdown code fences if present)
4. Return `VLMAnalysisResult` with the detections, summary, ISO timestamp, and the original frame as a data URL

**Frame capture utility** (also in this file or a helper):
```typescript
export function captureFrameFromVideo(video: HTMLVideoElement, quality = 0.7): string | null
```
- Create an offscreen `<canvas>` matching `video.videoWidth` × `video.videoHeight`
- `ctx.drawImage(video, 0, 0)`
- Return `canvas.toDataURL('image/jpeg', quality)` — strip the `data:image/jpeg;base64,` prefix for the API call, but keep the full data URL for the report
- Return `null` if video dimensions are 0 (no frame available)

#### 1c. VLM Monitor Hook (`src/hooks/useVLMMonitor.ts`)

```typescript
// src/hooks/useVLMMonitor.ts

export interface StreamDetectionState {
  detections: VLMDetection[];
  lastAnalysis: VLMAnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
  analysisCount: number;
}

export interface VLMMonitorConfig {
  intervalMs?: number;        // default: 10000 (10 seconds)
  enabled?: boolean;          // default: true
  maxDetectionsPerFrame?: number; // default: 20
}

export interface UseVLMMonitorReturn {
  /** Map of streamId → detection state */
  streamDetections: Map<string, StreamDetectionState>;
  /** Register a video element for monitoring */
  registerStream: (streamId: string, videoRef: HTMLVideoElement, label: string) => void;
  /** Unregister a stream */
  unregisterStream: (streamId: string) => void;
  /** Global enable/disable toggle */
  isMonitoring: boolean;
  setMonitoring: (enabled: boolean) => void;
  /** Currently active alert (intent match found) — null if no alert */
  activeAlert: IntentMatchAlert | null;
  /** Dismiss the active alert */
  dismissAlert: () => void;
  /** All historical alerts from this session (for PDF report) */
  alertHistory: IntentMatchAlert[];
  /** Trigger manual analysis on a specific stream */
  analyzeNow: (streamId: string) => void;
}

export interface IntentMatchAlert {
  id: string;
  streamId: string;
  streamLabel: string;
  detection: VLMDetection;
  matchedIntent: CommanderIntent;
  frameDataUrl: string;
  fullAnalysis: VLMAnalysisResult;
  timestamp: string;
}

export function useVLMMonitor(config?: VLMMonitorConfig): UseVLMMonitorReturn
```

**Implementation details:**

1. Maintain a `Map<string, { videoEl: HTMLVideoElement; label: string }>` ref for registered streams
2. Maintain `streamDetections` as React state (`useState<Map<string, StreamDetectionState>>`)
3. Maintain `activeAlert` state — when set, the RedAlertModal should show
4. Maintain `alertHistory` as a ref/state array accumulating all alerts
5. Use `useCommanderIntents()` internally to get active intents (filter `is_active === true`)
6. Set up a `setInterval` at `config.intervalMs` (default 10000ms):
   - On each tick, iterate registered streams
   - For each stream with a valid video element (videoWidth > 0, not paused):
     - Call `captureFrameFromVideo(video)`
     - Call `vlmAnalyzeFrame({ frameBase64, intents: activeIntents, streamLabel })`
     - Update `streamDetections` map with results
     - Check if any detection has `matchedIntents.length > 0`
     - If intent match found AND no `activeAlert` is currently showing:
       - Create `IntentMatchAlert` object
       - Set as `activeAlert`
       - Push to `alertHistory`
       - Call `persistDetection()` to write to Supabase (see below)
7. **Stagger analysis** across streams: don't fire all streams simultaneously. Use `streamIndex * 2000ms` offset within the interval to spread API calls.
8. Cleanup: clear interval on unmount, clear all state

**Supabase persistence for intent matches** (within the hook or a helper):
```typescript
async function persistIntentMatch(alert: IntentMatchAlert): Promise<void> {
  // 1. Create a data_product entry as the FK target
  const { data: dp } = await supabase
    .from('data_products')
    .insert({
      title: `VLM Detection: ${alert.detection.label} on ${alert.streamLabel}`,
      source_type: 'video_feed',  // may need to match enum — check actual enum values
      status: 'processed',
      content: { summary: alert.fullAnalysis.summary, stream: alert.streamLabel }
    } as any)
    .select('id')
    .single();

  if (!dp) return;

  // 2. Insert detection_result
  const { data: det } = await supabase
    .from('detection_results')
    .insert({
      data_product_id: dp.id,
      detector_type: 'vlm_claude',
      label: alert.detection.label,
      confidence: alert.detection.confidence,
      bounding_box: alert.detection.bbox,
      metadata: {
        description: alert.detection.description,
        matched_intents: alert.detection.matchedIntents,
        stream_label: alert.streamLabel,
        frame_timestamp: alert.timestamp
      }
    } as any)
    .select('id')
    .single();

  // 3. Insert correlation_alert
  await supabase
    .from('correlation_alerts')
    .insert({
      intent_id: alert.matchedIntent.id,
      data_product_id: dp.id,
      detection_id: det?.id ?? null,
      match_type: 'vlm_vision',
      match_score: alert.detection.confidence,
      matched_term: alert.matchedIntent.term,
      matched_label: alert.detection.label,
      acknowledged: false
    } as any);
}
```

**Note on `source_type` enum:** The existing DB has a `source_type` enum. Check actual allowed values. If `'video_feed'` doesn't exist, use an existing value like `'sigint'` or `'osint'` or whatever is available. The subagent implementing this should query: `SELECT enum_range(NULL::source_type);` or check `src/integrations/supabase/types.ts` for the enum definition.

---

### TASK 2: Detection Overlay Component

**Files to create:**
- `src/components/DetectionOverlay.tsx` — Canvas-based bounding box overlay

**Files to modify:**
- `src/pages/MediaPlayerPage.tsx` — Refactor `VideoCell` to:
  1. Export `videoRef` upward (via callback ref or forwardRef)
  2. Include `<DetectionOverlay>` as a sibling to `<video>`
  3. Integrate with `useVLMMonitor` at the page level

#### 2a. DetectionOverlay Component (`src/components/DetectionOverlay.tsx`)

```typescript
import { Detection } from "@/lib/streamTypes";
import { VLMDetection } from "@/lib/vlmService";

interface DetectionOverlayProps {
  /** Detections with normalized bounding boxes (0-1 range) */
  detections: VLMDetection[];
  /** Width of the video element in pixels */
  videoWidth: number;
  /** Height of the video element in pixels */
  videoHeight: number;
  /** Whether monitoring is active (shows status indicator) */
  isAnalyzing?: boolean;
}

export function DetectionOverlay({ detections, videoWidth, videoHeight, isAnalyzing }: DetectionOverlayProps): JSX.Element
```

**Implementation details:**

1. Render a `<canvas>` element with:
   - `position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 15;`
   - Canvas internal resolution matches `videoWidth × videoHeight` (or the container dimensions)
2. Use a `useEffect` that redraws whenever `detections` changes:
   - Clear the canvas
   - For each detection:
     - Convert normalized bbox `{x, y, w, h}` (0-1) to pixel coordinates: `px = x * canvasWidth`, etc.
     - Determine color using `priorityColor(confidenceToPriority(detection.confidence, detection.label))` from `streamTypes.ts`
     - Draw rectangle outline: `ctx.strokeRect(px, py, pw, ph)` with lineWidth 2-3, color from priority
     - Draw label background: filled rect above the bounding box
     - Draw label text: `"{label} {confidence}%"` in white, 11px monospace font
     - If detection has `matchedIntents.length > 0`, add a pulsing glow effect (draw the rect twice with different alpha + shadow)
3. Show a small status indicator in the top-right corner of the canvas:
   - Green dot + "VLM ACTIVE" when `isAnalyzing` is true
   - Dim dot when idle
   - Draw using canvas text rendering
4. Handle ResizeObserver to keep canvas dimensions synced with the container

#### 2b. MediaPlayerPage.tsx Modifications

The `VideoCell` component is currently defined as an internal function inside `MediaPlayerPage.tsx`. It needs these changes:

1. **Add a `videoRef` callback prop** so the parent can access the `<video>` element:
   ```typescript
   function VideoCell({
     source,
     index,
     onRemove,
     onVideoRef,  // NEW: (el: HTMLVideoElement | null) => void
     detections,  // NEW: VLMDetection[]
     isAnalyzing, // NEW: boolean
   }: { ... })
   ```

2. **Inside VideoCell**, after the `<video>` element, add:
   ```tsx
   <DetectionOverlay
     detections={detections}
     videoWidth={videoRef.current?.videoWidth ?? 640}
     videoHeight={videoRef.current?.videoHeight ?? 480}
     isAnalyzing={isAnalyzing}
   />
   ```

3. **Report the videoRef** to parent via callback:
   ```typescript
   useEffect(() => {
     onVideoRef?.(videoRef.current);
     return () => onVideoRef?.(null);
   }, [source]);
   ```

4. **In `MediaPlayerPage`**, integrate `useVLMMonitor`:
   ```typescript
   const vlm = useVLMMonitor({ intervalMs: 10000 });

   // Pass to each VideoCell:
   <VideoCell
     key={source?.id ?? i}
     source={source}
     index={i}
     onRemove={() => removeSource(i)}
     onVideoRef={(el) => {
       if (el && source) vlm.registerStream(source.id, el, source.label);
       else if (source) vlm.unregisterStream(source.id);
     }}
     detections={vlm.streamDetections.get(source?.id ?? '')?.detections ?? []}
     isAnalyzing={vlm.streamDetections.get(source?.id ?? '')?.isAnalyzing ?? false}
   />
   ```

5. **Add VLM monitoring toggle button** in the header bar (next to layout selector):
   ```tsx
   <Button
     size="sm"
     variant={vlm.isMonitoring ? "default" : "outline"}
     onClick={() => vlm.setMonitoring(!vlm.isMonitoring)}
   >
     <Eye className="h-3 w-3 mr-1" />
     {vlm.isMonitoring ? "VLM Active" : "VLM Off"}
   </Button>
   ```

6. **Render the RedAlertModal** at the bottom of MediaPlayerPage:
   ```tsx
   {vlm.activeAlert && (
     <RedAlertModal
       alert={vlm.activeAlert}
       alertHistory={vlm.alertHistory}
       onDismiss={vlm.dismissAlert}
     />
   )}
   ```

---

### TASK 3: Red Alert Modal

**Files to create:**
- `src/components/RedAlertModal.tsx`

**Dependencies:** Task 1 types (`IntentMatchAlert`), Task 4 (`generateCommanderReport`)

#### Component Specification

```typescript
import { IntentMatchAlert } from "@/hooks/useVLMMonitor";

interface RedAlertModalProps {
  alert: IntentMatchAlert;
  alertHistory: IntentMatchAlert[];
  onDismiss: () => void;
}

export function RedAlertModal({ alert, alertHistory, onDismiss }: RedAlertModalProps): JSX.Element
```

**Implementation details:**

1. **Full-screen overlay** using a portal (`createPortal` to `document.body`) or just absolute positioning with `z-index: 9999`:
   ```css
   position: fixed;
   inset: 0;
   z-index: 9999;
   background: rgba(220, 38, 38, 0.15);  /* red tint */
   backdrop-filter: blur(4px);
   ```

2. **Pulsing red border animation** — Tailwind `animate-pulse` on a red border, or custom keyframes:
   ```css
   @keyframes alert-pulse {
     0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.5); border-color: rgb(239, 68, 68); }
     50% { box-shadow: 0 0 60px rgba(239, 68, 68, 0.9); border-color: rgb(252, 165, 165); }
   }
   ```

3. **Modal content card** (centered, max-w-2xl):
   - **Header:** Large red siren icon (use `lucide-react` `Siren` or `AlertTriangle`), "⚠ COMMANDER'S INTENT MATCH DETECTED" title, pulsing
   - **Detection info:**
     - Stream name (from `alert.streamLabel`)
     - Detected object: `alert.detection.label` with confidence badge
     - Matched intent: `alert.matchedIntent.term` + description
     - Timestamp
   - **Frame preview:** Show `alert.frameDataUrl` as an `<img>` with the bounding box highlighted (can use a mini canvas overlay or just show the raw frame)
   - **Analysis summary:** `alert.fullAnalysis.summary`
   - **Action buttons:**
     - ❌ No close/X button — the ONLY way to dismiss is the "Print Report" button
     - 🖨️ "Print Report" button (primary, large, prominent):
       - On click: call `generateCommanderReport(alert, alertHistory)` (from Task 4)
       - After PDF downloads, call `onDismiss()`
     - Keyboard: `Escape` key should NOT dismiss (prevent default)

4. **Prevent background interaction:**
   - The overlay captures all clicks
   - Add `onKeyDown` handler to prevent Escape
   - `document.body.style.overflow = 'hidden'` while modal is open (restore on unmount)

5. **Audio alert (optional enhancement):** Play a short alert tone using the Web Audio API or an `<audio>` element for tactical immersion

---

### TASK 4: PDF Report Generator

**Files to create:**
- `src/lib/reportGenerator.ts`

**Dependencies:** Must `npm install jspdf` (add to project dependencies)

#### Function Signature

```typescript
import { IntentMatchAlert } from "@/hooks/useVLMMonitor";

export async function generateCommanderReport(
  currentAlert: IntentMatchAlert,
  alertHistory: IntentMatchAlert[]
): Promise<void>  // triggers browser download
```

**Implementation details — PDF structure (matches Commander's Report format):**

Use `jsPDF` library. All content generated client-side. The PDF should have:

#### Page 1: Title Page
- Title: "COMMANDER'S SURVEILLANCE REPORT" (large, bold, centered)
- Classification banner: "TACTICAL — FOR OFFICIAL USE ONLY" (red banner top and bottom)
- Report ID: Auto-generated from timestamp (`RPT-YYYYMMDD-HHmmss`)
- Date/Time Group: ISO timestamp formatted as military DTG
- Prepared by: "Automated VLM Surveillance System"
- Primary Alert: The current alert's detection label + stream name

#### Page 2: Executive Summary
- **Situation:** Brief paragraph summarizing the detection event
- **Key Finding:** The matched intent and what was detected
- **Confidence Level:** Detection confidence as percentage + priority level
- **Streams Monitored:** Count of active streams
- **Total Alerts This Session:** `alertHistory.length`

#### Page 3: Suspicious Activities / Intent Matches
- Table of ALL alerts from `alertHistory`:
  - Columns: Time | Stream | Detection | Confidence | Matched Intent | Priority
- Highlight the current/triggering alert row in red

#### Page 4+: Detailed Frame Observations
- For each alert in `alertHistory` (most recent first):
  - **Section header:** Stream name + timestamp
  - **Evidence frame:** Embed the `frameDataUrl` as a JPEG image in the PDF (use `jsPDF.addImage()`)
  - **Analysis text:** The `fullAnalysis.summary`
  - **Detections list:** All detections from that frame with labels, confidence, bbox coordinates
  - **Matched intents:** Which commander's intents were triggered

#### Final Page: Recommended Actions
- Auto-generated based on detection categories:
  - For `vessel` category intents: "Recommend maritime patrol dispatch to verify contact"
  - For `person` category: "Recommend ground unit verification and identification"
  - For `weapon` category: "IMMEDIATE — Escalate to force protection. Recommend lockdown procedures."
  - For `activity` category: "Recommend continued surveillance and pattern analysis"
  - Generic: "Continue monitoring. Correlate with other intelligence sources."
- **Distribution list:** (placeholder text)
- **Report footer:** Generation timestamp, system version

**PDF styling:**
- Use monospace font (`courier`) for data fields
- Use helvetica bold for headers
- Dark background sections simulated with filled rectangles + white text
- Red accents for alert-level items
- Page numbers in footer
- Each major section starts on a new page

**jsPDF specifics:**
```typescript
import jsPDF from 'jspdf';

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
// Add content...
doc.save(`Commander_Report_${reportId}.pdf`);
```

**For embedding images:** The `frameDataUrl` from alerts is already a base64 data URL. Use:
```typescript
doc.addImage(frameDataUrl, 'JPEG', x, y, width, height);
```

---

## Package Dependencies

**Must install before implementation:**
```bash
npm install jspdf
npm install --save-dev @types/jspdf  # if needed, though jspdf has built-in types
```

No other new dependencies required. The Anthropic API is called via `fetch()` directly.

---

## Environment Setup

**Add to `.env`:**
```
VITE_ANTHROPIC_API_KEY="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"
```

This makes the key accessible in the browser via `import.meta.env.VITE_ANTHROPIC_API_KEY`.

---

## File Change Summary

### New Files (4)
| File | Task | Description |
|------|------|-------------|
| `src/lib/vlmService.ts` | 1 | VLM API call logic, frame capture utility |
| `src/hooks/useVLMMonitor.ts` | 1 | React hook for periodic frame analysis |
| `src/components/DetectionOverlay.tsx` | 2 | Canvas overlay for bounding boxes |
| `src/components/RedAlertModal.tsx` | 3 | Full-screen alert modal |
| `src/lib/reportGenerator.ts` | 4 | PDF report generation |

### Modified Files (2)
| File | Task | Changes |
|------|------|--------|
| `src/pages/MediaPlayerPage.tsx` | 2 | Add videoRef callback to VideoCell, integrate useVLMMonitor, add DetectionOverlay, add VLM toggle button, render RedAlertModal |
| `.env` | 1 | Add `VITE_ANTHROPIC_API_KEY` |

---

## Task Dependency Graph

```
Task 1 (VLM Service + Hook)  ──┐
                                ├──▶ Task 2 (Overlay + MediaPlayerPage integration)
Task 3 (Red Alert Modal) ──────┤
Task 4 (PDF Report) ───────────┘
```

**Parallel execution strategy:**
- **Tasks 1 and 4** can be built fully independently (no shared files)
- **Task 3** can be built independently using the type interfaces from Task 1 (just needs the `IntentMatchAlert` type — can define it locally or import)
- **Task 2** depends on Tasks 1 and 3 being complete since it integrates everything into MediaPlayerPage

**Recommended execution order:**
1. First wave (parallel): Task 1 + Task 4 + Task 3
2. Second wave: Task 2 (integration) — depends on all others

Alternatively, Task 2 can build the `DetectionOverlay` component independently and a final integration pass wires everything together in `MediaPlayerPage.tsx`.

---

## Data Flow Summary

```
1. User enables VLM monitoring (toggle button in surveillance grid header)
2. useVLMMonitor starts interval timer (10s default)
3. Every interval, for each registered stream:
   a. captureFrameFromVideo(videoElement) → base64 JPEG
   b. Fetch active intents from useCommanderIntents (cached by React Query)
   c. vlmAnalyzeFrame({ frame, intents, streamLabel }) → POST to Anthropic API
   d. Parse VLMAnalysisResult with detections
   e. Update streamDetections state → triggers DetectionOverlay re-render
   f. If any detection.matchedIntents.length > 0:
      i.  Set activeAlert → triggers RedAlertModal render
      ii. Push to alertHistory
      iii. persistIntentMatch() → write to Supabase detection_results + correlation_alerts
4. DetectionOverlay reads detections from state, draws bounding boxes on canvas
5. RedAlertModal shows until user clicks "Print Report"
6. "Print Report" → generateCommanderReport() → downloads PDF → dismisses modal
7. Monitoring continues after dismissal
```

---

## Testing Notes

- For testing without live video, use a static MP4 file as a stream source (the existing VideoCell supports HTTP video URLs)
- The VLM analysis can be tested with any video that has recognizable objects
- Commander intents like "person", "vehicle", "weapon" should trigger matches on typical surveillance footage
- The 10-second interval prevents API rate limiting while providing near-real-time monitoring
- Each frame analysis costs approximately 0.01-0.03 USD with Claude Sonnet (depending on image resolution)

---

## Edge Cases to Handle

1. **No active intents:** Skip VLM analysis entirely (no point analyzing without intents). Show a warning badge on the VLM toggle.
2. **Video not playing:** Skip streams where `video.paused === true` or `video.videoWidth === 0`
3. **API errors:** Set `error` in StreamDetectionState, show error indicator on overlay, don't crash the interval
4. **Rate limiting:** If Anthropic returns 429, implement exponential backoff on that stream
5. **Multiple simultaneous intent matches:** Only show one RedAlertModal at a time; queue additional alerts
6. **Large grid (5x5 = 25 streams):** Stagger analysis calls; possibly limit concurrent VLM calls to 3-5 at a time
7. **Frame capture on cross-origin video:** Canvas `drawImage` may throw on CORS-restricted video. Catch and skip silently.
8. **PDF with many alerts:** Paginate properly; jsPDF auto-pagination with `doc.addPage()`
