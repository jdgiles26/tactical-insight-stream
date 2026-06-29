import { describe, it, expect } from "vitest";
import { resolveClassLabel } from "@/lib/localVideoProcessor";

/**
 * Tests for detection label resolution.
 * The LFM-based processor uses a common labels array.
 */
describe("resolveClassLabel", () => {
  it("returns common label for valid class IDs", () => {
    expect(resolveClassLabel(0)).toBe("person");
    expect(resolveClassLabel(1)).toBe("vehicle");
    expect(resolveClassLabel(2)).toBe("vessel");
    expect(resolveClassLabel(3)).toBe("aircraft");
    expect(resolveClassLabel(4)).toBe("building");
  });

  it("returns fallback string for unknown class IDs", () => {
    expect(resolveClassLabel(10)).toBe("class_10");
    expect(resolveClassLabel(999)).toBe("class_999");
  });

  it("handles negative class IDs gracefully", () => {
    expect(resolveClassLabel(-1)).toBe("class_-1");
  });
});
