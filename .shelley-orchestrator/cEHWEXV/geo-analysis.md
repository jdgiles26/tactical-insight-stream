# Geo-Correlation Code Analysis

Generated from complete read of all relevant source files.

---

## 1. Exact Schema: `data_products`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | NO | PK |
| `title` | `string` | NO | |
| `source_type` | `enum source_type` | NO | Default exists |
| `source_identifier` | `string` | YES | |
| `status` | `enum data_status` | NO | |
| `priority` | `enum priority_level` | YES | |
| `priority_score` | `number` | YES | 0-1 float |
| `priority_reasoning` | `string` | YES | |
| `confidence_score` | `number` | YES | 0-1 float |
| `content` | `Json` | YES | Arbitrary JSON blob |
| **`latitude`** | **`number`** | **YES** | **Decimal degrees** |
| **`longitude`** | **`number`** | **YES** | **Decimal degrees** |
| `created_at` | `string` (timestamp) | NO | |
| `updated_at` | `string` (timestamp) | NO | |

**Key geo observations:**
- `latitude` and `longitude` are **top-level nullable columns** on `data_products` — already in the DB schema.
- No PostGIS `geography`/`geometry` column exists. No spatial index mentioned.
- No `region`, `area_of_interest`, `geo_cluster_id`, or proximity-related columns exist.

---

## 2. Exact Schema: `correlation_alerts`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | NO | PK |
| `intent_id` | `string` | NO | FK → `commander_intents.id` |
| `data_product_id` | `string` | NO | FK → `data_products.id` |
| `detection_id` | `string` | YES | FK → `detection_results.id` |
| `match_type` | `string` | NO | Values: `exact`, `related`, `semantic`, `cross_source` |
| `match_score` | `number` | YES | 0-1 float |
| `matched_term` | `string` | NO | The commander intent term that matched |
| `matched_label` | `string` | NO | The detection label that matched |
| `acknowledged` | `boolean` | NO | Default false |
| `created_at` | `string` (timestamp) | NO | |

**Key observations:**
- No geo fields on `correlation_alerts` at all.
- Correlations are purely **text/label-based** (commander intent term ↔ detection label).
- No `proximity_km`, `geo_cluster_id`, or spatial correlation type exists.
- The `match_type` enum includes `cross_source` but has no `spatial` or `geo_proximity` value.

---

## 3. Related Schemas

### `manual_correlations`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `source_product_id` | UUID | FK → data_products |
| `target_product_id` | UUID | FK → data_products |
| `correlation_type` | string | Default: "manual" |
| `justification` | string | nullable |
| `confidence` | number | nullable |
| `created_at` | timestamp | |

No geo fields here either.

### `data_sources`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | string | |
| `source_type` | string | Free-form (not the enum) |
| `endpoint_url` | string | nullable |
| `auth_type` | string | nullable |
| `auth_credentials` | Json | nullable |
| `config` | Json | nullable |
| `status` | string | "active", "inactive", "error" |
| `retry_count` | number | |
| `max_retries` | number | |
| `retry_delay_seconds` | number | |
| `last_heartbeat` | timestamp | nullable |
| `last_error` | string | nullable |
| `total_ingested` | number | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

No geo fields on data_sources.

### `mission_groups` (higher-level grouping)
- `group_name`, `trigger_id`, `confidence`, `risk_level`, `correlation_method`, `summary`, `prediction` (Json), `metadata` (Json)
- Connected to `group_evidence` which links to data_products and registry entries
- No geo fields

---

## 4. Enum Values

### `source_type` (data_products)
```
"sensor" | "cot_message" | "image" | "video" | "document" | "sigint" | "humint" | "geoint"
```

### `data_status`
```
"ingested" | "processing" | "tagged" | "prioritized" | "transported" | "archived"
```

### `priority_level`
```
"critical" | "high" | "medium" | "low" | "routine"
```

---

## 5. How Search Works in DiscoveryPage

**File:** `src/pages/DiscoveryPage.tsx` + `src/hooks/useDataProducts.ts` (`useSearchDataProducts`)

- User types in a text input field.
- `useSearchDataProducts(query)` hook is called.
- If query is empty: fetches latest 50 data_products ordered by `created_at` desc.
- If query has text: uses `supabase.from("data_products").select("*").ilike("title", `%${query}%`)` — **title-only ilike search**, ordered by `priority_score` desc, limited to 50.
- **No geo search capability exists** — no spatial filtering, no radius search, no location-based discovery.
- Clicking a row opens `CorrelationPanel` as a side drawer showing alerts, detections, manual links, and related products for that item.

---

## 6. How the Map Currently Plots Data

**File:** `src/pages/MapPage.tsx` + `useAllGeoProducts()` hook

### Data Fetching
- `useAllGeoProducts()` fetches up to 1000 data_products where `latitude IS NOT NULL AND longitude IS NOT NULL`, ordered by `created_at` desc.
- Auto-refreshes every 15 minutes.

### Map Library: **Leaflet** (`L` from `leaflet`)
- Uses CARTO dark basemap tiles.
- Circle markers (not clustered) — each product with lat/lng gets one `L.circleMarker`.

### Marker Styling
- Color based on `priority`: critical=#e04848, high=#e8a020, medium=#3ea8d8, low=#2db87a, routine=#6b7280.
- Special handling for bayou water level sensors (`content.sensor_type === "bayou_water_level"`) — different colors, dashed outline, larger radius.
- Radius: critical=12, high=10, bayou=9, others=6.

### Popup Content
- Shows: title, source_type, source_identifier, priority_score, water level details (for bayou sensors), priority_reasoning.

### Viewport
- Centers on average lat/lng of all geo products.
- Fits bounds to all markers with 40px padding.
- Default center if no data: `[34.0, -117.0]`.

### Second Tab: GPS Jamming
- Embeds gpsjam.org iframe.

### **What's missing:**
- **No marker clustering** (MarkerClusterGroup not used).
- **No spatial grouping or proximity visualization.**
- **No click-to-correlate from map.**
- **No heat map or density view.**
- **No radius/area search.**
- **No lines/connections between correlated points.**

---

## 7. How Correlation Currently Works

### Pipeline-Level Correlation (`pipeline-orchestrator` edge function, "correlation" stage)

1. Fetches all active `commander_intents` (terms of interest).
2. Fetches `detection_results` for the current data_product.
3. **Exact/token-overlap matching:** For each intent term × each detection label, checks if one contains the other (case-insensitive). Creates alert with `match_type: "exact"` or `"related"`.
4. **Semantic similarity** (if HuggingFace API key is set): Uses sentence-transformers to compute similarity between unmatched intent terms and detection labels. Creates `match_type: "semantic"` alerts for scores > 0.6.
5. Inserts all generated alerts into `correlation_alerts` table.

**Critically: NO spatial/geographic correlation exists in the pipeline.** The correlation stage only compares text labels.

### AI Correlation Analysis (`ai-analysis-agent` edge function)

- `useCorrelationAnalysis()` hook invokes the `ai-analysis-agent` function with `type: "correlation"` and `context: ["spatial", "temporal", "thematic"]`.
- The agent fetches the 50 most recent data_products and sends them to Claude with a prompt asking for "spatial, temporal, thematic" correlations.
- The AI response may mention spatial relationships, but **no actual distance calculations, geo-clustering, or spatial algorithms are used** — it's purely LLM-based pattern matching on the JSON data.
- Returns `CorrelationResult[]` with `source_id`, `correlation_type`, `confidence`, `description`.

### Manual Correlations (`useCorrelations.ts`)

- Users can manually link two data_products via `manual_correlations` table.
- `useDataProductCorrelations(productId)` fetches: correlation_alerts for the product, detection_results, manual_correlations (both directions), and "related products" (other products sharing the same commander intent matches).
- Related products are found by: getting intent_ids from this product's alerts → finding other products' alerts with same intent_ids → fetching those products.

---

## 8. `IngestedData` Canonical Model

**File:** `src/lib/ingestedData.ts`

Defines a TypeScript interface with `lat: number` and `lon: number` fields. The `toIngestedData()` mapper reads from `product.latitude` and `product.longitude`, defaulting to 0.

Also includes:
- `militaryRelevance` (computed from keyword matching)
- `threatLevel` (mapped from priority string)
- `sentiment` (simple keyword analysis)
- `entities` (passed in from detection results)

This model is a **read-only view** — it's not written back to the DB.

---

## 9. Data Sources Structure

**File:** `src/hooks/useDataSources.ts` + `src/pages/SourcesPage.tsx`

- Data sources have a free-form `source_type` string (not the enum).
- Sources can be toggled active/inactive.
- Each source tracks `total_ingested`, `last_heartbeat`, `last_error`.
- Source configuration is stored in `config` (Json) and `auth_credentials` (Json).
- The SourcesPage shows stats (total, active, errors, total ingested) and source cards.
- A `LiveDataPanel` component handles real-time data ingestion.
- No geo fields on data_sources.

---

## 10. Existing Geographic Clustering or Proximity Logic

### **Answer: NONE EXISTS**

There is:
- ❌ No Haversine distance calculation anywhere in the codebase
- ❌ No spatial clustering algorithm (DBSCAN, k-means, grid-based)
- ❌ No proximity-based correlation alerts
- ❌ No geo-fencing or area-of-interest definitions
- ❌ No PostGIS extensions or spatial SQL functions
- ❌ No `ST_DWithin`, `ST_Distance`, or any spatial queries
- ❌ No Leaflet MarkerClusterGroup plugin
- ❌ No map-based search or filtering
- ❌ No visual connections/lines between nearby correlated products on the map

The only geo-related code:
- ✅ `latitude`/`longitude` columns exist on `data_products`
- ✅ `useAllGeoProducts()` filters for products with non-null lat/lng
- ✅ Leaflet map renders individual circle markers per product
- ✅ AI analysis agent's prompt mentions "spatial" correlation but does no actual spatial math
- ✅ `IngestedData` model has `lat`/`lon` fields

---

## 11. Summary of Gaps for Geo-Correlation Feature

To implement geographic correlation, the following would need to be built:

1. **Distance calculation utility** — Haversine formula for lat/lng distance in km
2. **Spatial clustering** — Group nearby data products (e.g., DBSCAN with configurable radius)
3. **New correlation_alerts match_type** — Add `"geo_proximity"` or `"spatial"` value
4. **Geo fields on correlation_alerts** — Optional: `proximity_km`, `geo_cluster_id`
5. **Pipeline integration** — Add spatial correlation step in pipeline-orchestrator
6. **Map visualization** — Cluster markers, draw connections between correlated points, heat maps
7. **Spatial search** — Search by radius from a point, or within a bounding box
8. **Optional: PostGIS** — For server-side spatial queries at scale (not required for small datasets)
