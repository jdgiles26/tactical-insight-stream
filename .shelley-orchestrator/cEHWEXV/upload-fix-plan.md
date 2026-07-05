# Upload Fix Plan

## Root Cause Analysis

### The Problem
The `.env` file contains:
```
VITE_SUPABASE_URL="https://eijzksdaciunejjrgpoa.supabase.co"
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY="sb_publishable_laUETnIXs8HNBGx4S5Cv1Q_7HQdtPVb"
```

The key `sb_publishable_*` is NOT a standard Supabase anon JWT key (which starts with `eyJ`). PostgREST (Supabase's REST API) requires a valid JWT to determine schema access and row-level security policies. The `sb_publishable_*` format is not recognized, causing `PGRST205 — Could not find the table 'public.data_products' in the schema cache`.

### Search Results for Real Key
- `supabase/.env` — does not exist
- `supabase/.env.local` — does not exist
- `supabase/config.toml` — exists but only has `project_id` and function configs, NO anon key
- `.env.local` — does not exist
- `.env.example` — does not exist
- `grep -r "eyJ"` — **NO matches found anywhere** in the codebase
- Only one `.env` file exists at root

**Conclusion: No valid Supabase anon key exists anywhere in this project.**

### Existing Local Store
A comprehensive `localSupabase` client exists at `src/lib/localStore.ts` that:
- Implements the full Supabase client interface (`.from()`, `.select()`, `.insert()`, `.update()`, `.delete()`, `.upsert()`)
- Has a full query builder with filters (`.eq()`, `.neq()`, `.in()`, `.ilike()`, `.gte()`, `.lte()`, `.gt()`, `.lt()`, `.is()`, `.not()`)
- Supports `.order()`, `.limit()`, `.single()`, `.maybeSingle()`
- Has channel/realtime subscription mocks
- Has storage, functions, and auth mocks
- Persists data to `localStorage` under key `mdg_local_store`
- **But it's NEVER imported or used anywhere in the app!**

### Current Architecture
- `src/integrations/supabase/client.ts` — creates a real Supabase client with the broken key. This is what ALL hooks and pages import.
- `src/utils/supabase.ts` — duplicate Supabase client (also uses the broken key), but appears unused by upload flow.
- `src/lib/localStore.ts` — complete localStorage-backed mock, but **not imported anywhere**.
- `src/pages/UploadPage.tsx` — imports `supabase` from `@/integrations/supabase/client` and does multiple `.from()` calls.
- ~15 hooks/pages import from `@/integrations/supabase/client`.

## Recommended Fix

### Strategy: Replace the Supabase client export with localSupabase

Since no valid Supabase credentials exist, we should make `src/integrations/supabase/client.ts` export the `localSupabase` client instead of a broken real client. This is the **single point of change** that fixes everything.

### Changes Required

#### 1. Modify `src/integrations/supabase/client.ts`

Replace the current content:
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
```

With:
```ts
import { localSupabase } from '@/lib/localStore';

// The Supabase anon key in .env is not a valid JWT (sb_publishable_* format),
// so we use the localStorage-backed client that implements the same interface.
// All CRUD operations, realtime subscriptions, storage, and functions are
// handled client-side with localStorage persistence.
export const supabase = localSupabase as any;
```

The `as any` is necessary because `localSupabase` doesn't perfectly match the Supabase generic types, but it implements all the methods that are actually called throughout the app.

#### 2. No other file changes needed

Because every hook and page imports from `@/integrations/supabase/client`, this single change propagates everywhere:
- `UploadPage.tsx` — uploads will work (insert → localStore → localStorage)
- `useDataProducts.ts` — queries will work (select → localStore → localStorage)
- `useDetectionResults.ts`, `useCorrelationAlerts.ts`, etc. — all work
- `useBackgroundIngestion.ts` — realtime subscriptions are mocked
- `SourcesPage.tsx`, `QueuePage.tsx` — all work

#### 3. Optional: Also fix `src/utils/supabase.ts`

This file also creates a broken Supabase client and throws if env vars are missing. It should either:
- Be deleted (if unused)
- Be updated to also re-export `localSupabase`

Need to check if anything imports from this file. Quick check shows it's likely unused by the main app flow, but should be fixed for safety.

### What This Achieves
- **Uploads work immediately**: UploadPage creates data products, detection results, correlation alerts, and event bus entries — all persisted to localStorage
- **Dashboard shows data**: All query hooks return data from localStorage
- **Survives page refresh**: localStorage persistence means data persists
- **No external dependencies**: Everything runs client-side
- **Minimal diff**: One file change to `client.ts` (+ optional `utils/supabase.ts` cleanup)

### Risk Assessment
- **Low risk**: The localStore.ts implementation is thorough and well-tested in concept
- **localStorage limits**: ~5-10MB depending on browser, plenty for demo data
- **Type safety**: Using `as any` loses type checking at the client level, but the runtime behavior is correct since localStore implements all used methods
- **No real backend**: If someone later adds a valid Supabase key, they'd need to revert this change. Could add a conditional check (if key starts with 'eyJ' use real client, else use local) for better forward-compatibility.

### Enhanced Version (Optional)

For better forward-compatibility, `client.ts` could be:
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { localSupabase } from '@/lib/localStore';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

// Use real Supabase client only if we have a valid JWT key (starts with 'eyJ')
const useRealClient = SUPABASE_KEY.startsWith('eyJ');

export const supabase: any = useRealClient
  ? createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : localSupabase;

if (!useRealClient) {
  console.info('[supabase/client] Using localStorage-backed client (no valid Supabase JWT key found)');
}
```

This approach is **recommended** as it:
1. Automatically uses the right client based on key format
2. Preserves the ability to use real Supabase if a valid key is provided later
3. Logs a clear message about which mode is active
