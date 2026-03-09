import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCES = {
  opensky: {
    url: "https://opensky-network.org/api/states/all",
    label: "OpenSky Aircraft Tracking",
  },
  ais_public: {
    url: "https://meri.digitraffic.fi/api/ais/v1/locations",
    label: "AIS Vessel Tracking (Finland Digitraffic)",
  },
  nasa_eonet: {
    url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50",
    label: "NASA EONET Natural Events",
  },
  nasa_firms: {
    url: "https://firms.modaps.eosdis.nasa.gov/api/area/csv/MODIS_NRT",
    label: "NASA FIRMS Active Fires",
  },
  noaa_water: {
    url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
    label: "NOAA Tides & Water Levels (Bayou/Gulf Sensors)",
  },
};

const OPENSKY_REGIONS: Record<string, { lamin: number; lomin: number; lamax: number; lomax: number }> = {
  caribbean_corridor: { lamin: 10, lomin: -90, lamax: 28, lomax: -60 },
  gulf_of_mexico: { lamin: 18, lomin: -98, lamax: 31, lomax: -80 },
  south_america_north: { lamin: -5, lomin: -82, lamax: 15, lomax: -50 },
  puerto_rico_usvi: { lamin: 16, lomin: -68, lamax: 20, lomax: -64 },
  us_east_coast: { lamin: 25, lomin: -82, lamax: 45, lomax: -65 },
  us_west_coast: { lamin: 30, lomin: -130, lamax: 50, lomax: -115 },
  europe_med: { lamin: 30, lomin: -10, lamax: 60, lomax: 40 },
  middle_east: { lamin: 12, lomin: 30, lamax: 42, lomax: 65 },
  east_asia: { lamin: 10, lomin: 95, lamax: 50, lomax: 145 },
  south_china_sea: { lamin: 0, lomin: 100, lamax: 25, lomax: 125 },
  horn_of_africa: { lamin: -5, lomin: 35, lamax: 20, lomax: 55 },
  indo_pacific: { lamin: -15, lomin: 90, lamax: 30, lomax: 160 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || "ingest";
    const source = body.source || "opensky";
    const sourceId = body.source_id || null;
    const bounds = body.bounds || null;
    const region = body.region || null;

    if (action === "list") {
      return jsonResponse({ sources: SOURCES, regions: OPENSKY_REGIONS });
    }

    if (source === "opensky") {
      const resolvedBounds = bounds || (region && OPENSKY_REGIONS[region]) || OPENSKY_REGIONS.caribbean_corridor;
      return await ingestOpenSky(supabase, sourceId, resolvedBounds);
    }

    if (source === "ais") {
      return await ingestAIS(supabase, sourceId);
    }

    if (source === "nasa_eonet") {
      return await ingestNasaEONET(supabase, sourceId);
    }

    if (source === "nasa_firms") {
      return await ingestNasaFIRMS(supabase, sourceId, bounds || (region && OPENSKY_REGIONS[region]));
    }

    if (source === "noaa_water") {
      return await ingestNOAAWater(supabase, sourceId);
    }

    return jsonResponse({ error: "Unknown source. Use: opensky, ais, nasa_eonet, nasa_firms, noaa_water" }, 400);
  } catch (err) {
    console.error("Live data ingestion error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

async function ingestOpenSky(supabase: any, sourceId: string | null, bounds: any) {
  const b = bounds;
  const url = `${SOURCES.opensky.url}?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "MDG/1.0" },
    signal: AbortSignal.timeout(45000),
  });

  if (!resp.ok) {
    return jsonResponse({ error: `OpenSky HTTP ${resp.status}` }, 502);
  }

  const data = await resp.json();
  const states = (data.states || []).slice(0, 50);

  let ingested = 0;
  for (const s of states) {
    const callsign = (s[1] || "").trim();
    const country = s[2] || "Unknown";
    const lon = s[5];
    const lat = s[6];
    const alt = s[7];
    const velocity = s[9];
    const onGround = s[8];

    if (!callsign || lat === null || lon === null) continue;

    const title = `Aircraft: ${callsign} (${country})`;

    const { error } = await supabase.from("data_products").insert({
      title,
      source_type: "sensor",
      source_identifier: `opensky:${callsign}`,
      content: {
        callsign, country, altitude: alt, velocity, on_ground: onGround,
        icao24: s[0], time_position: s[3], last_contact: s[4],
        heading: s[10], vertical_rate: s[11], squawk: s[14],
      },
      priority: alt && alt < 500 && !onGround ? "high" : "routine",
      priority_score: alt && alt < 500 && !onGround ? 0.8 : 0.1,
      confidence_score: 0.95,
      status: "ingested",
      latitude: lat,
      longitude: lon,
    });

    if (!error) ingested++;
  }

  if (sourceId) {
    await supabase
      .from("data_sources")
      .update({ last_heartbeat: new Date().toISOString(), status: "active" })
      .eq("id", sourceId);
  }

  return jsonResponse({ success: true, source: "opensky", states_received: states.length, ingested });
}

async function ingestAIS(supabase: any, sourceId: string | null) {
  const resp = await fetch(SOURCES.ais_public.url, {
    headers: { Accept: "application/json", "User-Agent": "MDG/1.0" },
    signal: AbortSignal.timeout(20000),
  });

  if (!resp.ok) {
    return jsonResponse({ error: `AIS HTTP ${resp.status}` }, 502);
  }

  const data = await resp.json();
  const features = (data.features || []).slice(0, 50);

  let ingested = 0;
  for (const f of features) {
    const props = f.properties || {};
    const coords = f.geometry?.coordinates || [];
    const mmsi = props.mmsi;
    const name = props.name || `Vessel MMSI:${mmsi}`;
    const sog = props.sog;
    const cog = props.cog;
    const heading = props.heading;
    const navStat = props.navStat;

    if (!mmsi || coords.length < 2) continue;

    const title = `AIS Vessel: ${name}`;
    const isHighPriority = sog > 20 || navStat === 0;

    const { error } = await supabase.from("data_products").insert({
      title,
      source_type: "sensor",
      source_identifier: `ais:${mmsi}`,
      content: {
        mmsi, name, sog, cog, heading, nav_status: navStat,
        timestamp: props.timestampExternal,
      },
      priority: isHighPriority ? "medium" : "routine",
      priority_score: isHighPriority ? 0.6 : 0.1,
      confidence_score: 0.9,
      status: "ingested",
      latitude: coords[1],
      longitude: coords[0],
    });

    if (!error) ingested++;
  }

  if (sourceId) {
    await supabase
      .from("data_sources")
      .update({ last_heartbeat: new Date().toISOString(), status: "active" })
      .eq("id", sourceId);
  }

  return jsonResponse({ success: true, source: "ais", features_received: features.length, ingested });
}

async function ingestNasaEONET(supabase: any, sourceId: string | null) {
  const resp = await fetch(SOURCES.nasa_eonet.url, {
    headers: { Accept: "application/json", "User-Agent": "MDG/1.0" },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    return jsonResponse({ error: `NASA EONET HTTP ${resp.status}` }, 502);
  }

  const data = await resp.json();
  const events = (data.events || []).slice(0, 50);

  let ingested = 0;
  for (const ev of events) {
    const cat = ev.categories?.[0]?.title || "Unknown";
    const geo = ev.geometry?.[ev.geometry.length - 1]; // latest geometry
    const coords = geo?.coordinates || [];
    const lon = coords[0];
    const lat = coords[1];
    const isSevere = ["Severe Storms", "Volcanoes", "Wildfires"].includes(cat);

    const title = `NASA EONET: ${ev.title}`;

    const { error } = await supabase.from("data_products").insert({
      title,
      source_type: "sensor",
      source_identifier: `nasa_eonet:${ev.id}`,
      content: {
        eonet_id: ev.id,
        category: cat,
        description: ev.description || null,
        sources: ev.sources?.map((s: any) => ({ id: s.id, url: s.url })),
        geometry_date: geo?.date,
        geometry_type: geo?.type,
        link: ev.link,
      },
      priority: isSevere ? "high" : "medium",
      priority_score: isSevere ? 0.75 : 0.4,
      confidence_score: 0.95,
      status: "ingested",
      latitude: lat || null,
      longitude: lon || null,
    });

    if (!error) ingested++;
  }

  if (sourceId) {
    await supabase
      .from("data_sources")
      .update({ last_heartbeat: new Date().toISOString(), status: "active" })
      .eq("id", sourceId);
  }

  return jsonResponse({ success: true, source: "nasa_eonet", events_received: events.length, ingested });
}

async function ingestNasaFIRMS(supabase: any, sourceId: string | null, bounds: any) {
  // NASA FIRMS provides a GeoJSON endpoint for active fires
  // Using the open summary endpoint (no API key needed for VIIRS/MODIS summary)
  const url = "https://firms.modaps.eosdis.nasa.gov/api/country/csv/MODIS_NRT/world/1";

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "MDG/1.0" },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    // FIRMS may require an API key; fall back to EONET fire data
    return jsonResponse({ error: "NASA FIRMS requires a MAP_KEY. Use nasa_eonet instead for fire events." }, 502);
  }

  if (!resp.ok) {
    await resp.text();
    return jsonResponse({ error: `NASA FIRMS HTTP ${resp.status}. Try nasa_eonet for fire data.` }, 502);
  }

  const text = await resp.text();
  const lines = text.split("\n").filter(l => l.trim());
  const header = lines[0]?.split(",") || [];
  const latIdx = header.indexOf("latitude");
  const lonIdx = header.indexOf("longitude");
  const confIdx = header.indexOf("confidence");
  const dateIdx = header.indexOf("acq_date");
  const brightIdx = header.indexOf("brightness");

  const rows = lines.slice(1, 51); // limit 50
  let ingested = 0;

  for (const row of rows) {
    const cols = row.split(",");
    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;

    if (bounds) {
      if (lat < bounds.lamin || lat > bounds.lamax || lon < bounds.lomin || lon > bounds.lomax) continue;
    }

    const confidence = cols[confIdx] || "unknown";
    const isHigh = parseInt(confidence) >= 80;

    const { error } = await supabase.from("data_products").insert({
      title: `NASA FIRMS Fire: ${cols[dateIdx] || "Active"} (${confidence}%)`,
      source_type: "sensor",
      source_identifier: `nasa_firms:${lat.toFixed(3)}_${lon.toFixed(3)}`,
      content: {
        brightness: cols[brightIdx],
        confidence,
        acq_date: cols[dateIdx],
        satellite: "MODIS",
      },
      priority: isHigh ? "high" : "medium",
      priority_score: isHigh ? 0.7 : 0.35,
      confidence_score: parseInt(confidence) / 100 || 0.5,
      status: "ingested",
      latitude: lat,
      longitude: lon,
    });

    if (!error) ingested++;
  }

  if (sourceId) {
    await supabase
      .from("data_sources")
      .update({ last_heartbeat: new Date().toISOString(), status: "active" })
      .eq("id", sourceId);
  }

  return jsonResponse({ success: true, source: "nasa_firms", rows_parsed: rows.length, ingested });
}

// NOAA Bayou & Gulf Coast water level stations
const NOAA_STATIONS = [
  { id: "8761724", name: "Grand Isle, LA", lat: 29.2633, lon: -89.9572 },
  { id: "8760922", name: "Pilots Station East, SW Pass, LA", lat: 28.9322, lon: -89.4075 },
  { id: "8761305", name: "Shell Beach, LA", lat: 29.8683, lon: -89.6731 },
  { id: "8760551", name: "South Pass, LA", lat: 28.9903, lon: -89.1408 },
  { id: "8762075", name: "Port Fourchon, LA", lat: 29.1142, lon: -90.1992 },
  { id: "8762482", name: "West Bank 1, Bayou Gauche, LA", lat: 29.7886, lon: -90.4206 },
  { id: "8761927", name: "New Canal Station, LA", lat: 30.0272, lon: -90.1133 },
  { id: "8760417", name: "Bay Waveland Yacht Club, MS", lat: 30.3253, lon: -89.3256 },
  { id: "8735180", name: "Dauphin Island, AL", lat: 30.2503, lon: -88.0750 },
  { id: "8726520", name: "St. Petersburg, FL", lat: 27.7606, lon: -82.6269 },
  { id: "8771341", name: "Galveston Bay Entrance, TX", lat: 29.3572, lon: -94.7247 },
  { id: "8770570", name: "Sabine Pass North, TX", lat: 29.7283, lon: -93.8703 },
  { id: "8764227", name: "LAWMA, Amerada Pass, LA", lat: 29.4497, lon: -91.3381 },
  { id: "8764314", name: "Eugene Island, LA", lat: 29.3675, lon: -91.3856 },
  { id: "8762928", name: "Cocodrie, Terrebonne Bay, LA", lat: 29.2453, lon: -90.6614 },
];

// High water thresholds (feet above MHHW - Mean Higher High Water)
const HIGH_WATER_THRESHOLD = 2.0; // feet above normal — storm surge indicator
const CRITICAL_WATER_THRESHOLD = 4.0; // feet above normal — severe storm / hurricane surge

async function ingestNOAAWater(supabase: any, sourceId: string | null) {
  const now = new Date();
  const beginDate = new Date(now.getTime() - 6 * 60 * 60 * 1000); // last 6 hours
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  let ingested = 0;
  let alerts = 0;

  for (const station of NOAA_STATIONS) {
    try {
      const params = new URLSearchParams({
        begin_date: fmt(beginDate),
        end_date: fmt(now),
        station: station.id,
        product: "water_level",
        datum: "MHHW",
        units: "english",
        time_zone: "gmt",
        format: "json",
        application: "MDG_SaltwaterRecon",
      });

      const resp = await fetch(`${SOURCES.noaa_water.url}?${params}`, {
        headers: { "User-Agent": "MDG/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      const readings = data.data || [];
      if (readings.length === 0) continue;

      // Get the latest reading
      const latest = readings[readings.length - 1];
      const waterLevel = parseFloat(latest.v);
      if (isNaN(waterLevel)) continue;

      const isHighWater = waterLevel >= HIGH_WATER_THRESHOLD;
      const isCritical = waterLevel >= CRITICAL_WATER_THRESHOLD;

      let priority: string = "routine";
      let priorityScore = 0.1;
      let priorityReasoning: string | null = null;

      if (isCritical) {
        priority = "critical";
        priorityScore = 0.98;
        priorityReasoning = `SEVERE STORM SURGE: Water level ${waterLevel.toFixed(2)}ft above MHHW at ${station.name}. Threshold: ${CRITICAL_WATER_THRESHOLD}ft. Indicates major storm system or hurricane surge. Immediate action required.`;
      } else if (isHighWater) {
        priority = "high";
        priorityScore = 0.80;
        priorityReasoning = `HIGH WATER ALERT: Water level ${waterLevel.toFixed(2)}ft above MHHW at ${station.name}. Threshold: ${HIGH_WATER_THRESHOLD}ft. Potential storm surge or approaching weather system.`;
      } else if (waterLevel >= 1.0) {
        priority = "medium";
        priorityScore = 0.50;
        priorityReasoning = `Elevated water level ${waterLevel.toFixed(2)}ft above MHHW at ${station.name}. Monitoring for trend.`;
      }

      // Calculate trend from readings
      const firstReading = parseFloat(readings[0]?.v);
      const trend = !isNaN(firstReading) ? waterLevel - firstReading : 0;
      const trendDirection = trend > 0.5 ? "rising_fast" : trend > 0.1 ? "rising" : trend < -0.5 ? "falling_fast" : trend < -0.1 ? "falling" : "stable";

      const title = `Bayou Sensor: ${station.name} — ${waterLevel.toFixed(2)}ft ${trendDirection === "rising_fast" ? "⚠ RISING FAST" : trendDirection === "rising" ? "↑ Rising" : trendDirection === "falling" ? "↓ Falling" : "→ Stable"}`;

      const { error } = await supabase.from("data_products").insert({
        title,
        source_type: "sensor",
        source_identifier: `noaa:${station.id}`,
        content: {
          station_id: station.id,
          station_name: station.name,
          water_level_ft: waterLevel,
          datum: "MHHW",
          trend_direction: trendDirection,
          trend_change_ft: parseFloat(trend.toFixed(2)),
          reading_time: latest.t,
          readings_count: readings.length,
          first_reading_ft: firstReading,
          quality: latest.q,
          flags: latest.f,
          sensor_type: "bayou_water_level",
          high_water_alert: isHighWater,
          critical_alert: isCritical,
        },
        priority,
        priority_score: priorityScore,
        priority_reasoning: priorityReasoning,
        confidence_score: 0.98, // NOAA official data
        status: "ingested",
        latitude: station.lat,
        longitude: station.lon,
      });

      if (!error) {
        ingested++;

        // If high water or critical, also create a correlation alert
        if (isHighWater || isCritical) {
          alerts++;
        }
      }
    } catch (err) {
      console.error(`Error fetching NOAA station ${station.id}:`, err);
    }
  }

  if (sourceId) {
    await supabase
      .from("data_sources")
      .update({ last_heartbeat: new Date().toISOString(), status: "active" })
      .eq("id", sourceId);
  }

  return jsonResponse({
    success: true,
    source: "noaa_water",
    stations_queried: NOAA_STATIONS.length,
    ingested,
    high_water_alerts: alerts,
  });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
