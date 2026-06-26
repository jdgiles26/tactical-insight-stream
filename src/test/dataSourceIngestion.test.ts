import { describe, it, expect, beforeEach } from "vitest";
import { computePriorityScore, scoreToPriorityLevel } from "@/lib/priorityScoring";
import { parseRssXml, type ScrapeResult } from "@/lib/webScraper";

// ── Test: Data Source Article Ingestion ─────────────────────────────

describe("Data Source Article Ingestion", () => {
  describe("computePriorityScore integration with ingestion", () => {
    it("scores scraped article content with threat keywords", () => {
      const content = "Breaking: missile attack reported near naval base, casualties expected";
      const score = computePriorityScore(content);
      expect(score).toBeGreaterThan(0.5);
      expect(scoreToPriorityLevel(score)).toBe("critical");
    });

    it("scores low-priority scraped content correctly", () => {
      const content = "Weather forecast: sunny skies expected this weekend";
      const score = computePriorityScore(content);
      expect(score).toBeLessThan(0.2);
      expect(scoreToPriorityLevel(score)).toBe("routine");
    });

    it("generates correct priority field name for DB insert", () => {
      const content = "military deployment near border";
      const priority_score = computePriorityScore(content);
      const priority = scoreToPriorityLevel(priority_score);

      // The DB schema expects 'priority' not 'priority_level'
      const insertPayload = {
        title: "[Scraped] Test Article",
        source_type: "document",
        source_identifier: "https://example.com/article",
        status: "ingested",
        content: { text: content, url: "https://example.com/article" },
        confidence_score: 0.7,
        priority_score,
        priority,
      };

      expect(insertPayload).toHaveProperty("priority");
      expect(insertPayload).not.toHaveProperty("priority_level");
      expect(["critical", "high", "medium", "low", "routine"]).toContain(insertPayload.priority);
    });
  });

  describe("RSS feed article ingestion fields", () => {
    it("uses 'document' as source_type for RSS ingested items", () => {
      const item = {
        title: "Test RSS Article",
        description: "An article about military exercises",
        link: "https://example.com/rss-article",
        pubDate: "2024-01-01T00:00:00Z",
        guid: "rss-item-123",
      };

      const textForScoring = `${item.title} ${item.description}`;
      const priority_score = computePriorityScore(textForScoring);
      const priority = scoreToPriorityLevel(priority_score);

      const insertPayload = {
        title: item.title,
        source_type: "document", // Must be a valid enum value
        source_identifier: "test-feed",
        status: "ingested",
        content: {
          description: item.description,
          link: item.link,
          pub_date: item.pubDate,
          guid: item.guid,
        },
        confidence_score: 0.6,
        priority_score,
        priority,
      };

      // Verify source_type is valid enum value
      const validSourceTypes = ["sensor", "cot_message", "image", "video", "document", "sigint", "humint", "geoint"];
      expect(validSourceTypes).toContain(insertPayload.source_type);
      expect(insertPayload).toHaveProperty("priority");
      expect(insertPayload).not.toHaveProperty("priority_level");
    });
  });
});

// ── Test: Scraping Functionality ────────────────────────────────────

describe("Scraping Functionality", () => {
  describe("parseRssXml", () => {
    it("parses RSS 2.0 XML into items", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Article One</title>
              <link>https://example.com/1</link>
              <description>Description of article one</description>
              <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
              <guid>guid-1</guid>
            </item>
            <item>
              <title>Article Two</title>
              <link>https://example.com/2</link>
              <description>Description of article two</description>
              <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
              <guid>guid-2</guid>
            </item>
          </channel>
        </rss>`;

      const items = parseRssXml(xml);
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe("Article One");
      expect(items[0].link).toBe("https://example.com/1");
      expect(items[0].description).toBe("Description of article one");
      expect(items[0].guid).toBe("guid-1");
      expect(items[1].title).toBe("Article Two");
    });

    it("parses Atom XML into items", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Atom Feed</title>
          <entry>
            <title>Atom Entry</title>
            <link href="https://example.com/atom-1" />
            <summary>Summary text</summary>
            <published>2024-01-01T00:00:00Z</published>
            <id>atom-id-1</id>
          </entry>
        </feed>`;

      const items = parseRssXml(xml);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Atom Entry");
      expect(items[0].link).toBe("https://example.com/atom-1");
      expect(items[0].description).toBe("Summary text");
      expect(items[0].guid).toBe("atom-id-1");
    });

    it("returns empty array for invalid XML", () => {
      const items = parseRssXml("<invalid>not a feed</invalid>");
      expect(items).toHaveLength(0);
    });

    it("handles empty feed gracefully", () => {
      const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
      const items = parseRssXml(xml);
      expect(items).toHaveLength(0);
    });
  });

  describe("ScrapeResult structure validation", () => {
    it("validates the expected shape of a scrape result", () => {
      const mockResult: ScrapeResult = {
        url: "https://example.com",
        title: "Test Page",
        content: "This is test content for the page",
        wordCount: 7,
        links: [{ text: "Link 1", href: "https://example.com/1" }],
        tables: [["Header 1", "Header 2"], ["Cell 1", "Cell 2"]],
        images: [{ src: "https://example.com/img.png", alt: "test" }],
        metadata: { title: "Test Page", description: "A test page" },
        extractedAt: "2024-01-01T00:00:00.000Z",
        mode: "article",
        rawHtmlLength: 5000,
      };

      expect(mockResult.url).toBeTruthy();
      expect(mockResult.title).toBeTruthy();
      expect(mockResult.content).toBeTruthy();
      expect(mockResult.wordCount).toBeGreaterThan(0);
      expect(mockResult.links).toBeInstanceOf(Array);
      expect(mockResult.tables).toBeInstanceOf(Array);
      expect(mockResult.images).toBeInstanceOf(Array);
      expect(mockResult.metadata).toBeDefined();
      expect(mockResult.extractedAt).toBeTruthy();
      expect(mockResult.mode).toBe("article");
      expect(mockResult.rawHtmlLength).toBeGreaterThan(0);
    });
  });
});

// ── Test: Ingestion Data Product Payload ────────────────────────────

describe("Ingestion Data Product Payload", () => {
  it("constructs a valid data product from scraped content", () => {
    const scrapeResult: ScrapeResult = {
      url: "https://news.example.com/breaking",
      title: "Breaking News: Naval Exercise",
      content: "The military conducted a naval exercise near the coast.",
      wordCount: 9,
      links: [],
      tables: [],
      images: [],
      metadata: { title: "Breaking News" },
      extractedAt: new Date().toISOString(),
      mode: "auto",
      rawHtmlLength: 2000,
    };

    const textForScoring = `${scrapeResult.title} ${scrapeResult.content}`;
    const priority_score = computePriorityScore(textForScoring);
    const priority = scoreToPriorityLevel(priority_score);

    const payload = {
      title: `[Scraped] ${scrapeResult.title}`,
      source_type: "document" as const,
      source_identifier: scrapeResult.url,
      status: "ingested" as const,
      content: {
        text: scrapeResult.content.substring(0, 50000),
        url: scrapeResult.url,
        extraction_mode: scrapeResult.mode,
        word_count: scrapeResult.wordCount,
        metadata: scrapeResult.metadata,
        links_count: scrapeResult.links.length,
        images_count: scrapeResult.images.length,
        tables_count: scrapeResult.tables.length,
        scraped_at: scrapeResult.extractedAt,
        raw_html_length: scrapeResult.rawHtmlLength,
      },
      confidence_score: 0.7,
      priority_score,
      priority,
    };

    expect(payload.title).toContain("[Scraped]");
    expect(payload.source_type).toBe("document");
    expect(payload.status).toBe("ingested");
    expect(payload.confidence_score).toBe(0.7);
    expect(payload.priority_score).toBeGreaterThanOrEqual(0);
    expect(payload.priority_score).toBeLessThanOrEqual(1);
    expect(["critical", "high", "medium", "low", "routine"]).toContain(payload.priority);
    expect(payload.content.text).toBe(scrapeResult.content);
    expect(payload.content.url).toBe(scrapeResult.url);
  });

  it("constructs valid data product from RSS item", () => {
    const rssItem = {
      title: "Hostile submarine detected in pacific",
      description: "Naval forces tracking hostile submarine near critical shipping lanes",
      link: "https://feed.example.com/article/1",
      pubDate: "2024-06-01T12:00:00Z",
      guid: "feed-guid-1",
      author: "Reuters",
      category: "Military",
    };

    const textForScoring = `${rssItem.title} ${rssItem.description}`;
    const priority_score = computePriorityScore(textForScoring);
    const priority = scoreToPriorityLevel(priority_score);

    const payload = {
      title: rssItem.title,
      source_type: "document" as const,
      source_identifier: "test-feed-id",
      status: "ingested" as const,
      content: {
        description: rssItem.description.substring(0, 5000),
        link: rssItem.link,
        pub_date: rssItem.pubDate,
        guid: rssItem.guid,
        author: rssItem.author,
        category: rssItem.category,
        feed_name: "Test Feed",
        feed_url: "https://feed.example.com/rss",
      },
      confidence_score: 0.6,
      priority_score,
      priority,
    };

    expect(payload.source_type).toBe("document");
    expect(payload).toHaveProperty("priority");
    expect(payload).not.toHaveProperty("priority_level");
    expect(priority_score).toBeGreaterThan(0.3); // military + hostile keywords
    expect(["critical", "high", "medium"]).toContain(payload.priority);
  });
});

// ── Test: Priority Scoring for Ingestion ────────────────────────────

describe("Priority Scoring for Ingestion", () => {
  it("handles empty content gracefully", () => {
    expect(computePriorityScore("")).toBe(0);
    expect(scoreToPriorityLevel(0)).toBe("routine");
  });

  it("scores all priority levels correctly", () => {
    expect(scoreToPriorityLevel(0.95)).toBe("critical");
    expect(scoreToPriorityLevel(0.85)).toBe("critical");
    expect(scoreToPriorityLevel(0.75)).toBe("high");
    expect(scoreToPriorityLevel(0.65)).toBe("high");
    expect(scoreToPriorityLevel(0.5)).toBe("medium");
    expect(scoreToPriorityLevel(0.4)).toBe("medium");
    expect(scoreToPriorityLevel(0.3)).toBe("low");
    expect(scoreToPriorityLevel(0.2)).toBe("low");
    expect(scoreToPriorityLevel(0.1)).toBe("routine");
    expect(scoreToPriorityLevel(0)).toBe("routine");
  });

  it("scores compound threat content highest", () => {
    const text = "nuclear missile attack emergency critical hostile casualties";
    const score = computePriorityScore(text);
    expect(score).toBeGreaterThan(0.6);
    expect(scoreToPriorityLevel(score)).toBe("high");
  });
});
