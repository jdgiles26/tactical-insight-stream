import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Free data source APIs
const SOURCES = {
  // OpenSky Network - live aircraft tracking (free, no auth required)
  opensky: {
    url: "https://opensky-network.org/api/states/all",
    label: "OpenSky Aircraft Tracking",
  },
  // AIS - marine traffic (free tier via public APIs)
  ais_public: {
    url: "https://meri.digitraffic.fi/api/ais/v1/locations",
    label: "AIS Vessel Tracking (Finland Digitraffic)",
  },
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
    const bounds = body.bounds || null; // { lamin, lomin, lamax, lomax }

    if (action === "list") {
      return jsonResponse({ sources: SOURCES });
    }

    if (source === "opensky") {
      return await ingestOpenSky(supabase, sourceId, bounds);
    }

    if (source === "ais") {
      return await ingestAIS(supabase, sourceId);
    }

    return jsonResponse({ error: "Unknown source. Use: opensky, ais" }, 400);
  } catch (err) {
    console.error("Live data ingestion error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

async function ingestOpenSky(supabase: any, sourceId: string | null, bounds: any) {
  // Default to Europe/Med region to avoid massive global payload that times out
  const b = bounds || { lamin: 30, lomin: -10, lamax: 60, lomax: 40 };
  const url = `${SOURCES.opensky.url}?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "MDG/1.0" },
    signal: AbortSignal.timeout(45000),
  });

  if (!resp.ok) {
    return jsonResponse({ error: `OpenSky HTTP ${resp.status}` }, 502);
  }

  const data = await resp.json();
  const states = (data.states || []).slice(0, 50); // Limit to 50

  let ingested = 0;
  for (const s of states) {
    const callsign = (s[1] || "").trim();
    const country = s[2] || "Unknown";
    const lon = s[5];
    const lat = s[6];
    const alt = s[7]; // geometric altitude
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
    const sog = props.sog; // speed over ground
    const cog = props.cog; // course over ground
    const heading = props.heading;
    const navStat = props.navStat;

    if (!mmsi || coords.length < 2) continue;

    const title = `AIS Vessel: ${name}`;
    const isHighPriority = sog > 20 || navStat === 0; // fast or underway using engine

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

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
