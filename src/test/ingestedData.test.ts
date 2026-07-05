import { describe, it, expect } from "vitest";
import { toIngestedData } from "@/lib/ingestedData";

describe("toIngestedData", () => {
  it("maps a basic product to IngestedData", () => {
    const product = {
      id: "test-id",
      source_identifier: "opensky:ABC123",
      title: "Aircraft: ABC123",
      content: { description: "Low altitude flight detected" },
      priority_score: 0.8,
      priority: "high",
      created_at: "2024-01-01T00:00:00Z",
      latitude: 29.0,
      longitude: -90.0,
    };

    const result = toIngestedData(product, ["aircraft"], ["ABC123"]);

    expect(result.id).toBe("test-id");
    expect(result.sourceId).toBe("opensky:ABC123");
    expect(result.priority).toBe(0.8);
    expect(result.threatLevel).toBe("high");
    expect(result.lat).toBe(29.0);
    expect(result.lon).toBe(-90.0);
    expect(result.labels).toEqual(["aircraft"]);
    expect(result.entities).toEqual(["ABC123"]);
  });

  it("defaults missing values", () => {
    const product = { id: "min-id" };
    const result = toIngestedData(product);

    expect(result.sourceId).toBe("");
    expect(result.priority).toBe(0);
    expect(result.threatLevel).toBe("routine");
    expect(result.lat).toBe(0);
    expect(result.lon).toBe(0);
    expect(result.labels).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.clickable).toBe(false);
    expect(result.detailURL).toBe("");
  });

  it("detects negative sentiment from threat content", () => {
    const product = {
      id: "threat-id",
      content: { description: "hostile attack with casualties reported" },
    };
    const result = toIngestedData(product);
    expect(result.sentiment).toBe("negative");
  });

  it("detects positive sentiment from peace content", () => {
    const product = {
      id: "peace-id",
      content: { description: "ceasefire agreement reached, aid delivered" },
    };
    const result = toIngestedData(product);
    expect(result.sentiment).toBe("positive");
  });

  it("detects mixed sentiment", () => {
    const product = {
      id: "mixed-id",
      content: { description: "peace agreement threatened by attack" },
    };
    const result = toIngestedData(product);
    expect(result.sentiment).toBe("mixed");
  });

  it("detects military relevance", () => {
    const product = {
      id: "mil-id",
      content: { description: "naval submarine deployed for reconnaissance patrol" },
    };
    const result = toIngestedData(product);
    expect(result.militaryRelevance).toBeGreaterThan(0);
  });

  it("sets clickable and detailURL from content link", () => {
    const product = {
      id: "link-id",
      content: { link: "https://example.com/article" },
    };
    const result = toIngestedData(product);
    expect(result.clickable).toBe(true);
    expect(result.detailURL).toBe("https://example.com/article");
  });
});
