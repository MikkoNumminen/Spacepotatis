---
name: balance-review
description: Diff uncommitted changes to game data (weapons, enemies, waves, missions, perks, augments, loot pools, solar systems) and report DPS, TTK, energy-cost-per-DPS, augment-folded effective DPS, loot-pool roster shifts, and drop-rate deltas vs HEAD.
---

# When to use
Invoke when the user runs `/balance-review`, asks "what did my JSON tweak do to balance," or has uncommitted edits to any of `src/game/data/{weapons.json,enemies.json,waves.json,missions.json,solarSystems.json}` or any of the TS catalogs (`perks.ts`, `augments.ts`, `lootPools.ts`). Read-only — never edits game files.

# Steps
1. `git status --porcelain -- src/game/data` to find dirty files. If none, report "no balance changes" and stop. (Watch this exact path — `src/game/phaser/data` does NOT exist.)
2. For each dirty file: `git show HEAD:<path>` for the BEFORE blob, read working-tree file for AFTER. Parse JSON files as JSON; for the TS catalogs (`perks.ts`, `augments.ts`, `lootPools.ts`) read as text and locate the literal record (`PERKS`, `AUGMENTS_RECORD`, `POOLS`) — `eval` is unsafe; quote-strip the keys you care about (id / cost / *Mul / *Bonus / weapons[] / augments[] / credits.min / credits.max).
3. Build keyed maps (by `id` for weapons / enemies / missions / augments; by `systemId` for loot pools; by `(missionId, wave.id, spawn index)` for waves). Diff keys: added / removed / changed.
4. For every changed entity, compute the metrics below for BEFORE and AFTER, then `(after-before)/before * 100` for the percent delta. Skip the percent if before is 0.
5. Cross-reference: every `spawn.enemy` in waves.json must resolve to an `enemies.json` id; every `waves.json` `missionId` must resolve to a `missions.json` id; every weapon DPS must be > 0; every loot-pool weapons[] / augments[] id must resolve; PERK_IDS in `perks.ts` must each have a matching `PERKS` entry; AUGMENT_IDS in `augments.ts` must each have a matching `AUGMENTS_RECORD` entry; every `mission.solarSystemId` must resolve to a `solarSystems.json` id.
6. Optionally run `npm test -- --reporter=json` (the repo has `src/game/data/data.test.ts` integrity tests, including the wave-budget invariant at `data.test.ts:248-256` and the `mission.solarSystemId` orphan check at `data.test.ts:159-166`) and report pass/fail. Skip if npm is unavailable.
7. Print the output tables. No edits, no commits.

# Metrics this skill computes
Field names come from the actual schemas — don't invent new ones. The source of truth for `WeaponDefinition` is `src/types/game.ts:34-52`.

- **Weapon DPS** (per `weapons.json` entry, base): `damage * projectileCount * (1000 / fireRateMs)`.
- **Effective DPS under augment** (when an augment in `augments.ts` changes): for any weapon a player could combine with the changed augment, recompute DPS using the folded effects from `foldAugmentEffects()` — `damage * damageMul`, `(projectileCount + projectileBonus)`, `fireRateMs * fireRateMul`. Report effective DPS with each *Mul/*Bonus applied individually so the user sees which augment did what. (E.g. "Yukon Gold Mortar + damage-up: base DPS 87.5 → 109.4, +25%.")
- **Energy per DPS** (efficiency): `energyCost / DPS`. `energyCost` is required on every weapon today — it represents reactor energy drained per FIRE event (not per bullet). Lower energy-per-DPS is more efficient. Reactor capacity at base is 100 with 25/sec recharge, so a sustainable fire rate is roughly `25 / energyCost` shots/sec. When `energy-down` (energyMul: 0.6) or `fire-rate-up` (fireRateMul: 0.7) is changed, recompute.
- **Time-to-kill (TTK, seconds)** for an `enemies.json` enemy by a given weapon: `enemy.hp / weaponDPS`. Compute for every (weapon, enemy) pair where either side changed. Where the changed entity is a tutorial-system mission, restrict the weapon set to the tutorial loot pool's `weapons[]` (potato family + free starter) — players can only obtain those there.
- **Wave intensity**: per `waves.json` wave, `sum(spawn.count * enemies[spawn.enemy].collisionDamage)`. Use the AFTER `enemies.json` for the AFTER value, BEFORE for BEFORE — collision-damage tweaks propagate.
- **Mission credit-per-second** (economy proxy): per missionId in `waves.json`, `sum(enemies[spawn.enemy].creditValue * spawn.count) / max(sum(wave.durationMs)/1000, 1)`. **Use the wave-level `durationMs`** — it's authoritative (see `src/game/data/data.test.ts:248-256`, which asserts every spawn's last-spawn-at fits inside `durationMs`). Do NOT divide by `sum(spawn.delayMs)` — `delayMs` is per-spawn start offset, not duration.
- **Mission reward delta**: when `missions.json` changes, just diff fields directly (no derived metric). Flag `solarSystemId` flips because they shift which loot pool the mission rewards from.
- **Perk drop rate**: `randomPerkId()` in `perks.ts` is uniform 1/N over `PERK_IDS`. Adding/removing a perk shifts every rate by `1/N_before - 1/N_after`. Flag if anyone added a `weight` field — current schema has none.

# Augments — first-class balance levers
Augments live in `src/game/data/augments.ts`. They are permanent multipliers a player binds to a single weapon (max 2 per weapon, see `MAX_AUGMENTS_PER_WEAPON`). Diff them like weapons:

- **Cost delta** — straight `cost` field diff.
- **Effect-multiplier delta** — `damageMul`, `fireRateMul`, `projectileBonus`, `energyMul`, `turnRateMul`. Each is identity (1 or 0) when absent.
- **Weapon impact recompute** — when any `*Mul` / `*Bonus` moves, recompute every weapon's DPS, energy/DPS, and TTK-vs-each-changed-enemy under the new fold. The `homing-up` augment (turnRateMul) has no effect on non-homing weapons — flag in interpretation if the user only tweaked `turnRateMul`.

# Loot pools — economy & roster levers
Loot pools live in `src/game/data/lootPools.ts` (the `POOLS` Map keyed by `SolarSystemId`). Diff per pool:

- **Weapons roster delta** — added / removed entries in `weapons[]`. A new id only matters if it resolves to a known `WeaponId`.
- **Augments roster delta** — same, against `AugmentId`.
- **Upgrades roster delta** — same, against the `UpgradeField` union (`shield`, `armor`, `reactor-capacity`, `reactor-recharge`).
- **Credits min/max delta** — flag if `min >= max`. Report the new average drop value (`(min+max)/2`) and the percent shift vs the old average.
- **Cross-system gating** — flag if a non-tutorial weapon (carrot/turnip family) lands in the `tutorial` pool, or a potato weapon disappears from `tutorial` (the tutorial system is potato-only by design — see the file's header comment).

# Files this skill reads
- `src/game/data/weapons.json` — fields: `id, name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost, tint, family, energyCost`. Optional: `homing`, `turnRateRadPerSec`, `gravity` (px/s² downward acceleration; carrots use 60–300 to arc), `bulletSprite`, `podSprite`. `family` is `"potato" | "carrot" | "turnip"` and gates which solar system surfaces the weapon in shop + loot pool.
- `src/game/data/enemies.json` — fields: `id, name, hp, speed, behavior, scoreValue, creditValue, spriteKey, fireRateMs, collisionDamage`.
- `src/game/data/waves.json` — `missions[].waves[].spawns[]` with `enemy, count, delayMs, intervalMs, formation, xPercent` and wave-level `id, durationMs`.
- `src/game/data/missions.json` — `id, kind, name, difficulty, requires, solarSystemId, ...` (galaxy/visual fields ignored unless changed).
- `src/game/data/solarSystems.json` — `id, name, sunColor, sunSize, ambientHue`. Cosmetic-only fields except `id` (which loot pools and missions key on).
- `src/game/data/perks.ts` — `PERKS` record + `PERK_IDS`. Read as text; parse the keys of the `PERKS` object literal.
- `src/game/data/augments.ts` — `AUGMENTS_RECORD` literal, `AUGMENT_IDS`, `MAX_AUGMENTS_PER_WEAPON`. Read as text; parse cost + the five `*Mul` / `*Bonus` fields.
- `src/game/data/lootPools.ts` — `POOLS` Map keyed by `SolarSystemId`. Read as text; parse `weapons[]`, `augments[]`, `upgrades[]`, `credits.{min,max}` per system.
- `git show HEAD:<path>` for the BEFORE versions of each.

# Output format
One markdown table per affected category. Columns: `file | id/key | field | before | after | Δ% | interpretation`.

```
### weapons.json
| id           | metric        | before | after | Δ%   | note                          |
|--------------|---------------|--------|-------|------|-------------------------------|
| heavy-cannon | DPS           | 87.5   | 70.0  | -20% | Yukon Gold Mortar hits 20% softer |
| heavy-cannon | TTK vs aphid  | 0.14s  | 0.17s | +27% | aphid takes ~1 extra shot     |
| heavy-cannon | energy/DPS    | 0.21   | 0.26  | +24% | less efficient per reactor unit |
| plasma-whip  | DPS           | 33.3   | 50.0  | +50% | Tokyo Cross Spray melts armor faster |
| hailstorm    | DPS (carrot)  | —      | —     | —    | Milan Purple Top Discs unchanged this diff |

### augments.ts
| id            | metric         | before | after | Δ%   | note                                           |
|---------------|----------------|--------|-------|------|------------------------------------------------|
| damage-up     | damageMul      | 1.25   | 1.40  | +12% | every augmented weapon hits ~12% harder        |
| damage-up     | cost           | 1000   | 1200  | +20% | shop access pricier                            |
| (folded) heavy-cannon + damage-up | DPS | 109.4  | 122.5 | +12% | still the alpha king, now with extra punch |

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
- (none) — or bullet each problem: dangling enemy id, DPS <= 0, perk count drift, missing mission reference, wave referencing removed enemy, loot-pool weapon id not in WeaponId, augment turnRateMul change with no homing weapon affected, mission solarSystemId pointing at unknown system, family-gated weapon in wrong pool, credits.min >= credits.max.
```

Keep the interpretation column to one short clause — name the entity in human terms ("Aphid is 30% slower", "Yamsteroid Belt wave 1 should feel easier", "Milan Purple Top Discs now kills Scarab Beetle in 2 fewer shots", "Tubernovae loot pool now ~20% richer"). If a change is purely cosmetic (tint, name, description, texture, orbitRadius, musicTrack, sunColor, ambientHue, bulletSprite, podSprite), list it once under a "Cosmetic-only" line — don't compute deltas.
