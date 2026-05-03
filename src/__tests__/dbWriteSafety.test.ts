import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// dbWriteSafety lives under scripts/ as a .mjs (the scripts/ folder is ESM
// run by node directly, not bundled by Next). Import it via dynamic import
// from the test so vitest's resolver picks up the file. Pinning the
// contract here so any future regression in the safety helper fails CI
// rather than hiding until an operator runs the script.

interface Flags {
  email: string | null;
  dryRun: boolean;
  confirm: boolean;
  backupDir: string;
  help: boolean;
}

interface DbWriteSafety {
  parseFlags(argv: readonly string[]): Flags;
  writeBackup(opts: {
    prevRow: Record<string, unknown>;
    scriptName: string;
    flags: Flags;
  }): Promise<string>;
  requireConfirm(flags: Flags): void;
}

async function loadHelper(): Promise<DbWriteSafety> {
  const url = "file:///" + resolve("scripts/_lib/dbWriteSafety.mjs").replace(/\\/g, "/");
  return (await import(/* @vite-ignore */ url)) as DbWriteSafety;
}

describe("scripts/_lib/dbWriteSafety.parseFlags", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`__EXIT_${code}__`);
    }) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("requires an email argument", async () => {
    const { parseFlags } = await loadHelper();
    expect(() => parseFlags(["node", "script.mjs"])).toThrow(/__EXIT_1__/);
  });

  it("defaults to dry-run when neither --confirm nor --dry-run is passed", async () => {
    const { parseFlags } = await loadHelper();
    const flags = parseFlags(["node", "script.mjs", "user@example.com"]);
    expect(flags.email).toBe("user@example.com");
    expect(flags.dryRun).toBe(true);
    expect(flags.confirm).toBe(false);
  });

  it("--confirm enables real writes (dryRun stays false)", async () => {
    const { parseFlags } = await loadHelper();
    const flags = parseFlags(["node", "script.mjs", "user@example.com", "--confirm"]);
    expect(flags.confirm).toBe(true);
    expect(flags.dryRun).toBe(false);
  });

  it("--dry-run is the explicit form of the default safe mode", async () => {
    const { parseFlags } = await loadHelper();
    const flags = parseFlags(["node", "script.mjs", "user@example.com", "--dry-run"]);
    expect(flags.dryRun).toBe(true);
    expect(flags.confirm).toBe(false);
  });

  it("--backup-dir overrides the default", async () => {
    const { parseFlags } = await loadHelper();
    const flags = parseFlags([
      "node",
      "script.mjs",
      "user@example.com",
      "--backup-dir=/tmp/backups",
      "--confirm"
    ]);
    expect(flags.backupDir).toBe("/tmp/backups");
  });

  it("rejects unknown flags rather than silently ignoring them (typo guard)", async () => {
    const { parseFlags } = await loadHelper();
    // --commit (not --confirm) is the typo that would silently no-op without this guard.
    expect(() =>
      parseFlags(["node", "script.mjs", "user@example.com", "--commit"])
    ).toThrow(/__EXIT_1__/);
  });

  it("--help exits 0 (not an error)", async () => {
    const { parseFlags } = await loadHelper();
    expect(() => parseFlags(["node", "script.mjs", "--help"])).toThrow(/__EXIT_0__/);
  });
});

// writeBackup writes the prevRow JSON to a timestamped file before any
// destructive UPDATE. Tests use a real tmpdir (not a mocked fs) so we
// exercise the actual mkdir/writeFile path that runs in production.
describe("scripts/_lib/dbWriteSafety.writeBackup", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dbsafety-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeFlags(overrides: Partial<Flags> = {}): Flags {
    return {
      email: "user@example.com",
      dryRun: false,
      confirm: true,
      backupDir: tmpDir,
      help: false,
      ...overrides
    };
  }

  it("writes a JSON file with the expected envelope (scriptName, email, timestamp, prevRow)", async () => {
    const { writeBackup } = await loadHelper();
    const prevRow = {
      credits: 5000,
      completed_missions: ["tutorial", "combat-1"],
      played_time_seconds: 1800
    };
    const fullPath = await writeBackup({
      prevRow,
      scriptName: "test-restore",
      flags: makeFlags()
    });
    expect(existsSync(fullPath)).toBe(true);
    const written = JSON.parse(readFileSync(fullPath, "utf8"));
    expect(written.scriptName).toBe("test-restore");
    expect(written.email).toBe("user@example.com");
    expect(written.prevRow).toEqual(prevRow);
    // ISO 8601 timestamp.
    expect(written.timestampUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("creates the backup directory if it doesn't exist (mkdir recursive)", async () => {
    const { writeBackup } = await loadHelper();
    const nestedDir = join(tmpDir, "nested", "deeper");
    expect(existsSync(nestedDir)).toBe(false);
    const fullPath = await writeBackup({
      prevRow: { credits: 0 },
      scriptName: "test",
      flags: makeFlags({ backupDir: nestedDir })
    });
    expect(existsSync(nestedDir)).toBe(true);
    expect(existsSync(fullPath)).toBe(true);
  });

  it("sanitizes the email in the filename (no path traversal via @ / / etc.)", async () => {
    const { writeBackup } = await loadHelper();
    const fullPath = await writeBackup({
      prevRow: { credits: 0 },
      scriptName: "test",
      flags: makeFlags({ email: "weird/../email@evil.com" })
    });
    // Filename must be inside backupDir — no escape via the email.
    expect(fullPath.startsWith(tmpDir)).toBe(true);
    // Slashes and @ symbols are scrubbed from the filename portion.
    const filename = fullPath.slice(tmpDir.length).replace(/^[\\/]+/, "");
    expect(filename).not.toContain("/");
    expect(filename).not.toContain("\\");
    expect(filename).not.toContain("@");
  });

  it("returns the absolute path of the written file", async () => {
    const { writeBackup } = await loadHelper();
    const fullPath = await writeBackup({
      prevRow: { credits: 0 },
      scriptName: "test",
      flags: makeFlags()
    });
    // Windows drive letter (D:\...) or POSIX root (/...).
    expect(fullPath).toMatch(/^[A-Za-z]:|^\//);
    expect(fullPath.endsWith(".json")).toBe(true);
  });
});

// requireConfirm is the kill-switch — dry-run exits 0 with a help message,
// missing --confirm exits 1, only confirmed-and-not-dry-run falls through.
// These behaviors determine whether the script actually mutates production
// data. Pinning them so a future refactor can't accidentally invert the
// logic and let unconfirmed POSTs through.
describe("scripts/_lib/dbWriteSafety.requireConfirm", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`__EXIT_${code}__`);
    }) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  function makeFlags(overrides: Partial<Flags> = {}): Flags {
    return {
      email: "user@example.com",
      dryRun: false,
      confirm: false,
      backupDir: "./db-backups",
      help: false,
      ...overrides
    };
  }

  it("exits 0 in dry-run mode (the safe default — no mutation, friendly hint)", async () => {
    const { requireConfirm } = await loadHelper();
    expect(() => requireConfirm(makeFlags({ dryRun: true }))).toThrow(/__EXIT_0__/);
  });

  it("exits 1 when neither dry-run nor confirm is set (defensive default)", async () => {
    const { requireConfirm } = await loadHelper();
    expect(() =>
      requireConfirm(makeFlags({ dryRun: false, confirm: false }))
    ).toThrow(/__EXIT_1__/);
  });

  it("falls through (does NOT exit) when --confirm is set and dryRun is false", async () => {
    const { requireConfirm } = await loadHelper();
    // No throw means no process.exit was called — script proceeds to UPDATE.
    expect(() =>
      requireConfirm(makeFlags({ dryRun: false, confirm: true }))
    ).not.toThrow();
  });

  it("dry-run beats confirm when both are set (safe-by-default semantics)", async () => {
    // If an operator passes both --dry-run and --confirm, dry-run wins.
    // Explicit dry-run intent should not be overridden by a stale --confirm
    // in shell history.
    const { requireConfirm } = await loadHelper();
    expect(() =>
      requireConfirm(makeFlags({ dryRun: true, confirm: true }))
    ).toThrow(/__EXIT_0__/);
  });
});
