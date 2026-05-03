import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBackup } from "./_lib/dbWriteSafety.mjs";

// These tests pin the wiring contract added by
// chore/wire-dbwritesafety-into-restore-scripts:
//   - restore-player.mjs and improve-restore.mjs both call writeBackup() with
//     scriptName === their basename and the full save_games row + forensic
//     context (player_id, email) as prevRow.
//   - The call sits AFTER the BEFORE row read and BEFORE the UPDATE.
//   - A failing writeBackup must veto the UPDATE (ROLLBACK in restore-player,
//     plain exit in improve-restore).
//
// We grep the source for ordering invariants because subprocess-mocking the
// failure path needs fs + Pool + env stubs, which is too brittle for CI.

describe("writeBackup contract - restore-player.mjs envelope", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wirebackup-rp-"));
    console.log = () => undefined;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces a JSON snapshot whose envelope matches the wiring in restore-player.mjs", async () => {
    const before = {
      credits: 5000,
      completed_missions: ["tutorial", "combat-1"],
      unlocked_planets: ["tutorial", "combat-1", "shop"],
      played_time_seconds: 3600,
      ship_config: { slots: [{ id: "starter", level: 1, augments: [] }] },
      updated_at: "2026-05-01T12:00:00.000Z",
    };
    const playerId = "00000000-0000-0000-0000-000000000abc";
    const email = "alice@example.com";

    const fullPath = await writeBackup({
      prevRow: { ...before, player_id: playerId, email },
      scriptName: "restore-player",
      flags: { email, backupDir: tmpDir },
    });

    expect(existsSync(fullPath)).toBe(true);
    const written = JSON.parse(readFileSync(fullPath, "utf8"));
    expect(written.scriptName).toBe("restore-player");
    expect(written.email).toBe(email);
    expect(written.prevRow.player_id).toBe(playerId);
    expect(written.prevRow.email).toBe(email);
    expect(written.prevRow.credits).toBe(5000);
    expect(written.prevRow.completed_missions).toEqual([
      "tutorial",
      "combat-1",
    ]);
    expect(written.prevRow.ship_config).toEqual(before.ship_config);
  });
});

describe("writeBackup contract - improve-restore.mjs envelope", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wirebackup-ir-"));
    console.log = () => undefined;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces a JSON snapshot whose envelope matches the wiring in improve-restore.mjs", async () => {
    const before = {
      credits: 10000,
      completed_missions: ["tutorial", "combat-1", "boss-1", "pirate-beacon"],
      unlocked_planets: [
        "tutorial",
        "combat-1",
        "boss-1",
        "shop",
        "market",
        "pirate-beacon",
        "tubernovae-outpost",
        "ember-run",
      ],
      played_time_seconds: 1800,
      ship_config: { slots: [{ id: "starter", level: 1, augments: [] }] },
      seen_story_entries: ["intro", "combat-1-clear"],
      updated_at: "2026-05-02T15:00:00.000Z",
    };
    const playerId = "11111111-1111-1111-1111-111111111111";
    const email = "bob@example.com";

    const fullPath = await writeBackup({
      prevRow: { ...before, player_id: playerId, email },
      scriptName: "improve-restore",
      flags: { email, backupDir: tmpDir },
    });

    expect(existsSync(fullPath)).toBe(true);
    const written = JSON.parse(readFileSync(fullPath, "utf8"));
    expect(written.scriptName).toBe("improve-restore");
    expect(written.email).toBe(email);
    expect(written.prevRow.player_id).toBe(playerId);
    expect(written.prevRow.ship_config).toEqual(before.ship_config);
    // seen_story_entries is part of the forensic snapshot - improve-restore
    // does not touch it, but a future operator diffing the backup needs it.
    expect(written.prevRow.seen_story_entries).toEqual([
      "intro",
      "combat-1-clear",
    ]);
  });
});

// SOURCE-LEVEL contract: both scripts MUST place the writeBackup call BEFORE
// the UPDATE and follow it with a catch that vetoes the mutation on failure.
describe("writeBackup wiring - source order assertions", () => {
  it("restore-player.mjs catches a writeBackup failure and ROLLBACKs before UPDATE", () => {
    const src = readFileSync(
      join(import.meta.dirname, "restore-player.mjs"),
      "utf8",
    );
    const writeBackupIdx = src.indexOf('scriptName: "restore-player"');
    const updateIdx = src.search(/UPDATE\s+spacepotatis\.save_games/);
    expect(writeBackupIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(0);
    expect(writeBackupIdx).toBeLessThan(updateIdx);
    const between = src.slice(writeBackupIdx, updateIdx);
    expect(between).toMatch(/catch\s*\(\s*backupErr\s*\)/);
    expect(between).toMatch(/ROLLBACK/);
    expect(between).toMatch(/process\.exit\(1\)/);
  });

  it("improve-restore.mjs catches a writeBackup failure and exits before UPDATE", () => {
    const src = readFileSync(
      join(import.meta.dirname, "improve-restore.mjs"),
      "utf8",
    );
    const writeBackupIdx = src.indexOf('scriptName: "improve-restore"');
    const updateIdx = src.search(/UPDATE\s+spacepotatis\.save_games/);
    expect(writeBackupIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(0);
    expect(writeBackupIdx).toBeLessThan(updateIdx);
    const between = src.slice(writeBackupIdx, updateIdx);
    expect(between).toMatch(/catch\s*\(\s*backupErr\s*\)/);
    expect(between).toMatch(/process\.exit\(1\)/);
  });

  it("both scripts resolve BACKUP_DIR via import.meta.dirname (not process.cwd)", () => {
    for (const name of ["restore-player.mjs", "improve-restore.mjs"]) {
      const src = readFileSync(join(import.meta.dirname, name), "utf8");
      expect(src).toMatch(
        /path\.resolve\(import\.meta\.dirname,\s*["']\.\.\/db-backups["']\)/,
      );
      // Negative: no cwd-relative "./db-backups" passed as backupDir - the
      // exact hazard PR review flagged.
      expect(src).not.toMatch(/backupDir:\s*["']\.\/db-backups["']/);
    }
  });
});

describe("writeBackup behaviour - preconditions for the wiring", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wirebackup-pre-"));
    console.log = () => undefined;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("file lands on disk before writeBackup resolves (precondition for UPDATE)", async () => {
    const fullPath = await writeBackup({
      prevRow: { credits: 1 },
      scriptName: "restore-player",
      flags: { email: "u@x.com", backupDir: tmpDir },
    });
    expect(existsSync(fullPath)).toBe(true);
    expect(readdirSync(tmpDir).length).toBe(1);
  });

  it("throws when the backupDir is unusable (the failure path that triggers ROLLBACK)", async () => {
    // Node rejects null-byte paths with ERR_INVALID_ARG_VALUE on every
    // platform. This stands in for the disk-full / permission-denied class
    // of failure without needing platform-specific chmod gymnastics.
    const poisonedDir = join(tmpDir, "bad\u0000dir");
    await expect(
      writeBackup({
        prevRow: { credits: 1 },
        scriptName: "restore-player",
        flags: { email: "u@x.com", backupDir: poisonedDir },
      }),
    ).rejects.toThrow();
  });
});
