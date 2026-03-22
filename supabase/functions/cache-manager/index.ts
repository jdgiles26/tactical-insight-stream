import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Cache Manager Edge Function
 *
 * Provides Redis-like caching for polled data sources using Supabase storage
 * as the persistence layer. This prevents excessive API calls during development
 * and respects rate limits on free public APIs.
 *
 * Actions:
 * - get: Retrieve cached data for a source
 * - set: Store data for a source with TTL
 * - invalidate: Clear cache for a source
 * - list: List all cached sources
 */

interface CacheEntry {
  source: string;
  data: any;
  cached_at: string;
  ttl_seconds: number;
  expires_at: string;
}

const DEFAULT_TTL = 3600; // 1 hour default TTL

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || "get";
    const source = body.source;
    const data = body.data;
    const ttl = body.ttl || DEFAULT_TTL;

    if (action === "get") {
      if (!source) {
        return jsonResponse({ error: "source parameter required" }, 400);
      }

      // Check if we have cached data that hasn't expired
      const { data: cached, error } = await supabase
        .from("api_cache")
        .select("*")
        .eq("source", source)
        .single();

      if (error || !cached) {
        return jsonResponse({ cached: false, data: null });
      }

      const expiresAt = new Date(cached.expires_at);
      const now = new Date();

      if (expiresAt < now) {
        // Cache expired, delete it
        await supabase.from("api_cache").delete().eq("source", source);
        return jsonResponse({ cached: false, data: null, expired: true });
      }

      return jsonResponse({
        cached: true,
        data: cached.data,
        cached_at: cached.cached_at,
        expires_at: cached.expires_at,
        age_seconds: Math.floor((now.getTime() - new Date(cached.cached_at).getTime()) / 1000),
      });
    }

    if (action === "set") {
      if (!source || !data) {
        return jsonResponse({ error: "source and data parameters required" }, 400);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const cacheEntry: CacheEntry = {
        source,
        data,
        cached_at: now.toISOString(),
        ttl_seconds: ttl,
        expires_at: expiresAt.toISOString(),
      };

      // Upsert cache entry
      const { error } = await supabase
        .from("api_cache")
        .upsert(cacheEntry, { onConflict: "source" });

      if (error) {
        console.error("Cache set error:", error);
        return jsonResponse({ error: "Failed to cache data" }, 500);
      }

      return jsonResponse({
        success: true,
        source,
        cached_at: cacheEntry.cached_at,
        expires_at: cacheEntry.expires_at,
        ttl_seconds: ttl,
      });
    }

    if (action === "invalidate") {
      if (!source) {
        return jsonResponse({ error: "source parameter required" }, 400);
      }

      const { error } = await supabase
        .from("api_cache")
        .delete()
        .eq("source", source);

      if (error) {
        return jsonResponse({ error: "Failed to invalidate cache" }, 500);
      }

      return jsonResponse({ success: true, invalidated: source });
    }

    if (action === "list") {
      const { data: caches, error } = await supabase
        .from("api_cache")
        .select("source, cached_at, expires_at, ttl_seconds")
        .order("cached_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: "Failed to list caches" }, 500);
      }

      const now = new Date();
      const enriched = (caches || []).map((c: any) => ({
        ...c,
        expired: new Date(c.expires_at) < now,
        age_seconds: Math.floor((now.getTime() - new Date(c.cached_at).getTime()) / 1000),
      }));

      return jsonResponse({ caches: enriched });
    }

    return jsonResponse({ error: "Unknown action. Use: get, set, invalidate, list" }, 400);
  } catch (err) {
    console.error("Cache manager error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
