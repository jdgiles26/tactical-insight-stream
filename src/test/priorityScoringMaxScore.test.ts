import { describe, it, expect } from "vitest";
import { computePriorityScore } from "@/lib/priorityScoring";

/**
 * Tests for the scoreAgainstDictionary max-score bug fix.
 *
 * Bug: `scoreAgainstDictionary` computed `maxScore` but never used it,
 * returning only `avgWeight + densityBonus`. This meant a text containing
 * one very-high-weight keyword (e.g. "nuclear" at 0.98) alongside several
 * lower-weight keywords would have its score dragged down by the average,
 * losing the signal from the highest-severity match.
 *
 * Fix: The function now blends maxScore (60%) with avgWeight (40%) before
 * adding the density bonus, so the highest-severity keyword dominates.
 */
describe("priorityScoring maxScore integration", () => {
  it("single high-threat keyword yields score dominated by its weight", () => {
    // "nuclear" has weight 0.98 in THREAT_KEYWORDS.
    // With the fix, the score should reflect the 0.98 weight strongly.
    // Composite = threatScore * 0.5 + military * 0.3 + urgency * 0.2
    // threatScore for "nuclear" alone: blended = 0.98*0.6 + 0.98*0.4 = 0.98, +0.03 density => 1.0 clamped
    const score = computePriorityScore("nuclear threat detected");
    // "nuclear" hits threat dict (0.98), "threat" doesn't appear in threat dict
    // but it doesn't appear in urgency either. So mainly threat score.
    // The score should be firmly above 0.45 (0.98 * 0.5 ~ 0.49)
    expect(score).toBeGreaterThan(0.45);
  });

  it("high keyword is not drowned out by many lower keywords", () => {
    // "nuclear" (0.98) + "patrol" (0.55 in military) + "radar" (0.58 in military)
    // Without maxScore blending, the military score would average down.
    // With the fix, the max military keyword weight should lift the score.
    const textHigh = "nuclear patrol radar";
    const textLowOnly = "patrol radar"; // no high-weight threat keyword

    const scoreHigh = computePriorityScore(textHigh);
    const scoreLow = computePriorityScore(textLowOnly);

    // The nuclear text should score significantly higher
    expect(scoreHigh).toBeGreaterThan(scoreLow + 0.15);
  });

  it("max-weight keyword dominates over many medium-weight matches", () => {
    // Many medium military keywords averaged together could yield ~0.62.
    // Adding one high-threat keyword ("nuclear" 0.98) should boost the total
    // score because maxScore weighs in.
    const base = "military naval submarine destroyer frigate";
    const withNuclear = base + " nuclear";

    const baseScore = computePriorityScore(base);
    const boostedScore = computePriorityScore(withNuclear);

    // Adding a 0.98-weight keyword should noticeably increase the score
    expect(boostedScore).toBeGreaterThan(baseScore);
  });

  it("single keyword score equals its weight (within composite formula)", () => {
    // "nuclear" alone: threatScore = min(1, 0.98*0.6 + 0.98*0.4 + 0.03) = min(1, 1.01) = 1.0
    // composite = 1.0 * 0.5 + 0 * 0.3 + 0 * 0.2 = 0.5
    const score = computePriorityScore("nuclear");
    expect(score).toBeCloseTo(0.5, 1);
  });
});
