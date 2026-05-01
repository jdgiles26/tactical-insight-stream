/**
 * Client-side web scraper / content extractor utilities.
 * Uses DOMParser for HTML processing and allorigins.win as CORS proxy.
 */

export type ExtractionMode =
  | "auto"
  | "article"
  | "table"
  | "links"
  | "raw_html"
  | "structured_data";

export interface ScrapeOptions {
  url: string;
  mode: ExtractionMode;
  cssSelector?: string;
  userAgent?: string;
  respectRobots?: boolean;
}

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  links: { text: string; href: string }[];
  tables: string[][];
  images: { src: string; alt: string }[];
  metadata: Record<string, string>;
  extractedAt: string;
  mode: ExtractionMode;
  rawHtmlLength: number;
}

const CORS_PROXIES = [
  (url: string) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) =>
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

/**
 * Attempt to fetch a URL, trying direct first then falling back to CORS proxies.
 */
export async function fetchWithCorsProxy(url: string): Promise<string> {
  // Try direct fetch first
  try {
    const res = await fetch(url, {
      mode: "cors",
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    if (res.ok) {
      return await res.text();
    }
  } catch {
    // Direct fetch failed (CORS), try proxies
  }

  // Try each proxy
  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        return await res.text();
      }
    } catch {
      // Try next proxy
    }
  }

  throw new Error(`Failed to fetch URL: ${url} \u2014 all proxies exhausted`);
}

/**
 * Parse HTML string into a DOM Document.
 */
function parseHTML(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

/**
 * Extract page metadata (title, description, og tags, etc.)
 */
function extractMetadata(doc: Document): Record<string, string> {
  const meta: Record<string, string> = {};

  const title = doc.querySelector("title");
  if (title) meta.title = title.textContent?.trim() || "";

  const metaTags = doc.querySelectorAll("meta");
  metaTags.forEach((tag) => {
    const name =
      tag.getAttribute("name") ||
      tag.getAttribute("property") ||
      tag.getAttribute("http-equiv");
    const content = tag.getAttribute("content");
    if (name && content) {
      meta[name] = content;
    }
  });

  return meta;
}

/**
 * Extract main article text using heuristic selectors.
 */
function extractArticleText(doc: Document): string {
  const selectors = [
    "article",
    "[role='main']",
    ".post-content",
    ".article-content",
    ".entry-content",
    ".story-body",
    ".article-body",
    "main",
    ".content",
    "#content",
    ".post",
    ".article",
  ];

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const clone = el.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("script, style, nav, footer, aside, .ad, .ads, .advertisement, .social-share")
        .forEach((n) => n.remove());

      const text = clone.textContent?.trim() || "";
      if (text.length > 100) {
        return cleanText(text);
      }
    }
  }

  const body = doc.body;
  if (body) {
    const clone = body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("script, style, nav, footer, aside, header, .ad, .ads")
      .forEach((n) => n.remove());
    return cleanText(clone.textContent || "");
  }

  return "";
}

/**
 * Extract all links from the document.
 */
function extractLinks(
  doc: Document,
  baseUrl: string
): { text: string; href: string }[] {
  const links: { text: string; href: string }[] = [];
  const anchors = doc.querySelectorAll("a[href]");

  anchors.forEach((a) => {
    const href = a.getAttribute("href") || "";
    const text = a.textContent?.trim() || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    let absoluteUrl = href;
    try {
      absoluteUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    if (text.length > 0) {
      links.push({ text: text.substring(0, 200), href: absoluteUrl });
    }
  });

  return links;
}

/**
 * Extract tables from the document.
 */
function extractTables(doc: Document): string[][] {
  const results: string[][] = [];
  const tables = doc.querySelectorAll("table");

  tables.forEach((table) => {
    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("th, td");
      const rowData: string[] = [];
      cells.forEach((cell) => {
        rowData.push(cell.textContent?.trim() || "");
      });
      if (rowData.length > 0) {
        results.push(rowData);
      }
    });
  });

  return results;
}

/**
 * Extract images from the document.
 */
function extractImages(
  doc: Document,
  baseUrl: string
): { src: string; alt: string }[] {
  const images: { src: string; alt: string }[] = [];
  const imgs = doc.querySelectorAll("img[src]");

  imgs.forEach((img) => {
    const src = img.getAttribute("src") || "";
    const alt = img.getAttribute("alt") || "";
    if (!src) return;

    let absoluteSrc = src;
    try {
      absoluteSrc = new URL(src, baseUrl).toString();
    } catch {
      return;
    }

    images.push({ src: absoluteSrc, alt });
  });

  return images;
}

/**
 * Extract content using a CSS selector.
 */
function extractBySelector(doc: Document, selector: string): string {
  const elements = doc.querySelectorAll(selector);
  const parts: string[] = [];

  elements.forEach((el) => {
    const text = el.textContent?.trim();
    if (text) parts.push(text);
  });

  return parts.join("\n\n");
}

/**
 * Extract structured data (JSON-LD, microdata).
 */
function extractStructuredData(doc: Document): string {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const results: unknown[] = [];

  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script.textContent || "");
      results.push(data);
    } catch {
      // Invalid JSON-LD, skip
    }
  });

  if (results.length > 0) {
    return JSON.stringify(results, null, 2);
  }

  return "No structured data (JSON-LD) found.";
}

/**
 * Clean extracted text: collapse whitespace, trim.
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Main scrape function: fetch URL and extract content based on mode.
 */
export async function scrapeUrl(options: ScrapeOptions): Promise<ScrapeResult> {
  const { url, mode, cssSelector } = options;

  const rawHtml = await fetchWithCorsProxy(url);
  const doc = parseHTML(rawHtml);
  const metadata = extractMetadata(doc);
  const title = metadata.title || metadata["og:title"] || url;

  let content = "";
  let links: { text: string; href: string }[] = [];
  let tables: string[][] = [];
  const images = extractImages(doc, url);

  if (cssSelector) {
    content = extractBySelector(doc, cssSelector);
  } else {
    switch (mode) {
      case "article":
        content = extractArticleText(doc);
        break;
      case "table":
        tables = extractTables(doc);
        content = tables
          .map((row) => row.join(" | "))
          .join("\n");
        break;
      case "links":
        links = extractLinks(doc, url);
        content = links
          .map((l) => `${l.text}: ${l.href}`)
          .join("\n");
        break;
      case "raw_html":
        content = rawHtml.substring(0, 50000);
        break;
      case "structured_data":
        content = extractStructuredData(doc);
        break;
      case "auto":
      default: {
        content = extractArticleText(doc);
        links = extractLinks(doc, url);
        tables = extractTables(doc);
        break;
      }
    }
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    content,
    wordCount,
    links,
    tables,
    images,
    metadata,
    extractedAt: new Date().toISOString(),
    mode,
    rawHtmlLength: rawHtml.length,
  };
}

/**
 * Parse RSS/Atom XML into items.
 */
export interface ParsedRssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  author?: string;
  category?: string;
}

export function parseRssXml(xml: string): ParsedRssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const items: ParsedRssItem[] = [];

  // Try RSS 2.0 format
  const rssItems = doc.querySelectorAll("item");
  if (rssItems.length > 0) {
    rssItems.forEach((item) => {
      items.push({
        title: item.querySelector("title")?.textContent?.trim() || "Untitled",
        link: item.querySelector("link")?.textContent?.trim() || "",
        description: cleanText(
          item.querySelector("description")?.textContent || ""
        ),
        pubDate: item.querySelector("pubDate")?.textContent?.trim() || "",
        guid:
          item.querySelector("guid")?.textContent?.trim() ||
          item.querySelector("link")?.textContent?.trim() ||
          "",
        author: item.querySelector("author")?.textContent?.trim() ||
          item.querySelector("dc\\:creator")?.textContent?.trim() || undefined,
        category:
          item.querySelector("category")?.textContent?.trim() || undefined,
      });
    });
    return items;
  }

  // Try Atom format
  const entries = doc.querySelectorAll("entry");
  entries.forEach((entry) => {
    const linkEl = entry.querySelector("link");
    const link =
      linkEl?.getAttribute("href") ||
      linkEl?.textContent?.trim() ||
      "";

    items.push({
      title:
        entry.querySelector("title")?.textContent?.trim() || "Untitled",
      link,
      description: cleanText(
        entry.querySelector("summary")?.textContent ||
          entry.querySelector("content")?.textContent ||
          ""
      ),
      pubDate:
        entry.querySelector("published")?.textContent?.trim() ||
        entry.querySelector("updated")?.textContent?.trim() ||
        "",
      guid:
        entry.querySelector("id")?.textContent?.trim() || link,
      author:
        entry.querySelector("author name")?.textContent?.trim() || undefined,
      category:
        entry.querySelector("category")?.getAttribute("term") || undefined,
    });
  });

  return items;
}

/**
 * Fetch and parse an RSS feed via CORS proxy.
 */
export async function fetchAndParseRss(
  feedUrl: string
): Promise<ParsedRssItem[]> {
  const xml = await fetchWithCorsProxy(feedUrl);
  return parseRssXml(xml);
}

/**
 * Scrape history stored in localStorage.
 */
export interface ScrapeHistoryEntry {
  id: string;
  url: string;
  title: string;
  wordCount: number;
  mode: ExtractionMode;
  scrapedAt: string;
}

const SCRAPE_HISTORY_KEY = "mdg_scrape_history";

export function getScrapeHistory(): ScrapeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SCRAPE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addScrapeHistory(entry: ScrapeHistoryEntry): void {
  const history = getScrapeHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, 50);
  localStorage.setItem(SCRAPE_HISTORY_KEY, JSON.stringify(trimmed));
}

export function clearScrapeHistory(): void {
  localStorage.removeItem(SCRAPE_HISTORY_KEY);
}

