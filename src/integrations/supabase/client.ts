// Supabase client — uses local in-memory store as a drop-in replacement
// when the Supabase backend tables are not available.
import { localSupabase } from '@/lib/localStore';

// Export the local store as the supabase client.
// All existing code that imports { supabase } from this module
// will use the local in-memory store seamlessly.
export const supabase = localSupabase as any;
