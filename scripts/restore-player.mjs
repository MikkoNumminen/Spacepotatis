// Recovery tool for spacepotatis.save_games. Originally written for the
// 2026-05-02 wipe; kept around because legitimate wipes will happen again.
//
// ============================================================================
// SAFETY CONTRACT — read this before running.
// ============================================================================
//
// This script bypasses /api/save and writes directly to Postgres. The
// server-side regression guard from PR #94 only inspects POST requests; direct
// DB writes are NOT gated by it. The script can destroy progress as easily as
// it can restore it.
//
// HISTORY: 2026-05-02 INCIDENT.
//   The first version of this script had hard-coded RESTORE_CREDITS and
//   RESTORE_PLAYTIME constants and ran straight to UPDATE on the first call.
//   An operator re-ran it ("let me check that again") and silently stomped a
//   real player's progress that had been earned since the first restore back
//   to the constants. There was no dry-run, no diff preview, no confirmation
//   prompt, no monotonic-shrink guard, no transaction. This rewrite fixes all
//   of that. Do NOT regress.
//
// THE TEN SAFEGUARDS (do not remove without a written reason):
//   1. Default mode is dry-run. You must pass --apply to write anything.
//   2. --apply requires --player-email=<email> matching the email argv.
//   3. Full BEFORE/AFTER per-field diff is printed in BOTH modes.
//   4. Monotonic-shrink guard: refuses to apply if completed_missions count
//      or unlocked_planets count would decrease. Override is the intentionally
//      awful --force-overwrite-i-know-this-destroys-progress (logged when used).
//      NOTE: credits and played_time_seconds are now monotonic BY CONSTRUCTION
//      (target = max(before, baseline)) — even with --force they cannot
//      regress. --force only matters for the LIST fields, where rollback to
//      a smaller set is the legitimate operator action.
//   5. The UPDATE runs inside a BEGIN ... COMMIT transaction; the BEFORE row
//      is read with SELECT ... FOR UPDATE inside the same transaction so two
//      concurrent operators on the same email cannot race the shrink check.
//      ROLLBACK on any error or refusal.
//   6. BEFORE state is printed with a timestamp before any prompt, so the
//      operator's terminal scrollback always has a recoverable copy.
//   7. Interactive [y/N] prompt with default N when --apply is set. Skip
//      ONLY when --no-prompt --apply --player-email=X
//      --i-have-printed-the-before-state are ALL present.
//   8. End-to-end subprocess smoke tests (restore-player.test.mjs) prove the
//      orchestration layer honors the safety contract — bare args = no DB
//      writes, --apply without --player-email = exit 2, mismatched
//      --player-email = exit 2 — so a regression in main() is caught by CI.
//   9. writeBackup() (scripts/_lib/dbWriteSafety.mjs) writes a JSON snapshot
//      of the prevRow to <repo>/db-backups/ INSIDE the transaction, after the
//      FOR UPDATE read passes the shrink check and the operator confirms,
//      but BEFORE the UPDATE runs. If writeBackup throws, ROLLBACK + exit 1.
//      The backup path is absolute (resolved from import.meta.dirname) so
//      cwd does not affect where snapshots land.
//  10. This header. If you're modifying the script, you've read this.
//
// USAGE
//   Dry run (default — safe, prints diff, exits 0):
//     node --env-file=.env.local scripts/restore-player.mjs <email>
//
//   Apply (interactive prompt):
//     node --env-file=.env.local scripts/restore-player.mjs <email> \
//       --apply --player-email=<email>
//
//   Apply non-interactively (CI / scripted):
//     node --env-file=.env.local scripts/restore-player.mjs <email> \
//       --apply --player-email=<email> --no-prompt \
//       --i-have-printed-the-before-state
//
//   Force shrink (DESTRUCTIVE — only when intentionally rolling back):
//     ... --force-overwrite-i-know-this-destroys-progress
//
// VALUES FROZEN AT 2026-05-02. The RESTORE_CREDITS constant is calibrated
// against the economy + cheat-delta caps as they existed on that date. If
// you reuse this script after a balance change or a different incident,
// review the constants before running — a stale 10000 might be either too
// generous (post-rebalance) or too stingy (post-economy-rework).

import { Pool } from "@neondatabase/serverless";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { writeBackup } from "./_lib/dbWriteSafety.mjs";

// Absolute path to <repo>/db-backups, resolved from this script's directory
// rather than process.cwd(). An operator running `node scripts/...` from a
// subdirectory must still land backups in the same gitignored location.
const BACKUP_DIR = path.resolve(import.meta.dirname, "../db-backups");

// Compensation BASELINES for the lost ship_config + actual-credits value.
// The player lost weapons, upgrades, reactor levels, and augments — none of
// which are derivable. 10000 credits is enough to re-buy a couple of weapons
// + a slot upgrade + some upgrades. Generous but not absurd; the credits-delta
// guard scales caps off completedMissions so future earned credits are bounded
// normally from this baseline.
//
// These are FLOORS, not absolute values. The applied target is
// max(before, baseline) so a re-run on a player who has since earned 50000
// credits cannot regress them to 10000 — even with --force-overwrite. This
// closes the 2026-05-02 footgun at its source for scalars.
const RESTORE_CREDITS = 10000;
const RESTORE_PLAYTIME = 1800; // 30 minutes — conservative starting floor
const RESTORE_COMPLETED = ["tutorial", "combat-1", "boss-1", "pirate-beacon"];
// Derived: INITIAL_UNLOCKED ('tutorial', 'shop', 'market', 'pirate-beacon',
// 'tubernovae-outpost') + every completed mission + everything the
// completion chain unlocks (combat-1's clear unlocks boss-1; pirate-beacon
// clear unlocks ember-run).
const RESTORE_UNLOCKED = [
  "tutorial",
  "combat-1",
  "boss-1",
  "shop",
  "market",
  "pirate-beacon",
  "tubernovae-outpost",
  "ember-run",
];

const FORCE_FLAG = "--force-overwrite-i-know-this-destroys-progress";

export function parseArgs(argv) {
  const positional = [];
  const flags = {
    apply: false,
    noPrompt: false,
    iHavePrintedTheBeforeState: false,
    force: false,
    playerEmail: null,
  };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--no-prompt") flags.noPrompt = true;
    else if (arg === "--i-have-printed-the-before-state")
      flags.iHavePrintedTheBeforeState = true;
    else if (arg === FORCE_FLAG) flags.force = true;
    else if (arg.startsWith("--player-email=")) {
      flags.playerEmail = arg.slice("--player-email=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length === 0) {
    throw new Error("missing <email> positional argument");
  }
  if (positional.length > 1) {
    throw new Error(`too many positional arguments: ${positional.join(", ")}`);
  }
  return { email: positional[0], ...flags };
}

export function computeDiff(before, target) {
  const beforeCredits = Number(before.credits ?? 0);
  const beforeCompleted = before.completed_missions ?? [];
  const beforeUnlocked = before.unlocked_planets ?? [];
  const beforePlaytime = Number(before.played_time_seconds ?? 0);
  const shrinks = [];
  if (target.credits < beforeCredits) {
    shrinks.push(`credits: ${beforeCredits} -> ${target.credits}`);
  }
  if (target.completed.length < beforeCompleted.length) {
    shrinks.push(
      `completed_missions count: ${beforeCompleted.length} -> ${target.completed.length}`,
    );
  }
  if (target.unlocked.length < beforeUnlocked.length) {
    shrinks.push(
      `unlocked_planets count: ${beforeUnlocked.length} -> ${target.unlocked.length}`,
    );
  }
  if (target.playtime < beforePlaytime) {
    shrinks.push(
      `played_time_seconds: ${beforePlaytime} -> ${target.playtime}`,
    );
  }
  return { shrinks };
}

function formatList(list) {
  if (!list || list.length === 0) return "[]";
  return `[${list.join(", ")}] (${list.length})`;
}

// Build the AFTER target. Scalars (credits, playtime) are monotonic by
// construction — max(before, baseline) — so a re-run cannot regress them
// even when --force-overwrite is passed. List fields are still hard-set to
// the baseline rosters; --force is the only way to apply a list shrink.
export function buildTarget(before) {
  const beforeCredits = Number(before.credits ?? 0);
  const beforePlaytime = Number(before.played_time_seconds ?? 0);
  return {
    credits: Math.max(beforeCredits, RESTORE_CREDITS),
    completed: RESTORE_COMPLETED,
    unlocked: RESTORE_UNLOCKED,
    playtime: Math.max(beforePlaytime, RESTORE_PLAYTIME),
  };
}

function printDiff(before, target) {
  const compactJson = (v) =>
    v === null || v === undefined ? "null" : JSON.stringify(v);
  const beforeCredits = Number(before.credits ?? 0);
  const beforePlaytime = Number(before.played_time_seconds ?? 0);
  const creditsNote =
    target.credits === beforeCredits
      ? " (unchanged — max-of-prev-or-baseline)"
      : ` (max(${beforeCredits}, baseline ${RESTORE_CREDITS}))`;
  const playtimeNote =
    target.playtime === beforePlaytime
      ? " (unchanged — max-of-prev-or-baseline)"
      : ` (max(${beforePlaytime}, baseline ${RESTORE_PLAYTIME}))`;
  console.log("\n--- DIFF (BEFORE -> AFTER) ---");
  console.log(
    `credits:              ${before.credits ?? "(none)"} -> ${target.credits}${creditsNote}`,
  );
  console.log(
    `completed_missions:   ${formatList(before.completed_missions)} -> ${formatList(target.completed)}`,
  );
  console.log(
    `unlocked_planets:     ${formatList(before.unlocked_planets)} -> ${formatList(target.unlocked)}`,
  );
  console.log(
    `played_time_seconds:  ${before.played_time_seconds ?? "(none)"} -> ${target.playtime}${playtimeNote}`,
  );
  console.log(
    `ship_config:          ${compactJson(before.ship_config)} -> (unchanged)`,
  );
  console.log("--- END DIFF ---\n");
}

async function confirm(prompt) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${prompt} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    console.error(
      "usage: restore-player.mjs <email> [--apply --player-email=<email>] " +
        "[--no-prompt --i-have-printed-the-before-state] " +
        `[${FORCE_FLAG}]`,
    );
    process.exit(2);
  }

  const mode = args.apply ? "APPLY" : "DRY-RUN";
  console.log(`mode:      ${mode}`);
  console.log(`email:     ${args.email}`);
  console.log(`timestamp: ${new Date().toISOString()}`);

  if (args.apply) {
    if (!args.playerEmail) {
      console.error(
        "\nrefusing: --apply requires --player-email=<email> matching the positional email.",
      );
      process.exit(2);
    }
    if (args.playerEmail !== args.email) {
      console.error(
        `\nrefusing: --player-email (${args.playerEmail}) does not match positional email (${args.email}).`,
      );
      process.exit(2);
    }
  }

  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const { rows: players } = await pool.query(
      "SELECT id FROM spacepotatis.players WHERE email = $1",
      [args.email],
    );
    if (players.length === 0) {
      console.error(`no player with email ${args.email}`);
      process.exit(1);
    }
    const playerId = players[0].id;
    console.log(`player_id: ${playerId}`);

    // Dry-run path: pool-read is fine — no write, no need to lock the row.
    // Apply path: read happens INSIDE the transaction with FOR UPDATE so a
    // concurrent operator cannot race the shrink check.
    if (!args.apply) {
      const beforeRes = await pool.query(
        `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
                ship_config, updated_at
         FROM spacepotatis.save_games WHERE player_id = $1 AND slot = 1`,
        [playerId],
      );
      if (beforeRes.rows.length === 0) {
        console.error(`no save_games row for player_id=${playerId} slot=1`);
        process.exit(1);
      }
      const before = beforeRes.rows[0];
      console.log(`\nBEFORE (read at ${new Date().toISOString()}):`);
      console.log(JSON.stringify(before, null, 2));

      const target = buildTarget(before);
      printDiff(before, target);

      const { shrinks } = computeDiff(before, target);
      if (shrinks.length > 0) {
        console.log(
          "MONOTONIC-SHRINK WARNING — applying would DECREASE list field(s):",
        );
        for (const s of shrinks) console.log(`  - ${s}`);
        console.log(
          `(scalars are max-of-prev-or-baseline so they cannot shrink. The above list shrinks would require ${FORCE_FLAG}.)`,
        );
        console.log("");
      }

      console.log(
        "DRY-RUN complete (no DB writes). Pass --apply to perform the restore.",
      );
      return;
    }

    // --apply path: open a transaction and lock the row for the lifetime of
    // the read-decide-write critical section.
    const client = await pool.connect();
    let txOpen = false;
    try {
      await client.query("BEGIN");
      txOpen = true;
      const beforeRes = await client.query(
        `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
                ship_config, updated_at
         FROM spacepotatis.save_games
         WHERE player_id = $1 AND slot = 1
         FOR UPDATE`,
        [playerId],
      );
      if (beforeRes.rows.length === 0) {
        await client.query("ROLLBACK");
        txOpen = false;
        console.error(`no save_games row for player_id=${playerId} slot=1`);
        process.exit(1);
      }
      const before = beforeRes.rows[0];
      console.log(
        `\nBEFORE (read at ${new Date().toISOString()}, row LOCKED FOR UPDATE):`,
      );
      console.log(JSON.stringify(before, null, 2));

      const target = buildTarget(before);
      printDiff(before, target);

      const { shrinks } = computeDiff(before, target);
      if (shrinks.length > 0) {
        console.log(
          "MONOTONIC-SHRINK WARNING — applying would DECREASE list field(s):",
        );
        for (const s of shrinks) console.log(`  - ${s}`);
        console.log("");
        if (!args.force) {
          await client.query("ROLLBACK");
          txOpen = false;
          console.error(
            `refusing to apply: would shrink list field(s). Override with ${FORCE_FLAG} ` +
              "ONLY if you are intentionally rolling back a player's progress.",
          );
          process.exit(3);
        }
        console.warn(
          `${FORCE_FLAG} was passed — proceeding with destructive list shrink. ` +
            "Operator accepted responsibility.",
        );
      }

      const skipPrompt =
        args.noPrompt &&
        args.iHavePrintedTheBeforeState &&
        args.playerEmail === args.email;
      if (!skipPrompt) {
        const ok = await confirm(
          `Apply this restore to ${args.email} (player_id=${playerId})?`,
        );
        if (!ok) {
          await client.query("ROLLBACK");
          txOpen = false;
          console.log("aborted by operator (no DB writes).");
          return;
        }
      } else {
        console.log("--no-prompt set — skipping interactive confirmation.");
      }

      // Capture the prevRow as a JSON snapshot BEFORE the UPDATE. If this
      // throws (disk full, permission denied), ROLLBACK and exit non-zero —
      // the whole point of the backup is recoverability, so a missing
      // snapshot must veto the mutation.
      try {
        const backupPath = await writeBackup({
          prevRow: { ...before, player_id: playerId, email: args.email },
          scriptName: "restore-player",
          flags: { email: args.email, backupDir: BACKUP_DIR },
        });
        console.log(`prevRow snapshot: ${backupPath}`);
      } catch (backupErr) {
        await client.query("ROLLBACK");
        txOpen = false;
        console.error(
          `error: writeBackup failed (${backupErr.message}) — refusing to UPDATE without a recoverable snapshot.`,
        );
        process.exit(1);
      }

      const result = await client.query(
        `UPDATE spacepotatis.save_games
         SET credits = $1,
             completed_missions = $2,
             unlocked_planets = $3,
             played_time_seconds = $4,
             updated_at = NOW()
         WHERE player_id = $5 AND slot = 1
         RETURNING credits, completed_missions, unlocked_planets, played_time_seconds, updated_at`,
        [
          target.credits,
          target.completed,
          target.unlocked,
          target.playtime,
          playerId,
        ],
      );
      if (result.rowCount !== 1) {
        await client.query("ROLLBACK");
        txOpen = false;
        console.error(
          `expected 1 row updated, got ${result.rowCount} — rolled back`,
        );
        process.exit(1);
      }
      await client.query("COMMIT");
      txOpen = false;
      console.log("\nAFTER (committed):");
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log("\nrestore complete");
    } catch (err) {
      if (txOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // ignore rollback failure — original error is what matters
        }
      }
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

// Only run main() when this file is the entry point. Allows the parseArgs /
// computeDiff helpers to be imported by tests without touching the DB.
const entry = process.argv[1] ?? "";
const isEntryPoint = entry.endsWith("restore-player.mjs");

if (isEntryPoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
