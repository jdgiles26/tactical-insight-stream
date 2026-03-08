import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Curated maritime/defense/geopolitical RSS feeds
const DEFAULT_FEEDS: Record<string, { url: string; category: string }> = {
  bbc_world: { url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "news" },
  reuters: { url: "https://feeds.reuters.com/reuters/topNews", category: "news" },
  aljazeera: { url: "https://www.aljazeera.com/xml/rss/all.xml", category: "news" },
  defense_one: { url: "https://www.defenseone.com/rss/", category: "defense" },
  breaking_defense: { url: "https://breakingdefense.com/feed/", category: "defense" },
  defense_news: { url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml", category: "defense" },
  usni_news: { url: "https://news.usni.org/feed", category: "maritime" },
  bellingcat: { url: "https://www.bellingcat.com/feed/", category: "osint" },
  dhs: { url: "https://www.dhs.gov/rss.xml", category: "government" },
  state_dept: { url: "https://www.state.gov/rss-feed/press-releases/feed/", category: "government" },
  csis: { url: "https://www.csis.org/analysis/feed", category: "think_tank" },
  atlantic_council: { url: "https://www.atlanticcouncil.org/feed/", category: "think_tank" },
  foreign_policy: { url: "https://foreignpolicy.com/feed/", category: "geopolitics" },
};

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category?: string;
}

function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const category = extractTag(itemXml, "category");
    if (title) {
      items.push({ title, link: link || "", description: description || "", pubDate: pubDate || "", category: category || undefined });
    }
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const simpleMatch = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
  return simpleMatch ? simpleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || "ingest";

    // ACTION: list - Return available feeds
    if (action === "list") {
      return jsonResponse({ feeds: DEFAULT_FEEDS });
    }

    // ACTION: ingest - Fetch and ingest RSS feeds
    const feedKeys = body.feeds || Object.keys(DEFAULT_FEEDS);
    const customUrls: string[] = body.custom_urls || [];
    const sourceId = body.source_id || null;
    const results: any[] = [];
    let totalIngested = 0;

    // Process default feeds
    for (const key of feedKeys) {
      const feed = DEFAULT_FEEDS[key];
      if (!feed) continue;
      try {
        const items = await fetchAndParseFeed(feed.url);
        const ingested = await ingestItems(supabase, items, key, feed.category, sourceId);
        totalIngested += ingested;
        results.push({ feed: key, url: feed.url, items_found: items.length, ingested });
      } catch (err) {
        results.push({ feed: key, url: feed.url, error: String(err) });
      }
    }

    // Process custom URLs
    for (const url of customUrls) {
      try {
        const items = await fetchAndParseFeed(url);
        const hostname = new URL(url).hostname;
        const ingested = await ingestItems(supabase, items, hostname, "custom", sourceId);
        totalIngested += ingested;
        results.push({ feed: hostname, url, items_found: items.length, ingested });
      } catch (err) {
        results.push({ feed: url, error: String(err) });
      }
    }

    // Update source heartbeat if provided
    if (sourceId) {
      await supabase
        .from("data_sources")
        .update({
          last_heartbeat: new Date().toISOString(),
          status: "active",
          retry_count: 0,
        })
        .eq("id", sourceId);
    }

    return jsonResponse({ success: true, total_ingested: totalIngested, results });
  } catch (err) {
    console.error("RSS ingestion error:", err);
    return jsonResponse({ error: "RSS ingestion failed", details: String(err) }, 500);
  }
});

async function fetchAndParseFeed(url: string): Promise<RSSItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "MDG-RSS-Ingester/1.0",
      },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return parseRSSXml(xml);
  } finally {
    clearTimeout(timeout);
  }
}

async function ingestItems(
  supabase: any,
  items: RSSItem[],
  feedName: string,
  category: string,
  sourceId: string | null
): Promise<number> {
  let ingested = 0;
  // Only take latest 20 items per feed to avoid flooding
  const recent = items.slice(0, 20);

  for (const item of recent) {
    const title = stripHtml(item.title).slice(0, 500);
    if (!title) continue;

    // Check if already ingested (by title + source)
    const { data: existing } = await supabase
      .from("data_products")
      .select("id")
      .eq("title", title)
      .eq("source_identifier", `rss:${feedName}`)
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Determine priority from keywords
    const priority = classifyPriority(title + " " + stripHtml(item.description));
    const priorityScores: Record<string, number> = {
      critical: 0.95, high: 0.8, medium: 0.6, low: 0.3, routine: 0.1,
    };

    const { error } = await supabase.from("data_products").insert({
      title,
      source_type: "document",
      source_identifier: `rss:${feedName}`,
      content: {
        link: item.link,
        description: stripHtml(item.description).slice(0, 2000),
        pub_date: item.pubDate,
        feed: feedName,
        category,
        rss_category: item.category,
      },
      priority,
      priority_score: priorityScores[priority],
      confidence_score: 0.75,
      status: "ingested",
    });

    if (!error) {
      ingested++;
      // Also publish to event bus
      await supabase.from("event_bus").insert({
        topic: "mdg.ingestion",
        stage: "ingestion",
        data_product_id: null, // Will be linked via title lookup if needed
        payload: { feed: feedName, category, title },
        status: "pending",
        partition_key: `rss:${feedName}`,
      });
    }
  }

  // Update source ingested count
  if (sourceId && ingested > 0) {
    const { data: src } = await supabase
      .from("data_sources")
      .select("total_ingested")
      .eq("id", sourceId)
      .single();
    if (src) {
      await supabase
        .from("data_sources")
        .update({ total_ingested: (src.total_ingested || 0) + ingested })
        .eq("id", sourceId);
    }
  }

  return ingested;
}

function classifyPriority(text: string): string {
  const t = text.toLowerCase();
  const critical = ["attack", "missile", "explosion", "war", "invasion", "nuclear", "emergency", "terror", "casualties", "killed"];
  const high = ["threat", "military", "conflict", "sanctions", "strike", "drone", "submarine", "navy", "weapon", "escalat"];
  const medium = ["security", "defense", "intelligence", "maritime", "patrol", "surveillance", "border", "vessel"];

  if (critical.some((k) => t.includes(k))) return "critical";
  if (high.some((k) => t.includes(k))) return "high";
  if (medium.some((k) => t.includes(k))) return "medium";
  return "routine";
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
