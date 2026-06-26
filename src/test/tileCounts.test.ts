import { describe, it, expect } from "vitest";
import { computeTileCounts } from "@/lib/tileCounts";

const mockProducts = [
  { id: "1", priority: "critical", status: "processing" },
  { id: "2", priority: "critical", status: "ready" },
  { id: "3", priority: "high", status: "processing" },
  { id: "4", priority: "medium", status: "ready" },
  { id: "5", priority: "low", status: "ready" },
  { id: "6", priority: null, status: "processing" },
  { id: "7", priority: "routine", status: "ready" },
];

describe("computeTileCounts — alerts tile drill down count", () => {
  it("displays correct drill down count for alerts (critical priority)", () => {
    const counts = computeTileCounts(mockProducts);
    // tile count must equal the number of items the drilldown would show
    const drilldownItems = mockProducts.filter((p) => p.priority === "critical");
    expect(counts.criticalCount).toBe(drilldownItems.length);
    expect(counts.criticalCount).toBe(2);
  });

  it("displays correct drill down count for other tiles", () => {
    const counts = computeTileCounts(mockProducts);

    // high priority tile
    const highItems = mockProducts.filter((p) => p.priority === "high");
    expect(counts.highCount).toBe(highItems.length);
    expect(counts.highCount).toBe(1);

    // processing status tile
    const processingItems = mockProducts.filter((p) => p.status === "processing");
    expect(counts.processingCount).toBe(processingItems.length);
    expect(counts.processingCount).toBe(3);

    // medium priority tile
    expect(counts.mediumCount).toBe(1);

    // low priority tile
    expect(counts.lowCount).toBe(1);
  });

  it("returns zero counts for an empty products array", () => {
    const counts = computeTileCounts([]);
    expect(counts.criticalCount).toBe(0);
    expect(counts.highCount).toBe(0);
    expect(counts.processingCount).toBe(0);
    expect(counts.mediumCount).toBe(0);
    expect(counts.lowCount).toBe(0);
  });

  it("tile count exactly matches the number of drilldown items for every priority", () => {
    for (const level of ["critical", "high", "medium", "low"] as const) {
      const expected = mockProducts.filter((p) => p.priority === level).length;
      const counts = computeTileCounts(mockProducts);
      const key = `${level}Count` as keyof typeof counts;
      expect(counts[key]).toBe(expected);
    }
  });

  it("null/undefined priority products are not counted in any priority bucket", () => {
    const counts = computeTileCounts(mockProducts);
    const total = counts.criticalCount + counts.highCount + counts.mediumCount + counts.lowCount + counts.routineCount;
    // item id='6' has null priority and must not appear in any priority bucket
    const nonNullPriorityItems = mockProducts.filter((p) => p.priority != null).length;
    expect(total).toBe(nonNullPriorityItems);
  });
});
