# ADR 0003: Anti-cheat is observation-first, never punitive

Date: 2026-05-04
Status: accepted

## Context

`/api/save` and `/api/leaderboard` enforce server-side cheat guards via
`src/lib/saveValidation.ts`: mission-graph validity, credit-delta caps,
playtime-delta plausibility, leaderboard-completion gating, and
no-shrink regression. The guards exist because save state is the player's
months of progression — a malicious or buggy client must never silently
corrupt it.

But there's a tension: the same guards that catch cheating can also fire
on a legitimate desync (e.g. localStorage save queue carries a stale
snapshot from a logged-out tab; the server has since hydrated a newer one).
If the server treats every regression as adversarial and rejects the save
hard, a legitimate player loses progression for what is, in fact, our
durability layer doing its job.

`save_audit` (PR #98, the table at `spacepotatis.save_audit`) was added
during the 2026-05-02 wipe recovery. It records every `/api/save` POST
attempt — success, validator rejection, or server error — capturing the
payload, the prev snapshot, the response status, the IP, and the user
agent. The intent is forensic: when something goes wrong, we have a
trail. It is NOT a real-time enforcement signal.

## Decision

Cheat-guard rejections return HTTP 422 with `error: "save_regression"` (or
the equivalent code) and the saveQueue treats that response as TRANSIENT —
the snapshot is held in localStorage and retried after the next successful
loadSave hydrates the local state. The guards do not block the player's
account; they reject the *write*, not the *player*. The `save_audit`
table is observation-only — no automated action triggers off it.

## Consequences

- Pro: a real cheating attempt fails to land; the player keeps trying,
  each attempt is logged with full payload + IP for forensics.
- Pro: a legitimate desync (stale queued snapshot vs. newer server save)
  recovers automatically — saveQueue retries after the next hydration;
  no support ticket, no data loss.
- Pro: `save_audit` gives us 30 days of "what did the client send?"
  context for any incident, with no PII beyond the email already on file.
- Con: an extra DB write per save POST. Mitigated by the audit insert
  being best-effort — failure to write the audit row never blocks the
  save itself.
- Con: the guards only protect against client-side cheats; a determined
  attacker who replays a valid sequence of POSTs can still grind credits
  legitimately. Acceptable: leaderboard is local cohort, not competitive.
- Sharpest implication: §15 of CLAUDE.md (Production data writes) gates
  every prod write behind `writeBackup` + a `--confirm` flag. The guards
  are the realtime layer; the prod-write rules are the offline layer; the
  audit log connects them.
