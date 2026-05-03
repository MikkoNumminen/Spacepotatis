---
name: equipment
description: Create, modify, or remove a weapon or piece of equipment (augment / reactor / shield / armor) — including visual changes to how it appears in combat or in the loadout UI. Covers stats, sprites, prices, and the full CRUD lifecycle for the entire ship-loadout content surface.
---

# When to use

Invoke for ANY request touching weapons, augments, reactor, shield, or armor — adding, removing, balancing, recoloring, re-skinning. Equipment is the only ship-gear surface in the codebase.

Route here on: action verb (`add / remove / change / tweak / rebalance / buff / nerf / recolor / re-skin / rip out / scrap / clone / design`) + any of `weapon / augment / shield / armor / reactor / loadout / projectile / bullet sprite / energy bar / tint dot`, OR sentiment-only ("X feels too weak/strong/cheap"), OR explicit ids. Visual asks ("recolor", "brighten", "make the bullet red", "augment dots are too dim", "energy bar should be green") also belong here.

## Boundary — do NOT use for
- **Mid-mission perks** → `/new-perk`. Scene-scoped, not persisted.
- **Enemies** → `/new-enemy`. **Missions** → `/new-mission`. **Story** → `/new-story`.
- **Systemic caps** (`MAX_LEVEL`, `MAX_AUGMENTS_PER_WEAPON`, `MAX_WEAPON_SLOTS` in `ShipConfig.ts`) — flag before editing.
- **A 5th equipment KIND** (e.g. "engine") — that's a feature; STOP and flag.
- **Player ship-sprite-only changes** — `BootScene.ts#drawPotatoShip` is unrelated to equipment.

## Adjacent
- "Enemy that fires a player-style weapon" → `/new-enemy` for the enemy entry, then this skill for the weapon.
- "Weapon as boss-1 reward" → primarily this skill (loot pool wiring).

# Surface map

## Weapons
- **Catalog**: `src/game/data/weapons.json` (6 entries — tier 1: rapid-fire, spread-shot, heavy-cannon; tier 2: corsair-missile, grapeshot-cannon, boarding-snare). Six previously-shipped weapons (the carrot/turnip family + spud-missile) live in TODO.md "Phase Vegetable-Catalog" with their last-shipped specs for reintroduction.
- **Type union**: `WeaponId` in [src/types/game.ts](src/types/game.ts).
- **Schema array**: `WEAPON_IDS` in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) — `satisfies readonly WeaponId[]` makes union/array drift fail typecheck.
- **Accessor**: `getWeapon(id)` in [src/game/data/weapons.ts](src/game/data/weapons.ts) — throws on unknown id.
- **`WeaponDefinition`** ([src/types/game.ts](src/types/game.ts)) — REQUIRED: `id`, `name`, `description`, `damage`, `fireRateMs`, `bulletSpeed`, `projectileCount`, `spreadDegrees`, `cost` (≥0), `tint` (CSS hex), `family` (`"potato" | "pirate"`), `tier` (`1 | 2`), `energyCost` (>0). OPTIONAL: `homing`, `turnRateRadPerSec`, `gravity` (px/s² +y; bullets arc and rotate to motion vector — gravity weapons use 60–300), `explosionRadius` + `explosionDamage` (AoE on impact — see `applyBulletAoE` in [CombatScene.ts](src/game/phaser/scenes/CombatScene.ts)), `slowFactor` (0..1, multiplier on enemy speed) + `slowDurationMs` (paired with explosionRadius — slows everything in the AoE), `bulletSprite`, `podSprite`.

### Tier + family gating
- `tier: 1` (currently the potato family) appears EVERYWHERE including the tutorial shop. The `WeaponTier` type in `types/game.ts` is the canonical surface; the badge UI renders T1/T2 in `ShopUI.tsx` + `WeaponCard.tsx` (look for the `TierBadge` helper).
- `tier: 2` (currently the pirate family) is HIDDEN in the tutorial-system shop ([ShopUI.tsx](src/components/ShopUI.tsx) filter checks `w.tier === 1` for tutorial). Tubernovae and later systems show every tier.
- Family is the visual / thematic group ("potato" / "pirate"); tier gates the shop. They tend to align (every tier-1 is potato, every tier-2 is pirate today) but they're independent fields — a future "potato tier-2" or "pirate tier-1" is structurally legal.
- LoadoutMenu is NEVER tier-gated — owned weapons stay usable everywhere.

### AoE / slow on impact (tier-2 pirate haul)
- `explosionRadius > 0` triggers an AoE pass in `CombatScene.applyBulletAoE` after the primary hit. Other enemies inside the radius take `explosionDamage` (scaled by `damageMul` like the direct hit). A small explosion-particles burst fires for visual legibility.
- `slowFactor` (e.g. 0.5 = half speed) + `slowDurationMs` re-stamp a slow on every enemy in the AoE. The primary target is included even when no other enemies are nearby. Slow is implemented on `Enemy.applySlow(factor, durationMs, now)`; `effectiveSpeed(time)` reads it inside the behavior switch in `preUpdate`.
- The bullet carries the effect bag through `Bullet.fire(..., effect)`; `WeaponSystem.tryFire` builds it from the def. **Both fields together** — `slowFactor` alone with no `explosionRadius` will only slow the primary target (engine handles this gracefully but no live weapon uses that path).

## Augments
- **Catalog**: [src/game/data/augments.ts](src/game/data/augments.ts) — TS `AUGMENTS_RECORD` (NOT JSON). 5 entries: damage-up, fire-rate-up, extra-projectile, energy-down, homing-up.
- **Type/schema/accessor**: `AugmentId` in `types/game.ts`, `AUGMENT_IDS` in `save.ts` (same `satisfies` guard), `getAugment(id)`.
- **`AugmentDefinition`** — REQUIRED: `id`, `name`, `description`, `cost`, `tint`. AT LEAST ONE multiplier: `damageMul`, `fireRateMul`, `projectileBonus`, `energyMul`, `turnRateMul`. New multiplier KIND = code change in `PlayerFireController` / `SlotModResolver`; STOP and flag.
- **Cap**: `MAX_AUGMENTS_PER_WEAPON = 2`.

## Reactor / Shield / Armor
NOT catalog entries — constants in [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts):
- `BASE_SHIELD = 40`, `BASE_ARMOR = 60`
- `BASE_REACTOR_CAPACITY = 100`, `REACTOR_CAPACITY_PER_LEVEL = 30`
- `BASE_REACTOR_RECHARGE = 25`, `REACTOR_RECHARGE_PER_LEVEL = 8`
- `MAX_LEVEL = 5`
- Cost curves: `shieldUpgradeCost`, `armorUpgradeCost`, `reactorCapacityCost`, `reactorRechargeCost` (default: double per level).

## Visuals — what to edit per surface

| What | Where |
|---|---|
| Weapon **bullet sprite** | `BootScene.ts` `draw<X>Bullet(key)` + `weapons.json#bulletSprite`. **Coupling:** also update `weapons.json#tint` so loadout/shop/pickup dot matches. |
| Weapon **bullet trajectory (arc)** | `weapons.json#gravity` — px/s² +y. Friendly bullets fire toward -y, so positive gravity arcs them. Bullets rotate to motion vector (cosmetic tumble suppressed). Reference: 60 = sniper drift, 120 = assault arc, 300 = grenade drop. Engine in `Bullet.fire`/`preUpdate` — no code change needed. |
| Weapon **side-pod sprite** | `BootScene.ts` `draw<X>Pod(key)` + `weapons.json#podSprite`. `PodController.ts` is generic — any weapon with `podSprite` set shows a pod when equipped in a non-primary slot. Multiple weapons can share a pod texture (`pod-potato`). |
| Weapon **UI tint dot** (loadout/shop) | `weapons.json#tint` — CSS color, read by `WeaponDot` in [src/components/loadout/dots.tsx](src/components/loadout/dots.tsx). |
| Augment **UI tint dot** | `augments.ts#<id>.tint`. |
| Combat HUD energy/shield/armor **bars** | [src/game/phaser/scenes/combat/CombatHud.ts](src/game/phaser/scenes/combat/CombatHud.ts) — Phaser Graphics. Energy ~L88, shield ~L67, armor ~L73. |
| HUD **perk chips** | `CombatHud.ts#refreshPerkChips()` ~L105. Chip tint from `PERKS[id].tint` (see `/new-perk`). Layout/typography here. |
| **Explosion / hit / impact particles** | [CombatVfx.ts](src/game/phaser/scenes/combat/CombatVfx.ts) `emitExplosionParticles` (~L21). Uses `particle-spark` from `BootScene.ts`. NO per-weapon variation today (generic white). |
| **Muzzle flash / projectile trails** | NOT IMPLEMENTED. Feature ask — STOP and flag. |
| Player **ship sprite** | `BootScene.ts#drawPotatoShip`. Doesn't react to equipment. Equipment-driven ship visuals = new feature; STOP and flag. |
| **Per-weapon energy chip** | NOT IMPLEMENTED — only one shared energy bar. |
| Shop **weapon row layout** | [ShopUI.tsx](src/components/ShopUI.tsx) — pure React/Tailwind, generic across weapons. |
| **Item-acquisition cue** | Audio only via [itemSfx.ts](src/game/audio/itemSfx.ts) per-category. NO toast/popup/particle. |

### Visual gotcha — `tint` not always honored at draw time
Some `BootScene.ts` bullet generators hard-code their fill (e.g. `drawPotatoBullet` is lime-green regardless of `tint`). Before promising "just edit `weapons.json#tint`", grep the matching `draw<X>Bullet` and confirm it reads a color parameter. If hard-coded, edit the generator or add a tint-aware variant.

# Templates

**A. Standard shop weapon**
```json
{
  "id": "<kebab-id>",
  "name": "<Display Name>",
  "description": "<one-line tooltip>",
  "damage": 12, "fireRateMs": 220, "bulletSpeed": 520,
  "projectileCount": 1, "spreadDegrees": 0,
  "cost": 600, "tint": "#88ccff",
  "family": "potato", "energyCost": 6
}
```

**B. Homing missile** — add `"homing": true, "turnRateRadPerSec": 3.0` to A; pair with custom `bulletSprite` for unique look.

**C. Augment — single multiplier**
```ts
"<kebab-id>": {
  id: "<kebab-id>", name: "<Display Name>",
  description: "<tooltip>", cost: 400, tint: "#66ffaa",
  damageMul: 1.25
}
```

**D. Augment — trade-off** — same shape as C with two multipliers (one positive, one negative), e.g. `fireRateMul: 0.5, damageMul: 0.6`.

**E. Re-skinned existing weapon** — rename + new bullet sprite + matching tint, stats unchanged. The `id` MUST stay (referenced from saves, loot pools, upgrade ladder, `DEFAULT_SHIP`). Renaming the id is REMOVE+CREATE, not re-skin. Edit `weapons.json` entry IN PLACE: `name`, `description`, `tint` (matching new bullet color), `bulletSprite` (new key), `podSprite` (optional, reusable). Stats/family/cost/energyCost stay frozen.

When in doubt, copy the structurally closest existing entry. Run `/balance-review` after drafting numbers.

# Operation: CREATE

## Inputs
1. Kind (weapon | augment).
2. Weapon: id (kebab, unique), name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost (≥0), tint, family, energyCost (>0). Optional: homing, turnRateRadPerSec, bulletSprite, podSprite, gravity.
3. Augment: id, name, description, cost, tint + ≥1 multiplier.
4. **Distribution** — must wire at least one or it's inaccessible:
   - **Shop** (default — `ShopUI.tsx` iterates `getAllWeapons()` / `getAllAugments()`).
   - **Mission drop** — add to a pool in [lootPools.ts](src/game/data/lootPools.ts) under the right `solarSystemId`.
   - **Mid-mission upgrade ladder** (weapons only) — `nextWeaponUpgrade()` in [DropController.ts](src/game/phaser/scenes/combat/DropController.ts) hard-codes `["rapid-fire", "spread-shot", "heavy-cannon"]`.
   - **Default loadout** (free starters only, cost === 0) — `DEFAULT_SHIP.slots` / `inventory` in [ShipConfig.ts](src/game/state/ShipConfig.ts).
   - **Boss reward** — same as mission drop, scoped to a boss mission.

## Steps — weapon
1. Read `weapons.json`; confirm id unique; compare balance.
2. Append entry.
3. Extend `WeaponId` union in `types/game.ts`.
4. Add id to `WEAPON_IDS` in `save.ts` (`satisfies` enforces parity).
5. **Visual** (only if custom `bulletSprite`): add `draw<X>Bullet(key)` in `BootScene.ts`, call from `generateTextures()`, set `bulletSprite`.
6. Wire ≥1 distribution channel.
7. `/balance-review` against the existing 9 weapons; adjust if out-of-band.
8. `npm run typecheck && npm run lint && npm test`.

## Steps — augment
1. Read `augments.ts`; confirm id unique.
2. Add entry to `AUGMENTS_RECORD`.
3. Extend `AugmentId` union.
4. Add id to `AUGMENT_IDS`.
5. New multiplier KIND → STOP (code change).
6. (Optional) loot pool entry.
7. Run checks.

# Operation: MODIFY

## Stats only

| Target | File |
|---|---|
| Weapon stats | `weapons.json` |
| Augment multipliers | `augments.ts` `AUGMENTS_RECORD` |
| Reactor/shield/armor base + per-level | [ShipConfig.ts](src/game/state/ShipConfig.ts) |
| Reactor/shield/armor cost curves | Same — `*UpgradeCost` functions |

After: `npm run typecheck && npm run lint && npm test`. For balance-significant changes, run `/balance-review`. [data.test.ts](src/game/data/data.test.ts) asserts `damage > 0`, `fireRateMs > 0`, `bulletSpeed > 0`, `cost ≥ 0`, `energyCost > 0` — pushing to 0/negative fails the data, not the test.

## Visuals only — see surface table above
`weapons.json#tint` / `augments.ts#tint` propagates immediately. Bullet sprite changes require BOTH `BootScene.ts` generator AND `weapons.json#bulletSprite`.

## Re-skin (rename + new bullet + matching tint, stats frozen)
Use Template E. Phrasings: "rename X to Y", "make X shoot a red potato instead of cyan capsule", "re-skin X as Y".

1. Pick texture key. Convention: `bullet-<theme>`, `pod-<theme>` (e.g. `bullet-potato-idaho`, `pod-potato`). Pods are share-friendly.
2. Add `draw<X>Bullet(key)` (and `draw<X>Pod(key)` if needed) — copy closest existing generator and recolor.
3. Wire into `BootScene.generateTextures()`.
4. Edit `weapons.json` entry IN PLACE: `name`, `description`, `tint` (matches new bullet — mismatch reads as a bug), `bulletSprite`, `podSprite` (reuse keys when fitting; potato weapons share `pod-potato`).
5. **Do NOT touch `id`** (referenced from `DEFAULT_SHIP`, save migration, upgrade ladder, loot pools, tests). Id rename = REMOVE+CREATE.
6. **Do NOT touch stats.** Re-skin is presentation-only. Mix presentation + balance = two separate commits so `/balance-review` has a clean diff.
7. Run checks. Smoke: `npm run dev`, boot tutorial mission.

# Operation: REMOVE

> ## ⚠️ HARD RULE — credit refund is mandatory, not optional
>
> Before touching ANYTHING else, add the removed id + its current `cost` to `REMOVED_WEAPON_BASE_COSTS` in [src/game/state/persistence/salvageRemovedWeapons.ts](src/game/state/persistence/salvageRemovedWeapons.ts). Then add a matching unit test in [salvageRemovedWeapons.test.ts](src/game/state/persistence/salvageRemovedWeapons.test.ts).
>
> **Why this is the first step, every time:** once you delete the weapon from `weapons.json` / `WEAPON_IDS`, the original `cost` value is gone from the live catalog. The salvage map is the only place that remembers what the player paid. The hydrate-time pipeline (`calculateLegacyRefund` in `salvageRemovedWeapons.ts`, called from `persistence.ts`) automatically refunds `cost + per-level upgrade costs paid + sum of installed augment costs` to every player who owned the removed weapon — but only if the entry is in the map.
>
> **Skipping this step silently destroys hours of player progression.** No exceptions. CI test [salvageInvariants.test.ts](src/game/state/persistence/salvageInvariants.test.ts) catches the most common forgotten-entry shape but cannot catch every case — the rule is on you.
>
> Re-skinning a weapon (renaming the id without changing stats) is REMOVE+CREATE: the old id needs a salvage entry too.

Most dangerous op — codebase has hard-coded references to specific weapon ids on top of the player-progress concern above.

## Hard-coded references (must clean up)

| File | What it references | What breaks if you remove |
|---|---|---|
| [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) `DEFAULT_SHIP` | `"rapid-fire"` (line 71) | New player has no weapons; `ShipConfig.test.ts` fails |
| [src/game/state/persistence/safetyNet.ts](src/game/state/persistence/safetyNet.ts) `seedStarterIfEmpty` | `newWeaponInstance("rapid-fire")` (the post-migration safety net — kicks in when both slots and inventory are empty after every migrator runs). PR #76 split persistence into per-shape migrators under `persistence/`; the safety net is the single starter-fallback site today. | Corrupted save → permanently weaponless player |
| [src/game/phaser/scenes/combat/DropController.ts](src/game/phaser/scenes/combat/DropController.ts) `nextWeaponUpgrade()` | `"rapid-fire"`, `"spread-shot"`, `"heavy-cannon"` | Mid-mission upgrade ladder skips a rung |
| [src/game/data/lootPools.ts](src/game/data/lootPools.ts) | spread-shot, heavy-cannon, spud-missile, tater-net (tutorial system); tail-gunner, side-spitter, plasma-whip, hailstorm (tubernovae) | Removed weapon stops appearing as a mission drop |
| [src/game/state/ShipConfig.test.ts](src/game/state/ShipConfig.test.ts) | `"rapid-fire"` at line 29 (asserts DEFAULT_SHIP starts with it), plus `spread-shot` / `heavy-cannon` literals throughout the slot/inventory assertions | Test fails |
| [src/game/state/GameState.test.ts](src/game/state/GameState.test.ts) | Extensive weapon-id literals: `rapid-fire`, `spread-shot`, `heavy-cannon`, `tail-gunner`, `side-spitter` (used to assert slot/inventory shape and migration behavior) | Tests fail at every assertion that names the removed id |
| [src/game/state/rewards.test.ts](src/game/state/rewards.test.ts) | `spread-shot`, `heavy-cannon`, `spud-missile`, `tater-net` (mission-reward selection tests) | Reward-pool tests assert specific id outcomes and fail if any of these go away |
| [src/game/state/sync.test.ts](src/game/state/sync.test.ts) | `rapid-fire` (lines ~71, ~123 — round-trip save fixtures) | Sync round-trip tests fail |

## Save-format safety net + credit refund (HARD RULE)
`migrateShip` silently DROPS unknown weapon and augment ids on hydrate — existing saves are SAFE from crashes. Server schema is permissive (`LegacyShipSchema`). **No DB migration needed for removals.**

**Player progress, however, is the load-bearing concern.** When a weapon is removed from the catalog, every player who owned a copy must be reimbursed in credits — **base cost + per-level upgrade costs paid + cost of every installed augment**. The refund is a HARD RULE: removing a weapon without wiring the refund silently destroys hours of player progression and that's not acceptable.

The refund pipeline lives at [src/game/state/persistence/salvageRemovedWeapons.ts](src/game/state/persistence/salvageRemovedWeapons.ts):
- `REMOVED_WEAPON_BASE_COSTS` is the load-bearing map. **Add the removed id + its last-shipped `cost` here** before deleting the weapons.json entry. Once the id leaves `WEAPON_IDS`, this map is the only place that remembers what the player paid.
- `calculateLegacyRefund(raw)` is called from `hydrate()` in [persistence.ts](src/game/state/persistence.ts) BEFORE the per-shape migrators (because they drop unknown ids via `isKnownWeapon` before salvage can see them). It walks the raw legacy snapshot — supports new-shape (per-instance), legacy id-array (`unlockedWeapons` + `weaponLevels` + `weaponAugments`), named-slots, and pre-loadout `primaryWeapon` shapes.
- The refund is added to `state.credits` purely additively. No mutation of slots/inventory — those are still cleaned up by `migrateShip` as before.
- Tests: [salvageRemovedWeapons.test.ts](src/game/state/persistence/salvageRemovedWeapons.test.ts). Add a new case for any new wave of removals (covers the per-instance + per-id-ledger paths).

The other danger is the hard-coded reference list above.

## Augment-specific notes
Simpler than weapon removal — no hard-coded augment ids in `DEFAULT_SHIP`, `migrateShip`, `DropController`, or `ShipConfig.test.ts` today. Migrate-save drops unknown augment ids the same way. **Still grep the id** — `lootPools.ts`, mission rewards, and tests CAN reference augment ids.

## Steps
1. **Refund entry FIRST.** Before touching the catalog, add the removed id + its current `cost` to `REMOVED_WEAPON_BASE_COSTS` in [salvageRemovedWeapons.ts](src/game/state/persistence/salvageRemovedWeapons.ts). Order matters — once `WEAPON_IDS` no longer contains the id, you can't easily look up the original cost. Augments installed on the removed weapon get refunded automatically via `AUGMENTS[augId].cost`; no extra work needed for those.
2. `grep -rn '"<id>"' src/` (catches anything new since last skill update; includes `*.test.ts` fixtures).
3. Replace each ref with a sensible fallback id, or delete if optional.
4. Remove entry from `weapons.json` / `augments.ts`.
5. Remove from `WeaponId` / `AugmentId` union.
6. Remove from `WEAPON_IDS` / `AUGMENT_IDS` (`satisfies` will fail to compile if these drift).
7. (Optional) drop unused `BootScene.ts` generator + texture key — harmless dead code if left.
8. **Salvage test.** Add a new `it()` to `salvageRemovedWeapons.test.ts` covering the new id at level 1 (no augments) and at higher levels with augments. The test is the contract that the refund is wired correctly.
9. **TODO.md backlog entry.** Append the verbatim weapons.json spec under "Phase Vegetable-Catalog (backlog)" so the weapon can be reintroduced later. Include `tier`, `family`, sprite keys.
10. `npm run typecheck && npm run lint && npm test`. Data + ShipConfig + salvage tests are the canary.

# Invariants

## All operations
- `WEAPON_IDS` ↔ `WeaponId` and `AUGMENT_IDS` ↔ `AugmentId` stay locked (`satisfies` is the guard).
- No `any`. No new comments unless explaining a non-obvious why.
- `npm run typecheck && npm test` passes.

## CREATE
- Id is kebab-case, unique.
- Weapon: `cost ≥ 0`, `energyCost > 0`, `damage > 0`, `fireRateMs > 0`, `bulletSpeed > 0`.
- If `bulletSprite` set, matching texture key is registered via a `BootScene` generator (else bullet renders blank).
- Augment has ≥1 multiplier.
- **Reintroducing a previously-removed id is safe** — `salvageRemovedWeapons.ts` filters out any id present in the live `WEAPON_IDS`, so a stale `REMOVED_WEAPON_BASE_COSTS` entry stops firing automatically once the id is back in the catalog. Leave the entry; the salvage map is a graveyard, not a registry. Optionally remove it for tidiness.

## REMOVE
- **Refund entry in `REMOVED_WEAPON_BASE_COSTS` (HARD RULE — see banner at the top of the REMOVE section).** Skipping it silently wipes player progression. `salvageInvariants.test.ts` catches the easy case (id in TODO backlog but missing from the map) — but the human ledger of "what cost did this weapon ship at" only exists in your head and the soon-deleted `weapons.json` entry.
- Every hard-coded reference in the table is updated/deleted.
- `DEFAULT_SHIP.slots[0].id` and `migrateShip` fallback resolve to a known `WeaponId`.
- `ShipConfig.test.ts:29` updated to the new starter weapon. `GameState.test.ts`, `rewards.test.ts`, `sync.test.ts` only need editing if they assert the removed id — `grep -rn '"<id>"' src/game/state/*.test.ts`.

# Files this skill never touches
- `src/game/state/shipMutators.ts` — id-agnostic.
- `src/components/loadout/*` — generic across all ids.
- `src/game/state/sync.ts`, save server route, `db/migrations/` — schemas read catalogs at runtime; no DB migration for catalog adds/removes.
- `src/lib/saveValidation.ts` — credit caps derive from waves + loot pools, not equipment prices.
- `src/game/audio/itemSfx.ts` — generic per-category cues fire automatically.
