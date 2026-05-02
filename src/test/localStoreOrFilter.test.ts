import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for the localStore QueryBuilder `or()` filter.
 *
 * These cover two bugs that were fixed:
 *
 * Bug 1 — Numeric comparison operators (gt, gte, lt, lte) in `or()` were
 *   comparing raw string values instead of coercing to numbers. This caused
 *   incorrect results like "9" > "10" evaluating to true (string comparison).
 *
 * Bug 2 — The `or()` parser split on ALL commas, so a filter value that
 *   contained a comma (e.g. `col.eq.hello,world`) would be incorrectly
 *   split into two broken clauses.
 */

// We need to import the localSupabase client to test the query builder
// Since it uses localStorage internally, we mock that in the jsdom env.
import localSupabase from "@/lib/localStore";

describe("localStore or() filter", () => {
  const TABLE = "__test_or_filter";

  beforeEach(async () => {
    // Clear the test table by deleting everything
    // Insert fresh test data
    try {
      // Delete all rows (no filter = match all)
      const { data: existing } = await localSupabase.from(TABLE).select();
      if (existing && existing.length > 0) {
        for (const row of existing) {
          await localSupabase.from(TABLE).delete().eq("id", row.id);
        }
      }
    } catch {}

    // Seed test data
    await localSupabase.from(TABLE).insert([
      { id: "r1", name: "alpha", score: 5,  status: "active" },
      { id: "r2", name: "beta",  score: 10, status: "inactive" },
      { id: "r3", name: "gamma", score: 15, status: "active" },
      { id: "r4", name: "delta", score: 100, status: "pending" },
      { id: "r5", name: "hello, world", score: 42, status: "active" },
    ]);
  });

  // ─── Bug 1: Numeric coercion in gt/gte/lt/lte ────────────────────────

  it("or() with gt correctly compares numbers, not strings", async () => {
    // Bug: without numeric coercion, "9" > "10" would be true (string order)
    // and "5" > "10" would also be true. With the fix, only score > 10 matches.
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("score.gt.10");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    // Only r3 (15), r4 (100), r5 (42) have score > 10
    expect(ids).toEqual(["r3", "r4", "r5"]);
  });

  it("or() with lte correctly compares numbers, not strings", async () => {
    // With string comparison, "100" <= "10" would be true (lexicographic).
    // With numeric coercion, only score <= 10 should match.
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("score.lte.10");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    // Only r1 (5) and r2 (10) have score <= 10
    expect(ids).toEqual(["r1", "r2"]);
  });

  it("or() with gte correctly compares numbers", async () => {
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("score.gte.15");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    // r3 (15), r4 (100), r5 (42)
    expect(ids).toEqual(["r3", "r4", "r5"]);
  });

  it("or() with lt correctly compares numbers", async () => {
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("score.lt.10");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    // Only r1 (5)
    expect(ids).toEqual(["r1"]);
  });

  it("or() combines multiple numeric clauses correctly", async () => {
    // score < 6 OR score > 50
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("score.lt.6,score.gt.50");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    // r1 (5 < 6) and r4 (100 > 50)
    expect(ids).toEqual(["r1", "r4"]);
  });

  // ─── Bug 2: Commas inside values ─────────────────────────────────────

  it("or() handles values containing commas without splitting them", async () => {
    // "hello, world" contains a comma. The old parser would split this into
    // two broken clauses: "name.eq.hello" and " world" which would fail.
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("name.eq.hello, world");

    const ids = (data as any[]).map((r: any) => r.id);
    expect(ids).toEqual(["r5"]);
  });

  it("or() handles comma-in-value alongside a normal clause", async () => {
    // First clause: name.eq.hello, world (value with comma)
    // Second clause: name.eq.alpha (normal)
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("name.eq.hello, world,name.eq.alpha");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    expect(ids).toEqual(["r1", "r5"]);
  });

  // ─── Mixed: eq and is still work ─────────────────────────────────────

  it("or() with eq matches string values correctly", async () => {
    const { data } = await localSupabase
      .from(TABLE)
      .select()
      .or("status.eq.active,status.eq.pending");

    const ids = (data as any[]).map((r: any) => r.id).sort();
    expect(ids).toEqual(["r1", "r3", "r4", "r5"]);
  });
});
