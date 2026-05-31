# content-audit defect fixture

Seeded defects for recall-mode calibration of the `content-audit` skill. Each is
a **tsc- and lint-clean content-invariant violation** — chosen deliberately: a
defect that `tsc` or a schema test would catch isn't a fair test of the audit's
cross-reference logic (the cold arm would catch it too, via the compiler). These
all compile and pass schema validation; only the audit's checklist catches them.

Anchors and find-strings are grounded against Spacepotatis `master` as of
2026-05-31. `apply-defects.mjs` drift-guards every op — if a source file moved
and an anchor no longer matches exactly, the run aborts and writes nothing. That
loud failure is the signal to refresh this file.

## Verified defects (9)

| id | check | difficulty | What it plants | Why a cold pass misses it |
|---|---|---|---|---|
| `ca-orphan-enemy` | #1 | easy | wave spawn → `aphid-spectre` (no such enemy) | nothing — both arms should catch this (also `data.test.ts`). The floor case. |
| `ca-enemy-spritekey-orphan` | #3 | medium | enemy `spriteKey` → `enemy-aphid-phantom` | needs the BootScene-generator ↔ data cross-ref |
| `ca-bullet-sprite-orphan` | #4 | medium | weapon `bulletSprite` → `bullet-potato-phantom` | same cross-ref, different surface |
| `ca-mission-dag-cycle` | #8 | hard | ember-run requires burnt-spud (already requires ember-run) → 2-cycle | needs DFS cycle detection; both ids are valid so tsc is clean |
| `ca-lootpool-family-leak` | #9 | medium | adds `corsair-missile` (tier-2 pirate) to the potato-only tutorial pool | valid `WeaponId` (tsc-clean); only the family-gating invariant catches it |
| `ca-lootpool-credits-range` | #9 | medium | tubernovae pool `min:1000 > max:500` | two valid numbers; only the min<max assertion catches it |
| `ca-mission-system-orphan` | #10 | medium | mission `solarSystemId` → `tubernovae-cluster` (no such system) | needs the mission ↔ solarSystems cross-ref |
| `ca-story-voice-missing` | #11 | hard | story `voiceTrack` → `…market-arrival-voice-v2.mp3` (no file) | needs a `public/audio/story/` **disk** check — a code-only read misses it |
| `ca-story-trigger-orphan` | #11 | hard | on-mission-select trigger → `combat-2` (no such mission) | needs the trigger ↔ missions cross-ref |
| `ca-active-perk-no-consumer` | #5 | hard | drops `empCharges += 1` from the `emp` perk's `apply()` case | code-level; emp stays type:`active` but its resource is never charged so `triggerActive()` always early-returns. tsc/lint-clean (empCharges still read elsewhere). Caught only by reading `apply()` per check #5(a). |

## Stub (1) — deliberately not authored

| id | check | Why it stays a stub |
|---|---|---|
| `ca-enemy-behavior-uncovered` | #6 | **No clean audit-only version exists.** `behavior` is a closed Zod enum (`EnemyBehaviorSchema`, `src/lib/schemas/enemies.ts:69`), `enemies.test.ts:44` rejects unknown behaviors, and a compile-time `_enemyBehaviorCheck` ties the enum to the `Enemy.preUpdate` switch (no default case). Any seeded behavior is caught by typecheck / schema test, never by audit reasoning. **Finding:** content-audit check #6 is largely redundant with the compiler — prune or annotate it rather than fixture it. |

## Difficulty buckets

`grade-recall.mjs` reports recall split easy / medium / hard. The discriminating
signal lives in **medium + hard** — easy defects (`ca-orphan-enemy`) are
grep-findable and both arms catch them, so they don't separate a good audit from
a cold scan. A skill that only lifts recall on easy defects is barely better than
grep; the keep/cut decision should weight the hard bucket.

## Adding a defect

1. Pick a content invariant from the `content-audit` SKILL.md checklist not yet
   covered (or under-covered) here.
2. Plant it as anchored find/replace ops against current master. Prefer a
   tsc-clean violation. Add an `after` anchor when the `find` string isn't
   unique file-wide (see `ca-mission-system-orphan`).
3. Set `groundTruth.anchor` to a string (or array of strings) any correct
   finding *must* name — usually the bad id/path you introduced.
4. `node ../../apply-defects.mjs --defects defects.json --worktree <repo-root> --dry-run`
   to confirm the anchors match exactly.
