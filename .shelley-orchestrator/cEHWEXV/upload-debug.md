# Upload & Process Page — Debug Findings

## Runtime Error (observed in browser)

**Error message**: `Could not find the table 'public.data_products' in the schema cache`  
**Supabase error code**: `PGRST205`  
**When it occurs**: Step 1 of `processFile()` — the `supabase.from("data_products").insert(...)` call.

### Reproduction
1. Navigate to `/upload`
2. Upload any file (document, video, or audio)
3. The Processing Queue shows: **ERROR — Could not find the table 'public.data_products' in the schema cache**

---

## Root Cause: Supabase API Key Type

### The Key
```
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY="sb_publishable_laUETnIXs8HNBGx4S5Cv1Q_7HQdtPVb"
```

This is an `sb_publishable_` key, NOT a standard Supabase anon JWT key (which starts with `eyJ...`).

### Evidence

| Test | Result |
|------|--------|
| `curl .../rest/v1/data_products?select=id&limit=1` with publishable key | `PGRST205` — table not found in schema cache |
| `curl .../rest/v1/` (schema listing) with publishable key | `"Access to schema is forbidden"` |
| `curl .../auth/v1/settings` with publishable key | **Works** — returns auth settings JSON |
| `curl .../rest/v1/rpc/current_role` with publishable key | `PGRST202` — function not found in schema cache |

### Diagnosis

The `sb_publishable_` key is a newer Supabase Gateway key type. It:
- ✅ Is accepted by the Supabase Gateway (`sb-gateway-version: 1`)
- ✅ Has access to Auth endpoints
- ❌ Does NOT have PostgREST Data API access
- ❌ Cannot see any tables or functions in the `public` schema

The publishable key's database role does not have `GRANT USAGE ON SCHEMA public` or `GRANT SELECT/INSERT/UPDATE` on the application tables. The migrations only created RLS policies for the `anon` role.

The Supabase client code in `src/integrations/supabase/client.ts` reads:
```ts
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';
```

The env var name `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` itself is wrong — the standard convention is `VITE_SUPABASE_ANON_KEY`. There is no JWT anon key (`eyJ...`) anywhere in the project.

---

## Additional Code Bugs Found

### Bug 1: `processFile` useCallback missing dependencies (stale closure)

**File**: `src/pages/UploadPage.tsx`, line ~236  
**Code**:
```ts
const processFile = useCallback(async (file: File, idx: number) => {
  // ... uses uploadLat and uploadLng state variables
  ...(uploadLat && uploadLng ? { latitude: parseFloat(uploadLat), longitude: parseFloat(uploadLng) } : {}),
  ...
}, [updateUpload]);  // ❌ Missing uploadLat, uploadLng
```

**Impact**: If a user types lat/lng coordinates and then uploads, the coordinates won't be included because `processFile` captured the initial empty-string values.

**Fix**: Add `uploadLat` and `uploadLng` to the dependency array:
```ts
}, [updateUpload, uploadLat, uploadLng]);
```

### Bug 2: Upload index collision on sequential batches (race condition)

**File**: `src/pages/UploadPage.tsx`, `handleFileSelect`  
**Code**:
```ts
const baseIdx = uploads.length;  // captured but NEVER USED
setUploads((prev) => [...newUploads, ...prev]);  // prepends
files.forEach((file, i) => {
  setTimeout(() => processFile(file, i), i * 300);  // uses raw index i
});
```

**Impact**: When a second batch of files is uploaded while the first batch is still processing:
- New items are prepended, shifting all existing indices
- The first batch's `processFile` callbacks (which captured old indices) now point to the wrong items
- Status updates get applied to wrong files in the queue

**Fix**: Use unique IDs instead of array indices for tracking uploads.

### Bug 3: Audio files misclassified as "image" 

**File**: `src/pages/UploadPage.tsx`, `processFile`  
**Code**:
```ts
const isVideo = file.type.startsWith("video/");
const isDoc = file.type === "application/pdf" || ...;
const sourceType = isVideo ? "video" : isDoc ? "document" : "image";
```

**Impact**: Audio files (`audio/*`) don't match either `isVideo` or `isDoc`, so they fall through to `sourceType = "image"`. They get processed by `processDocumentLocally()` which only reads the filename. The `source_type` enum doesn't include `"audio"` — closest valid values would be `"sensor"` or `"sigint"`.

**Note**: This won't cause a crash ("image" is a valid enum value) but produces incorrect metadata.

### Bug 4: `as any` casts hiding type mismatches

**File**: `src/pages/UploadPage.tsx`  
Multiple `as any` casts are used to bypass TypeScript checking:
```ts
source_type: sourceType as any,
status: "processing" as any,
priority: "medium" as any,
```

These are actually valid enum values, so the casts aren't hiding bugs here. But the `correlation_alerts` insert also uses `as any`:
```ts
await supabase.from("correlation_alerts").insert({ ... } as any)
```
The correlation_alerts insert is missing the required fields per the DB schema — but the `.catch(() => {})` swallows any error silently.

### Bug 5: `event_bus` insert uses `as any` and has `offset_id: never` in schema

**File**: `src/pages/UploadPage.tsx`  
The `event_bus` table has `offset_id` typed as `never` for Insert (auto-generated), which is correct. But the insert is wrapped in `as any` and `.catch(() => {})`, so errors are silently swallowed.

---

## Summary of Blocking vs Non-Blocking Issues

| # | Bug | Severity | Blocking? |
|---|-----|----------|-----------|
| 0 | **Supabase publishable key has no Data API access** | Critical | ✅ YES — all uploads fail |
| 1 | processFile stale closure (missing deps) | Medium | No — only affects geo-coordinates |
| 2 | Index collision on sequential uploads | Medium | No — only affects multi-batch uploads |
| 3 | Audio files misclassified as "image" | Low | No — doesn't crash, just wrong metadata |
| 4 | `as any` casts on correlation_alerts | Low | No — errors are caught |
| 5 | Silent error swallowing on event_bus | Low | No — non-critical side effect |

## Required Fix

The **only blocking fix** is the Supabase API key. The `sb_publishable_` key does not have PostgREST schema access. Options:

1. **Replace the key** with a proper Supabase anon JWT key (`eyJ...`) that has the `anon` role
2. **Add database GRANTs** for the publishable key's role on all required tables (requires DB admin access, which we don't have from this VM — direct DB connections are blocked by network)
3. **Route through Edge Functions** instead of direct Data API calls (major refactor)

The non-blocking bugs (1-5) should also be fixed for correctness.

### DB Access Status

- **Direct DB connection** (`db.eijzksdaciunejjrgpoa.supabase.co`): Only has AAAA (IPv6) DNS record; VM has no IPv6 connectivity → **unreachable**
- **Supabase Pooler** (`aws-0-*.pooler.supabase.com`): Returns `FATAL: Tenant or user not found` → **misconfigured or different region**
- **Supabase REST API** (via HTTPS): Reachable, but publishable key gets `PGRST205` on all tables
- **Supabase Auth API** (via HTTPS): Reachable and working
- **Supabase Management API**: Requires JWT, publishable key rejected with "JWT could not be decoded"
- **Supabase CLI**: No access token configured (`supabase login` not done)

**Conclusion**: We cannot fix the DB grants from this VM. The correct Supabase anon JWT key must be provided and set as `VITE_SUPABASE_ANON_KEY` in `.env`.
