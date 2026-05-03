import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

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
