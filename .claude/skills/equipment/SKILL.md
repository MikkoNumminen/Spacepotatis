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
- **Catalog**: `src/game/data/weapons.json` (9 entries: rapid-fire, spread-shot, heavy-cannon, spud-missile, tater-net, tail-gunner, side-spitter, plasma-whip, hailstorm).
- **Type union**: `WeaponId` in [src/types/game.ts](src/types/game.ts).
- **Schema array**: `WEAPON_IDS` in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) — `satisfies readonly WeaponId[]` makes union/array drift fail typecheck.
- **Accessor**: `getWeapon(id)` in [src/game/data/weapons.ts](src/game/data/weapons.ts) — throws on unknown id.
- **`WeaponDefinition`** ([src/types/game.ts](src/types/game.ts)) — REQUIRED: `id`, `name`, `description`, `damage`, `fireRateMs`, `bulletSpeed`, `projectileCount`, `spreadDegrees`, `cost` (≥0), `tint` (CSS hex), `family` (`"potato" | "carrot" | "turnip"`), `energyCost` (>0). OPTIONAL: `homing`, `turnRateRadPerSec`, `gravity` (px/s² +y; bullets arc and rotate to motion vector — carrot weapons use 60–300), `bulletSprite`, `podSprite`.

### Family gating
- `"potato"` appears EVERYWHERE (incl. tutorial).
- `"carrot"` / `"turnip"` are HIDDEN in tutorial shop ([ShopUI.tsx](src/components/ShopUI.tsx) filter) and excluded from tutorial loot pool ([lootPools.ts](src/game/data/lootPools.ts)).
- New non-potato weapon inherits tutorial-hidden behavior automatically. Add to a system's loot pool to make it drop there.
- LoadoutMenu is NEVER family-gated — owned weapons stay usable everywhere.

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

Most dangerous op — codebase has hard-coded references to specific weapon ids.

## Hard-coded references (must clean up)

| File | What it references | What breaks if you remove |
|---|---|---|
| [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) `DEFAULT_SHIP` | `"rapid-fire"` (line 71) | New player has no weapons; `ShipConfig.test.ts` fails |
| [src/game/state/persistence.ts](src/game/state/persistence.ts) `migrateShip` fallback | `newWeaponInstance("rapid-fire")` at BOTH line 333 AND line 386 (two fallback sites — the legacy-shape rebuild and the modern-shape rebuild). Forgetting either leaves a partially-broken hydrate path. | Corrupted save → permanently weaponless player |
| [src/game/phaser/scenes/combat/DropController.ts](src/game/phaser/scenes/combat/DropController.ts) `nextWeaponUpgrade()` | `"rapid-fire"`, `"spread-shot"`, `"heavy-cannon"` | Mid-mission upgrade ladder skips a rung |
| [src/game/data/lootPools.ts](src/game/data/lootPools.ts) | spread-shot, heavy-cannon, spud-missile, tater-net (tutorial system); tail-gunner, side-spitter, plasma-whip, hailstorm (tubernovae) | Removed weapon stops appearing as a mission drop |
| [src/game/state/ShipConfig.test.ts](src/game/state/ShipConfig.test.ts) | `"rapid-fire"` at line 29 (asserts DEFAULT_SHIP starts with it), plus `spread-shot` / `heavy-cannon` literals throughout the slot/inventory assertions | Test fails |
| [src/game/state/GameState.test.ts](src/game/state/GameState.test.ts) | Extensive weapon-id literals: `rapid-fire`, `spread-shot`, `heavy-cannon`, `tail-gunner`, `side-spitter` (used to assert slot/inventory shape and migration behavior) | Tests fail at every assertion that names the removed id |
| [src/game/state/rewards.test.ts](src/game/state/rewards.test.ts) | `spread-shot`, `heavy-cannon`, `spud-missile`, `tater-net` (mission-reward selection tests) | Reward-pool tests assert specific id outcomes and fail if any of these go away |
| [src/game/state/sync.test.ts](src/game/state/sync.test.ts) | `rapid-fire` (lines ~71, ~123 — round-trip save fixtures) | Sync round-trip tests fail |

## Save-format safety net
`migrateShip` silently DROPS unknown weapon and augment ids on hydrate — existing saves are SAFE. Server schema is permissive (`LegacyShipSchema`). **No DB migration needed for removals.** The only danger is the hard-coded reference list above.

## Augment-specific notes
Simpler than weapon removal — no hard-coded augment ids in `DEFAULT_SHIP`, `migrateShip`, `DropController`, or `ShipConfig.test.ts` today. Migrate-save drops unknown augment ids the same way. **Still grep the id** — `lootPools.ts`, mission rewards, and tests CAN reference augment ids.

## Steps
1. `grep -rn '"<id>"' src/` (catches anything new since last skill update; includes `*.test.ts` fixtures).
2. Replace each ref with a sensible fallback id, or delete if optional.
3. Remove entry from `weapons.json` / `augments.ts`.
4. Remove from `WeaponId` / `AugmentId` union.
5. Remove from `WEAPON_IDS` / `AUGMENT_IDS` (`satisfies` will fail to compile if these drift).
6. (Optional) drop unused `BootScene.ts` generator + texture key — harmless dead code if left.
7. `npm run typecheck && npm run lint && npm test`. Data + ShipConfig tests are the canary.

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

## REMOVE
- Every hard-coded reference in the table is updated/deleted.
- `DEFAULT_SHIP.slots[0].id` and `migrateShip` fallback resolve to a known `WeaponId`.
- `ShipConfig.test.ts:29` updated to the new starter weapon. `GameState.test.ts`, `rewards.test.ts`, `sync.test.ts` only need editing if they assert the removed id — `grep -rn '"<id>"' src/game/state/*.test.ts`.

# Files this skill never touches
- `src/game/state/shipMutators.ts` — id-agnostic.
- `src/components/loadout/*` — generic across all ids.
- `src/game/state/sync.ts`, save server route, `db/migrations/` — schemas read catalogs at runtime; no DB migration for catalog adds/removes.
- `src/lib/saveValidation.ts` — credit caps derive from waves + loot pools, not equipment prices.
- `src/game/audio/itemSfx.ts` — generic per-category cues fire automatically.
