import { describe, it, expect } from "vitest";
import { processDocumentLocally } from "@/lib/localDocumentProcessor";

// jsdom File doesn't implement .text() — create a helper that adds it
function createTextFile(content: string, name: string, type = "text/plain"): File {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  // Ensure .text() is available (jsdom Blob supports it)
  if (!file.text) {
    (file as any).text = () => Promise.resolve(content);
  }
  return file;
}

/**
 * Tests for document processor NLP extraction.
 * Validates that key elements are correctly identified from document content.
 */
describe("processDocumentLocally", () => {
  it("extracts vessel names from document text", async () => {
    const content = "Report: USS Enterprise departing port of Norfolk at 0800Z for patrol operations.";
    const file = createTextFile(content, "mission-report.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    expect(result.detections).toBeGreaterThan(0);
    const vesselDet = result.detection_details.find((d) => d.label === "vessel_name");
    expect(vesselDet).toBeDefined();
    expect(vesselDet!.raw_entity).toContain("USS Enterprise");
  });

  it("extracts coordinates from document text", async () => {
    const content = "Target position confirmed at 34.0522, -118.2437. Proceed with interdiction.";
    const file = createTextFile(content, "intel-brief.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    const coordDet = result.detection_details.find((d) => d.label === "coordinates");
    expect(coordDet).toBeDefined();
  });

  it("extracts key elements from tactical documents", async () => {
    const content = `
      OPORD 2024-001
      Commander's intent: Establish maritime security in sector Alpha.
      Date: 15 Jan 2024
      Location: port Norfolk
      Capt Johnson will lead the interdiction of the white trawler at 0800Z.
      Classification: SECRET
    `;
    const file = createTextFile(content, "opord-2024-001.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    expect(result.key_elements.commander_intent).toBeDefined();
    expect(result.key_elements.location).toBeDefined();
    expect(result.key_elements.target_vehicle).toBeDefined();
    expect(result.key_elements.personnel).toBeDefined();
  });

  it("detects emergency triggers", async () => {
    const content = "MAYDAY MAYDAY MAYDAY. Vessel taking on water at grid ref BA1234. Requesting immediate assistance.";
    const file = createTextFile(content, "distress-signal.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    expect(result.emergency_detected).toBe(true);
    expect(result.emergency_type).toBe("mayday");
  });

  it("handles empty documents gracefully", async () => {
    const file = createTextFile("", "empty.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    expect(result.detections).toBeGreaterThanOrEqual(0);
  });

  it("extracts classification level from documents", async () => {
    const content = "TOP SECRET // NOFORN\nIntelligence assessment: hostile submarine detected in sector Bravo.";
    const file = createTextFile(content, "intel-report.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    expect(result.key_elements.classification).toBeDefined();
    expect(result.key_elements.classification).toMatch(/TOP SECRET/i);
  });

  it("extracts personnel identifiers", async () => {
    const content = "Col Martinez issued the warning order at 1400Z. All units report to sector Delta.";
    const file = createTextFile(content, "warnord.txt");
    const result = await processDocumentLocally(file);

    expect(result.success).toBe(true);
    expect(result.key_elements.personnel).toBeDefined();
    expect(result.key_elements.personnel).toContain("Col Martinez");
  });
});
