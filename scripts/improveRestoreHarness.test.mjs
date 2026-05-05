// Regression tests for SEC-007+021: improve-restore.mjs safety harness.
//
// SEC-007: verify the script imports parseFlags + requireConfirm from
//   dbWriteSafety.mjs and that the destructive UPDATE is gated behind a
//   requireConfirm() call in the source.
// SEC-021: verify the UPDATE is wrapped in a BEGIN/FOR UPDATE/COMMIT
//   transaction so concurrent operators cannot race the read-then-write window.
//
// Uses source-grep approach (same pattern as writeBackup-wiring.test.mjs:138+)
// to avoid needing a real DB or complex subprocess mocking.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(import.meta.dirname, "improve-restore.mjs"),
  "utf8",
);

describe("SEC-007: improve-restore.mjs safety harness", () => {
  it("imports parseFlags from dbWriteSafety.mjs", () => {
    expect(src).toMatch(/parseFlags/);
    expect(src).toMatch(/dbWriteSafety\.mjs/);
  });

  it("imports requireConfirm from dbWriteSafety.mjs", () => {
    expect(src).toMatch(/requireConfirm/);
  });

  it("calls parseFlags (not manual process.argv[2] positional grab)", () => {
    // The old footgun: `const email = process.argv[2]`. Should be gone.
    expect(src).not.toMatch(/process\.argv\[2\]/);
    // Must use parseFlags instead
    expect(src).toMatch(/parseFlags\(/);
  });

  it("calls requireConfirm before the UPDATE runs", () => {
    const requireConfirmIdx = src.indexOf("requireConfirm(");
    const updateIdx = src.search(/UPDATE\s+spacepotatis\.save_games/);
    expect(requireConfirmIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(0);
    expect(requireConfirmIdx).toBeLessThan(updateIdx);
  });

  it("default mode is dry-run (no --confirm = no DB open)", () => {
    // parseFlags must set dryRun when --confirm absent — this is
    // enforced by the helper itself; confirm the script passes
    // process.argv (not a hand-sliced subset that might skip the gate).
    expect(src).toMatch(/parseFlags\(process\.argv\)/);
  });

  it("has --player-email cross-check against positional email", () => {
    // Mirror of restore-player.mjs:261-269 pattern
    expect(src).toMatch(/player-email/);
    expect(src).toMatch(/playerEmail/);
  });
});

describe("SEC-021: improve-restore.mjs transaction wrapper", () => {
  it("opens a BEGIN transaction before UPDATE", () => {
    const beginIdx = src.search(/['"]BEGIN['"]/);
    const updateIdx = src.search(/UPDATE\s+spacepotatis\.save_games/);
    expect(beginIdx).toBeGreaterThan(0);
    expect(beginIdx).toBeLessThan(updateIdx);
  });

  it("uses SELECT FOR UPDATE to lock the row before UPDATE", () => {
    const forUpdateIdx = src.search(/FOR\s+UPDATE/);
    const updateIdx = src.search(/UPDATE\s+spacepotatis\.save_games/);
    expect(forUpdateIdx).toBeGreaterThan(0);
    expect(forUpdateIdx).toBeLessThan(updateIdx);
  });

  it("COMMITs the transaction after UPDATE", () => {
    const commitIdx = src.search(/['"]COMMIT['"]/);
    const updateIdx = src.search(/UPDATE\s+spacepotatis\.save_games/);
    expect(commitIdx).toBeGreaterThan(0);
    expect(commitIdx).toBeGreaterThan(updateIdx);
  });

  it("ROLLBACKs on error", () => {
    expect(src).toMatch(/['"]ROLLBACK['"]/);
  });

  it("uses pool.connect() for transactional client (not pool.query)", () => {
    // Transactions require a dedicated client (not pool.query which can
    // spread queries across different connections).
    expect(src).toMatch(/pool\.connect\(\)/);
  });
});
