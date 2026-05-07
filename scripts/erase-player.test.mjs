// Regression tests for SEC-010 — erase-player.mjs cross-check gates.
//
// The destructive DB path can't be tested in CI (no test DB, and a real
// DELETE is destructive). What CAN be tested: the pure argv-parsing and
// gate-validation logic. These are the two gates that catch operator typos
// before any DB connection is opened.

import { describe, it, expect } from "vitest";

import {
  parseEraseFlags,
  validateEraseFlags,
} from "./erase-player.mjs";

describe("SEC-010: parseEraseFlags argv parsing", () => {
  it("extracts the positional email", () => {
    const flags = parseEraseFlags([
      "node",
      "scripts/erase-player.mjs",
      "alice@example.com",
    ]);
    expect(flags.email).toBe("alice@example.com");
    expect(flags.confirm).toBe(false);
    expect(flags.playerEmail).toBe(null);
  });

  it("extracts --confirm and --player-email flags", () => {
    const flags = parseEraseFlags([
      "node",
      "scripts/erase-player.mjs",
      "alice@example.com",
      "--confirm",
      "--player-email=alice@example.com",
    ]);
    expect(flags.email).toBe("alice@example.com");
    expect(flags.confirm).toBe(true);
    expect(flags.playerEmail).toBe("alice@example.com");
  });

  it("captures --player-email as null when absent", () => {
    const flags = parseEraseFlags([
      "node",
      "scripts/erase-player.mjs",
      "alice@example.com",
      "--confirm",
    ]);
    expect(flags.playerEmail).toBe(null);
  });

  it("captures a mismatched --player-email value verbatim", () => {
    const flags = parseEraseFlags([
      "node",
      "scripts/erase-player.mjs",
      "alice@example.com",
      "--confirm",
      "--player-email=bob@example.com",
    ]);
    expect(flags.email).toBe("alice@example.com");
    expect(flags.playerEmail).toBe("bob@example.com");
  });
});

describe("SEC-010: validateEraseFlags gate logic", () => {
  it("dry-run mode passes without --player-email cross-check", () => {
    const result = validateEraseFlags({
      email: "alice@example.com",
      confirm: false,
      dryRun: false,
      playerEmail: null,
    });
    expect(result.ok).toBe(true);
  });

  it("explicit --dry-run also passes without cross-check", () => {
    const result = validateEraseFlags({
      email: "alice@example.com",
      confirm: true,
      dryRun: true,
      playerEmail: null,
    });
    expect(result.ok).toBe(true);
  });

  it("--confirm without --player-email is rejected", () => {
    const result = validateEraseFlags({
      email: "alice@example.com",
      confirm: true,
      dryRun: false,
      playerEmail: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing-cross-check");
    expect(result.message).toMatch(/--player-email/);
  });

  it("--confirm with mismatched --player-email is rejected", () => {
    const result = validateEraseFlags({
      email: "alice@example.com",
      confirm: true,
      dryRun: false,
      playerEmail: "bob@example.com",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("email-mismatch");
    expect(result.message).toMatch(/does not match/);
  });

  it("--confirm with matching --player-email passes", () => {
    const result = validateEraseFlags({
      email: "alice@example.com",
      confirm: true,
      dryRun: false,
      playerEmail: "alice@example.com",
    });
    expect(result.ok).toBe(true);
  });
});
