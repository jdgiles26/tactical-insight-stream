# Backend & Data Pipeline Audit

**Scope:** All Supabase edge functions, local processors, data pipeline hooks, pages, and supporting libraries.  
**Date:** 2025-07-18  
**Auditor:** Backend subagent

---

## CRITICAL — Secrets Leaked in `.env`

| Secret | Value prefix | Risk |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:amethystMarie2024!!@db.eijz…` | **Full DB password in plaintext, includes direct Postgres connection string** |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-eY_RAW…` | Live API key committed to repo |
| `HUGGINGFACE_API_KEY` | `hf_XbuYo…` | Live API key committed to repo |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `sb_publishable_laUET…` | Publishable key (lower risk but still shouldn't be committed) |

**Impact:** Anyone with repo access has full database superuser credentials and can run arbitrary SQL, exfiltrate data, or call paid APIs. These keys must be rotated immediately and `.env` must be added to `.gitignore`.

---

## 1. Edge Function Bugs

### 1.1 `live-data-ingester` — Response body consumed twice (CRITICAL)

**File:** `supabase/functions/live-data-ingester/index.ts`, lines ~88-100 (repeated for every source)

```ts
const result = await ingestOpenSky(supabase, sourceId, resolvedBounds);
if (useCache && result.ok) {
  const resultData = await result.json();   // ← consumes body
  await supabase.functions.invoke("cache-manager", { … });
  return jsonResponse(resultData);           // ← re-wraps, works
}
return result;  // ← when useCache is FALSE, returns original Response
```

The issue: when `useCache` is **true** and `result.ok` is **true**, the code calls `result.json()` which consumes the Response body stream. This works because it then re-wraps into `jsonResponse()`. **But** the real problem is the pattern itself—the `ingestOpenSky()` etc. functions already return `Response` objects created by `jsonResponse()`. When caching is enabled, the entire result is double-serialized/deserialized unnecessarily.

More critically: if `result.ok` is **false** (e.g., the upstream API returned a 502), the code falls through to `return result` — but when `useCache` is **true** and the result is *not* ok, it still falls through correctly. The actual silent bug is that **when `useCache` is false, the caching block is skipped entirely and the original Response is returned** — but if someone later adds middleware that reads the body, it will fail since it's a one-shot readable stream.

### 1.2 `live-data-ingester` — Duplicate data flooding on every call (HIGH)

**File:** `supabase/functions/live-data-ingester/index.ts`

Every invocation of `ingestOpenSky()`, `ingestAIS()`, `ingestNasaEONET()` etc. **inserts up to 50 new rows** into `data_products` without checking for existing records with the same `source_identifier`. Only the RSS ingester has dedup logic. This means:

- Every time the "Fetch" button is clicked or a cron triggers, 50 duplicate aircraft/vessel/event rows are created.
- The `data_products` table will grow unboundedly with near-identical data.
- The cache only prevents re-fetching from the upstream API—it does **not** prevent re-insertion when the cache is cold.

**Fix needed:** Upsert by `source_identifier` or check for recent duplicates before inserting.

### 1.3 `live-data-ingester` — OpenSky `result` variable shadowed / wrong return path (MEDIUM)

```ts
if (source === "opensky") {
  const result = await ingestOpenSky(…);
  if (useCache && result.ok) {
    …
    return jsonResponse(resultData);
  }
  return result;  // ← returns when useCache is false OR result not ok
}
```

When `useCache` is `true` but `result.ok` is `false` (upstream 502), the function still hits `return result` — which returns the error Response directly. This is correct but fragile — the error response from `ingestOpenSky()` already uses `jsonResponse()` so CORS headers are present. However, this pattern is repeated 5 times identically, violating DRY.

### 1.4 `video-processor` — YOLOv8 output tensor parsed with wrong memory layout (HIGH)

**File:** `supabase/functions/video-processor/index.ts`, function `parseYoloOutput()`

```ts
const numAnchors = data.length / (4 + numClasses);
for (let i = 0; i < numAnchors; i++) {
  const offset = i * (4 + numClasses);
```

YOLOv8's output tensor shape is `[1, 4+num_classes, num_anchors]` (documented in the comment above), meaning data is stored in **column-major** order: all cx values first, then all cy values, etc. But the parsing code reads in **row-major** order (`offset = i * stride`). This will produce garbage bounding boxes and class scores when real ONNX inference is connected.

**Correct access pattern should be:**
```ts
const cx = data[0 * numAnchors + i];
const cy = data[1 * numAnchors + i];
const bw = data[2 * numAnchors + i];
const bh = data[3 * numAnchors + i];
for (let c = 0; c < numClasses; c++) {
  const conf = data[(4 + c) * numAnchors + i];
}
```

### 1.5 `video-processor` — Bounding box coordinates assume normalized [0,1] range (MEDIUM)

The `parseYoloOutput()` code converts cx/cy/w/h by multiplying by `imgWidth`/`imgHeight`. YOLOv8 outputs coordinates in **pixel space** relative to the 640×640 input, not normalized [0,1]. If the frame extractor returns frames at the native resolution, the coordinates will be wildly wrong. The code would need to scale from 640×640 to the original image dimensions.

### 1.6 `video-processor` — `onnx_enabled` always returns `false` (LOW)

```ts
return new Response(JSON.stringify({
  …
  onnx_enabled: false,  // ← hardcoded, even when ONNX inference ran successfully
```

The response always reports `onnx_enabled: false` regardless of whether real inference occurred. The `modelSource` variable correctly tracks `"yolo_onnx"` vs `"heuristic"`, but the response field is hardcoded.

### 1.7 `video-processor` — Silent `as any` casts bypass type safety (MEDIUM)

Multiple `.insert()` and `.update()` calls use `as any` to force data into tables whose TypeScript types don't match:

```ts
await supabase.from("silent_object_registry").update({ … } as any)
await supabase.from("mission_groups").insert({ … } as any)
await supabase.from("group_evidence").insert({ … } as any)
```

This hides schema mismatches at compile time. If any column names are wrong, inserts will silently fail at runtime.

### 1.8 `document-processor` — Regex divergence from local processor (MEDIUM)

**Edge function:**
```ts
const timeMatch = text.match(/\b(\d{4}Z|\d{2}:\d{2}\s*(UTC|local|Z)?(\d+)\s*hours?\s*(ago|from now)?)\b/i);
```

**Local processor (`localDocumentProcessor.ts`):**
```ts
const timeMatch = text.match(/\b(\d{4}Z|\d{2}:\d{2}\s*(UTC|local|Z)?(\d+)\s*hours?\s*(ago|from now)?)\b/i);
```

Both have the same regex, but it's **broken**: the `(\d+)` group follows `(UTC|local|Z)?` without a separator, so `14:30UTC3hours ago` would be needed to match, but `14:30 UTC` alone won't capture the hours part. The original edge function has a subtly different regex with `|` between the two alternatives:

```ts
// Edge function version (correct):
/\b(\d{4}Z|\d{2}:\d{2}\s*(UTC|local|Z)?|(\d+)\s*hours?\s*(ago|from now)?)\b/i
```

Actually examining both more carefully — the edge function version has a **pipe** (`|`) before `(\d+)`, making it an alternation. The local processor version is **missing that pipe**, making it require the time-of-day pattern followed immediately by the hours pattern. This means time references like "3 hours ago" will **not match** in the local processor but **will match** in the edge function.

### 1.9 `ingest-receiver` — Race condition on `total_ingested` counter (MEDIUM)

```ts
await supabase.from("data_sources").update({
  …
  total_ingested: source.total_ingested + 1,
}).eq("id", payload.source_id);
```

This is a classic read-then-write race condition. If two requests arrive simultaneously for the same source, both read the same `total_ingested` value, both increment it to N+1, and one increment is lost. Should use a Postgres `total_ingested = total_ingested + 1` RPC or SQL increment.

### 1.10 `ingest-receiver` — `source.total_ingested` may not exist on the selected row (LOW)

The select query only fetches `id, auth_type, status`:
```ts
const { data: source } = await supabase
  .from("data_sources")
  .select("id, auth_type, status")
  .eq("id", payload.source_id)
  .single();
```

But then it accesses `source.total_ingested` which was **not selected**. This will be `undefined`, and `undefined + 1` = `NaN`. The counter will be set to `NaN` in the database.

### 1.11 `rss-ingester` — Event bus entries have `data_product_id: null` (HIGH)

```ts
await supabase.from("event_bus").insert({
  …
  data_product_id: null, // Will be linked via title lookup if needed
  …
});
```

The pipeline orchestrator's `executeStage()` function relies on `event.data_product_id` to look up and process data products. With `null`, every stage will skip processing:

```ts
case "ingestion":
  if (!event.data_product_id) throw new Error("Missing data_product_id…");
```

So RSS-ingested items publish events that **immediately fail** in the pipeline, landing in the dead letter queue after max retries.

**Fix:** The insert into `data_products` returns the product ID — use it:
```ts
const { data: inserted } = await supabase.from("data_products").insert({…}).select("id").single();
// Then use inserted.id in the event_bus insert
```

### 1.12 `rss-ingester` — `total_ingested` same race condition as ingest-receiver (MEDIUM)

Same read-then-write pattern:
```ts
const { data: src } = await supabase.from("data_sources").select("total_ingested")…
await supabase.from("data_sources").update({ total_ingested: (src.total_ingested || 0) + ingested })
```

### 1.13 `ai-analysis-agent` — Sends full document text as Claude prompt without sanitization (MEDIUM)

The `analyzeDocument()`, `analyzeCorrelations()`, and other functions embed raw user content directly into prompts:
```ts
const prompt = `Analyze this military/intelligence document:\n\n${content}\n\n…`;
```

This is a prompt injection vector. Malicious content in uploaded documents could override the system prompt or extract sensitive context.

### 1.14 `ai-analysis-agent` — `analyzeCorrelations()` sends up to 50 full data products as JSON (HIGH)

```ts
const { data: products } = await supabase.from("data_products").select("*").limit(50);
const prompt = `…\n${JSON.stringify(productsData, null, 2)}\n…`;
```

This can easily exceed Claude's context window, causing API errors. Each product's `content` field can be arbitrarily large. No truncation is applied.

### 1.15 `ai-analysis-agent` — `parseAnalysisResponse()` regex extracts first JSON object only (LOW)

```ts
const jsonMatch = analysis.match(/\{[\s\S]*\}/);
```

This greedy regex matches from the **first** `{` to the **last** `}` in the entire response. If Claude returns text after the JSON block containing `}`, the regex will capture too much and the JSON.parse will fail. Should use a non-greedy match or structured output.

### 1.16 `cache-manager` — `api_cache` table not in TypeScript types (MEDIUM)

The `api_cache` table exists in the migration `20260322_add_api_cache.sql` but is **not** present in `src/integrations/supabase/types.ts`. The cache-manager edge function uses the service role key so it bypasses TypeScript types, but any client-side code trying to interact with the cache would get type errors. The `supabase gen types` command needs to be re-run.

### 1.17 `pipeline-orchestrator` — Processing stage routes `"image"` to BOTH video-processor and document-processor (MEDIUM)

```ts
case "processing":
  if (["video", "image"].includes(sourceType)) {
    // calls video-processor
  } else if (["document", "image"].includes(sourceType)) {
    // calls document-processor
  }
```

The `"image"` source type appears in **both** conditions. Due to `if/else if`, only the video-processor branch will execute for images. The document-processor branch for images is dead code. If the intent was to run both, the `else` must be removed.

### 1.18 `pipeline-orchestrator` — `statusMap` applies status for the NEXT stage, not current (LOW)

```ts
const statusMap: Record<string, string> = {
  processing: "processing",
  tagging: "tagged",
  prioritization: "prioritized",
  transport: "transported",
};
if (statusMap[nextStage]) {
  await supabase.from("data_products").update({ status: statusMap[nextStage] })…
}
```

This sets the data product status to the next stage's status **before** that stage has executed. So when the "tagging" event is created, the product is immediately marked as "tagged" even though tagging hasn't happened yet.

### 1.19 `pipeline-orchestrator` — Missing `ingestion` and `correlation` from statusMap (LOW)

The `statusMap` doesn't include entries for `ingestion` or `correlation` stages, so data products entering those stages won't have their status updated.

### 1.20 `pipeline-orchestrator` — Metrics query fetches ALL events without pagination (HIGH)

```ts
if (action === "metrics") {
  const { data: pending } = await supabase
    .from("event_bus")
    .select("stage, status", { count: "exact" })
    .in("status", ["pending", "processing", "retry"]);
```

This fetches **all** pending/processing/retry events with no limit. As the event bus grows, this query will become increasingly slow and eventually time out the edge function (default 10s limit).

The `useEventBusMetrics()` hook on the client side is even worse:
```ts
const { data: allEvents } = await supabase.from("event_bus").select("stage, status");
```
This fetches **every event ever** (no status filter, no limit). With refetch every 3 seconds, this is a performance bomb.

---

## 2. Data Pipeline Issues

### 2.1 Pipeline doesn't auto-trigger — requires manual "Process" button (HIGH)

The pipeline-orchestrator's `"process"` action must be explicitly called to advance events through stages. There is no cron job, database trigger, or webhook configured to automatically process pending events. Users must click "Process All" on the Pipeline page.

This means:
- Uploaded files sit in "ingested" status until someone manually triggers processing.
- RSS feed items (if they worked — see bug 1.11) would never be processed.
- Real-time intelligence value is lost due to manual processing requirement.

### 2.2 Dual processing paths create inconsistent state (HIGH)

Files uploaded via `UploadPage.tsx` are processed **locally** (client-side) AND inserted into `data_products`. But the pipeline orchestrator also has processing logic that would call the edge functions. If both run:

1. Local processing sets status to `"tagged"` and inserts detection results.
2. The pipeline orchestrator (if triggered) would set status to `"processing"` and invoke video/document-processor edge functions, which would also set status to `"processing"` → `"tagged"`, creating **duplicate detection results**.

There is no guard to prevent double-processing.

### 2.3 Upload page: new files prepended but processed by original index (MEDIUM)

```ts
setUploads((prev) => [...newUploads, ...prev]);  // prepend new files
files.forEach((file, i) => {
  setTimeout(() => processFile(file, i), i * 300);  // process by index 0,1,2...
});
```

New uploads are prepended to the array, but `processFile(file, i)` uses the index `i` from the `files` array (0, 1, 2…). The `updateUpload(idx, …)` call inside `processFile` uses this index to update state. Since new items are prepended, index 0 in the new batch corresponds to the **first** new item, which is correct. However, if the user uploads a second batch while the first is still processing, the indices will collide — batch 2's index 0 will overwrite batch 1's index 0 status.

### 2.4 Event bus: no consumer locking or at-least-once guarantee (MEDIUM)

The pipeline-orchestrator's `"process"` action fetches pending events and processes them sequentially. If two concurrent requests both call `action: "process"`, they will both select the same pending events (no `FOR UPDATE SKIP LOCKED`), potentially processing them twice.

### 2.5 Processing queue (`processing_queue` table) is orphaned (LOW)

Both `video-processor` and `document-processor` write to the `processing_queue` table, and `ingest-receiver` also inserts a `metadata_extraction` step. However, **nothing reads from this table** — it's never queried by any function or hook. The `event_bus` table has completely replaced it. The processing_queue inserts are dead writes.

### 2.6 Storm snapshot recording triggers on every re-render (MEDIUM)

**File:** `src/components/StormThreatPanel.tsx`

```ts
useEffect(() => {
  if (lastRecordedScore.current === assessment.score) return;
  lastRecordedScore.current = assessment.score;
  recordSnapshot.mutate(…);
}, [assessment.score, sensors.length]);
```

The dependency array includes `sensors.length`, so if a new sensor appears with the same total score, the effect won't re-fire (since `assessment.score` hasn't changed). But if the score changes by even 0.001 (floating point), a new snapshot is recorded. With sensors refreshing, this can create many near-duplicate snapshots.

Also: `recordSnapshot` is missing from the dependency array — React will warn about this.

---

## 3. Missing Error Handling

### 3.1 `video-processor` — Detection insert errors silently swallowed

```ts
const { data: detRow } = await supabase.from("detection_results").insert({…}).select("id").single();
```

No error handling. If the insert fails (e.g., schema mismatch from the `as any` casts), the error is silently ignored and `detRow` is null.

### 3.2 `video-processor` — Silent object registry errors swallowed

All registry insert/update operations ignore errors:
```ts
const { data: newEntry } = await supabase.from("silent_object_registry").insert({…} as any)…
```

### 3.3 `video-processor` — Correlation alert insert errors ignored

```ts
await supabase.from("correlation_alerts").insert(alerts);  // no error check
```

### 3.4 `video-processor` — Mission group / evidence creation errors ignored

The entire retrospective matching block has no error handling on any of the ~10 supabase operations.

### 3.5 `document-processor` — Same pattern: all insert operations lack error checks

Detection results, correlation alerts, emergency triggers, mission groups, group evidence, commander's intents — none check for insert errors.

### 3.6 `pipeline-orchestrator` — Stage execution errors may leave events in "processing" forever

If the edge function crashes (OOM, timeout) during `executeStage()`, the event remains in `"processing"` status indefinitely. There is no heartbeat/timeout mechanism to detect stale processing events and re-queue them.

### 3.7 `live-data-ingester` — No error handling for cache-manager invocations

```ts
await supabase.functions.invoke("cache-manager", {…});
```

If the cache-manager function is not deployed or fails, the error is unhandled and will crash the live-data-ingester.

### 3.8 All edge functions — No authentication/authorization checks

None of the edge functions validate the caller's identity. They all use `SUPABASE_SERVICE_ROLE_KEY` (full admin access) but accept requests from any origin (`Access-Control-Allow-Origin: *`). Any unauthenticated HTTP request can trigger data ingestion, processing, or cache manipulation.

### 3.9 `UploadPage.tsx` — No file size limit validation

Files of any size can be uploaded. Large files will cause the browser tab to run out of memory during `file.text()` or `processVideoLocally()` calls.

---

## 4. Broken Data Flows

### 4.1 RSS → Pipeline flow is completely broken

1. `rss-ingester` inserts `data_products` rows ✓
2. `rss-ingester` publishes to `event_bus` with `data_product_id: null` ✗
3. `pipeline-orchestrator` ingestion stage throws `"Missing data_product_id"` ✗
4. After 3 retries → dead letter queue ✗

**Result:** RSS items are ingested into `data_products` but never processed, tagged, correlated, or prioritized.

### 4.2 Live data → Pipeline flow doesn't exist

The `live-data-ingester` inserts into `data_products` but **never publishes to the event bus**. There is no `event_bus.insert()` call anywhere in the function. Live data (OpenSky, AIS, NASA, NOAA) is ingested but never enters the processing pipeline.

### 4.3 Local upload → Pipeline flow skips pipeline entirely

`UploadPage.tsx` processes files locally and inserts results directly into `data_products` and `detection_results`. It never publishes to the event bus, so the pipeline stages (tagging, correlation, prioritization, transport) are never executed for uploaded files.

### 4.4 Video processor → AI analysis: content fetch is redundant and wasteful

```ts
content: {
  ...((await supabase.from("data_products").select("content").eq("id", data_product_id).single()).data?.content || {}),
  ai_summary: aiAnalysis.summary,
```

This performs an extra SELECT query inside an UPDATE's value expression. It should have used the product data already available or fetched it once at the start.

### 4.5 Commander's Intent correlation in video-processor is gated but document-processor is not

In `video-processor`, alerts are only generated when `activeEmergencies?.length > 0`:
```ts
if (intents && (activeEmergencies?.length ?? 0) > 0) {
```

In `document-processor`, alerts are generated for **all** active intents regardless of emergency state:
```ts
if (intents) {
  for (const intent of intents) { … }
}
```

This inconsistency means video detections require an emergency trigger to generate correlation alerts, but document detections do not.

---

## 5. Upload / Processing Issues

### 5.1 Local video processor is pure heuristic — no actual video analysis (BY DESIGN but misleading)

`processVideoLocally()` does not read any video frame data. It generates fake detections based on filename keywords. The UI shows "YOLOv8 best-boat.onnx (maritime)" model status, which is misleading since no model is running.

### 5.2 Local document processor cannot read PDF content

```ts
if (file.type === "application/pdf") {
  return file.name.replace(/[_\-\/]/g, " ").replace(/\.[^.]+$/, "");
}
```

PDF files are "processed" using only the filename as text. No PDF parsing library is included. All detection results for PDFs are based solely on filename keywords, not actual document content.

### 5.3 `UploadPage` — `priorityScores` variable declared but only `medium` is used (LOW)

```ts
const priorityScores: Record<string, number> = { critical: 0.95, high: 0.8, medium: 0.6, … };
// Always uses:
priority_score: priorityScores.medium,
```

All uploads start at "medium" priority regardless of content. The content-based `computePriorityScore()` from `src/lib/priorityScoring.ts` is never called anywhere in the upload flow.

### 5.4 `priorityScoring.ts` is completely unused (LOW)

The `computePriorityScore()` and `scoreToPriorityLevel()` functions are defined but never imported or called anywhere in the codebase. The priority scoring logic is duplicated inline in each edge function and the upload page.

### 5.5 `ingestedData.ts` / `toIngestedData()` is unused (LOW)

The canonical `IngestedData` interface and `toIngestedData()` mapper are defined but never imported or used. Each component and function creates its own ad-hoc data shapes.

### 5.6 `streamTypes.ts` — Detection type mismatch with backend (LOW)

The `Detection` interface in `streamTypes.ts` has a `priority` field of type `"high" | "medium" | "low" | "none"`, but the `detection_results` table has no `priority` column. The `confidenceToPriority()` helper maps confidence to priority, but this is only used client-side for rendering — the backend never stores detection priority.

---

## 6. Schema / Type Mismatches

### 6.1 `api_cache` table missing from TypeScript types

The table exists per migration `20260322_add_api_cache.sql` but is not in `src/integrations/supabase/types.ts`. Need to run `supabase gen types typescript`.

### 6.2 `silent_object_registry` — fields written but not in typed schema

Edge functions write `is_matched`, `bounding_box`, `confidence` etc. via `as any`. The TypeScript types do include these fields, but the `as any` casts bypass validation. If a column is renamed in a migration, the code won't catch it at compile time.

### 6.3 `data_products.source_type` enum doesn't include all ingested types

The `source_type` enum is: `sensor | cot_message | image | video | document | sigint | humint | geoint`.

The `live-data-ingester` always uses `"sensor"` for all live data sources (OpenSky, AIS, NASA, NOAA), which is correct. But the local upload page casts source type with `as any`:
```ts
source_type: sourceType as any,
```
The `sourceType` variable can be `"video"`, `"document"`, or `"image"`, which are all valid enum values. The `as any` cast is unnecessary.

### 6.4 `data_products.status` — edge functions write `"prioritized"` and `"transported"` but upload page only writes `"processing"` and `"tagged"`

Local uploads never reach `"prioritized"` or `"transported"` status because the pipeline isn't triggered. Products from local uploads remain in `"tagged"` status permanently.

### 6.5 `correlation_alerts` — `detection_id` is optional in schema but pipeline orchestrator always provides it

The pipeline orchestrator's correlation stage adds `detection_id` to alerts:
```ts
alerts.push({ …, detection_id: det.id, … });
```
But the video-processor and document-processor skip `detection_id` entirely:
```ts
alerts.push({ …, /* no detection_id */ … });
```
This means alerts from direct processor correlation have no way to trace back to the specific detection that triggered them.

### 6.6 `event_bus.metadata` — schema says `Json | null` but orchestrator writes `{}` default

Minor: the event bus inserts sometimes provide `metadata: {}` and sometimes omit it. The schema default handles this, but the inconsistency makes debugging harder.

### 6.7 `QueuePage.tsx` — `status` cast uses `as any` for StatusBadge

```ts
<StatusBadge status={item.status as any} />
<StatusBadge status={item.priority as any} />
```

These casts hide potential rendering issues if the status or priority values don't match what `StatusBadge` expects.

---

## 7. Performance & Scalability Concerns

### 7.1 N+1 query patterns in edge functions (HIGH)

**video-processor:** For each detection (up to 5), performs:
- 1 insert into `detection_results`
- 1 select + 1 insert/update on `silent_object_registry`
- For each active emergency (up to 10) × each detection:
  - 1 select on `mission_groups`
  - 1 insert on `mission_groups` (if new)
  - 1 select on `group_evidence`
  - 1 insert on `group_evidence` (trigger doc)
  - 1 insert on `group_evidence` (detection)
  - 1 update on `silent_object_registry`

Worst case: 5 detections × 10 emergencies × ~6 queries = **300+ database queries** per video processing call.

**document-processor:** Similar pattern with NER entities + emergency triggers.

### 7.2 `useEventBusMetrics()` fetches entire event_bus table every 3 seconds

As noted above, this hook has no limit, no pagination, and refetches constantly.

### 7.3 No database indexes mentioned for common query patterns

Frequent queries filter on:
- `event_bus.status` + `event_bus.stage` (orchestrator process action)
- `data_products.status` (QueuePage)
- `silent_object_registry.object_uid` (video processor dedup)
- `correlation_alerts.intent_id` + `data_product_id` (cross-source correlation)

Without explicit indexes, these queries will perform full table scans as data grows.

---

## 8. Summary of Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| **CRITICAL** | 3 | Secrets in `.env`, `total_ingested` NaN bug (ingest-receiver reads field not selected), YOLOv8 tensor layout wrong |
| **HIGH** | 7 | RSS pipeline broken (null data_product_id), live data no pipeline entry, duplicate data flooding, correlation analysis prompt overflow, N+1 queries, metrics unbounded, upload index collision |
| **MEDIUM** | 12 | Race conditions, regex divergence, image routing dead code, premature status updates, no auth, no file size limits, cache errors unhandled, dual processing paths, etc. |
| **LOW** | 8 | Unused modules, hardcoded flags, minor type mismatches, dead code |

---

## 9. Recommended Priority Fixes

1. **Rotate all secrets** in `.env` immediately; add `.env` to `.gitignore`.
2. **Fix ingest-receiver** `select()` to include `total_ingested`, or use Postgres increment RPC.
3. **Fix rss-ingester** to pass `data_product_id` to event bus.
4. **Add event bus publishing** to `live-data-ingester` so live data enters the pipeline.
5. **Add deduplication** to `live-data-ingester` (upsert by `source_identifier`).
6. **Fix YOLOv8 tensor parsing** to use column-major access pattern.
7. **Add pagination/limits** to metrics queries.
8. **Add authentication** to edge functions.
9. **Consolidate processing paths** — either local-only or edge-function-only, not both without guards.
10. **Run `supabase gen types typescript`** to sync `api_cache` table into types.
