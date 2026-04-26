---
name: balance-review
description: Diff uncommitted changes to game data JSON and report DPS, TTK, energy-cost-per-DPS, and drop-rate deltas vs HEAD.
---

# When to use
Invoke when the user runs `/balance-review`, asks "what did my JSON tweak do to balance," or has uncommitted edits to any of `src/game/phaser/data/{weapons.json,enemies.json,waves.json,missions.json}` (or `perks.ts`). Read-only — never edits game files.

# Steps
1. `git status --porcelain -- src/game/phaser/data` to find dirty files. If none, report "no balance changes" and stop.
2. For each dirty JSON: `git show HEAD:<path>` for the BEFORE blob, read working-tree file for AFTER. Parse both as JSON.
3. Build keyed maps (by `id` for weapons/enemies/missions; by `(missionId, wave.id, spawn index)` for waves). Diff keys: added / removed / changed.
4. For every changed entity, compute the metrics below for BEFORE and AFTER, then `(after-before)/before * 100` for the percent delta. Skip the percent if before is 0.
5. Cross-reference: every `spawn.enemy` in waves.json must resolve to an `enemies.json` id; every `waves.json` `missionId` must resolve to a `missions.json` id; every weapon DPS must be > 0; PERK_IDS in `perks.ts` must each have a matching `PERKS` entry (drop weights are uniform — flag if anyone added a `weight` field).
6. Optionally run `npm test -- --reporter=json` (the repo has `src/game/phaser/data/data.test.ts` integrity tests) and report pass/fail. Skip if npm is unavailable.
7. Print the output tables. No edits, no commits.

# Metrics this skill computes
Field names come from the actual schemas — don't invent new ones.

- **Weapon DPS** (per `weapons.json` entry): `damage * projectileCount * (1000 / fireRateMs)`.
- **Energy per DPS** (efficiency): `energyCost / DPS`. `energyCost` is required on every weapon today — it represents reactor energy drained per FIRE event (not per bullet). Lower energy-per-DPS is more efficient. Reactor capacity at base is 100 with 25/sec recharge, so a sustainable fire rate is roughly `25 / energyCost` shots/sec.
- **Time-to-kill (TTK, seconds)** for an `enemies.json` enemy by a given weapon: `enemy.hp / weaponDPS`. Compute for every (weapon, enemy) pair where either side changed.
- **Wave intensity**: per `waves.json` wave, `sum(spawn.count * enemies[spawn.enemy].collisionDamage)`. Use the AFTER `enemies.json` for the AFTER value, BEFORE for BEFORE — collision-damage tweaks propagate.
- **Mission credit-per-second** (economy proxy): per missionId in `waves.json`, `sum(enemies[spawn.enemy].creditValue * spawn.count) / max(sum(spawn.delayMs)/1000, 1)`. Rough — `delayMs` is the spawn-start offset, not duration; treat as a relative indicator only.
- **Mission reward delta**: when `missions.json` changes, just diff fields directly (no derived metric).
- **Perk drop rate**: `randomPerkId()` in `perks.ts` is uniform 1/N over `PERK_IDS`. Adding/removing a perk shifts every rate by `1/N_before - 1/N_after`.

# Files this skill reads
- `src/game/phaser/data/weapons.json` — fields: `id, name, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost, tint, slot, energyCost`. Optional: `homing`, `turnRateRadPerSec`.
- `src/game/phaser/data/enemies.json` — fields: `id, name, hp, speed, behavior, scoreValue, creditValue, spriteKey, fireRateMs, collisionDamage`.
- `src/game/phaser/data/waves.json` — `missions[].waves[].spawns[]` with `enemy, count, delayMs, intervalMs, formation, xPercent` and wave-level `id, durationMs`.
- `src/game/phaser/data/missions.json` — `id, kind, name, difficulty, requires, ...` (galaxy/visual fields ignored unless changed).
- `src/game/phaser/data/perks.ts` — `PERKS` record + `PERK_IDS`. Read as text; parse the keys of the `PERKS` object literal.
- `git show HEAD:<path>` for the BEFORE versions of each.

# Output format
One markdown table per affected category. Columns: `file | id/key | field | before | after | Δ% | interpretation`.

```
### weapons.json
| id           | metric        | before | after | Δ%   | note                          |
|--------------|---------------|--------|-------|------|-------------------------------|
| heavy-cannon | DPS           | 87.5   | 70.0  | -20% | Plasma Triad hits 20% softer  |
| heavy-cannon | TTK vs basic  | 0.14s  | 0.17s | +27% | drone takes ~1 extra shot     |
| heavy-cannon | energy/DPS    | 0.21   | 0.26  | +24% | less efficient per reactor unit |
```

Repeat for `### enemies.json`, `### waves.json` (intensity + credit/sec), `### missions.json`, `### perks.ts`.

End with:
```
### Flagged issues
- (none) — or bullet each problem: dangling enemy id, DPS <= 0, perk count drift, missing mission reference, wave referencing removed enemy.
```

Keep the interpretation column to one short clause — name the entity in human terms ("Drone is 30% slower", "combat-1 wave 1 should feel easier", "Pulse Cannon now kills Weaver in 2 fewer shots"). If a change is purely cosmetic (tint, name, description, texture, orbitRadius, musicTrack), list it once under a "Cosmetic-only" line — don't compute deltas.
