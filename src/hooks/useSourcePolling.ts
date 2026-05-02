/**
 * useSourcePolling — Polls active custom data sources and creates data_products.
 *
 * When a data source has status "active" and an endpoint_url, this hook
 * periodically fetches the endpoint, extracts items from the response,
 * and inserts them as data_products into the local store.
 */

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataSources, type DataSource } from "@/hooks/useDataSources";
import { computePriorityScore, scoreToPriorityLevel } from "@/lib/priorityScoring";

/** Default polling interval: 60 seconds */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** Max items to ingest per poll cycle per source */
const MAX_ITEMS_PER_POLL = 25;

/**
 * Attempt to extract an array of items from an API response.
 * Tries common JSON structures: array at root, .data, .results, .items, .features
 * Also supports the JSONPath-like config hint from the source.
 */
function extractItems(body: any, jsonPath?: string | null): any[] {
  if (!body) return [];

  // If the user provided a simple dotted path like "data.results"
  if (jsonPath) {
    const simplified = jsonPath.replace(/^\$\.?/, "").replace(/\[\*\]$/g, "");
    if (simplified) {
      let obj = body;
      for (const key of simplified.split(".")) {
        if (obj && typeof obj === "object" && key in obj) {
          obj = obj[key];
        } else {
          obj = null;
          break;
        }
      }
      if (Array.isArray(obj)) return obj;
    }
  }

  // Auto-detect common shapes
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.features)) return body.features; // GeoJSON
  if (Array.isArray(body?.records)) return body.records;
  if (Array.isArray(body?.entries)) return body.entries;
  if (Array.isArray(body?.states)) return body.states; // OpenSky
  if (Array.isArray(body?.locations)) return body.locations;

  // Single object — wrap it
  if (typeof body === "object" && !Array.isArray(body)) return [body];
  return [];
}

/** Extract a title from an item, trying common field names */
function extractTitle(item: any, sourceName: string, index: number): string {
  if (typeof item === "string") return item.slice(0, 120);
  return (
    item.title ||
    item.name ||
    item.label ||
    item.summary ||
    item.headline ||
    item.subject ||
    item.description?.slice(0, 80) ||
    item.text?.slice(0, 80) ||
    `${sourceName} item #${index + 1}`
  );
}

/** Extract lat/lon from an item */
function extractCoords(
  item: any,
  defaultLat?: number,
  defaultLon?: number
): { lat: number | null; lon: number | null } {
  const lat =
    item.latitude ?? item.lat ?? item.geometry?.coordinates?.[1] ?? item.location?.lat ?? defaultLat ?? null;
  const lon =
    item.longitude ?? item.lon ?? item.lng ?? item.geometry?.coordinates?.[0] ?? item.location?.lon ?? item.location?.lng ?? defaultLon ?? null;
  return {
    lat: lat != null ? Number(lat) : null,
    lon: lon != null ? Number(lon) : null,
  };
}

/** Extract text content for priority scoring */
function extractContent(item: any): string {
  if (typeof item === "string") return item;
  return [
    item.title, item.description, item.summary, item.text, item.content, item.body, item.message,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Build auth headers from source config */
function buildHeaders(source: DataSource): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
  };
  const creds = source.auth_credentials as Record<string, any> || {};
  switch (source.auth_type) {
    case "api_key":
      if (creds.api_key) headers[creds.header_name || "X-API-Key"] = creds.api_key;
      break;
    case "basic":
      if (creds.username) headers["Authorization"] = `Basic ${btoa(`${creds.username}:${creds.password || ""}`)}`;
      break;
    case "bearer":
      if (creds.token) headers["Authorization"] = `Bearer ${creds.token}`;
      break;
  }
  // Custom headers from config
  const custom = (source.config as any)?.custom_headers;
  if (custom && typeof custom === "object") {
    for (const [k, v] of Object.entries(custom)) {
      if (k && typeof v === "string") headers[k] = v;
    }
  }
  return headers;
}

async function pollSource(source: DataSource): Promise<number> {
  if (!source.endpoint_url) return 0;

  const headers = buildHeaders(source);
  const config = source.config as Record<string, any> || {};
  const requestBody = config.request_body_template;

  const fetchOpts: RequestInit = {
    method: requestBody ? "POST" : "GET",
    headers,
    signal: AbortSignal.timeout(15000),
  };
  if (requestBody) {
    (fetchOpts.headers as Record<string, string>)["Content-Type"] = "application/json";
    fetchOpts.body = typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
  }

  let res: Response;
  try {
    res = await fetch(source.endpoint_url, fetchOpts);
  } catch {
    // Try CORS proxy fallback
    res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(source.endpoint_url)}`,
      { signal: AbortSignal.timeout(15000) }
    );
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  const items = extractItems(body, config.response_jsonpath);
  if (items.length === 0) return 0;

  const defaultLat = config.default_latitude ? Number(config.default_latitude) : undefined;
  const defaultLon = config.default_longitude ? Number(config.default_longitude) : undefined;

  let ingested = 0;
  for (const item of items.slice(0, MAX_ITEMS_PER_POLL)) {
    const title = extractTitle(item, source.name, ingested);
    const content = extractContent(item);
    const { lat, lon } = extractCoords(item, defaultLat, defaultLon);
    const priorityScore = computePriorityScore(title + " " + content);
    const priorityLevel = scoreToPriorityLevel(priorityScore);

    try {
      const { error } = await supabase.from("data_products").insert({
        title,
        source_type: source.source_type === "rest_api" ? "sensor" : source.source_type,
        source_identifier: source.name,
        status: "ingested",
        priority: priorityLevel,
        priority_score: priorityScore,
        confidence_score: 0.65,
        latitude: lat,
        longitude: lon,
        content: typeof item === "object" ? item : { text: String(item) },
      } as any);
      if (!error) ingested++;
    } catch {
      // skip individual item errors
    }
  }

  return ingested;
}

/**
 * Hook that automatically polls all active data sources with endpoint URLs.
 * Runs in the background while the Sources page (or any page importing it) is mounted.
 */
export function useSourcePolling() {
  const { data: sources } = useDataSources();
  const queryClient = useQueryClient();
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollingSources = useRef<Set<string>>(new Set());

  const doPoll = useCallback(
    async (source: DataSource) => {
      // Guard against concurrent polls of the same source
      if (pollingSources.current.has(source.id)) return;
      pollingSources.current.add(source.id);

      try {
        const ingested = await pollSource(source);
        if (ingested > 0) {
          // Update source heartbeat & total
          try {
            await supabase
              .from("data_sources")
              .update({
                last_heartbeat: new Date().toISOString(),
                total_ingested: (source.total_ingested || 0) + ingested,
                last_error: null,
              } as any)
              .eq("id", source.id);
          } catch {}

          queryClient.invalidateQueries({ queryKey: ["data_products"] });
          queryClient.invalidateQueries({ queryKey: ["data_products_geo"] });
          queryClient.invalidateQueries({ queryKey: ["data_sources"] });
          queryClient.invalidateQueries({ queryKey: ["data_product_stats"] });
          queryClient.invalidateQueries({ queryKey: ["queue_products"] });
          console.log(`[SourcePolling] ${source.name}: ingested ${ingested} items`);
        }
      } catch (err: any) {
        console.warn(`[SourcePolling] ${source.name} failed:`, err.message);
        try {
          await supabase
            .from("data_sources")
            .update({
              last_heartbeat: new Date().toISOString(),
              last_error: err.message,
              retry_count: (source.retry_count || 0) + 1,
            } as any)
            .eq("id", source.id);
          queryClient.invalidateQueries({ queryKey: ["data_sources"] });
        } catch {}
      } finally {
        pollingSources.current.delete(source.id);
      }
    },
    [queryClient]
  );

  useEffect(() => {
    const activeSources = (sources || []).filter(
      (s) => s.status === "active" && s.endpoint_url
    );
    const activeIds = new Set(activeSources.map((s) => s.id));

    // Clear intervals for sources that are no longer active
    for (const [id, interval] of intervalsRef.current.entries()) {
      if (!activeIds.has(id)) {
        clearInterval(interval);
        intervalsRef.current.delete(id);
      }
    }

    // Start intervals for newly active sources
    for (const source of activeSources) {
      if (!intervalsRef.current.has(source.id)) {
        const config = source.config as Record<string, any> || {};
        const intervalMs = ((config.polling_interval_seconds ?? 60) * 1000) || DEFAULT_POLL_INTERVAL_MS;

        // Immediate first poll
        doPoll(source);

        // Then poll at interval
        const timer = setInterval(() => doPoll(source), intervalMs);
        intervalsRef.current.set(source.id, timer);
      }
    }

    // Cleanup on unmount
    return () => {
      for (const interval of intervalsRef.current.values()) {
        clearInterval(interval);
      }
      intervalsRef.current.clear();
    };
  }, [sources, doPoll]);
}
