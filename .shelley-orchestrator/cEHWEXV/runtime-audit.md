# Runtime Audit — Tactical Insight Stream (MDG v2)

**Date:** 2025-07-28  
**Dev Server:** http://localhost:8080 (Vite 5.4.19)  
**Status:** ✅ Running

---

## 1. Dev Server Health

| Check | Result |
|-------|--------|
| Vite dev server responds | ✅ HTTP 200, HTML with `#root` rendered |
| HMR / WebSocket connected | ✅ `[vite] connected.` in console |
| React mounts successfully | ✅ Full DOM rendered (24KB+ in `#root`) |

## 2. Route-by-Route Loading

All 12 routes + catch-all return HTTP 200 and render correctly:

| Route | HTTP | Browser Render | Notes |
|-------|------|----------------|-------|
| `/` (Dashboard) | ✅ 200 | ✅ Full render | Operations Dashboard with stats cards, charts, recent data |
| `/ingest` | ✅ 200 | ✅ | Data Ingestion page |
| `/upload` | ✅ 200 | ✅ | Upload & Process page |
| `/map` | ✅ 200 | ✅ Full render | Map View with storm threat, bayou sensors, Ops Map/GPS Jamming tabs |
| `/discovery` | ✅ 200 | ✅ | Discovery page |
| `/analytics` | ✅ 200 | ✅ | Analytics page |
| `/queue` | ✅ 200 | ✅ | Processing Queue |
| `/sources` | ✅ 200 | ✅ Full render | Data Sources with 6 live free data source cards (RSS, OpenSky, AIS, NASA EONET, FIRMS, NOAA) |
| `/intent` | ✅ 200 | ✅ | Commander's Intent page |
| `/alerts` | ✅ 200 | ✅ | Alerts page |
| `/pipeline` | ✅ 200 | ✅ Full render | Event Pipeline with Kafka-compatible event bus, stats cards |
| `/media` | ✅ 200 | ✅ | Media Player page |
| `/*` (404) | ✅ 200 | ✅ | NotFound catch-all |

## 3. Supabase Connectivity

| Check | Result |
|-------|--------|
| Supabase URL format | ✅ `https://eijzksdaciunejjrgpoa.supabase.co` |
| Supabase reachable | ⚠️ HTTP 404 on base URL (normal for Supabase projects) |
| REST API reachable | ⚠️ HTTP 401 — `"Access to schema is forbidden"` — API key rejected |
| Key format | ⚠️ Non-standard: `sb_publishable_...` (not the typical `eyJ...` JWT format) |
| **Impact** | 🟡 **Low** — App uses a **local in-memory store** (`src/lib/localStore.ts`) as a drop-in Supabase replacement. The Supabase client module exports `localSupabase as any`. Data persists via `localStorage`. The app is fully functional without a live Supabase backend. |

## 4. TypeScript Compilation

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ **Zero errors** — Clean compilation |

## 5. Production Build

| Check | Result |
|-------|--------|
| `vite build` | ✅ **Builds successfully** in ~28s |
| Bundle size | ⚠️ Main chunk is **2,161 KB** (645 KB gzipped) — exceeds 500 KB warning |
| CSS warning | ⚠️ `@import must precede all other statements` in `index.css` — `@import url(fonts)` appears after `@tailwind` directives |
| Browserslist | ℹ️ Data 9 months old — `npx update-browserslist-db@latest` recommended |

## 6. Test Suite

| Check | Result |
|-------|--------|
| `vitest run` | ✅ **35 tests passed** across 4 test files (6.1s) |
| Test files | `ingestedData.test.ts` (7), `streamTypes.test.ts` (17), `priorityScoring.test.ts` (10), `example.test.ts` (1) |

## 7. Dependency Health

| Check | Result |
|-------|--------|
| `npm ls --depth=0` | ✅ **No errors, no warnings, no missing deps** |
| Problematic dep | ⚠️ `puppeteer` (v24.40.0) is a **production dependency** but is never imported in `src/`. It's a 300MB+ server-side browser automation tool that bloats `node_modules` and should be removed or moved to `devDependencies`. |
| React Router v6 deprecations | ⚠️ Console warnings about `v7_startTransition` and `v7_relativeSplatPath` future flags — prep needed for v7 migration |

## 8. Error Handling in Hooks

Error handling patterns found in hooks (all look reasonable):

| File | Pattern |
|------|---------|
| `useCorrelationAnalysis.ts:48` | `catch (err: any)` → `console.error("Correlation analysis error:", err)` |
| `useBackgroundIngestion.ts:66` | `catch (err: unknown)` — properly typed |
| `useVLMMonitor.ts:338` | `catch (err)` → `console.error(...)` |

**No unhandled promise rejections or missing error boundaries detected at runtime.**

## 9. Code Quality Markers

| Check | Result |
|-------|--------|
| `TODO/FIXME/HACK/BUG/BROKEN` in src/ | ✅ **None found** |
| `console.error` usage | ✅ Appropriate — only in catch blocks |
| Error boundaries | ⚠️ **None found** — no React ErrorBoundary components. A crash in any component will white-screen the whole app. |

## 10. Import Health

| Check | Result |
|-------|--------|
| `@/` path alias imports | ✅ 221 imports across src/ — all resolve correctly |
| Missing source files | ✅ **None** — all referenced hooks, components, and lib files exist |
| Circular dependencies | Not detected at build time |

## 11. React Pattern Check

| Check | Result |
|-------|--------|
| `useState(undefined)` | ✅ Only 1 instance: `use-mobile.tsx` — standard pattern for SSR-safe mobile detection |
| `useEffect([])` (empty deps) | ✅ None found — hooks use proper dependency arrays |

## 12. Console Errors at Runtime

| Check | Result |
|-------|--------|
| Console errors on `/` | ✅ None |
| Console errors on `/sources` | ✅ None |
| Console errors on `/map` | ✅ None |
| Console errors on `/pipeline` | ✅ None |
| Console warnings | ⚠️ 2 React Router v6 deprecation warnings (see §7) |

---

## Summary

### ✅ What's Working Well
- All 12 routes load without crashes
- Zero TypeScript errors
- All 35 tests pass
- No missing dependencies or broken imports
- Clean error handling in hooks
- No TODO/FIXME debt markers
- Local store fallback works seamlessly without Supabase

### ⚠️ Issues to Address (Priority Order)

1. **CSS `@import` order** (Quick fix) — Move the Google Fonts `@import` in `src/index.css` to the top of the file, before `@tailwind` directives. This is a CSS spec violation that causes a build warning.

2. **No React Error Boundaries** (Medium) — Add at least a top-level `<ErrorBoundary>` wrapper in `App.tsx` to prevent full white-screen crashes.

3. **Bundle size: 2.1 MB main chunk** (Medium) — Use `React.lazy()` + `Suspense` for route-level code splitting. The map (Leaflet), charts (Recharts), and media player (hls.js/vidstack) pages are heavy and should be lazy-loaded.

4. **Remove `puppeteer` from production deps** (Quick fix) — It's unused in frontend code and adds massive bloat. Remove it or move to `devDependencies` if needed for tooling.

5. **Supabase API key is non-functional** (Low priority) — The `sb_publishable_` key format is rejected by Supabase REST API. This is currently mitigated by the local store fallback, but will need fixing when switching to a real backend.

6. **React Router v7 migration prep** (Low priority) — Add future flags `v7_startTransition` and `v7_relativeSplatPath` to `<BrowserRouter>` to silence warnings and prepare for upgrade.

7. **Update browserslist database** (Trivial) — Run `npx update-browserslist-db@latest`.
