import jsPDF from "jspdf";
import type { VLMAlert, StreamDetectionState } from "@/types/vlm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const ML = 20; // margin left
const MR = 20;
const MT = 20;
const MB = 25;
const CW = PAGE_W - ML - MR; // content width
const MAX_Y = PAGE_H - MB;

type ThreatLevel = VLMAlert["threatLevel"];

const THREAT_RANK: Record<ThreatLevel, number> = {
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

// ---------------------------------------------------------------------------
// Derived-data helpers (work with the real VLMAlert shape)
// ---------------------------------------------------------------------------

/** Highest threat across all alerts. */
function highestThreat(alerts: VLMAlert[]): ThreatLevel {
  if (alerts.length === 0) return "LOW";
  return alerts.reduce<ThreatLevel>(
    (max, a) => (THREAT_RANK[a.threatLevel] > THREAT_RANK[max] ? a.threatLevel : max),
    "LOW",
  );
}

/** Average confidence across all detections in the given alerts. */
function avgConfidence(alerts: VLMAlert[]): number {
  let total = 0;
  let count = 0;
  for (const a of alerts) {
    for (const d of a.detections) {
      total += d.confidence;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

/** Sum of all individual detections. */
function totalDetections(alerts: VLMAlert[]): number {
  return alerts.reduce((s, a) => s + a.detections.length, 0);
}

/** Unique object type labels across all alerts. */
function uniqueObjectTypes(alert: VLMAlert): string[] {
  return [...new Set(alert.detections.map((d) => d.label))];
}

/** Monitoring duration string. */
function monitoringDuration(analyses: VLMAlert[]): string {
  if (analyses.length === 0) return "0.0 seconds";
  const maxTs = Math.max(...analyses.map((a) => a.timestamp));
  const minTs = Math.min(...analyses.map((a) => a.timestamp));
  const dur = (maxTs - minTs) / 1000;
  return `${dur.toFixed(1)} seconds`;
}

/** Collect suspicious-activity strings for the bullet list. */
function suspiciousActivities(alerts: VLMAlert[]): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  for (const a of alerts) {
    for (const mi of a.matchedIntents) {
      const key = mi.intentTerm.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push(
          `${mi.intentTerm} detected as ${mi.detectionLabel} (${(mi.confidence * 100).toFixed(0)}% confidence)`,
        );
      }
    }
    // Pull extra keywords from the scene description
    const desc = a.sceneDescription.toLowerCase();
    for (const kw of [
      "collision risk", "dark vessel", "unknown", "suspicious",
      "congested", "loitering", "erratic", "smuggling",
      "unauthorized", "missing ais", "high density",
    ]) {
      if (desc.includes(kw) && !seen.has(kw)) {
        seen.add(kw);
        items.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    }
  }
  return items;
}

function utcNow(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// ---------------------------------------------------------------------------
// Low-level PDF drawing helpers
// ---------------------------------------------------------------------------

/** Add a new page if `needed` mm won't fit; return current y. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > MAX_Y) {
    doc.addPage();
    return MT;
  }
  return y;
}

function drawSectionHeader(doc: jsPDF, y: number, text: string): number {
  y = ensureSpace(doc, y, 14);
  doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(30, 30, 30);
  doc.text(text, ML, y);
  y += 2;
  doc.setDrawColor(100, 100, 100).setLineWidth(0.3);
  doc.line(ML, y, ML + CW, y);
  return y + 6;
}

function drawTable(
  doc: jsPDF,
  y: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
): number {
  const rh = 8;

  y = ensureSpace(doc, y, rh + rh * rows.length + 4);

  // header
  doc.setFillColor(220, 220, 220);
  doc.rect(ML, y - 5, CW, rh, "F");
  doc.setDrawColor(150, 150, 150).rect(ML, y - 5, CW, rh, "S");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(30, 30, 30);
  let x = ML + 2;
  headers.forEach((h, i) => { doc.text(h, x, y); x += colWidths[i]; });
  y += rh;

  // rows
  doc.setFont("helvetica", "normal").setFontSize(9);
  for (const row of rows) {
    y = ensureSpace(doc, y, rh);
    doc.setDrawColor(200, 200, 200).rect(ML, y - 5, CW, rh, "S");
    x = ML + 2;
    row.forEach((cell, i) => {
      const t = cell.length > 55 ? cell.slice(0, 52) + "..." : cell;
      doc.text(t, x, y);
      x += colWidths[i];
    });
    y += rh;
  }
  return y + 2;
}

function drawBullets(doc: jsPDF, y: number, items: string[]): number {
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(30, 30, 30);
  for (const item of items) {
    const lines: string[] = doc.splitTextToSize(item, CW - 8);
    const h = lines.length * 5 + 2;
    y = ensureSpace(doc, y, h);
    doc.text("\u2022", ML + 2, y);
    doc.text(lines, ML + 8, y);
    y += h;
  }
  return y;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateCommanderReport(
  alerts: VLMAlert[],
  analysisHistory: VLMAlert[],
  streamDetections: Map<string, StreamDetectionState>,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const sortedAnalyses = [...analysisHistory].sort((a, b) => a.timestamp - b.timestamp);
  const sortedAlerts = [...alerts].sort((a, b) => a.timestamp - b.timestamp);

  // Use analysisHistory when available, fall back to alerts
  const pool = sortedAnalyses.length > 0 ? sortedAnalyses : sortedAlerts;

  const threat = highestThreat(alerts);
  const confidence = avgConfidence(pool);
  const detCount = totalDetections(pool);
  const duration = monitoringDuration(pool);
  const susActs = suspiciousActivities(alerts);
  const frameCount = pool.length;

  let y = MT;

  // ===================================================================
  // PAGE 1 — Title & Executive Summary
  // ===================================================================

  // Gray banner
  doc.setFillColor(200, 200, 200);
  doc.rect(0, y - 10, PAGE_W, 18, "F");
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(30, 30, 30);
  doc.text("COMMANDER'S REPORT", PAGE_W / 2, y + 2, { align: "center" });
  y += 16;

  // Subtitle
  doc.setFont("helvetica", "italic").setFontSize(12).setTextColor(80, 80, 80);
  doc.text("Maritime Surveillance Analysis", ML, y);
  y += 10;

  // Metadata
  const meta: [string, string][] = [
    ["Report Generated:", utcNow()],
    ["Monitoring Duration:", duration],
    ["Frames Analyzed:", String(frameCount)],
  ];
  for (const [label, value] of meta) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(30, 30, 30);
    doc.text(label, ML, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, ML + 42, y);
    y += 6;
  }
  y += 6;

  // Executive Summary table
  y = drawSectionHeader(doc, y, "EXECUTIVE SUMMARY");
  y += 2;
  y = drawTable(
    doc, y,
    ["Metric", "Value"],
    [
      ["Overall Threat Level", threat],
      ["Total Objects Detected", String(detCount)],
      ["Suspicious Activity Frames", String(alerts.length)],
      ["AI Confidence Score", `${(confidence * 100).toFixed(1)}%`],
    ],
    [CW * 0.55, CW * 0.45],
  );
  y += 6;

  // Suspicious activities
  y = drawSectionHeader(doc, y, "SUSPICIOUS ACTIVITIES DETECTED");
  y += 2;
  if (susActs.length > 0) {
    y = drawBullets(doc, y, susActs);
  } else {
    doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(100, 100, 100);
    doc.text("No suspicious activities detected during monitoring period.", ML, y);
    y += 6;
  }

  // ===================================================================
  // PAGES 2-3 — Detailed Observations
  // ===================================================================

  doc.addPage();
  y = MT;
  y = drawSectionHeader(doc, y, "DETAILED OBSERVATIONS");
  y += 4;

  for (const a of pool) {
    const types = uniqueObjectTypes(a).join(", ") || "unknown";
    const topConf = a.detections.length > 0
      ? Math.max(...a.detections.map((d) => d.confidence))
      : 0;
    const tsLabel = `Timestamp ${((a.timestamp - (pool[0]?.timestamp ?? a.timestamp)) / 1000).toFixed(1)}s`;
    const metaLine = `Objects: ${a.detections.length} | Types: ${types} | Threat: ${a.threatLevel} | Confidence: ${(topConf * 100).toFixed(1)}%`;

    const descLines: string[] = doc.splitTextToSize(a.sceneDescription, CW);
    const block = 8 + 6 + descLines.length * 4.5 + 8;
    y = ensureSpace(doc, y, Math.min(block, 60));

    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(30, 30, 30);
    doc.text(tsLabel, ML, y);
    y += 6;

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(80, 80, 80);
    doc.text(metaLine, ML, y);
    y += 6;

    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(30, 30, 30);
    for (const line of descLines) {
      y = ensureSpace(doc, y, 5);
      doc.text(line, ML, y);
      y += 4.5;
    }
    y += 6;
  }

  // ===================================================================
  // PAGE 4 — Evidence Frames
  // ===================================================================

  doc.addPage();
  y = MT;
  y = drawSectionHeader(doc, y, "EVIDENCE FRAMES");
  y += 4;

  const frames = sortedAlerts.filter((a) => a.frameBase64).slice(0, 4);

  if (frames.length > 0) {
    for (const f of frames) {
      try {
        const hasDepth = !!f.depthMapBase64;
        const imgW = hasDepth ? CW * 0.48 : CW * 0.7;
        const imgH = imgW * 0.5625; // 16:9

        y = ensureSpace(doc, y, imgH + 12);

        const src = f.frameBase64.startsWith("data:")
          ? f.frameBase64
          : `data:image/jpeg;base64,${f.frameBase64}`;

        doc.addImage(src, "JPEG", ML, y, imgW, imgH);

        if (hasDepth) {
          const depthSrc = f.depthMapBase64!.startsWith("data:")
            ? f.depthMapBase64!
            : `data:image/jpeg;base64,${f.depthMapBase64!}`;
          doc.addImage(depthSrc, "JPEG", ML + imgW + 4, y, imgW, imgH);
        }

        y += imgH + 3;

        const relTs = ((f.timestamp - (pool[0]?.timestamp ?? f.timestamp)) / 1000).toFixed(1);
        doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(100, 100, 100);
        doc.text(`Frame at ${relTs}s - ${f.threatLevel} threat`, ML, y);
        y += 8;
      } catch (err) {
        console.warn("Failed to embed evidence frame in PDF:", err);
        doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(150, 100, 100);
        doc.text("[Frame could not be embedded]", ML, y);
        y += 8;
      }
    }
  } else {
    doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(100, 100, 100);
    doc.text("No evidence frames captured during this monitoring session.", ML, y);
    y += 8;
  }

  // ===================================================================
  // PAGE 5 — Recommended Actions
  // ===================================================================

  doc.addPage();
  y = MT;
  y = drawSectionHeader(doc, y, "RECOMMENDED ACTIONS");
  y += 4;
  y = drawBullets(doc, y, RECOMMENDED_ACTIONS[threat] ?? RECOMMENDED_ACTIONS.LOW);

  // Stream summary
  if (streamDetections.size > 0) {
    y += 8;
    y = ensureSpace(doc, y, 20);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(80, 80, 80);
    doc.text("Monitored Streams Summary:", ML, y);
    y += 6;

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 60);
    streamDetections.forEach((state) => {
      y = ensureSpace(doc, y, 6);
      doc.text(
        `\u2022 ${state.streamLabel}: ${state.detections.length} detections, ` +
        `threat ${state.threatLevel}, ${state.matchedIntents.length} intent matches`,
        ML + 2,
        y,
      );
      y += 5;
    });
  }

  // Footer
  y = ensureSpace(doc, y, 20);
  y += 10;
  doc.setDrawColor(180, 180, 180).setLineWidth(0.2);
  doc.line(ML, y, ML + CW, y);
  y += 5;
  doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(140, 140, 140);
  doc.text(
    `Generated by Tactical Insight Stream \u2022 ${utcNow()} \u2022 Classification: UNCLASSIFIED`,
    PAGE_W / 2, y, { align: "center" },
  );

  // ===================================================================
  // Download
  // ===================================================================

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`commanders-report-${dateStr}.pdf`);
}
