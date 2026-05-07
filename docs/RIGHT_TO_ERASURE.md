# Right-to-erasure runbook

This document is the operator runbook for processing a GDPR Article 17 right-to-erasure request from a Spacepotatis player.

## When this runbook is invoked

A player sends a support email requesting deletion of their account and all associated game data. Under GDPR Article 17 (and equivalent legislation in other jurisdictions) the operator must erase the data without undue delay — in practice, within 30 days.

## Cascade topology

Deleting the `spacepotatis.players` row for a player's email triggers `ON DELETE CASCADE` on every child table:

| Table | FK | What's deleted |
|---|---|---|
| `spacepotatis.save_games` | `player_id` | save data (credits, ship loadout, mission progress) |
| `spacepotatis.leaderboard` | `player_id` | all leaderboard entries for this player |
| `spacepotatis.save_audit` | `player_id` | forensic audit log rows for this player |

No manual child-row cleanup is needed — Postgres handles it in a single transaction.

## Pre-flight checklist

Before running the erasure script:

1. **Verify the request is from the actual account holder.** This step is outside this document's scope (it depends on your support channel). At minimum: confirm the email matches the support sender and matches what Google OAuth reports for their account. Impersonation of an erasure request (attacker requesting deletion of another player's data) is a social-engineering vector — do not accept unsigned, unverified, or forwarded requests.

2. **Confirm the player email.** Copy-paste the email from the support ticket. Do not type it from memory. The `--player-email=<email>` cross-check in the script exists to catch typos — it will refuse to proceed if the two addresses differ.

3. **Print or screenshot the current save row before deletion.** The dry-run step below prints the `save_games` row. Screenshot the terminal output before running `--confirm`. This screenshot is the support-side audit trail for "what existed before we deleted it."

## Running the erasure

### Step 1 — dry run (mandatory before every apply)

```bash
node --env-file=.env.local scripts/erase-player.mjs <player-email>
```

This is the default mode. It:
- Looks up the player and prints their `players` row.
- Prints their `save_games` row (the data that will be erased).
- Counts their `leaderboard` and `save_audit` rows (the cascade scope).
- Exits 0 with no DB writes.

Review the output carefully. Confirm the email, player ID, and cascade counts match the support ticket. If anything looks wrong — wrong email, unexpected player ID, suspiciously large or small save — **stop and re-verify** before proceeding.

### Step 2 — apply

```bash
node --env-file=.env.local scripts/erase-player.mjs <player-email> \
  --confirm --player-email=<player-email>
```

Both `<player-email>` values must be identical. The cross-check is defense-in-depth against paste errors.

What the script does in apply mode:
1. Opens a `BEGIN` transaction.
2. Reads the `players` row with `SELECT … FOR UPDATE` (blocks concurrent save POSTs from racing the delete).
3. Re-reads the `save_games` row under `FOR UPDATE` inside the transaction.
4. Calls `writeBackup()` to write a timestamped JSON snapshot of the player's data to `db-backups/` (see §Backup retention below). If the backup write fails, the script rolls back and exits non-zero — **the backup is the recoverability contract**.
5. Issues `DELETE FROM spacepotatis.players WHERE id = $1` — the cascade handles child rows.
6. Commits.

### Step 3 — cascade verification

After the script exits "erasure complete", run the verification queries it prints:

```sql
SELECT COUNT(*) FROM spacepotatis.save_games  WHERE player_id = '<uuid>';  -- expect 0
SELECT COUNT(*) FROM spacepotatis.leaderboard  WHERE player_id = '<uuid>';  -- expect 0
SELECT COUNT(*) FROM spacepotatis.save_audit   WHERE player_id = '<uuid>';  -- expect 0
```

Replace `<uuid>` with the player_id printed by the script. All three should return 0. If any return non-zero, investigate before closing the support ticket.

You can run these against the database via:

```bash
node --env-file=.env.local scripts/check-player.mjs <player-email>
```

This script is read-only and safe to run at any time (it will report "not found" after a successful erasure).

## Backup retention

`scripts/erase-player.mjs` calls `writeBackup()` (from `scripts/_lib/dbWriteSafety.mjs`, see CLAUDE.md §15) before every DELETE. The backup lands in `db-backups/` (gitignored) as a timestamped JSON file:

```
db-backups/erase-player_<email>_<timestamp>.json
```

The backup captures:
- The `players` row (id, email, name, created_at).
- The `save_games` row (all fields, at the moment the transaction locked the row).
- Counts of `leaderboard` and `save_audit` rows that cascaded.

Keep the backup for at least 90 days (matching the GDPR response window + a reasonable dispute window). The `db-backups/` directory is gitignored; it is not automatically retained. Copy the file to the support ticket if you need to document "what was deleted."

## Responding to the requester

After the erasure is confirmed:
1. Reply to the support ticket confirming deletion and the date it was processed.
2. Attach the verification output (Step 3) or note the zero counts in the reply.
3. Do not send the backup snapshot to the requester — it contains their raw save data, which defeats the purpose of erasure.

## What is NOT covered by this runbook

- Erasure of data held by third-party processors (Google OAuth, Neon, Vercel). Those services have their own GDPR processes. Google: delete the account from Google's account manager. Neon: the player's data lives inside the Neon database managed by you (the operator); erasing it here covers the Neon side. Vercel: Vercel's access logs (containing the player's IP) are outside this script's scope.
- Bulk erasure of multiple accounts. This script is scoped to one player per invocation. Bulk operations require explicit operator sign-off per CLAUDE.md §15 rule 3.
- Right-to-access (GDPR Article 15) or portability (Article 20) requests — those require a separate read-only data export path (not yet implemented).
