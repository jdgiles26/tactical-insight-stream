import { describe, it, expect } from "vitest";
import {
  computePriorityScore,
  scoreToPriorityLevel,
} from "@/lib/priorityScoring";

describe("computePriorityScore", () => {
  it("returns 0 for empty text", () => {
    expect(computePriorityScore("")).toBe(0);
    expect(computePriorityScore("   ")).toBe(0);
  });

  it("returns a score > 0 for threat keywords", () => {
    const score = computePriorityScore("missile attack detected near the border");
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns a high score for combined threat + military + urgency", () => {
    const score = computePriorityScore(
      "EMERGENCY: hostile military submarine launched torpedo attack"
    );
    expect(score).toBeGreaterThan(0.7);
  });

  it("returns a low score for benign text", () => {
    const score = computePriorityScore("The weather is nice today, sunny skies ahead");
    expect(score).toBeLessThan(0.2);
  });

  it("clamps result to [0, 1]", () => {
    const score = computePriorityScore(
      "attack missile nuclear explosion bombing strike ambush sniper ied assassination chemical biological radiological invasion war terror hostile"
    );
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreToPriorityLevel", () => {
  it("returns critical for score >= 0.85", () => {
    expect(scoreToPriorityLevel(0.85)).toBe("critical");
    expect(scoreToPriorityLevel(0.95)).toBe("critical");
  });

  it("returns high for 0.65 <= score < 0.85", () => {
    expect(scoreToPriorityLevel(0.65)).toBe("high");
    expect(scoreToPriorityLevel(0.80)).toBe("high");
  });

  it("returns medium for 0.4 <= score < 0.65", () => {
    expect(scoreToPriorityLevel(0.40)).toBe("medium");
    expect(scoreToPriorityLevel(0.60)).toBe("medium");
  });

  it("returns low for 0.2 <= score < 0.4", () => {
    expect(scoreToPriorityLevel(0.20)).toBe("low");
    expect(scoreToPriorityLevel(0.35)).toBe("low");
  });

  it("returns routine for score < 0.2", () => {
    expect(scoreToPriorityLevel(0.0)).toBe("routine");
    expect(scoreToPriorityLevel(0.19)).toBe("routine");
  });
});
