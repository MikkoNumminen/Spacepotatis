// Safety helpers for any script under scripts/ that mutates production data
// (player saves, leaderboard rows, schema, etc.). Use these instead of
// hand-rolling argv parsing and confirm-flag logic — every script gets the
// same audit trail and the same dry-run guarantee.
//
// The 2026-05-02 wipe + restore exposed how dangerous direct DB writes are:
//   - restore-player.mjs could destroy progress as easily as restore it
//   - no automatic backup of prevRow before overwrite
//   - no "are you sure" gate; one wrong email argv and you'd damage another player
//
// Required usage pattern for any new scripts/*.mjs that writes to prod:
//
//   import { parseFlags, requireConfirm, writeBackup } from "./_lib/dbWriteSafety.mjs";
//
//   const flags = parseFlags(process.argv);  // { email, dryRun, confirm, backupDir }
//   // ... fetch prevRow ...
//   await writeBackup({ prevRow, scriptName: "restore-player", flags });
//   if (flags.dryRun) {
//     console.log("DRY RUN — would write:", nextValues);
//     process.exit(0);
//   }
//   requireConfirm(flags);  // exits with code 1 if --confirm wasn't passed
//   // ... actual UPDATE ...
//
// Default behavior is SAFE: without explicit --confirm, the script reads
// prevRow, prints a diff, writes a backup, and exits with code 0. The
// operator must re-invoke with --confirm to actually mutate.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const HELP_TEXT = `
Usage: node --env-file=.env.local scripts/<name>.mjs <email> [flags]

Flags:
  --dry-run        Print what would be written; do NOT mutate. (default behavior
                   when --confirm is absent — explicit --dry-run just makes the
                   intent visible in shell history.)
  --confirm        Required for the script to actually issue the UPDATE.
                   Without it, the script exits 0 after the dry-run preview.
  --backup-dir=DIR Where to write the prevRow JSON snapshot before the UPDATE.
                   Defaults to ./db-backups/. Created if it doesn't exist.
  --help           Print this help.

Default mode is dry-run. Re-invoke with --confirm after reviewing the diff.
`;

/**
 * Parse argv into a typed flags object. Returns:
 *   { email, dryRun, confirm, backupDir, help }
 *
 * Exits the process with code 1 if email is missing (unless --help).
 */
export function parseFlags(argv) {
  const args = argv.slice(2); // drop "node" + script path
  const flags = {
    email: null,
    dryRun: false,
    confirm: false,
    backupDir: "./db-backups",
    help: false
  };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--confirm") flags.confirm = true;
    else if (arg.startsWith("--backup-dir=")) flags.backupDir = arg.slice("--backup-dir=".length);
    else if (!arg.startsWith("--") && flags.email === null) flags.email = arg;
    else {
      console.error(`unknown arg: ${arg}`);
      console.error(HELP_TEXT);
      process.exit(1);
    }
  }
  if (flags.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  if (!flags.email) {
    console.error("error: <email> is required");
    console.error(HELP_TEXT);
    process.exit(1);
  }
  // If neither --confirm nor explicit --dry-run is passed, default to
  // dry-run so a casual invocation never mutates by surprise.
  if (!flags.confirm && !flags.dryRun) {
    console.log("(no --confirm flag — defaulting to dry-run)\n");
    flags.dryRun = true;
  }
  return flags;
}

/**
 * Write the prevRow JSON to a timestamped file under backupDir before any
 * destructive operation. Idempotent re-runs overwrite the backup; that's
 * fine because the script is idempotent too.
 *
 * Returns the absolute path of the backup file.
 */
export async function writeBackup({ prevRow, scriptName, flags }) {
  await mkdir(flags.backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeEmail = flags.email.replace(/[^a-zA-Z0-9.]/g, "_");
  const filename = `${scriptName}_${safeEmail}_${ts}.json`;
  const fullPath = path.resolve(flags.backupDir, filename);
  await writeFile(
    fullPath,
    JSON.stringify(
      {
        scriptName,
        email: flags.email,
        timestampUtc: new Date().toISOString(),
        prevRow
      },
      null,
      2
    )
  );
  console.log(`backup written: ${fullPath}`);
  return fullPath;
}

/**
 * Block the script from proceeding to the UPDATE unless the operator passed
 * --confirm explicitly. Exits with code 1 if the gate fails — the dry-run
 * preview should have already printed the planned diff by this point.
 */
export function requireConfirm(flags) {
  if (flags.dryRun) {
    console.log("\nDRY RUN — no DB mutation performed.");
    console.log("Re-invoke with --confirm to actually write.");
    process.exit(0);
  }
  if (!flags.confirm) {
    console.error("error: --confirm not passed; refusing to mutate.");
    process.exit(1);
  }
}
