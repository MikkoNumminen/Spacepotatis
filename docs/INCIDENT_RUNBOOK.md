# Incident runbook

Operational playbook for production data incidents in Spacepotatis. Each section starts with the symptom an operator (or a coding agent) would observe, then the diagnosis steps, then the fix.

This file is the entry point — when something breaks in prod, read here first before improvising.

## General principles

1. **Don't make it worse.** Resist the urge to "just run a fix". Production data writes are irreversible without backups. Always:
   - Run any diagnostic script in dry-run mode first.
   - Capture the affected rows BEFORE writing (`scripts/_lib/dbWriteSafety.mjs` does this automatically — use it).
   - Have at least one independent confirmation of the diagnosis before mutating.
2. **Stop the bleed before you clean the wound.** If a bug is actively destroying data, ship the guard FIRST, then restore. Otherwise the restore gets re-wiped on the next cycle (this happened on 2026-05-02 — see §1).
3. **Audit-trail every prod write.** Any one-off recovery script gets committed to `scripts/` with a header comment explaining what it did and the date it ran. Don't run-and-delete; future maintainers (and you, three months from now) need the record.

## How to read this file

Each incident type below has the same shape:
- **Symptom**: what the operator sees.
- **Diagnose**: read-only commands to confirm the hypothesis.
- **Fix**: write commands, gated behind explicit confirmation.
- **Post**: what to commit, who to notify, what to verify.

## §1. Player save data corruption / wipe

**Symptom**: A player reports their progress is gone. UI shows zero credits, zero cleared missions, default ship loadout, planets locked that should be unlocked.

### Diagnose

```bash
node --env-file=.env.local scripts/check-player.mjs <email>
```

This is read-only. Inspect:
- `credits`, `completed_missions`, `unlocked_planets`, `played_time_seconds` in the save row
- `seen_story_entries` (often survives partial wipes — useful for confirming the row was active recently)
- `updated_at` — if it changed RIGHT before the symptom, suspect a recent client/server bug
- The leaderboard rows — these survive save wipes and are the ground truth for what missions the player actually cleared

If `completed_missions` is `[]` but the leaderboard has entries, the save was wiped. Confirmed.

### Fix

The 2026-05-02 wipe vector (regression POSTs) is closed by [`validateNoRegression`](../src/lib/saveValidation.ts) — so a buggy client can't re-wipe today. But if a NEW wipe vector appears:

1. **Stop the bleed first.** Do NOT restore until you understand what triggered the wipe. Find the root cause in the route handler or the client save path. Ship a fix to production. Verify the affected player can no longer trigger another wipe (their session might be stuck retrying with bad state).
2. **Restore the save** using the leaderboard as the source of truth for `completed_missions`:
   - For each mission with a leaderboard row, the player completed it.
   - `unlocked_planets` = `INITIAL_UNLOCKED` ∪ completedMissions ∪ chain-unlocks (e.g. completing pirate-beacon unlocks ember-run via `requires`).
   - `credits` and `played_time_seconds` are NOT recoverable from the leaderboard. Estimate from cumulative scores (~10:1 score:credit ratio for most enemies based on enemies.json). Err on the side of generous compensation since the player lost their ship config too.
   - `ship_config` is not recoverable. Either leave at default (player rebuilds) or pre-equip a tier-appropriate loadout based on their progression.

3. Use the safety helper. Two calling styles exist:

   **(a) New scripts** — adopt the full helper (dry-run-by-default, `--confirm` to mutate):
   ```js
   import { parseFlags, writeBackup, requireConfirm } from "./_lib/dbWriteSafety.mjs";
   const flags = parseFlags(process.argv);
   // ... fetch prevRow ...
   await writeBackup({ prevRow, scriptName: "your-script-name", flags });
   if (flags.dryRun) { /* print planned changes, exit 0 */ }
   requireConfirm(flags);
   // ... actual UPDATE ...
   ```

   **(b) Existing recovery scripts** (`restore-player.mjs`, `improve-restore.mjs`) — predate `parseFlags` and use a hand-rolled flag set documented inline. They still call `writeBackup()` from the helper before any UPDATE. The flag surface for `restore-player.mjs`:
   ```bash
   # default = dry-run; prints diff and exits 0
   node --env-file=.env.local scripts/restore-player.mjs <email>

   # apply (interactive [y/N] prompt)
   node --env-file=.env.local scripts/restore-player.mjs <email> \
     --apply --player-email=<email>

   # apply non-interactively (CI / scripted)
   node --env-file=.env.local scripts/restore-player.mjs <email> \
     --apply --player-email=<email> --no-prompt \
     --i-have-printed-the-before-state

   # force a list-shrink rollback (DESTRUCTIVE — credits/playtime are still
   # max-of-prev-or-baseline so they cannot regress even with this flag)
   ... --force-overwrite-i-know-this-destroys-progress
   ```

4. **First run dry**: `node --env-file=.env.local scripts/restore-player.mjs <email>` — defaults to dry-run, reads the BEFORE row, prints the planned diff, exits 0. (Backups are written ONLY on the apply path, INSIDE the BEGIN/COMMIT transaction, after the FOR-UPDATE shrink check passes — so a dry-run does not touch `db-backups/`.)
5. **Re-run with `--apply --player-email=<email>`** after reviewing the diff. The interactive prompt defaults to N. The backup snapshot lands at `db-backups/restore-player_<safe-email>_<utc-ts>.json` before the UPDATE runs.
6. Verify with `check-player.mjs` that the row matches expectations.

### Post

- Commit the script to `scripts/` with header documenting what it did and when, even though it was a one-off. See `scripts/restore-player.mjs` and `scripts/improve-restore.mjs` for the audit-trail template.
- If the wipe vector itself was new: the fix PR should also update [`saveValidation.ts`](../src/lib/saveValidation.ts) tests to cover the new pattern.

## §2. Schema drift (DB column missing / extra)

**Symptom**: `/api/save` returns 500 with `server_error`. Logs show `column "X" does not exist` or similar Postgres error.

### Diagnose

```bash
node --env-file=.env.local scripts/check-schema.mjs
```

Read-only. Compares the live schema to the migrations and prints any column or table mismatches.

### Fix

This bit prod once (PR #89 added `seen_story_entries TEXT[]` and the migration sat unapplied for 3 days, 500ing every save POST). The discipline:

1. If the column is missing because a migration didn't run: apply it.
   ```bash
   node --env-file=.env.local scripts/migrate.mjs
   ```
2. If the column is extra (a manual change someone forgot to migrate): write a migration. **Never edit `db/migrations/` files that have already shipped** — append a new file.

See CLAUDE.md §7a for the migration-shipping HARD RULE: a PR that adds a migration is NOT done until the migration has been applied to prod.

## §3. Leaderboard score not landing

**Symptom**: Player reports their score isn't on the board after winning a mission. Or it lands but with a different value.

### Diagnose

```bash
node --env-file=.env.local scripts/check-player.mjs <email>
```

Read the `leaderboard rows` section. Compare to what the player saw in the post-mission modal.

If the row IS present but the score differs: client-server scoring mismatch. Check `ScoreSystem` in Phaser combat scene.

If the row is absent: most likely the score POST hit a 422 (mission_not_completed cheat guard) because the player's `completed_missions` doesn't include the mission they just played. This happens when: (a) a parallel saveNow lost the completion, (b) the score posted before the save did. The score queue retries automatically; no manual fix usually needed.

### Fix

Don't manually insert leaderboard rows. The `validateMissionCompleted` guard exists for a reason. If the player's score is stuck in their localStorage queue, it'll retry on next mount/visibility/online trigger.

If the queue is permanently stuck (rare — usually means the player's `completed_missions` doesn't reflect their actual progress), fix the SAVE first via §1, then the score queue will drain on its own.

## §4. Cross-account data leak

**Symptom**: Player A signs in and sees Player B's progress. Or pending save from one account lands on another account.

### Diagnose

This shouldn't be possible after the cross-account guards in `saveQueue.ts`. If it happens:

1. Check `localStorage[spacepotatis:pendingSave:v2]` on the affected device — what `playerEmail` stamp is in there? (The pre-PR-#100 `:v1` shape lacked the stamp; if you find a leftover `:v1` blob the read path drops it on next page load.)
2. Check the auth session: does `session.user.email` match what the player expects?
3. Check the most recent /api/save POST in Vercel logs — what `auth.email` did it run under?

### Fix

Open an incident-level bug, freeze the affected accounts, do not POST anything.

## §5. Audit access

When you need to audit recent activity for a player without modifying anything:

```bash
# Player overview (save + leaderboard)
node --env-file=.env.local scripts/check-player.mjs <email>

# Live schema vs. expected migrations
node --env-file=.env.local scripts/check-schema.mjs

# Vercel logs (read-only via dashboard or CLI)
vercel logs --follow
```

All three are non-mutating.

## §6. Escalation

If a fix requires writing more than one row, or affects more than one player, **stop**. Discuss with the user before proceeding. The recovery scripts in `scripts/` are scoped to single-player restoration; bulk operations are an entirely different risk class and need explicit go-ahead.
