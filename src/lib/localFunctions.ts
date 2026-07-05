/**
 * Local implementations of Supabase Edge Functions.
 *
 * This module provides real data-fetching logic for the "live-data-ingester"
 * and "rss-ingester" function mocks so that the LiveDataPanel and
 * useBackgroundIngestion hook actually produce data_products.
 */

import { fetchAndParseRss } from "@/lib/webScraper";
import { RSS_FEED_CATALOG } from "@/lib/rssFeedCatalog";

// ── Types ──────────────────────────────────────────────────────────

type Row = Record<string, any>;

/** Callback that inserts rows into the local store. */
export type StoreInsertFn = (table: string, rows: Row[]) => Row[];

// ── Region bounding boxes for OpenSky ──────────────────────────────

const REGION_BOUNDS: Record<string, { lamin: number; lomin: number; lamax: number; lomax: number }> = {
  caribbean_corridor:   { lamin: 10, lomin: -85, lamax: 25, lomax: -60 },
  gulf_of_mexico:       { lamin: 18, lomin: -98, lamax: 31, lomax: -80 },
  south_america_north:  { lamin: -5, lomin: -80, lamax: 13, lomax: -50 },
  puerto_rico_usvi:     { lamin: 17, lomin: -68, lamax: 19, lomax: -64 },
  us_east_coast:        { lamin: 25, lomin: -82, lamax: 45, lomax: -66 },
  us_west_coast:        { lamin: 32, lomin: -130, lamax: 49, lomax: -115 },
  europe_med:           { lamin: 30, lomin: -10, lamax: 55, lomax: 40 },
  middle_east:          { lamin: 12, lomin: 30, lamax: 42, lomax: 63 },
  east_asia:            { lamin: 20, lomin: 100, lamax: 45, lomax: 145 },
  south_china_sea:      { lamin: 0, lomin: 100, lamax: 25, lomax: 125 },
  horn_of_africa:       { lamin: -5, lomin: 35, lamax: 18, lomax: 55 },
  indo_pacific:         { lamin: -15, lomin: 90, lamax: 20, lomax: 140 },
};

// ── NOAA Gulf Coast stations ────────────────────────────────────────

const NOAA_STATIONS: { id: string; name: string; lat: number; lon: number }[] = [
  { id: "8761724", name: "Grand Isle, LA",         lat: 29.2633, lon: -89.9573 },
  { id: "8760922", name: "Pilots Station East, LA", lat: 28.9322, lon: -89.4075 },
  { id: "8764227", name: "LAWMA, Amerada Pass, LA", lat: 29.4496, lon: -91.3381 },
  { id: "8768094", name: "Calcasieu Pass, LA",      lat: 29.7682, lon: -93.3429 },
  { id: "8770570", name: "Sabine Pass, TX",         lat: 29.7284, lon: -93.8701 },
  { id: "8771013", name: "Eagle Point, TX",         lat: 29.4810, lon: -94.9180 },
  { id: "8771450", name: "Galveston Pier 21, TX",   lat: 29.3101, lon: -94.7935 },
  { id: "8775237", name: "Port Aransas, TX",        lat: 27.8397, lon: -97.0725 },
  { id: "8779770", name: "Port Isabel, TX",         lat: 26.0612, lon: -97.2155 },
  { id: "8726520", name: "St Petersburg, FL",       lat: 27.7606, lon: -82.6269 },
  { id: "8729108", name: "Panama City, FL",         lat: 30.1524, lon: -85.6671 },
  { id: "8729840", name: "Pensacola, FL",           lat: 30.4044, lon: -87.2112 },
  { id: "8735180", name: "Dauphin Island, AL",      lat: 30.2500, lon: -88.0750 },
  { id: "8747437", name: "Bay Waveland, MS",        lat: 30.3256, lon: -89.3256 },
  { id: "8761305", name: "Shell Beach, LA",         lat: 29.8683, lon: -89.6731 },
];

// ── Shared helpers ─────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;

/** fetch with a timeout */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function makeProduct(overrides: Partial<Row>): Row {
  return {
    id: crypto.randomUUID(),
    status: "ingested",
    priority: "low",
    confidence_score: 0.5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── OpenSky ─────────────────────────────────────────────────────────

async function ingestOpenSky(
  insert: StoreInsertFn,
  region: string,
): Promise<number> {
  const bounds = REGION_BOUNDS[region] ?? REGION_BOUNDS.caribbean_corridor;
  const url =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${bounds.lamin}&lomin=${bounds.lomin}&lamax=${bounds.lamax}&lomax=${bounds.lomax}`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    console.warn(`[localFunctions] OpenSky returned ${res.status}`);
    return 0;
  }

  const json = await res.json();
  const states: any[] = json?.states ?? [];

  // Limit to 50 to keep the local store manageable
  const limited = states.slice(0, 50);
  if (limited.length === 0) return 0;

  const rows = limited.map((s: any) => {
    // OpenSky state vector indices:
    // 0=icao24, 1=callsign, 2=origin, 5=longitude, 6=latitude,
    // 7=baro_altitude, 9=velocity, 10=heading, 13=squawk
    const callsign = (s[1] || "").trim() || s[0] || "UNKNOWN";
    const lat = s[6] ?? null;
    const lon = s[5] ?? null;
    const altitude = s[7] ?? s[13] ?? null;
    const velocity = s[9] ?? null;
    const heading = s[10] ?? null;
    const onGround = s[8] ?? false;

    return makeProduct({
      title: `Aircraft: ${callsign}`,
      source_type: "sensor",
      source_identifier: `opensky:${s[0]}`,
      latitude: lat,
      longitude: lon,
      content: {
        icao24: s[0],
        callsign,
        origin_country: s[2],
        altitude,
        velocity,
        heading,
        on_ground: onGround,
        region,
        data_source: "opensky",
      },
    });
  });

  insert("data_products", rows);
  return rows.length;
}

// ── AIS (Finland Digitraffic) ──────────────────────────────────────

async function ingestAis(insert: StoreInsertFn): Promise<number> {
  const url = "https://meri.digitraffic.fi/api/ais/v1/locations";
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    console.warn(`[localFunctions] Digitraffic AIS returned ${res.status}`);
    return 0;
  }

  const json = await res.json();
  const features: any[] = json?.features ?? [];

  // Limit to 50
  const limited = features.slice(0, 50);
  if (limited.length === 0) return 0;

  const rows = limited.map((f: any) => {
    const props = f.properties || {};
    const coords = f.geometry?.coordinates ?? [null, null];
    const mmsi = props.mmsi || f.mmsi || "UNKNOWN";

    return makeProduct({
      title: `Vessel MMSI: ${mmsi}`,
      source_type: "sensor",
      source_identifier: `ais:${mmsi}`,
      latitude: coords[1],
      longitude: coords[0],
      content: {
        mmsi,
        sog: props.sog,
        cog: props.cog,
        heading: props.heading,
        nav_status: props.navStat,
        timestamp: props.timestampExternal,
        data_source: "ais_tracker",
      },
    });
  });

  insert("data_products", rows);
  return rows.length;
}

// ── NOAA Water Levels ──────────────────────────────────────────────

async function ingestNoaaWater(insert: StoreInsertFn): Promise<number> {
  const rows: Row[] = [];

  // Fetch all stations in parallel, tolerate individual failures
  const results = await Promise.allSettled(
    NOAA_STATIONS.map(async (station) => {
      const url =
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
        `?date=latest&station=${station.id}&product=water_level` +
        `&datum=MLLW&units=english&time_zone=gmt&application=MDG&format=json`;

      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;

      const json = await res.json();
      const data = json?.data;
      if (!Array.isArray(data) || data.length === 0) return null;

      const latest = data[data.length - 1];
      const waterLevel = parseFloat(latest.v);
      const sigma = parseFloat(latest.s) || null;

      return makeProduct({
        title: `Water Level: ${station.name} (${isNaN(waterLevel) ? "N/A" : waterLevel.toFixed(2)} ft)`,
        source_type: "sensor",
        source_identifier: `noaa:${station.id}`,
        latitude: station.lat,
        longitude: station.lon,
        priority: waterLevel > 3 ? "high" : waterLevel > 1.5 ? "medium" : "low",
        content: {
          station_id: station.id,
          station_name: station.name,
          water_level_ft: waterLevel,
          sigma,
          measurement_time: latest.t,
          datum: "MLLW",
          data_source: "noaa_water",
        },
      });
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      rows.push(r.value);
    }
  }

  if (rows.length > 0) {
    insert("data_products", rows);
  }
  return rows.length;
}

// ── NASA EONET ─────────────────────────────────────────────────────

async function ingestNasaEonet(insert: StoreInsertFn): Promise<number> {
  const url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20";
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    console.warn(`[localFunctions] NASA EONET returned ${res.status}`);
    return 0;
  }

  const json = await res.json();
  const events: any[] = json?.events ?? [];
  if (events.length === 0) return 0;

  const rows = events.map((evt: any) => {
    // Get most recent geometry point
    const geo = evt.geometry?.[evt.geometry.length - 1];
    const coords = geo?.coordinates ?? [null, null];
    const category = evt.categories?.[0]?.title ?? "Natural Event";

    return makeProduct({
      title: `${category}: ${evt.title}`,
      source_type: "sensor",
      source_identifier: `eonet:${evt.id}`,
      latitude: coords[1],
      longitude: coords[0],
      priority: category.toLowerCase().includes("severe") || category.toLowerCase().includes("volcano") ? "high" : "medium",
      content: {
        eonet_id: evt.id,
        category,
        description: evt.description || null,
        link: evt.link,
        sources: evt.sources?.map((s: any) => s.url),
        geometry_date: geo?.date,
        data_source: "nasa_eonet",
      },
    });
  });

  insert("data_products", rows);
  return rows.length;
}

// ── NASA FIRMS (fire data) ─────────────────────────────────────────

async function ingestNasaFirms(
  insert: StoreInsertFn,
  region: string,
): Promise<number> {
  // FIRMS requires a MAP_KEY for CSV/JSON downloads. Fall back to the
  // open FIRMS RSS/KML or generate synthetic fire-watch points based
  // on the EONET fire events.
  const url =
    "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=30&category=wildfires";

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    console.warn(`[localFunctions] NASA FIRMS/EONET returned ${res.status}`);
    return 0;
  }

  const json = await res.json();
  const events: any[] = json?.events ?? [];
  if (events.length === 0) return 0;

  const bounds = REGION_BOUNDS[region];

  const rows: Row[] = [];
  for (const evt of events) {
    const geo = evt.geometry?.[evt.geometry.length - 1];
    const lon = geo?.coordinates?.[0];
    const lat = geo?.coordinates?.[1];
    if (lat == null || lon == null) continue;

    // Filter to requested region if we have bounds
    if (bounds) {
      if (lat < bounds.lamin || lat > bounds.lamax || lon < bounds.lomin || lon > bounds.lomax) {
        continue;
      }
    }

    rows.push(
      makeProduct({
        title: `Fire: ${evt.title}`,
        source_type: "sensor",
        source_identifier: `firms:${evt.id}`,
        latitude: lat,
        longitude: lon,
        priority: "high",
        content: {
          eonet_id: evt.id,
          category: "Wildfire",
          link: evt.link,
          geometry_date: geo?.date,
          data_source: "nasa_firms",
        },
      }),
    );
  }

  if (rows.length > 0) {
    insert("data_products", rows);
  }
  return rows.length;
}

// ── RSS Ingester ───────────────────────────────────────────────────

async function ingestRss(
  insert: StoreInsertFn,
  body?: any,
): Promise<{ total_ingested: number }> {
  // If a specific feed_url was provided, ingest just that one
  if (body?.feed_url) {
    try {
      const items = await fetchAndParseRss(body.feed_url);
      if (items.length === 0) return { total_ingested: 0 };

      const rows = items.slice(0, 25).map((item) =>
        makeProduct({
          title: item.title,
          source_type: "document",
          source_identifier: body.feed_name || body.feed_url,
          content: {
            description: item.description?.substring(0, 5000),
            link: item.link,
            pub_date: item.pubDate,
            guid: item.guid,
            author: item.author,
            category: item.category || "rss",
            feed_name: body.feed_name,
            feed_url: body.feed_url,
            data_source: "rss_feed",
          },
          confidence_score: 0.6,
        }),
      );

      insert("data_products", rows);
      return { total_ingested: rows.length };
    } catch (err: any) {
      console.warn(`[localFunctions] RSS single-feed error:`, err.message);
      return { total_ingested: 0 };
    }
  }

  // Otherwise ingest all feeds from the catalog (used by the LiveDataPanel "Ingest All")
  let totalIngested = 0;
  const allFeeds = RSS_FEED_CATALOG.flatMap((c) => c.feeds);

  // Process a subset to avoid huge concurrent fetches — take first 8 feeds
  const feedsToProcess = allFeeds.slice(0, 8);

  const results = await Promise.allSettled(
    feedsToProcess.map(async (feed) => {
      try {
        const items = await fetchAndParseRss(feed.url);
        if (items.length === 0) return 0;

        const rows = items.slice(0, 15).map((item) =>
          makeProduct({
            title: item.title,
            source_type: "document",
            source_identifier: feed.id,
            content: {
              description: item.description?.substring(0, 5000),
              link: item.link,
              pub_date: item.pubDate,
              guid: item.guid,
              author: item.author,
              category: item.category || feed.category,
              feed_name: feed.name,
              feed_url: feed.url,
              data_source: "rss_feed",
            },
            confidence_score: 0.6,
          }),
        );

        insert("data_products", rows);
        return rows.length;
      } catch (err: any) {
        console.warn(`[localFunctions] RSS feed ${feed.id} failed:`, err.message);
        return 0;
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") totalIngested += r.value;
  }

  return { total_ingested: totalIngested };
}

// ── Public dispatcher ──────────────────────────────────────────────

export async function invokeLiveDataIngester(
  insert: StoreInsertFn,
  body: any,
): Promise<{ data: any; error: any }> {
  const source: string = body?.source ?? "";
  const region: string = body?.region ?? "caribbean_corridor";

  try {
    let ingested = 0;

    switch (source) {
      case "opensky":
        ingested = await ingestOpenSky(insert, region);
        break;
      case "ais":
        ingested = await ingestAis(insert);
        break;
      case "noaa_water":
        ingested = await ingestNoaaWater(insert);
        break;
      case "nasa_eonet":
        ingested = await ingestNasaEonet(insert);
        break;
      case "nasa_firms":
        ingested = await ingestNasaFirms(insert, region);
        break;
      default:
        console.warn(`[localFunctions] Unknown live-data source: ${source}`);
        return { data: { ingested: 0, error: `Unknown source: ${source}` }, error: null };
    }

    console.log(`[localFunctions] ${source}: ingested ${ingested} records`);
    return { data: { ingested, success: true }, error: null };
  } catch (err: any) {
    console.error(`[localFunctions] ${source} error:`, err);
    return { data: { ingested: 0 }, error: { message: err.message || String(err) } };
  }
}

export async function invokeRssIngester(
  insert: StoreInsertFn,
  body: any,
): Promise<{ data: any; error: any }> {
  try {
    const result = await ingestRss(insert, body);
    console.log(`[localFunctions] RSS: ingested ${result.total_ingested} articles`);
    return { data: { ...result, ingested: result.total_ingested, success: true }, error: null };
  } catch (err: any) {
    console.error(`[localFunctions] RSS error:`, err);
    return { data: { total_ingested: 0, ingested: 0 }, error: { message: err.message || String(err) } };
  }
}
