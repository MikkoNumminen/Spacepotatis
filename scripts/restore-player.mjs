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
// THE EIGHT SAFEGUARDS (do not remove without a written reason):
//   1. Default mode is dry-run. You must pass --apply to write anything.
//   2. --apply requires --player-email=<email> matching the email argv.
//   3. Full BEFORE/AFTER per-field diff is printed in BOTH modes.
//   4. Monotonic-shrink guard: refuses to apply if completed_missions count,
//      unlocked_planets count, played_time_seconds, or credits would decrease.
//      Override is the intentionally awful flag
//      --force-overwrite-i-know-this-destroys-progress (logged when used).
//   5. The UPDATE runs inside a BEGIN ... COMMIT transaction; ROLLBACK on
//      any error or refusal.
//   6. BEFORE state is printed with a timestamp before any prompt, so the
//      operator's terminal scrollback always has a recoverable copy.
//   7. Interactive [y/N] prompt with default N when --apply is set. Skip
//      ONLY when --no-prompt --apply --player-email=X
//      --i-have-printed-the-before-state are ALL present.
//   8. This header. If you're modifying the script, you've read this.
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

// Compensation for the lost ship_config + actual-credits value. The player
// lost weapons, upgrades, reactor levels, and augments — none of which are
// derivable. 10000 credits is enough to re-buy a couple of weapons + a slot
// upgrade + some upgrades. Generous but not absurd; the credits-delta guard
// scales caps off completedMissions so future earned credits are bounded
// normally from this baseline.
const RESTORE_CREDITS = 10000;
const RESTORE_PLAYTIME = 1800; // 30 minutes — conservative starting point
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

function printDiff(before, target) {
  const compactJson = (v) =>
    v === null || v === undefined ? "null" : JSON.stringify(v);
  console.log("\n--- DIFF (BEFORE -> AFTER) ---");
  console.log(
    `credits:              ${before.credits ?? "(none)"} -> ${target.credits}`,
  );
  console.log(
    `completed_missions:   ${formatList(before.completed_missions)} -> ${formatList(target.completed)}`,
  );
  console.log(
    `unlocked_planets:     ${formatList(before.unlocked_planets)} -> ${formatList(target.unlocked)}`,
  );
  console.log(
    `played_time_seconds:  ${before.played_time_seconds ?? "(none)"} -> ${target.playtime}`,
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

    const target = {
      credits: RESTORE_CREDITS,
      completed: RESTORE_COMPLETED,
      unlocked: RESTORE_UNLOCKED,
      playtime: RESTORE_PLAYTIME,
    };
    printDiff(before, target);

    const { shrinks } = computeDiff(before, target);
    if (shrinks.length > 0) {
      console.log("MONOTONIC-SHRINK WARNING — applying would DECREASE:");
      for (const s of shrinks) console.log(`  - ${s}`);
      console.log("");
      if (args.apply && !args.force) {
        console.error(
          `refusing to apply: would shrink monotonic field(s). Override with ${FORCE_FLAG} ` +
            "ONLY if you are intentionally rolling back a player's progress.",
        );
        process.exit(3);
      }
      if (args.apply && args.force) {
        console.warn(
          `${FORCE_FLAG} was passed — proceeding with destructive shrink. ` +
            "Operator accepted responsibility.",
        );
      }
    }

    if (!args.apply) {
      console.log(
        "dry-run complete (no DB writes). Pass --apply to perform the restore.",
      );
      return;
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
        console.log("aborted by operator (no DB writes).");
        return;
      }
    } else {
      console.log("--no-prompt set — skipping interactive confirmation.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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
          RESTORE_CREDITS,
          RESTORE_COMPLETED,
          RESTORE_UNLOCKED,
          RESTORE_PLAYTIME,
          playerId,
        ],
      );
      if (result.rowCount !== 1) {
        await client.query("ROLLBACK");
        console.error(
          `expected 1 row updated, got ${result.rowCount} — rolled back`,
        );
        process.exit(1);
      }
      await client.query("COMMIT");
      console.log("\nAFTER (committed):");
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log("\nrestore complete");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure — original error is what matters
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
