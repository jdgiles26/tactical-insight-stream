import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { localSupabase } from '@/lib/localStore';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Use real Supabase client only when we have a valid JWT anon key (starts with 'eyJ').
// The current project has an sb_publishable_* key which PostgREST does not accept,
// so we fall back to a comprehensive localStorage-backed client.
const useRealClient = SUPABASE_KEY.startsWith('eyJ');

export const supabase: any = useRealClient
  ? createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : localSupabase;

if (!useRealClient) {
  console.info(
    '[Supabase] Using localStorage-backed client — no valid JWT key found.\n' +
    'All data persists in browser localStorage under key "mdg_local_store".'
  );
}
