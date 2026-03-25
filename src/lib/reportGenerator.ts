import jsPDF from "jspdf";
import type { VLMAlert, ThreatLevel, StreamDetectionState } from "@/types/vlm";

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const PAGE_WIDTH = 210;   // A4 mm
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 25;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN_BOTTOM;

const THREAT_PRIORITY: Record<ThreatLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const RECOMMENDED_ACTIONS: Record<ThreatLevel, string[]> = {
  CRITICAL: [
    "Immediate tactical response required",
    "Escalate to command authority",
    "Deploy assets to area",
    "Initiate emergency communication protocols",
  ],
  HIGH: [
    "Increase monitoring frequency",
    "Alert watch commander",
    "Prepare response assets",
    "Cross-reference with intelligence databases",
  ],
  MEDIUM: [
    "Continue monitoring",
    "Flag for review",
    "Update vessel tracking database",
  ],
  LOW: [
    "Log for record",
    "Continue standard monitoring",
  ],
};

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getHighestThreat(alerts: VLMAlert[]): ThreatLevel {
  if (alerts.length === 0) return "LOW";
  return alerts.reduce((max, a) =>
    THREAT_PRIORITY[a.threatLevel] > THREAT_PRIORITY[max] ? a.threatLevel : max,
    "LOW" as ThreatLevel,
  );
}

function getAverageConfidence(alerts: VLMAlert[]): number {
  if (alerts.length === 0) return 0;
  return alerts.reduce((sum, a) => sum + a.confidence, 0) / alerts.length;
}

function getTotalDetections(alerts: VLMAlert[]): number {
  return alerts.reduce((sum, a) => sum + a.objectCount, 0);
}

function getMonitoringDuration(analyses: VLMAlert[]): string {
  if (analyses.length === 0) return "0.0 seconds";
  const maxTs = Math.max(...analyses.map((a) => a.timestamp));
  return `${maxTs.toFixed(1)} seconds`;
}

function getUniqueMatchedIntents(alerts: VLMAlert[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const alert of alerts) {
    for (const mi of alert.matchedIntents) {
      const key = mi.term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(mi.term);
      }
    }
  }
  return result;
}

function getSuspiciousActivities(alerts: VLMAlert[]): string[] {
  const activities: string[] = [];
  const seen = new Set<string>();

  for (const alert of alerts) {
    // Extract from matched intents
    for (const mi of alert.matchedIntents) {
      const desc = `${mi.term} detected as ${mi.label} (${(mi.confidence * 100).toFixed(0)}% confidence)`;
      if (!seen.has(mi.term.toLowerCase())) {
        seen.add(mi.term.toLowerCase());
        activities.push(desc);
      }
    }

    // Extract notable info from scene descriptions
    const desc = alert.sceneDescription.toLowerCase();
    const keywords = [
      "collision risk", "dark vessel", "unknown", "suspicious",
      "congested", "loitering", "erratic", "smuggling",
      "unauthorized", "missing ais", "high density",
    ];
    for (const kw of keywords) {
      if (desc.includes(kw) && !seen.has(kw)) {
        seen.add(kw);
        // Capitalize first letter
        activities.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    }
  }

  return activities;
}

function formatUTCDate(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

// Check if we need a page break, and add one if so. Returns new yPosition.
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > USABLE_HEIGHT) {
    doc.addPage();
    return MARGIN_TOP;
  }
  return y;
}

// Wrap text and return lines
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

// ─────────────────────────────────────────────────────────
// Drawing primitives
// ─────────────────────────────────────────────────────────

function drawSectionHeader(doc: jsPDF, y: number, text: string): number {
  y = ensureSpace(doc, y, 14);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(text, MARGIN_LEFT, y);
  y += 2;
  // Underline
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y);
  return y + 6;
}

function drawTable(
  doc: jsPDF,
  y: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
): number {
  const rowHeight = 8;
  const headerHeight = 8;
  const startX = MARGIN_LEFT;

  y = ensureSpace(doc, y, headerHeight + rowHeight * rows.length + 4);

  // Header row background
  doc.setFillColor(220, 220, 220);
  doc.rect(startX, y - 5, CONTENT_WIDTH, headerHeight, "F");
  doc.setDrawColor(150, 150, 150);
  doc.rect(startX, y - 5, CONTENT_WIDTH, headerHeight, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  let xOffset = startX + 2;
  headers.forEach((h, i) => {
    doc.text(h, xOffset, y);
    xOffset += colWidths[i];
  });
  y += headerHeight;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rows.forEach((row) => {
    y = ensureSpace(doc, y, rowHeight);

    // Row border
    doc.setDrawColor(200, 200, 200);
    doc.rect(startX, y - 5, CONTENT_WIDTH, rowHeight, "S");

    xOffset = startX + 2;
    row.forEach((cell, i) => {
      const truncated = cell.length > 50 ? cell.substring(0, 47) + "..." : cell;
      doc.text(truncated, xOffset, y);
      xOffset += colWidths[i];
    });
    y += rowHeight;
  });

  return y + 2;
}

function drawBulletList(doc: jsPDF, y: number, items: string[], maxWidth: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);

  for (const item of items) {
    const lines = wrapText(doc, item, maxWidth - 8);
    const blockHeight = lines.length * 5 + 2;
    y = ensureSpace(doc, y, blockHeight);

    doc.text("\u2022", MARGIN_LEFT + 2, y);
    doc.text(lines, MARGIN_LEFT + 8, y);
    y += lines.length * 5 + 2;
  }

  return y;
}

// ─────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────

export async function generateCommanderReport(
  alerts: VLMAlert[],
  analysisHistory: VLMAlert[],
  streamDetections: Map<string, StreamDetectionState>,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Sorted analyses for chronological report
  const sortedAnalyses = [...analysisHistory].sort((a, b) => a.timestamp - b.timestamp);
  const sortedAlerts = [...alerts].sort((a, b) => a.timestamp - b.timestamp);

  // Computed values
  const highestThreat = getHighestThreat(alerts);
  const avgConfidence = getAverageConfidence(analysisHistory.length > 0 ? analysisHistory : alerts);
  const totalDetections = getTotalDetections(analysisHistory.length > 0 ? analysisHistory : alerts);
  const duration = getMonitoringDuration(analysisHistory.length > 0 ? analysisHistory : alerts);
  const suspiciousFrames = alerts.length;
  const suspiciousActivities = getSuspiciousActivities(alerts);
  const framesAnalyzed = analysisHistory.length || alerts.length;

  let y = MARGIN_TOP;

  // ================================================================
  // PAGE 1: Title & Executive Summary
  // ================================================================

  // Gray banner header
  doc.setFillColor(200, 200, 200);
  doc.rect(0, y - 10, PAGE_WIDTH, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text("COMMANDER'S REPORT", PAGE_WIDTH / 2, y + 2, { align: "center" });
  y += 16;

  // Subtitle
  doc.setFont("helvetica", "italic");
  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  doc.text("Maritime Surveillance Analysis", MARGIN_LEFT, y);
  y += 10;

  // Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);

  doc.setFont("helvetica", "bold");
  doc.text("Report Generated:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(formatUTCDate(), MARGIN_LEFT + 38, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Monitoring Duration:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(duration, MARGIN_LEFT + 42, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Frames Analyzed:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(framesAnalyzed), MARGIN_LEFT + 38, y);
  y += 12;

  // Executive Summary section
  y = drawSectionHeader(doc, y, "EXECUTIVE SUMMARY");
  y += 2;

  y = drawTable(
    doc,
    y,
    ["Metric", "Value"],
    [
      ["Overall Threat Level", highestThreat],
      ["Total Objects Detected", String(totalDetections)],
      ["Suspicious Activity Frames", String(suspiciousFrames)],
      ["AI Confidence Score", `${(avgConfidence * 100).toFixed(1)}%`],
    ],
    [CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.45],
  );
  y += 6;

  // Suspicious Activities Detected
  y = drawSectionHeader(doc, y, "SUSPICIOUS ACTIVITIES DETECTED");
  y += 2;

  if (suspiciousActivities.length > 0) {
    y = drawBulletList(doc, y, suspiciousActivities, CONTENT_WIDTH);
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("No suspicious activities detected during monitoring period.", MARGIN_LEFT, y);
    y += 6;
  }

  // ================================================================
  // PAGES 2-3: Detailed Observations
  // ================================================================

  doc.addPage();
  y = MARGIN_TOP;
  y = drawSectionHeader(doc, y, "DETAILED OBSERVATIONS");
  y += 4;

  const analysesToReport = sortedAnalyses.length > 0 ? sortedAnalyses : sortedAlerts;

  for (const analysis of analysesToReport) {
    const tsLabel = `Timestamp ${analysis.timestamp.toFixed(1)}s`;
    const typesStr = analysis.objectTypes.join(", ") || "unknown";
    const metaLine = `Objects: ${analysis.objectCount} | Types: ${typesStr} | Threat: ${analysis.threatLevel} | Confidence: ${(analysis.confidence * 100).toFixed(1)}%`;

    // Estimate space needed
    const descLines = wrapText(doc, analysis.sceneDescription, CONTENT_WIDTH);
    const blockHeight = 8 + 6 + descLines.length * 4.5 + 8;
    y = ensureSpace(doc, y, Math.min(blockHeight, 60));

    // Timestamp header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(tsLabel, MARGIN_LEFT, y);
    y += 6;

    // Meta line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(metaLine, MARGIN_LEFT, y);
    y += 6;

    // Scene description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);

    for (const line of descLines) {
      y = ensureSpace(doc, y, 5);
      doc.text(line, MARGIN_LEFT, y);
      y += 4.5;
    }
    y += 6;
  }

  // ================================================================
  // PAGE 4: Evidence Frames
  // ================================================================

  doc.addPage();
  y = MARGIN_TOP;
  y = drawSectionHeader(doc, y, "EVIDENCE FRAMES");
  y += 4;

  // Collect frames from alerts (up to 4)
  const framesWithData = sortedAlerts
    .filter((a) => a.frameBase64)
    .slice(0, 4);

  if (framesWithData.length > 0) {
    for (const frame of framesWithData) {
      try {
        // The frame height for the image
        const imgWidth = CONTENT_WIDTH * 0.7;
        const imgHeight = imgWidth * 0.5625; // 16:9 aspect

        // Check if we also have a depth map to show side by side
        const hasDepth = !!frame.depthMapBase64;
        const effectiveWidth = hasDepth ? CONTENT_WIDTH * 0.48 : imgWidth;
        const effectiveHeight = effectiveWidth * 0.5625;

        y = ensureSpace(doc, y, effectiveHeight + 12);

        // Prepare image data
        const imgData = frame.frameBase64!.startsWith("data:")
          ? frame.frameBase64!
          : `data:image/jpeg;base64,${frame.frameBase64!}`;

        doc.addImage(imgData, "JPEG", MARGIN_LEFT, y, effectiveWidth, effectiveHeight);

        // Depth map alongside if available
        if (hasDepth) {
          const depthData = frame.depthMapBase64!.startsWith("data:")
            ? frame.depthMapBase64!
            : `data:image/jpeg;base64,${frame.depthMapBase64!}`;
          doc.addImage(
            depthData,
            "JPEG",
            MARGIN_LEFT + effectiveWidth + 4,
            y,
            effectiveWidth,
            effectiveHeight,
          );
        }

        y += effectiveHeight + 3;

        // Caption
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const caption = `Frame at ${frame.timestamp.toFixed(1)}s - ${frame.threatLevel} threat`;
        doc.text(caption, MARGIN_LEFT, y);
        y += 8;
      } catch (err) {
        // Image embedding can fail with corrupt base64 — skip silently
        console.warn("Failed to embed evidence frame in PDF:", err);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(150, 100, 100);
        doc.text(`[Frame at ${frame.timestamp.toFixed(1)}s - image could not be embedded]`, MARGIN_LEFT, y);
        y += 8;
      }
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("No evidence frames captured during this monitoring session.", MARGIN_LEFT, y);
    y += 8;
  }

  // ================================================================
  // PAGE 5: Recommended Actions
  // ================================================================

  doc.addPage();
  y = MARGIN_TOP;
  y = drawSectionHeader(doc, y, "RECOMMENDED ACTIONS");
  y += 4;

  const actions = RECOMMENDED_ACTIONS[highestThreat] ?? RECOMMENDED_ACTIONS.LOW;
  y = drawBulletList(doc, y, actions, CONTENT_WIDTH);

  // Additional context based on stream detections
  y += 8;
  if (streamDetections.size > 0) {
    y = ensureSpace(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("Monitored Streams Summary:", MARGIN_LEFT, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);

    streamDetections.forEach((state) => {
      y = ensureSpace(doc, y, 6);
      doc.text(
        `\u2022 ${state.streamName}: ${state.totalFramesAnalyzed} frames, ${state.totalDetections} detections, ${state.alertCount} alerts`,
        MARGIN_LEFT + 2,
        y,
      );
      y += 5;
    });
  }

  // Footer on last page
  y = ensureSpace(doc, y, 20);
  y += 10;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y);
  y += 5;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Generated by Tactical Insight Stream \u2022 ${formatUTCDate()} \u2022 Classification: UNCLASSIFIED`,
    PAGE_WIDTH / 2,
    y,
    { align: "center" },
  );

  // ================================================================
  // Save / Download
  // ================================================================

  const dateStr = new Date().toISOString().substring(0, 10);
  doc.save(`commanders-report-${dateStr}.pdf`);
}
