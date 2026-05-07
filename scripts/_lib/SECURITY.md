# `scripts/_lib/dbWriteSafety.mjs` — security notes

This helper is the safety harness for every script under `scripts/` that
mutates production data. Read CLAUDE.md §15 for the long-form rule.

## Threat mitigated

- **Operator misfire** (SEC-007, CLAUDE.md §15): an operator runs
  `node scripts/<destructive>.mjs <wrong-email>` mid-keystroke or
  copy-pastes the wrong arg, and the destructive op runs immediately.
  The 2026-05-02 wipe was exactly this class of incident.
- **Unrecoverable destructive op** (SEC-021, CLAUDE.md §15): a
  destructive op runs without a backup of the prevRow, so even
  spotting the misfire afterward leaves no recovery path.
- **Cross-account misfire** (SEC-007): a positional `<email>` argv
  silently differs from the operator's intended target.

## Invariants enforced

- INV-SCRIPT-1 — `writeBackup({ prevRow, scriptName, flags })`
  serializes the prevRow to `db-backups/<scriptName>_<email>_<ts>.json`
  before the destructive op. If `writeBackup` throws, the calling
  script must ROLLBACK the transaction and exit non-zero.
- INV-SCRIPT-2 — `parseFlags()` defaults to `--dry-run` when neither
  `--dry-run` nor `--confirm` is passed. `requireConfirm()` exits 0
  on dry-run (after printing the planned diff) and exits 1 if
  `--confirm` is missing on a non-dry-run path.
- INV-SCRIPT-3 — every destructive script verifies the positional
  `<email>` argument matches a separate `--player-email=<email>`
  flag before proceeding.

## What MUST NOT change without security review

- **The `--dry-run` default.** A casual invocation must NEVER
  mutate. The `parseFlags` body at lines 84-89 documents the flip:
  if neither `--confirm` nor `--dry-run` is passed, we default to
  dry-run. Removing this default re-opens SEC-007.
- **`writeBackup` writes a JSON file BEFORE the destructive op.**
  Calling it AFTER the UPDATE / DELETE means a failed UPDATE
  followed by a successful backup gives the operator a backup of
  the post-mutation state — useless for recovery. Both
  `restore-player.mjs:406` and `improve-restore.mjs:172` and
  `erase-player.mjs:277` call writeBackup BEFORE the destructive
  query. Reordering them defeats the purpose.
- **The backup-failure → ROLLBACK contract.** If `writeBackup`
  throws (disk full, permission denied), the calling script MUST
  ROLLBACK and exit non-zero. The pattern in
  `restore-player.mjs:412-419`, `improve-restore.mjs:178-185`,
  `erase-player.mjs:291-298` is the canonical implementation.
  Skipping the ROLLBACK on backup failure runs the destructive op
  without a recoverable snapshot.
- **`requireConfirm` exits BEFORE the destructive op runs.**
  Inverting the logic to "warn and proceed" defeats the gate.

## Common mistakes

- **"Make `--confirm` the default and add `--dry-run` for safety"**
  — that inverts the trust model. The cost of a dry-run-by-default
  is an extra `--confirm` invocation; the cost of a mutate-by-
  default is a destroyed save. The default must be safe.
- **"Skip writeBackup for read-mostly scripts that 'usually'
  succeed"** — every UPDATE / DELETE is one bug away from
  destroying real data. The backup is cheap; running without it is
  the unrecoverable failure mode.
- **"Use a global `DRY_RUN` env var instead of an argv flag"** —
  env vars persist across shell invocations; an operator who
  exported `DRY_RUN=false` for one test run leaves the next
  destructive script firing immediately. Argv is per-invocation
  and can't accidentally leak.

## How to test changes safely

- `npm test -- src/__tests__/dbWriteSafety.test.ts` — helper unit
  tests.
- `npm test -- scripts/writeBackup-wiring.test.mjs` — confirms each
  destructive script wires `writeBackup` to its prevRow / flags
  correctly.
- `npm test -- scripts/improveRestoreHarness.test.mjs` — SEC-007
  + SEC-021 retrofit verification (parseFlags import, requireConfirm
  gate, BEGIN/FOR UPDATE/COMMIT ordering, ROLLBACK on backup
  failure).
- Manual smoke: invoke a destructive script with no flags;
  it must print the dry-run preview and exit 0 without mutating.
  Re-invoke with `--confirm` plus the email cross-check; only then
  may the UPDATE / DELETE run.
