---
name: balance-review
description: Diff uncommitted changes to game data (weapons, enemies, waves, missions, perks, augments, loot pools, solar systems) and report DPS, TTK, energy-cost-per-DPS, augment-folded effective DPS, loot-pool roster shifts, and drop-rate deltas vs HEAD.
---

# When to use
Invoke on `/balance-review`, "what did my JSON tweak do to balance," or any uncommitted edits to `src/game/data/{weapons,enemies,waves,missions,solarSystems}.json` or the TS catalogs (`perks.ts`, `augments.ts`, `lootPools.ts`). Read-only.

# Steps
1. `git status --porcelain -- src/game/data` to find dirty files. None → report "no balance changes" and stop.
2. For each dirty file: `git show HEAD:<path>` for BEFORE, working tree for AFTER. JSON files parse as JSON; TS catalogs (`perks.ts`, `augments.ts`, `lootPools.ts`) read as text and locate the literal record (`PERKS`, `AUGMENTS_RECORD`, `POOLS`) — `eval` is unsafe; quote-strip the keys you care about (id / cost / *Mul / *Bonus / weapons[] / augments[] / credits.min / credits.max).
3. Build keyed maps (`id` for weapons/enemies/missions/augments; `systemId` for loot pools; `(missionId, wave.id, spawn index)` for waves). Diff added / removed / changed.
4. For each changed entity, compute the metrics below for BEFORE and AFTER, then `(after-before)/before * 100`. Skip percent if before is 0.
5. Cross-reference: every `spawn.enemy` resolves to an `enemies.json` id; every `waves.json` `missionId` resolves to `missions.json`; every weapon DPS > 0; every loot-pool `weapons[]`/`augments[]` id resolves; PERK_IDS each have a `PERKS` entry; AUGMENT_IDS each have an `AUGMENTS_RECORD` entry; every `mission.solarSystemId` resolves to `solarSystems.json`.
6. Optionally `npm test -- --reporter=json` (integrity tests in `src/game/data/data.test.ts`, including wave-budget invariant at `data.test.ts:248-256` and `mission.solarSystemId` orphan check at `data.test.ts:159-166`). Skip if npm unavailable.
7. Print the output tables. No edits, no commits.

# Metrics
Field names come from real schemas. `WeaponDefinition` source of truth: `src/types/game.ts:34-52`.

- **Weapon DPS** (base, per `weapons.json`): `damage * projectileCount * (1000 / fireRateMs)`.
- **Effective DPS under augment** (when `augments.ts` changes): for any weapon a player could pair with the augment, recompute via `foldAugmentEffects()` — `damage * damageMul`, `(projectileCount + projectileBonus)`, `fireRateMs * fireRateMul`. Report each *Mul/*Bonus separately so the user sees which augment did what.
- **Energy per DPS**: `energyCost / DPS`. `energyCost` is required, drained per FIRE event (not per bullet). Lower is more efficient. Reactor base = 100 cap, 25/sec recharge → sustainable rate ≈ `25 / energyCost` shots/sec. Recompute when `energy-down` (energyMul: 0.6) or `fire-rate-up` (fireRateMul: 0.7) change.
- **TTK (s)** for `(weapon, enemy)`: `enemy.hp / weaponDPS`. Compute for every pair where either side changed. For tutorial-system missions, restrict weapons to the tutorial loot pool's `weapons[]` (potato family + free starter).
- **Wave intensity**: per wave, `sum(spawn.count * enemies[spawn.enemy].collisionDamage)`. Use AFTER `enemies.json` for AFTER, BEFORE for BEFORE.
- **Mission credit-per-second**: per missionId, `sum(enemies[spawn.enemy].creditValue * spawn.count) / max(sum(wave.durationMs)/1000, 1)`. **Use wave-level `durationMs`** — authoritative (`data.test.ts:248-256`). Do NOT divide by `sum(spawn.delayMs)` — that's per-spawn start offset, not duration.
- **Mission reward delta**: diff `missions.json` fields directly. Flag `solarSystemId` flips (they shift the loot pool).
- **Perk drop rate**: `randomPerkId()` is uniform 1/N over `PERK_IDS`. Add/remove shifts every rate by `1/N_before - 1/N_after`. Flag if anyone added a `weight` field — current schema has none.

# Augments — first-class balance levers
`src/game/data/augments.ts`. Permanent multipliers bound to a single weapon (max 2 per weapon, see `MAX_AUGMENTS_PER_WEAPON`).

- **Cost delta** — `cost` field diff.
- **Effect-multiplier delta** — `damageMul`, `fireRateMul`, `projectileBonus`, `energyMul`, `turnRateMul`. Each defaults to identity (1 or 0) when absent.
- **Weapon impact recompute** — when any *Mul/*Bonus moves, recompute every weapon's DPS, energy/DPS, and TTK-vs-each-changed-enemy under the new fold. `homing-up` (turnRateMul) has no effect on non-homing weapons — flag if user only tweaked `turnRateMul`.

# Loot pools — economy & roster levers
`src/game/data/lootPools.ts` (`POOLS` Map keyed by `SolarSystemId`). Per pool:

- **Weapons roster delta** — added/removed `weapons[]` entries. New id matters only if it resolves to a known `WeaponId`.
- **Augments roster delta** — same, against `AugmentId`.
- **Upgrades roster delta** — same, against `UpgradeField` (`shield`, `armor`, `reactor-capacity`, `reactor-recharge`).
- **Credits min/max delta** — flag if `min >= max`. Report new average (`(min+max)/2`) and percent shift vs old.
- **Cross-system gating** — flag a non-tutorial weapon (carrot/turnip family) in `tutorial`, or a potato weapon dropping out of `tutorial` (tutorial is potato-only — see file header).

# Files this skill reads
- `src/game/data/weapons.json` — `id, name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost, tint, family, energyCost`. Optional: `homing`, `turnRateRadPerSec`, `gravity` (px/s² downward; carrots use 60–300 to arc), `bulletSprite`, `podSprite`. `family` ∈ `"potato"|"carrot"|"turnip"` and gates which solar system surfaces it.
- `src/game/data/enemies.json` — `id, name, hp, speed, behavior, scoreValue, creditValue, spriteKey, fireRateMs, collisionDamage`.
- `src/game/data/waves.json` — `missions[].waves[].spawns[]` with `enemy, count, delayMs, intervalMs, formation, xPercent`; wave-level `id, durationMs`.
- `src/game/data/missions.json` — `id, kind, name, difficulty, requires, solarSystemId, ...` (galaxy/visual fields ignored unless changed).
- `src/game/data/solarSystems.json` — `id, name, sunColor, sunSize, ambientHue`. Cosmetic-only except `id`.
- `src/game/data/perks.ts` — `PERKS` record + `PERK_IDS`. Read as text; parse `PERKS` object literal keys.
- `src/game/data/augments.ts` — `AUGMENTS_RECORD`, `AUGMENT_IDS`, `MAX_AUGMENTS_PER_WEAPON`. Read as text; parse cost + the five *Mul/*Bonus fields.
- `src/game/data/lootPools.ts` — `POOLS` Map keyed by `SolarSystemId`. Read as text; parse `weapons[]`, `augments[]`, `upgrades[]`, `credits.{min,max}` per system.
- `git show HEAD:<path>` for BEFORE versions.

# Output format
One markdown table per affected category. Columns: `id | metric | before | after | Δ% | note`.

```
### weapons.json
| id           | metric        | before | after | Δ%   | note                          |
|--------------|---------------|--------|-------|------|-------------------------------|
| heavy-cannon | DPS           | 87.5   | 70.0  | -20% | Yukon Gold Mortar 20% softer  |
| heavy-cannon | TTK vs aphid  | 0.14s  | 0.17s | +27% | aphid takes ~1 extra shot     |
| heavy-cannon | energy/DPS    | 0.21   | 0.26  | +24% | less efficient per reactor unit |

### augments.ts
| id                                | metric    | before | after | Δ%   | note                          |
|-----------------------------------|-----------|--------|-------|------|-------------------------------|
| damage-up                         | damageMul | 1.25   | 1.40  | +12% | every augmented weapon +12%   |
| damage-up                         | cost      | 1000   | 1200  | +20% | shop access pricier           |
| (folded) heavy-cannon + damage-up | DPS       | 109.4  | 122.5 | +12% | still alpha king              |

### lootPools.ts
| systemId   | field            | before              | after                    | note                                  |
|------------|------------------|---------------------|--------------------------|---------------------------------------|
| tutorial   | weapons[]        | spread, heavy, spud | + tail-gunner            | ⚠ carrot leaked into potato-only system |
| tubernovae | credits.min/max  | 500/1000 (avg 750)  | 700/1100 (avg 900, +20%) | richer drops post-Dreadfruit          |
```

Repeat for `### enemies.json`, `### waves.json` (intensity + credit/sec), `### missions.json`, `### solarSystems.json`, `### perks.ts`.

End with:
```
### Flagged issues
- (none) — or bullet each: dangling enemy id, DPS <= 0, perk count drift, missing mission ref, wave referencing removed enemy, loot-pool weapon id not in WeaponId, augment turnRateMul change with no homing weapon affected, mission solarSystemId pointing at unknown system, family-gated weapon in wrong pool, credits.min >= credits.max.
```

Keep the note column to one short clause naming the entity in human terms ("Aphid 30% slower", "Yamsteroid Belt wave 1 easier"). Cosmetic-only changes (tint, name, description, texture, orbitRadius, musicTrack, sunColor, ambientHue, bulletSprite, podSprite) get one "Cosmetic-only" line — no deltas computed.
