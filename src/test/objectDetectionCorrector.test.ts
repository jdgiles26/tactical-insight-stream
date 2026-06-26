import { describe, it, expect } from "vitest";
import { resolveClassLabel } from "@/lib/localVideoProcessor";

/**
 * Tests for YOLO detection label resolution.
 * Note: MODEL_LABELS defaults to ["ship"] (single-class SAR model).
 * resolveClassLabel falls back to COCO-80 for class IDs beyond MODEL_LABELS.
 */
describe("resolveClassLabel", () => {
  it("returns model label for class 0 (default SAR model has 'ship')", () => {
    // With default MODEL_LABELS = ["ship"], class 0 resolves to "ship"
    expect(resolveClassLabel(0)).toBe("ship");
  });

  it("falls back to COCO-80 labels for class IDs beyond model labels", () => {
    // MODEL_LABELS has only 1 entry ("ship"), so class 1+ falls back to COCO-80
    expect(resolveClassLabel(1)).toBe("bicycle");
    expect(resolveClassLabel(2)).toBe("car");
    expect(resolveClassLabel(3)).toBe("motorcycle");
    expect(resolveClassLabel(5)).toBe("bus");
    expect(resolveClassLabel(7)).toBe("truck");
    expect(resolveClassLabel(8)).toBe("boat");
    expect(resolveClassLabel(14)).toBe("bird");
    expect(resolveClassLabel(79)).toBe("toothbrush");
  });

  it("returns fallback string for unknown class IDs beyond COCO-80", () => {
    expect(resolveClassLabel(80)).toBe("class_80");
    expect(resolveClassLabel(999)).toBe("class_999");
  });

  it("handles negative class IDs gracefully", () => {
    const result = resolveClassLabel(-1);
    expect(result).toBe("class_-1");
  });

  it("returns real object names instead of generic class_N", () => {
    // All valid COCO class IDs should return readable names
    for (let i = 1; i < 80; i++) {
      const label = resolveClassLabel(i);
      expect(label).not.toMatch(/^class_\d+$/);
    }
  });
});
