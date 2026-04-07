# Tactical Insight Stream — Complete Bug Audit

**Date:** 2025-07-17  
**Scope:** Data source loading, ingestion, correlation, and UI systems  
**Severity Scale:** 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low | ⚪ Info

---

## 1. CRITICAL SECURITY ISSUES

### 🔴 BUG-001: Secrets committed to git in plaintext `.env`
**File:** `.env`  
**Lines:** 1-7  
**Evidence:** `git log --oneline -5 -- .env` shows multiple commits touching this file, and `.gitignore` does NOT contain `.env`.  
**Details:** The `.env` file contains:
- `DATABASE_URL` with plaintext Postgres password (`amethystMarie2024!!`)
- `ANTHROPIC_API_KEY` (`sk-ant-api03-...`)
- `HUGGINGFACE_API_KEY` (`hf_Xbu...`)
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

All of these are committed to the repository history. Even adding `.env` to `.gitignore` now won't remove them from git history. Every key must be rotated immediately.

**Fix:** Add `.env` to `.gitignore`, rotate ALL keys, use `git filter-branch` or `bfg` to scrub history.

### 🔴 BUG-002: `VITE_`-prefixed secrets exposed to browser bundle
**File:** `.env`, lines 6-7  
**Details:** `VITE_HUGGINGFACE_API_KEY` is prefixed with `VITE_`, which means Vite will embed it into the client-side JavaScript bundle. Any user can extract this API key from the browser's DevTools. The Anthropic key is NOT prefixed (good), but the HuggingFace key is.

**Fix:** Remove `VITE_` prefix; proxy HuggingFace calls through a backend/edge function.

---

## 2. SUPABASE CLIENT — FULLY REPLACED WITH LOCAL MOCK

### 🔴 BUG-003: Supabase client replaced with local in-memory store — no real backend
**File:** `src/integrations/supabase/client.ts`, lines 1-6  
**Details:** The entire Supabase client is replaced:
```ts
import { localSupabase } from '@/lib/localStore';
export const supabase = localSupabase as any;
```
This means:
- **No real database** — all data lives in `localStorage` and is lost on clear
- **No real authentication** — `auth.getSession()` always returns `null`
- **No real edge functions** — `functions.invoke()` always returns `{ data: { success: true }, error: null }`
- **No real realtime** — the `ChannelMock` subscribes to the local store, not Postgres changes
- **No real storage** — uploads are no-ops, downloads return errors

Every feature in the app that depends on Supabase is running against a fake. The `as any` cast silences all TypeScript errors.

### 🔴 BUG-004: Edge function calls silently succeed with empty data
**File:** `src/lib/localStore.ts`, lines 481-486  
**Details:** `FunctionsMock.invoke()` returns `{ data: { success: true }, error: null }` for ALL calls. This affects:
- `rss-ingester` — `LiveDataPanel` shows "RSS ingestion complete: 0 new articles" (misleading success)
- `live-data-ingester` — All live data buttons (OpenSky, AIS, EONET, FIRMS, NOAA) show success with 0 records
- `ai-analysis-agent` — Correlation analysis returns no analysis but shows "No correlations found" (looks like it worked)
- `useBackgroundIngestion` — Polls every 10s, always gets `{ success: true }`, counts 0 records each cycle

The user sees success toasts for operations that do absolutely nothing.

### 🟠 BUG-005: ChannelMock.unsubscribe() does not remove listeners
**File:** `src/lib/localStore.ts`, lines 471-474  
**Details:** `ChannelMock.unsubscribe()` returns `Promise.resolve()` but never calls `store.unsubscribe()` to remove the listeners registered in `.subscribe()`. This means:
- Every time a component mounts/unmounts (e.g. `useDataSources`, `ActivityFeed`), new listeners accumulate
- Listeners from unmounted components keep firing, causing stale `queryClient.invalidateQueries()` calls
- Memory leak grows over time with navigation

**Fix:** Track the registered listeners in the ChannelMock and remove them in `unsubscribe()`.

---

## 3. DATA FLOW & INGESTION BUGS

### 🟠 BUG-006: `useBackgroundIngestion` polls edge functions that return nothing
**File:** `src/hooks/useBackgroundIngestion.ts`, lines 58-80  
**Details:** The hook calls `supabase.functions.invoke("live-data-ingester", ...)` every 10 seconds for OpenSky, AIS, and NOAA. With the mock client, this:
- Generates console spam: `[localStore] functions.invoke("live-data-ingester") — returning mock response` every 10s × 3 sources = 30 log lines/minute
- `data?.ingested` is always `undefined` (mock returns `{ success: true }`, not `{ ingested: N }`), so `cycleIngested` stays 0
- Never shows toast (the `if (cycleIngested > 0)` guard prevents it)
- But the `cycleCount` increments forever, suggesting activity to the user

### 🟠 BUG-007: Burst/stress test simulation creates race conditions
**File:** `src/pages/IngestPage.tsx`, lines 147-156  
**Details:** The "Burst: Generate 5" and "Stress Test: Generate 20" buttons use:
```ts
for (let i = 0; i < 5; i++) setTimeout(handleSimulate, i * 300);
```
Problems:
1. `handleSimulate` is called in a closure that captures the current `ingest` mutation — the `disabled={ingest.isPending}` check only prevents clicking while ONE mutation is pending, but `setTimeout` fires independently
2. Each `handleSimulate` call creates a new `ingest.mutate()` — React Query doesn't queue mutations by default, so multiple can fire concurrently
3. Each call generates a new random title/priority, but all share the same mutation instance, so `onSuccess` toasts may interleave or overwrite each other
4. The `disabled` prop becomes stale after the first mutation completes, allowing the user to trigger overlapping bursts

### 🟡 BUG-008: `useDataProductStats` fetches ALL rows to compute counts
**File:** `src/hooks/useDataProducts.ts`, lines 59-79  
**Details:** The stats query does:
```ts
const { data } = await supabase.from("data_products").select("status, priority, source_type");
```
With no `.limit()`, this fetches every row in the table. For large datasets, this transfers massive payloads to the client just to count statuses. With a real Supabase backend, this should use `.count()` or a database view/RPC.

### 🟡 BUG-009: `useSearchDataProducts` fires on every keystroke with no debounce
**File:** `src/hooks/useDataProducts.ts`, lines 82-99; `src/pages/DiscoveryPage.tsx`, line 12  
**Details:** The search query triggers on every character typed:
```ts
const [query, setQuery] = useState(...);
const { data } = useSearchDataProducts(query);
```
There's no debounce — every keystroke fires a Supabase query. With the local store this is fine, but with a real backend this would hammer the API.

### 🟡 BUG-010: `priority_score` jitter in simulation can go negative
**File:** `src/pages/IngestPage.tsx`, line 72  
**Details:**
```ts
priority_score: priorityScores[randomPriority] + (Math.random() * 0.1 - 0.05),
```
For `routine` (score 0.1), the jitter range is `[0.05, 0.15]`. For `low` (0.3), range is `[0.25, 0.35]`. These are fine. But conceptually, scores should be clamped to `[0, 1]`. If someone adds a priority with score 0.0, this would produce negative scores.

### 🟡 BUG-011: Confidence score is random, not based on actual data quality
**File:** `src/pages/IngestPage.tsx`, lines 39 and 71  
**Details:** Both manual and simulated ingestion set:
```ts
confidence_score: Math.random() * 0.3 + 0.7
```
This always produces 70-100% confidence regardless of actual data. For manual ingestion, a user would expect to set this themselves.

---

## 4. TYPE SAFETY & TYPESCRIPT ISSUES

### 🟠 BUG-012: Pervasive `as any` casts bypass type checking
**Files:** Multiple  
**Details:** The codebase is riddled with `as any` casts that disable TypeScript's safety:
- `src/integrations/supabase/client.ts:6` — `localSupabase as any` (hides entire API mismatch)
- `src/hooks/useDataSources.ts:58` — `source as any` on insert
- `src/hooks/useDataSources.ts:68` — `updates as any` on update
- `src/hooks/useCorrelationAlerts.ts:38` — `{ acknowledged: true } as any`
- `src/hooks/useEmergencyTriggers.ts:85` — `{ is_active: false, deactivated_at: ... } as any`
- `src/hooks/useCommanderIntents.ts:25` — `intent as any`
- `src/hooks/useCommanderIntents.ts:35` — `{ is_active } as any`
- `src/hooks/useCorrelations.ts:119` — `{ ... } as any` on manual correlation insert
- `src/pages/SourcesPage.tsx:21` — `{ id, status } as any`
- `src/pages/IngestPage.tsx:117` — `e.target.value as any` (×2)

These casts would hide real bugs if the local store or Supabase schema changes.

### 🟠 BUG-013: `DataSource` type manually defined instead of using generated types
**File:** `src/hooks/useDataSources.ts`, lines 4-22  
**Details:** `DataSource` is manually declared as an interface, while `useDataProducts.ts` correctly uses `Database["public"]["Tables"]["data_products"]["Row"]`. If the Supabase schema changes, the manual `DataSource` type will silently drift out of sync.

### 🟡 BUG-014: `DataSourceInsert` omits fields that may have no DB defaults
**File:** `src/hooks/useDataSources.ts`, line 24  
**Details:**
```ts
type DataSourceInsert = Omit<DataSource, "id" | "created_at" | "updated_at" | "total_ingested" | "retry_count">;
```
This requires `status`, `last_heartbeat`, `last_error`, `auth_credentials`, `config` to be provided. But `useCreateDataSource` accepts `Partial<DataSourceInsert>` (line 56), so these could be `undefined`. If the database doesn't have defaults for `auth_credentials` and `config` (JSONB), inserts may fail with NOT NULL violations.

### 🟡 BUG-015: `as unknown as` double-cast on query results
**Files:** `src/hooks/useDataSources.ts:52`, `src/hooks/useCorrelationAlerts.ts:14`, `src/hooks/useEmergencyTriggers.ts:44,55,65,76`, `src/hooks/useCommanderIntents.ts:13`  
**Details:** Pattern `data as unknown as SomeType[]` is used extensively. This bypasses TypeScript's structural checking entirely. If the actual row shape doesn't match the interface, no error is raised at compile time.

---

## 5. UI/UX BUGS

### 🟠 BUG-016: SourceForm silently swallows creation errors
**File:** `src/components/sources/SourceForm.tsx`, line 42  
**Details:**
```ts
onError: (err: any) => {},
```
When source creation fails, the error handler is empty — no toast, no console log, no user feedback. The form just sits there with no indication of failure.

**Fix:** Add `toast.error("Failed to create source: " + err.message)`.

### 🟠 BUG-017: Unused imports in SourcesPage
**File:** `src/pages/SourcesPage.tsx`, lines 3-11  
**Details:** These imports are declared but never used in the component:
- `Input` (line 4)
- `supabase` (line 6)
- `Camera, FileText, Waves, Rss, Trash2, Power, PowerOff, RefreshCw, AlertTriangle, CheckCircle2, Activity, Clock, Hash, Satellite, Ship, Plane, Download, Globe2, Flame` (lines 8-11)
- `formatDistanceToNow` (line 12)

This bloats the bundle and triggers linter warnings.

### 🟡 BUG-018: Stats panel uses fixed 4-column grid without responsive breakpoints
**File:** `src/pages/SourcesPage.tsx`, line 41  
**Details:**
```html
<div className="grid grid-cols-4 gap-4">
```
On mobile screens (< 640px), 4 columns is too narrow. Should be `grid-cols-2 sm:grid-cols-4` or similar.

### 🟡 BUG-019: `CorrelationPanel` overlaps page content as a fixed sidebar
**File:** `src/components/CorrelationPanel.tsx`, line 73  
**Details:** The panel is `fixed inset-y-0 right-0 z-50 w-[520px]`. On viewports < 520px wide, it covers the entire screen with no way to scroll the main content. There's no overlay/backdrop to indicate the rest of the page is blocked. On mobile, this is completely unusable.

### 🟡 BUG-020: "Related by Location" panel stacks under CorrelationPanel with z-index fight
**File:** `src/pages/DiscoveryPage.tsx`, lines 76-98  
**Details:** The geo-siblings panel is `fixed bottom-0 right-0 z-[51] w-[520px]`. It renders OVER the bottom of the CorrelationPanel (z-50). These two fixed panels overlap, potentially hiding the CorrelationPanel's lower content.

### 🟡 BUG-021: `liveAlerts` state in AlertsPanel accumulates duplicates
**File:** `src/components/AlertsPanel.tsx`, lines 13, 22-29  
**Details:** `liveAlerts` state stores alerts from realtime, but `allAlerts` (line 38) only uses `alerts` from the query hook (not `liveAlerts`). The `liveAlerts` state is written to but never read — it's dead code. Meanwhile, when `refetch()` runs, the query result already contains the new alert, so the component re-renders correctly. The `liveAlerts` state is vestigial and wastes memory.

### 🟡 BUG-022: `newCount` in ActivityFeed never resets
**File:** `src/components/ActivityFeed.tsx`, line 26  
**Details:** `setNewCount((c) => c + 1)` increments on every INSERT event, but there's no mechanism to reset it (e.g., when the user scrolls to the top or clicks a "dismiss" button). The badge grows indefinitely.

### 🔵 BUG-023: `handleNewAlert` uses `toast.error` for non-error alerts
**File:** `src/components/AlertsPanel.tsx`, line 25  
**Details:** All correlation alerts use `toast.error()` (red error toast), even for low-confidence `related` or `semantic` matches. Should use `toast.warning()` for non-critical matches and reserve `toast.error()` for `cross_source` or `exact` high-score matches.

### 🔵 BUG-024: Pie chart in Index.tsx has no legend
**File:** `src/pages/Index.tsx`, lines 128-137  
**Details:** The "Source Types" pie chart renders colored slices but has no legend or labels to identify which color maps to which source type. Users can only identify slices by hovering (tooltip).

---

## 6. OBSERVER / MEMORY LEAK ISSUES

### 🟠 BUG-025: IntersectionObserver elements are never unobserved
**Files:** `src/components/DataProductTable.tsx:77`, `src/components/ActivityFeed.tsx:116`  
**Details:** The pattern is:
```tsx
ref={unseen ? (el) => { if (el) observe(el); } : undefined}
```
When `unseen` flips to `false` (item is seen), the ref changes to `undefined`, but the element is never `unobserve()`d from the IntersectionObserver. The observer continues tracking the DOM element even after it's marked as seen. Over time with long lists, this accumulates observed elements that will never trigger meaningful callbacks.

**Fix:** Use `useEffect` cleanup or call `unobserve()` in the visibility callback after marking seen.

### 🟡 BUG-026: `useVisibilityTracker` recreates observer on every `onVisible` change
**File:** `src/hooks/useSeenItems.ts`, lines 53-66  
**Details:** The `useEffect` that creates the `IntersectionObserver` has `[onVisible]` as a dependency. In `DataProductTable`, `onVisible` is:
```ts
useCallback((id: string) => markSeen(id), [markSeen])
```
Since `markSeen` is stable (from `useCallback` with `[]` deps), this is actually fine. But in `ActivityFeed`, the same pattern is used and `markSeen` is also stable. However, if a consumer passes an unstable callback, the observer would be destroyed and recreated on every render, losing all tracked elements.

---

## 7. CORRELATION SYSTEM GAPS

### 🔴 BUG-027: Entire correlation pipeline is non-functional
**Files:** `src/hooks/useCorrelationAnalysis.ts`, `src/hooks/useCorrelationAlerts.ts`  
**Details:** The correlation system requires:
1. `supabase.functions.invoke("ai-analysis-agent")` — returns mock `{ success: true }`, no analysis ever runs
2. `correlation_alerts` table — exists in local store but is always empty (nothing creates alerts)
3. Commander's Intent matching — requires a backend trigger/edge function to scan ingested data against intent terms; with the mock, this never happens
4. Detection results — `detection_results` table is always empty

The entire correlation/alerting pipeline is inert. Users can define Commander's Intent terms and ingest data, but no alerts are ever generated because the matching logic lives in edge functions that are mocked.

### 🟠 BUG-028: `useDeleteDataProduct` doesn't clean up `manual_correlations`
**File:** `src/hooks/useCorrelations.ts`, lines 146-156  
**Details:** The cascade delete cleans up `detection_results`, `correlation_alerts`, `processing_queue`, `event_bus`, and `metadata_tags`, but does NOT delete from `manual_correlations` where the product is either `source_product_id` or `target_product_id`. This leaves orphaned manual correlation records.

**Fix:** Add:
```ts
await supabase.from("manual_correlations").delete().eq("source_product_id", id);
await supabase.from("manual_correlations").delete().eq("target_product_id", id);
```

### 🟠 BUG-029: `useAcknowledgeAlert` doesn't invalidate query cache
**File:** `src/hooks/useCorrelationAlerts.ts`, lines 37-44  
**Details:** `useAcknowledgeAlert` returns a plain async function, not a `useMutation`. It updates the database but never calls `queryClient.invalidateQueries()`. The caller (`AlertsPanel`) manually calls `refetch()`, but this is fragile — if any other component displays the alert, it won't update.

**Fix:** Convert to `useMutation` with `onSuccess: () => qc.invalidateQueries({ queryKey: ["correlation_alerts"] })`.

### 🟡 BUG-030: `useRealtimeAlerts` has potential stale-closure problem
**File:** `src/hooks/useCorrelationAlerts.ts`, lines 22-34  
**Details:** The `useEffect` depends on `[onNewAlert]`, and the realtime handler calls `onNewAlert(payload.new)`. If `onNewAlert` changes identity between renders (unstable reference), the old subscription remains active with the old callback while a new one is created. The `AlertsPanel` wraps it in `useCallback` with `[refetch]` as a dep — if `refetch` changes identity, this triggers a re-subscription.

### 🟡 BUG-031: Geo-correlation runs O(n²) DBSCAN on every render cycle
**File:** `src/lib/geoCorrelation.ts`, lines 170-240  
**Details:** `computeGeoClusters` runs a full DBSCAN with `regionQuery` doing O(n) distance checks per point, called O(n) times = O(n²). With `limit(1000)` products, this is up to 1,000,000 haversine calculations. The `useMemo` in `useGeoCorrelation` only guards against `geoProducts` reference changes, but `refetchInterval: 30_000` re-fetches every 30s, producing a new array reference each time → full O(n²) recompute every 30 seconds.

Additionally, `GeoCorrelationBadge` is rendered per-row in `DataProductTable`, each calling `useGeoCorrelation()` independently — but since they share the same React Query cache key, they share data (OK). However, each badge runs its own `useMemo` for `getClusterForProduct`, which iterates all clusters.

---

## 8. DATA INTEGRITY ISSUES

### 🟠 BUG-032: Local store `insert` overwrites user-provided `id` ordering
**File:** `src/lib/localStore.ts`, lines 34-43  
**Details:**
```ts
const newRow = {
  id: row.id || crypto.randomUUID(),
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
  ...row,  // ← spread AFTER defaults
};
```
The spread `...row` comes AFTER the defaults, so if `row` contains `id: undefined`, it will overwrite the generated UUID with `undefined`. This is because `{ id: 'uuid', ...{ id: undefined } }` produces `{ id: undefined }` in JavaScript.

**Fix:** Filter out undefined values from `row` before spreading, or spread row first then apply defaults for missing keys.

### 🟡 BUG-033: Local store has no unique constraint enforcement
**File:** `src/lib/localStore.ts`  
**Details:** The local store is a plain array — there's no enforcement of unique constraints. If the same commander intent `term` is added twice, or the same manual correlation is created twice, duplicates accumulate without error. A real Supabase backend would reject these with constraint violations.

### 🟡 BUG-034: Local store `localStorage` has ~5MB limit
**File:** `src/lib/localStore.ts`, lines 18-21  
**Details:** All data is serialized to `localStorage` via `JSON.stringify`. With 1000+ data products (each containing content JSON, coordinates, etc.), this can easily exceed the 5MB localStorage quota. The `save()` method catches the error silently:
```ts
try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tables)); } catch {}
```
When this fails, new data is held in memory but lost on page refresh — silent data loss.

### 🟡 BUG-035: `useDataProducts` and `useAllGeoProducts` fetch overlapping data
**File:** `src/hooks/useDataProducts.ts`, lines 8-29  
**Details:** `useDataProducts()` fetches 500 products, `useAllGeoProducts()` fetches 1000 geo-located products. Components using both (directly or transitively) load up to 1500 rows of largely overlapping data. With a real backend, this doubles network traffic unnecessarily.

---

## 9. MISSING FEATURES / INCOMPLETE IMPLEMENTATIONS

### 🟠 BUG-036: No authentication or authorization
**File:** `src/lib/localStore.ts`, line 533  
**Details:** `auth.getSession()` always returns `{ session: null }`. There is no login flow, no RLS (Row Level Security), and no user context. Any user can see and modify all data.

### 🟠 BUG-037: RSS ingestion, live data ingestion, and AI analysis are entirely mocked
**Files:** `src/components/sources/LiveDataPanel.tsx`, `src/hooks/useBackgroundIngestion.ts`, `src/hooks/useCorrelationAnalysis.ts`  
**Details:** All edge function calls (`rss-ingester`, `live-data-ingester`, `ai-analysis-agent`) go to the mock which returns empty success. No actual data is ever fetched from external APIs (BBC RSS, OpenSky, AIS, NASA EONET, NASA FIRMS, NOAA). The entire live data panel is non-functional.

### 🟡 BUG-038: SourceForm has no validation beyond empty name
**File:** `src/components/sources/SourceForm.tsx`, lines 25-43  
**Details:** The form only checks `if (!name.trim()) return`. There's no validation for:
- Endpoint URL format (could be any string)
- Negative or zero max retries / retry delay
- Auth type selected but no credentials provided
- Duplicate source names

### 🟡 BUG-039: No pagination on any data table
**Files:** `src/hooks/useDataProducts.ts`, `src/components/DataProductTable.tsx`  
**Details:** All queries use `.limit(50)` to `.limit(1000)` but there's no "Load More" or pagination UI. Users with more data than the limit will never see older items.

### 🟡 BUG-040: `useBackgroundIngestion` is defined but never mounted
**File:** `src/hooks/useBackgroundIngestion.ts`  
**Details:** The hook is exported but grep of the codebase shows no component imports or uses it. The background polling system is dead code — never started.

### 🔵 BUG-041: No loading/error states for correlation analysis
**File:** `src/hooks/useCorrelationAnalysis.ts`  
**Details:** `analyzeCorrelations` returns `null` on error after showing a toast. There's no `error` state exposed from the hook — callers can't display inline error messages or retry buttons.

### 🔵 BUG-042: Commander's Intent has no bulk import/export
**File:** `src/pages/CommanderIntentPage.tsx`  
**Details:** Intents can only be added one at a time via the form. For tactical scenarios with dozens of watch terms, there's no CSV import, paste-multiple, or export functionality.

---

## 10. PERFORMANCE CONCERNS

### 🟡 BUG-043: `GeoCorrelationBadge` creates a `useGeoCorrelation` hook per table row
**File:** `src/components/GeoCorrelationBadge.tsx`, `src/components/DataProductTable.tsx:92`  
**Details:** Each row in the data table renders a `<GeoCorrelationBadge>` which calls `useGeoCorrelation()`. While React Query deduplicates the fetch, each badge instantiates its own `useMemo` for cluster computation. With 500 rows, this creates 500 useMemo computations of `getClusterForProduct`, each iterating all clusters × all members.

### 🟡 BUG-044: DBSCAN `seedSet.includes(nb)` is O(n) per check
**File:** `src/lib/geoCorrelation.ts`, line 227  
**Details:**
```ts
if (!seedSet.includes(nb)) { seedSet.push(nb); }
```
`Array.includes()` is O(n) on the seed set. For dense clusters, this makes the inner DBSCAN loop O(n²) within the already O(n²) algorithm, potentially O(n³) worst case.

**Fix:** Use a `Set` for O(1) lookups.

### 🔵 BUG-045: Local store `save()` serializes entire database on every write
**File:** `src/lib/localStore.ts`, line 27  
**Details:** Every `insert`, `update`, and `delete` calls `this.save()` which does `JSON.stringify(this.tables)` — serializing ALL tables. During burst ingestion (20 products), this runs 20 full serializations in rapid succession.

---

## 11. MISCELLANEOUS ISSUES

### 🟡 BUG-046: `handleToggle` in SourcesPage doesn't handle "error" → "active" transition safely
**File:** `src/pages/SourcesPage.tsx`, lines 19-22  
**Details:**
```ts
const newStatus = source.status === "active" ? "inactive" : "active";
```
If `source.status === "error"`, toggling sets it to `"active"`. But no error-clearing logic runs — `last_error` persists, `retry_count` isn't reset. The source would show as "active" but still display the old error message.

### 🟡 BUG-047: `confirm()` used for destructive actions instead of custom dialog
**Files:** `src/pages/SourcesPage.tsx:25`, `src/components/CorrelationPanel.tsx:62`  
**Details:** `window.confirm()` is a blocking browser dialog that breaks the UI flow, can't be styled, and may be suppressed by some browsers. Should use a custom confirmation dialog (e.g., AlertDialog from shadcn/ui).

### 🔵 BUG-048: `DataProductTable` local interface doesn't include all fields used by parent
**File:** `src/components/DataProductTable.tsx`, lines 8-18  
**Details:** The `DataProduct` interface defined locally in the table component is a subset of the full type — it's missing `content`, `latitude`, `longitude`, `priority_reasoning`, etc. This means the table can't be easily extended to show these fields without updating the local interface. Should import the canonical type.

### 🔵 BUG-049: `useSearchDataProducts` returns all products when query is empty
**File:** `src/hooks/useDataProducts.ts`, lines 84-91  
**Details:** When `query.trim()` is empty, it fetches the latest 50 products ordered by `created_at`. When there IS a query, it orders by `priority_score`. This inconsistent ordering means the list jumps between two different sort orders as the user types/clears the search field.

### ⚪ BUG-050: Multiple duplicate `SOURCE_TYPE_OPTIONS` definitions
**Files:** `src/components/sources/SourceCard.tsx:4-12`, `src/components/sources/SourceForm.tsx:5-13`  
**Details:** The same source type options array is defined independently in two files. If a new source type is added, both must be updated. Should be extracted to a shared constant.

---

## SUMMARY

| Severity | Count | Key Areas |
|----------|-------|-----------|
| 🔴 Critical | 4 | Secrets in git, no real backend, non-functional edge functions, dead correlation pipeline |
| 🟠 High | 10 | Silent error swallowing, memory leaks, missing cascade deletes, race conditions, mock data |
| 🟡 Medium | 17 | Type safety, performance, missing validation, no pagination, UI responsiveness |
| 🔵 Low | 5 | Toast misuse, missing legends, dead code |
| ⚪ Info | 1 | Code duplication |
| **Total** | **37 unique issues** | |

### Top 5 Actions Required
1. **Rotate all secrets immediately** — every API key in `.env` is compromised via git history
2. **Restore real Supabase client** or acknowledge app is demo-only — the local store mock makes ALL backend features non-functional
3. **Fix ChannelMock listener leak** — causes growing memory consumption and stale callbacks
4. **Add `manual_correlations` cleanup to `useDeleteDataProduct`** — orphaned records will accumulate
5. **Add error handling to `SourceForm.onError`** — users get zero feedback on creation failure
