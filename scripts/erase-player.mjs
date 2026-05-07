// GDPR right-to-erasure operator tool for spacepotatis.
//
// ============================================================================
// WHAT IT DOES
// ============================================================================
//
// Cascade-deletes a player's entire data set from production:
//   spacepotatis.players WHERE email = $1
//   → spacepotatis.save_games   (CASCADE)
//   → spacepotatis.leaderboard  (CASCADE)
//   → spacepotatis.save_audit   (CASCADE)
//
// The deletion runs inside BEGIN … COMMIT with a SELECT … FOR UPDATE lock on
// the players row, so a concurrent save POST cannot race the delete. The
// player's save_games row is snapshotted to db-backups/ via writeBackup()
// BEFORE the DELETE, providing a recoverable record for the support-side
// conversation.
//
// ============================================================================
// WHY IT EXISTS
// ============================================================================
//
// GDPR Article 17 gives EU data subjects the right to request erasure.
// CLAUDE.md §15 requires that any script mutating production data use an
// explicit safety harness (parseFlags, requireConfirm, writeBackup). This
// script is the compliant operator tool — do NOT issue ad-hoc SQL instead.
//
// ============================================================================
// WHEN TO USE
// ============================================================================
//
// Only after the operator has verified the erasure request per the runbook in
// docs/RIGHT_TO_ERASURE.md. Never run against an email you did not explicitly
// verify from a support ticket. The deletion is CASCADE and irreversible
// (recovery requires the db-backups/ snapshot, which exists only if this
// script's backup step ran — ad-hoc SQL has no such guarantee).
//
// ============================================================================
// DRY-RUN DEFAULT — SAFE BY DEFAULT
// ============================================================================
//
// Without --confirm the script prints the planned operation and exits 0.
// No DB writes occur until --confirm is passed.
//
// ============================================================================
// USAGE
// ============================================================================
//
//   Dry run (default — safe, prints plan, exits 0):
//     node --env-file=.env.local scripts/erase-player.mjs <email>
//
//   Apply (requires --confirm AND matching --player-email cross-check):
//     node --env-file=.env.local scripts/erase-player.mjs <email> \
//       --confirm --player-email=<email>
//
// ============================================================================
// DATE CREATED: 2026-05-07
// ============================================================================

import { Pool } from "@neondatabase/serverless";
import path from "node:path";
import { parseFlags, requireConfirm, writeBackup } from "./_lib/dbWriteSafety.mjs";

// Absolute path to <repo>/db-backups, resolved from this script's directory
// so that cwd does not affect where snapshots land.
const BACKUP_DIR = path.resolve(import.meta.dirname, "../db-backups");

// parseFlags parses argv into { email, dryRun, confirm, backupDir, help }.
// It exits 0 on --help and exits 1 if <email> is missing.
// The backupDir default ("./db-backups") is overridden below to the absolute
// BACKUP_DIR so the snapshot lands in a stable location regardless of cwd.
function parseEraseFlags(argv) {
  // parseFlags from dbWriteSafety reads the first non-flag token as email
  // and also handles --confirm / --dry-run / --backup-dir. We layer the
  // --player-email cross-check on top.
  const baseFlags = parseFlags(argv);
  const flags = { ...baseFlags, playerEmail: null, backupDir: BACKUP_DIR };

  // Re-scan for --player-email=<email> which dbWriteSafety doesn't know.
  const args = argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith("--player-email=")) {
      flags.playerEmail = arg.slice("--player-email=".length);
    }
  }

  return flags;
}

async function main() {
  let flags;
  try {
    flags = parseEraseFlags(process.argv);
  } catch (err) {
    console.error(`error: ${err.message}`);
    console.error(
      "usage: erase-player.mjs <email> [--confirm --player-email=<email>] [--dry-run] [--backup-dir=DIR]",
    );
    process.exit(2);
  }

  const mode = flags.confirm && !flags.dryRun ? "APPLY" : "DRY-RUN";
  console.log(`mode:      ${mode}`);
  console.log(`email:     ${flags.email}`);
  console.log(`timestamp: ${new Date().toISOString()}`);
  console.log(
    "action:    CASCADE DELETE spacepotatis.players WHERE email = $1",
  );
  console.log(
    "           (cascades to save_games, leaderboard, save_audit)",
  );

  if (flags.confirm && !flags.dryRun) {
    // --confirm mode: require the cross-check flag
    if (!flags.playerEmail) {
      console.error(
        "\nrefusing: --confirm requires --player-email=<email> matching the positional email.",
      );
      console.error(
        "This cross-check exists to catch typos — re-invoke with both flags set to the same address.",
      );
      process.exit(2);
    }
    if (flags.playerEmail !== flags.email) {
      console.error(
        `\nrefusing: --player-email (${flags.playerEmail}) does not match positional email (${flags.email}).`,
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
    // Look up the player to confirm they exist before opening a transaction.
    const { rows: players } = await pool.query(
      "SELECT id, email, name, created_at FROM spacepotatis.players WHERE email = $1",
      [flags.email],
    );
    if (players.length === 0) {
      console.error(`\nno player found with email: ${flags.email}`);
      console.error("nothing to erase — exiting 0.");
      return;
    }
    const player = players[0];
    console.log(`\nplayer found:`);
    console.log(`  id:         ${player.id}`);
    console.log(`  email:      ${player.email}`);
    console.log(`  name:       ${player.name ?? "(null)"}`);
    console.log(`  created_at: ${player.created_at}`);

    // Fetch save_games row for the backup snapshot (pool-read in dry-run; the
    // full transaction repeats the read under FOR UPDATE in apply mode).
    const saveRes = await pool.query(
      `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
              ship_config, updated_at
       FROM spacepotatis.save_games WHERE player_id = $1 AND slot = 1`,
      [player.id],
    );
    const saveRow = saveRes.rows[0] ?? null;
    console.log("\nsave_games row (slot 1):");
    console.log(
      saveRow ? JSON.stringify(saveRow, null, 2) : "  (no save row — player never saved)",
    );

    // Count rows that will cascade-delete.
    const [lbCount, auditCount] = await Promise.all([
      pool
        .query(
          "SELECT COUNT(*) AS n FROM spacepotatis.leaderboard WHERE player_id = $1",
          [player.id],
        )
        .then((r) => Number(r.rows[0]?.n ?? 0)),
      pool
        .query(
          "SELECT COUNT(*) AS n FROM spacepotatis.save_audit WHERE player_id = $1",
          [player.id],
        )
        .then((r) => Number(r.rows[0]?.n ?? 0)),
    ]);
    console.log("\ncascade scope:");
    console.log(`  save_games rows:   ${saveRow ? 1 : 0}`);
    console.log(`  leaderboard rows:  ${lbCount}`);
    console.log(`  save_audit rows:   ${auditCount}`);

    // In dry-run mode, requireConfirm prints the dry-run message and exits 0.
    requireConfirm(flags);

    // --confirm path: open a transaction, lock the players row, write backup,
    // then DELETE (cascade fans out automatically from players.id).
    const client = await pool.connect();
    let txOpen = false;
    try {
      await client.query("BEGIN");
      txOpen = true;

      // Lock the players row for the lifetime of the read-decide-delete window
      // so a concurrent save POST cannot race between our read and our DELETE.
      const lockRes = await client.query(
        `SELECT id, email, name, created_at
         FROM spacepotatis.players
         WHERE email = $1
         FOR UPDATE`,
        [flags.email],
      );
      if (lockRes.rows.length === 0) {
        // Player was deleted between our initial read and the FOR UPDATE lock.
        await client.query("ROLLBACK");
        txOpen = false;
        console.log("\nplayer row vanished between initial read and lock — nothing to erase.");
        return;
      }
      const lockedPlayer = lockRes.rows[0];

      // Re-read save_games inside the transaction under FOR UPDATE so we get
      // an accurate snapshot for the backup.
      const txSaveRes = await client.query(
        `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
                ship_config, updated_at
         FROM spacepotatis.save_games WHERE player_id = $1 AND slot = 1
         FOR UPDATE`,
        [lockedPlayer.id],
      );
      const txSaveRow = txSaveRes.rows[0] ?? null;

      // Write the backup BEFORE deleting. If writeBackup throws (disk full,
      // permission denied), ROLLBACK and refuse to delete — the backup is the
      // recoverability contract.
      try {
        const backupPath = await writeBackup({
          prevRow: {
            player: { ...lockedPlayer },
            save_games: txSaveRow,
            leaderboard_count: lbCount,
            save_audit_count: auditCount,
          },
          scriptName: "erase-player",
          flags: { email: flags.email, backupDir: flags.backupDir },
        });
        console.log(`\nprevRow snapshot: ${backupPath}`);
      } catch (backupErr) {
        await client.query("ROLLBACK");
        txOpen = false;
        console.error(
          `error: writeBackup failed (${backupErr.message}) — refusing to DELETE without a recoverable snapshot.`,
        );
        process.exit(1);
      }

      // The cascade does the work: deleting the players row cascades to
      // save_games, leaderboard, and save_audit via ON DELETE CASCADE FKs.
      const delRes = await client.query(
        "DELETE FROM spacepotatis.players WHERE id = $1 RETURNING id, email",
        [lockedPlayer.id],
      );
      if (delRes.rowCount !== 1) {
        await client.query("ROLLBACK");
        txOpen = false;
        console.error(
          `unexpected rowCount=${delRes.rowCount} on DELETE — rolled back.`,
        );
        process.exit(1);
      }

      await client.query("COMMIT");
      txOpen = false;

      console.log("\nDELETE committed.");
      console.log(
        `  deleted player_id: ${delRes.rows[0].id} (${delRes.rows[0].email})`,
      );
      console.log("\nrun the cascade verification queries to confirm zero orphans:");
      console.log(
        `  SELECT COUNT(*) FROM spacepotatis.save_games WHERE player_id = '${lockedPlayer.id}';   -- expect 0`,
      );
      console.log(
        `  SELECT COUNT(*) FROM spacepotatis.leaderboard WHERE player_id = '${lockedPlayer.id}';  -- expect 0`,
      );
      console.log(
        `  SELECT COUNT(*) FROM spacepotatis.save_audit WHERE player_id = '${lockedPlayer.id}';   -- expect 0`,
      );
      console.log("\nerasure complete.");
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

// Only run main() when this file is the entry point so the parseEraseFlags
// helper can be imported by a test without touching the DB.
const entry = process.argv[1] ?? "";
const isEntryPoint =
  entry.endsWith("erase-player.mjs") || entry.endsWith("erase-player");

if (isEntryPoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { parseEraseFlags };
