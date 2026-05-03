import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DEFAULT_THRESHOLDS,
  evaluateReadiness,
  formatReport,
} from "./check-audit-readiness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(HERE, "check-audit-readiness.mjs");

function runScript() {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_URL_UNPOOLED;
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

// Pure-logic tests for the readiness evaluator. The script's main() is the
// thin DB shell around these helpers; covering them here proves the verdict
// + missing-threshold list without spinning up Postgres.
describe("evaluateReadiness", () => {
  it("treats an empty table as NOT YET with all three thresholds unmet", () => {
    const row = {
      total_rows: 0,
      distinct_players: 0,
      days_of_data: 0,
    };
    const result = evaluateReadiness(row);
    expect(result.ready).toBe(false);
    expect(result.unmet).toEqual([
      "total_rows",
      "distinct_players",
      "days_of_data",
    ]);
  });

  it("treats a missing/undefined row as NOT YET (no crash on first-ever run)", () => {
    const result = evaluateReadiness(undefined);
    expect(result.ready).toBe(false);
    expect(result.unmet.length).toBe(3);
  });

  it("returns READY when all three thresholds are met exactly", () => {
    const row = {
      total_rows: 100,
      distinct_players: 2,
      days_of_data: 3,
    };
    const result = evaluateReadiness(row);
    expect(result.ready).toBe(true);
    expect(result.unmet).toEqual([]);
  });

  it("returns READY when all three thresholds are exceeded comfortably", () => {
    const row = {
      total_rows: 5000,
      distinct_players: 25,
      days_of_data: 14.7,
    };
    const result = evaluateReadiness(row);
    expect(result.ready).toBe(true);
    expect(result.unmet).toEqual([]);
  });

  it("flags only the unmet threshold(s)", () => {
    const row = {
      total_rows: 50,
      distinct_players: 5,
      days_of_data: 7,
    };
    const result = evaluateReadiness(row);
    expect(result.ready).toBe(false);
    expect(result.unmet).toEqual(["total_rows"]);
  });

  it("accepts string-typed counts (Postgres returns BIGINT as string)", () => {
    const row = {
      total_rows: "150",
      distinct_players: "3",
      days_of_data: "5.25",
    };
    const result = evaluateReadiness(row);
    expect(result.ready).toBe(true);
  });

  it("respects custom thresholds when supplied", () => {
    const row = {
      total_rows: 10,
      distinct_players: 1,
      days_of_data: 1,
    };
    const result = evaluateReadiness(row, {
      totalRows: 10,
      distinctPlayers: 1,
      daysOfData: 1,
    });
    expect(result.ready).toBe(true);
  });

  // Parametric — the README + script header both promise these specific
  // verdict / missing-threshold combinations. If the matrix drifts the
  // workflow's branching logic silently breaks.
  describe.each([
    {
      name: "rows just under threshold",
      row: { total_rows: 99, distinct_players: 5, days_of_data: 10 },
      ready: false,
      unmet: ["total_rows"],
    },
    {
      name: "single player, lots of data, lots of time",
      row: { total_rows: 500, distinct_players: 1, days_of_data: 30 },
      ready: false,
      unmet: ["distinct_players"],
    },
    {
      name: "first day after launch",
      row: { total_rows: 200, distinct_players: 4, days_of_data: 0.5 },
      ready: false,
      unmet: ["days_of_data"],
    },
    {
      name: "rows + players short, days OK",
      row: { total_rows: 30, distinct_players: 1, days_of_data: 7 },
      ready: false,
      unmet: ["total_rows", "distinct_players"],
    },
  ])("$name", ({ row, ready, unmet }) => {
    it("matches the documented verdict + unmet list", () => {
      const result = evaluateReadiness(row);
      expect(result.ready).toBe(ready);
      expect(result.unmet).toEqual(unmet);
    });
  });

  it("exposes the default thresholds as 100 / 2 / 3", () => {
    expect(DEFAULT_THRESHOLDS.totalRows).toBe(100);
    expect(DEFAULT_THRESHOLDS.distinctPlayers).toBe(2);
    expect(DEFAULT_THRESHOLDS.daysOfData).toBe(3);
  });
});

describe("formatReport", () => {
  it("notes the empty-table case and still prints a STATUS line", () => {
    const row = { total_rows: 0 };
    const evaluation = evaluateReadiness(row);
    const report = formatReport(row, evaluation);
    expect(report).toContain("(table is empty");
    expect(report).toContain("STATUS: NOT YET");
    expect(report).toContain("waiting for:");
  });

  it("renders all three threshold lines with a pass/fail mark", () => {
    const row = {
      total_rows: 200,
      distinct_players: 5,
      days_of_data: 7,
      first_audit: new Date("2026-04-30T10:00:00Z"),
      latest_audit: new Date("2026-05-02T15:00:00Z"),
      avg_payload_bytes: 1234,
      successes: 180,
      rejections: 15,
      server_errors: 5,
    };
    const evaluation = evaluateReadiness(row);
    const report = formatReport(row, evaluation);
    expect(report).toContain("[OK] total_rows: 200 / 100");
    expect(report).toContain("[OK] distinct_players: 5 / 2");
    expect(report).toContain("[OK] days_of_data: 7 / 3");
    expect(report).toContain("STATUS: READY");
  });

  it("includes the response-status distribution and payload size when populated", () => {
    const row = {
      total_rows: 200,
      distinct_players: 5,
      days_of_data: 7,
      first_audit: new Date("2026-04-30T10:00:00Z"),
      latest_audit: new Date("2026-05-02T15:00:00Z"),
      avg_payload_bytes: 1234,
      successes: 180,
      rejections: 15,
      server_errors: 5,
    };
    const evaluation = evaluateReadiness(row);
    const report = formatReport(row, evaluation);
    expect(report).toContain("204 (success):    180");
    expect(report).toContain("422 (rejected):   15");
    expect(report).toContain(">=500 (errors):   5");
    expect(report).toContain("avg_payload_bytes:  1234");
  });

  it("lists the unmet thresholds in the STATUS line when NOT YET", () => {
    const row = { total_rows: 50, distinct_players: 1, days_of_data: 1 };
    const evaluation = evaluateReadiness(row);
    const report = formatReport(row, evaluation);
    expect(report).toContain(
      "STATUS: NOT YET (waiting for: total_rows, distinct_players, days_of_data)",
    );
  });
});

// Subprocess smoke — proves the env-error contract holds end-to-end. The
// GitHub Actions workflow branches on exit code 2 to fail loudly when the
// secret isn't wired up; if main() ever silently returns 1 instead, the
// cron will look healthy while the underlying check is broken.
describe("check-audit-readiness main() env-error contract", () => {
  it("exits 2 with a helpful message when DATABASE_URL is missing", () => {
    const result = runScript();
    expect(result.status).toBe(2);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(/DATABASE_URL not set/);
  });
});
