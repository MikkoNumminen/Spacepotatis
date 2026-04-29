---
name: equipment
description: Create, modify, or remove a weapon or piece of equipment (augment / reactor / shield / armor) — including visual changes to how it appears in combat or in the loadout UI. Covers stats, sprites, prices, and the full CRUD lifecycle for the entire ship-loadout content surface.
---

# When to use

**Invoke this skill for ANY request that touches weapons, augments, or ship equipment** — adding, removing, balancing, or changing how it looks. Equipment is the only weapon/ship-gear surface in the codebase, so any of the following phrasings should route here:

## Triggers — creation
- "/equipment", "/new-equipment", "/new-weapon" (now redirects here)
- "add a weapon", "add a new weapon", "add a gun", "make a new gun"
- "add an augment", "add a mod"
- "design a new <weapon|augment>", "design an augment that does X"
- "give <weapon> homing", "make <weapon> a missile" (homing toggle on existing or new weapon)
- "duplicate / clone <existing weapon> with <change>"

## Triggers — stat / balance modification
- "change <weapon>'s damage / fire rate / energy cost / spread / bullet speed"
- "make <weapon> stronger / weaker", **"buff <weapon>"**, **"nerf <weapon>"**
- "<weapon> feels too weak / too strong / cheap / expensive" (sentiment-only — still in scope; treat as a balance ask)
- "rebalance the reactor / shield / armor"
- "increase max armor", "make the energy bar bigger"
- "tweak the cost curve for <X>"
- **"make shields cheaper"**, **"halve the reactor upgrade price"**, "raise/lower the cost of <equipment>"

## Triggers — visual modification
- "make the <weapon>'s bullet look <color>", "give <weapon> a different projectile"
- "change <weapon>'s tint dot in the loadout"
- "change the <augment>'s badge color"
- "make <weapon>'s bullet sprite <shape>"
- "change combat HUD bars" (energy / shield / armor)
- **"recolor"**, **"brighten"**, **"darken"**, **"dim"**, **"re-skin"** anything in the loadout/HUD
- "the augment dots are too dim", "the energy bar should be green not amber"
- "change the explosion / spark / impact color" (handled — see visual surface)

## Triggers — removal
- "remove the <weapon>", "delete <weapon>", "drop <weapon>"
- **"rip out / kill / scrap / retire <weapon>"**
- "we're not shipping <augment> anymore"

If the request mentions any specific weapon id, augment id, or any of the words `weapon / augment / shield / armor / reactor / loadout / projectile / bullet sprite / energy bar / tint dot` alongside an action verb (`add / remove / change / tweak / rebalance / modify / buff / nerf / colorize / recolor / re-skin / rip out / scrap / design / clone`), or a sentiment phrasing about an existing weapon/equipment feeling too X, invoke this skill.

## Boundary — do NOT use for
- **Mid-mission perks** → `/new-perk`. Perks are scene-scoped buffs that reset every CombatScene boot; they are NOT persisted in the ship.
- **Enemies** → `/new-enemy`.
- **Missions / waves** → `/new-mission`.
- **Story popups** → `/new-story`.
- **Tweaking a number that isn't yours to tweak** — e.g. changing `MAX_LEVEL`, `MAX_AUGMENTS_PER_WEAPON`, or `MAX_WEAPON_SLOTS` in `src/game/state/ShipConfig.ts`. Those are systemic caps; flag any user request that wants them changed before editing.
- **Adding a new equipment KIND** (a 5th category beyond weapons / augments / reactor / shield / armor — e.g. "shields-with-types" or "engine"). That requires extending `ShipConfig`, schemas, mutators, and UI; it's a feature, not a content change. STOP and flag.
- **Player ship-sprite-only changes** ("make the ship bigger", "change the potato to a different shape"). The ship sprite is in `BootScene.ts#drawPotatoShip` and is unrelated to equipment today; route to a regular code-edit ask, not this skill.

## Adjacent asks (route here for the equipment portion)

- **"Add an enemy that fires a new player-style weapon"** — `/new-enemy` runs first for the enemy, but the new weapon belongs in this skill. Run `/new-enemy` for the enemy entry, then `/equipment` for the weapon.
- **"Add a weapon and wire it as the boss-1 reward"** — primarily equipment. The reward wiring lives in this skill's CREATE-weapon distribution step (loot pool + upgrade ladder).

# Surface map — by entry kind

## Weapons

- **Catalog**: `src/game/data/weapons.json` (9 entries today: rapid-fire, spread-shot, heavy-cannon, spud-missile, tater-net, tail-gunner, side-spitter, plasma-whip, hailstorm).
- **Type union**: `WeaponId` in [src/types/game.ts](src/types/game.ts).
- **Schema array**: `WEAPON_IDS` in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) — uses `satisfies readonly WeaponId[]` so adding to one without the other fails to compile.
- **Accessor**: `getWeapon(id)` in [src/game/data/weapons.ts](src/game/data/weapons.ts) — throws on unknown id (no nullable variant).
- **Definition shape** (`WeaponDefinition` in [src/types/game.ts](src/types/game.ts)) — REQUIRED: `id`, `name`, `description`, `damage`, `fireRateMs`, `bulletSpeed`, `projectileCount`, `spreadDegrees`, `cost` (≥ 0), `tint` (CSS hex), `energyCost` (> 0). OPTIONAL: `homing` (bool), `turnRateRadPerSec`, `bulletSprite` (BootScene texture key), `podSprite`.

## Augments

- **Catalog**: [src/game/data/augments.ts](src/game/data/augments.ts) — TypeScript `AUGMENTS_RECORD` constant. **NOT** a JSON file. 5 entries: damage-up, fire-rate-up, extra-projectile, energy-down, homing-up.
- **Type union**: `AugmentId` in [src/types/game.ts](src/types/game.ts).
- **Schema array**: `AUGMENT_IDS` in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) (with the same `satisfies` parity guard).
- **Accessor**: `getAugment(id)` in [src/game/data/augments.ts](src/game/data/augments.ts).
- **Definition shape** (`AugmentDefinition`) — REQUIRED: `id`, `name`, `description`, `cost`, `tint`. AT LEAST ONE multiplier: `damageMul`, `fireRateMul`, `projectileBonus`, `energyMul`, `turnRateMul`. Multipliers are folded automatically by `PlayerFireController` / `SlotModResolver` — adding a new multiplier KIND (not just a new value) is a code change, not a content change; STOP and flag.
- **Cap**: `MAX_AUGMENTS_PER_WEAPON = 2` (constant in augments.ts).

## Reactor / Shield / Armor

These are NOT catalog entries. They're parameter constants in [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts):
- `BASE_SHIELD = 40`, `BASE_ARMOR = 60`
- `BASE_REACTOR_CAPACITY = 100`, `REACTOR_CAPACITY_PER_LEVEL = 30`
- `BASE_REACTOR_RECHARGE = 25`, `REACTOR_RECHARGE_PER_LEVEL = 8`
- `MAX_LEVEL = 5`
- Cost curves: `shieldUpgradeCost`, `armorUpgradeCost`, `reactorCapacityCost`, `reactorRechargeCost` (all double per level by default).

Modifying these is a stat-only change — see Operation: MODIFY → stats.

## Visuals — what to edit per surface

| What changes visually | Where to edit |
|---|---|
| Weapon **bullet sprite** in combat | `BootScene.ts` `draw<X>Bullet(key)` generator + `weapons.json` `bulletSprite` field. **Coupling:** if the new sprite materially changes the weapon's color, also update `weapons.json#tint` to match so the loadout / shop / pickup UI dot reads as the same weapon — these two fields are read by different surfaces but should always agree on color. |
| Weapon **side-pod sprite** | `BootScene.ts` `draw<X>Pod(key)` + `weapons.json` `podSprite` field. The pod render path in `src/game/phaser/entities/player/PodController.ts` is GENERIC — it iterates `slotInstances` and reads `getWeapon(inst.id).podSprite` for each one. Any weapon with `podSprite` set automatically gets a visible side pod when equipped in a non-primary slot; weapons without it stay invisible (today's behavior). Multiple weapons can share the same pod texture (e.g. `rapid-fire` and `spread-shot` both use `pod-potato`). |
| Weapon **UI tint dot** (loadout, shop) | `weapons.json` `tint` field — pure CSS color, read by `WeaponDot` in [src/components/loadout/dots.tsx](src/components/loadout/dots.tsx). No sprite/texture work needed. |
| Augment **UI tint dot** | `augments.ts` `<id>.tint` field — same. |
| Combat HUD energy / shield / armor **bars** | [src/game/phaser/scenes/combat/CombatHud.ts](src/game/phaser/scenes/combat/CombatHud.ts) — Phaser Graphics calls. Energy bar ~line 88, shield ~line 67, armor ~line 73. |
| Combat HUD **perk chips** (active perks during combat) | `CombatHud.ts` `refreshPerkChips()` ~line 105. Chip tint is read from `PERKS[id].tint` — for chip color, see `/new-perk`. For chip layout/typography in this skill, edit the function directly. |
| **Explosion / hit / impact particles** in combat | [src/game/phaser/scenes/combat/CombatVfx.ts](src/game/phaser/scenes/combat/CombatVfx.ts) `emitExplosionParticles` (~line 21). Uses the `particle-spark` texture generated in `BootScene.ts`. Recolor by editing the spark generator OR by changing the emitter's `tint` config. Today there is NO per-weapon variation — all impacts are generic white sparks. |
| **Muzzle flash / projectile trails** | NOT IMPLEMENTED today. If a user asks for one, that's a new visual feature, not a content tweak. STOP and flag. |
| Player **ship sprite** | `BootScene.ts` `drawPotatoShip` — does NOT currently change with equipment. If a request wants armor-level / shield-level / weapon-loadout to alter the ship sprite, that's a NEW visual coupling and a feature; STOP and flag. |
| **Energy chip per weapon** in combat | NOT IMPLEMENTED — only one shared energy bar exists. Per-weapon chips are NOT a feature today. |
| Shop UI **weapon row layout** | [src/components/ShopUI.tsx](src/components/ShopUI.tsx) — pure React/Tailwind. Same render path is used for all weapons; no per-weapon code. Layout/typography changes go here. |
| **Item-acquisition cue** | Audio only via [src/game/audio/itemSfx.ts](src/game/audio/itemSfx.ts) per-category cues (`weapon / augment / upgrade / money`). NO toast / popup / particle visual today. |

### Visual gotcha — `tint` is not always honored at draw time

Some bullet generators in `BootScene.ts` hard-code their fill color (e.g. `drawPotatoBullet` is lime-green regardless of the weapon's `tint` field). Before telling the user "just edit `weapons.json#tint` to recolor the bullet", grep the matching `draw<X>Bullet` function and confirm it reads a color parameter rather than baking one in. If the generator is hard-coded, you must either edit the generator OR add a tint-aware variant.

# Templates — pick one and fill in

The four shapes that match what's in the catalog today. Match the user's intent to one and use it as your starting point instead of building from scratch.

**A. Standard shop weapon** — bought with credits, basic ballistic.
```json
{
  "id": "<kebab-id>",
  "name": "<Display Name>",
  "description": "<one-line tooltip>",
  "damage": 12,
  "fireRateMs": 220,
  "bulletSpeed": 520,
  "projectileCount": 1,
  "spreadDegrees": 0,
  "cost": 600,
  "tint": "#88ccff",
  "energyCost": 6
}
```

**B. Homing missile weapon** — turns toward enemies; pair with a custom bulletSprite if you want a unique look.
```json
{
  "id": "<kebab-id>",
  "name": "<Display Name>",
  "description": "<one-line tooltip>",
  "damage": 24,
  "fireRateMs": 700,
  "bulletSpeed": 360,
  "projectileCount": 1,
  "spreadDegrees": 0,
  "cost": 1200,
  "tint": "#ffaa44",
  "energyCost": 14,
  "homing": true,
  "turnRateRadPerSec": 3.0
}
```

**C. Augment — single multiplier**
```ts
"<kebab-id>": {
  id: "<kebab-id>",
  name: "<Display Name>",
  description: "<one-line tooltip>",
  cost: 400,
  tint: "#66ffaa",
  damageMul: 1.25
}
```

**D. Augment — trade-off (two multipliers, one positive one negative)**
```ts
"<kebab-id>": {
  id: "<kebab-id>",
  name: "<Display Name>",
  description: "<one-line tooltip — call out the trade>",
  cost: 600,
  tint: "#ff66aa",
  fireRateMul: 0.5,
  damageMul: 0.6
}
```

**E. Re-skinned existing weapon** — rename + new bullet sprite + matching tint, stats unchanged. The pattern the weapon walk-through uses on every existing weapon. Stats stay frozen so balance doesn't shift; only the surface presentation changes. The `id` MUST stay the same — it's referenced from saves, loot pools, the upgrade ladder, and `DEFAULT_SHIP`. Renaming the id is a destructive change and belongs in REMOVE+CREATE, not here.
```json
{
  "id": "<unchanged-existing-id>",
  "name": "<New Display Name>",
  "description": "<rewritten tooltip>",
  "damage": <unchanged>,
  "fireRateMs": <unchanged>,
  "bulletSpeed": <unchanged>,
  "projectileCount": <unchanged>,
  "spreadDegrees": <unchanged>,
  "cost": <unchanged>,
  "tint": "#<new-hex-matching-the-bullet>",
  "energyCost": <unchanged>,
  "bulletSprite": "<new-bootscene-key>",
  "podSprite": "<optional-bootscene-key, shared OK>"
}
```

When in doubt, pick an existing entry that's structurally closest (e.g. "spread-shot" for a spread weapon, "spud-missile" for a homing one) and copy its shape. Run `/balance-review` after you've drafted numbers — the comparison against existing DPS / TTK / cost-per-DPS keeps the new entry in the same balance band.

# Operation: CREATE

## Inputs the user must provide
1. The kind (weapon | augment).
2. For a weapon: id (kebab-case, unique), name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost (≥ 0), tint (hex), energyCost (> 0). Optional: homing, turnRateRadPerSec, bulletSprite, podSprite.
3. For an augment: id (kebab-case, unique), name, description, cost, tint. Plus at least one multiplier field.
4. **Distribution** — where the new content first appears to the player. Pick one or more:
   - **Shop catalog** (default for weapons + augments — `ShopUI.tsx` iterates `getAllWeapons()` / `getAllAugments()` automatically; no extra wiring).
   - **Mission drop** — add the id to a pool in [src/game/data/lootPools.ts](src/game/data/lootPools.ts) under the right `solarSystemId` block.
   - **Mid-mission upgrade ladder** — for weapons only, the `nextWeaponUpgrade()` function in [src/game/phaser/scenes/combat/DropController.ts](src/game/phaser/scenes/combat/DropController.ts) hard-codes a progression sequence (`["rapid-fire", "spread-shot", "heavy-cannon"]` today). If the new weapon should slot into this in-mission progression, append or insert into that array.
   - **Default loadout** — only for free starter weapons (cost === 0). Add to `DEFAULT_SHIP.slots` or `DEFAULT_SHIP.inventory` in [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts).
   - **Boss reward** — same as mission drop, but tied to a specific boss mission's loot pool entry.

## Steps — weapon

1. Read [src/game/data/weapons.json](src/game/data/weapons.json) to confirm the id is unique and to compare balance against existing weapons (run `/balance-review` first if numbers feel uncertain).
2. Append the new entry to the array.
3. Extend the `WeaponId` union literal in [src/types/game.ts](src/types/game.ts).
4. Add the new id to the `WEAPON_IDS` array in [src/lib/schemas/save.ts](src/lib/schemas/save.ts). The `satisfies readonly WeaponId[]` clause makes this a compile-time requirement — typecheck will fail if you forget.
5. **Visual** (only if the weapon has a custom `bulletSprite`):
   a. Add a `draw<X>Bullet(key)` method to [src/game/phaser/scenes/BootScene.ts](src/game/phaser/scenes/BootScene.ts).
   b. Call it from `generateTextures()`.
   c. Set `bulletSprite` in the weapon entry to the matching key.
6. **Distribution** (where the player first gets it) — see the input list above; pick at least one. The skill author MUST wire the new weapon into at least one distribution channel or it will be inaccessible to the player.
7. Run `/balance-review` to compare DPS / TTK / energy-cost-per-DPS / cost-per-DPS deltas against the existing 9 weapons. Adjust numbers if the new weapon is materially out-of-band.
8. Run `npm run typecheck && npm run lint && npm test`.

## Steps — augment

1. Read [src/game/data/augments.ts](src/game/data/augments.ts) to confirm the id is unique.
2. Add the entry to `AUGMENTS_RECORD`.
3. Extend the `AugmentId` union in [src/types/game.ts](src/types/game.ts).
4. Add the id to the `AUGMENT_IDS` array in [src/lib/schemas/save.ts](src/lib/schemas/save.ts).
5. If the augment introduces a NEW multiplier kind (not just a new value of an existing field), STOP — that's a player-code change in `PlayerFireController` / `SlotModResolver`, not a content addition.
6. (Optional) Add to a loot pool if mission drops should grant it.
7. Run `npm run typecheck && npm run lint && npm test`.

# Operation: MODIFY

## Stats only

| Target | File to edit |
|---|---|
| Weapon stats (damage, fireRateMs, etc.) | `weapons.json` |
| Augment multipliers | `augments.ts` `AUGMENTS_RECORD` |
| Reactor / shield / armor base + per-level constants | [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) |
| Reactor / shield / armor cost curves | Same — the `*UpgradeCost` functions in `ShipConfig.ts` |

After editing stats, run `npm run typecheck && npm run lint && npm test`. For balance-significant changes, run `/balance-review` to summarize the deltas. Note: the per-weapon assertions in [src/game/data/data.test.ts](src/game/data/data.test.ts) check `damage > 0`, `fireRateMs > 0`, `bulletSpeed > 0`, `cost ≥ 0`, `energyCost > 0` — pushing a value to 0 or negative will fail those tests, and the fix is the test, not the data.

## Visuals only — see surface table above

Single-edit operations in most cases: changing `weapons.json#tint` or `augments.ts#tint` propagates to the loadout/shop UI immediately. Changing a bullet sprite requires both the `BootScene.ts` generator AND the `weapons.json#bulletSprite` field.

## Re-skin (rename + new bullet sprite + matching tint)

The weapon walk-through pass uses this shape repeatedly: stats stay frozen so balance doesn't shift, only the presentation changes. Common phrasings: "rename X to Y", "make X shoot a red potato instead of cyan capsule", "re-skin X as Y". Use Template E.

Steps:
1. Pick the new texture key. Convention: `bullet-<theme>` for the bullet, `pod-<theme>` for the optional pod (e.g. `bullet-potato-idaho`, `pod-potato`). Pod textures are share-friendly — multiple weapons can reference the same `pod-X` key (the `PodController` is generic).
2. Add the `draw<X>Bullet(key)` generator in `BootScene.ts` (and `draw<X>Pod(key)` if the weapon needs its own pod variant). Pattern: copy the closest existing generator and recolor.
3. Wire the new generator(s) into `BootScene.generateTextures()` next to the existing `drawBullet` calls.
4. In `weapons.json`, edit the existing entry IN PLACE (don't add a new one — the `id` stays):
   - `name` — display name in loadout / shop / pickups
   - `description` — one-line tooltip
   - `tint` — switch to a hex that visually matches the new bullet color (the loadout dot, shop row chip, and pickup color all read this; mismatched tint vs sprite reads as a bug)
   - `bulletSprite` — set to the new texture key
   - `podSprite` — set if the weapon should show a side pod when equipped in slot ≥ 1; reuse an existing key when the visual fits (potato weapons all share `pod-potato`, for example).
5. **Do NOT touch the `id`.** It's referenced from `DEFAULT_SHIP`, save migration, the upgrade ladder, loot pools, and tests. A pure re-skin keeps the id and only changes surface fields. If the user actually wants the id to change, that's REMOVE + CREATE, not a re-skin.
6. **Do NOT touch stats.** A re-skin is presentation-only. If the user wants both presentation and balance changes, do them as two separate commits so `/balance-review` has a clean diff.
7. Run `npm run typecheck && npm run lint && npm test`. The data-integrity tests confirm the new texture-key strings start with `bullet-` / `pod-` and are non-empty; manual smoke (`npm run dev`, boot the tutorial mission) confirms the new sprite renders.

# Operation: REMOVE

REMOVE is the most dangerous operation because the codebase has hard-coded references to specific weapon ids. Before removing, walk this table.

## Hard-coded references (must clean up)

| File | What it references | What breaks if you remove |
|---|---|---|
| [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) `DEFAULT_SHIP` | `"rapid-fire"` | New player has no weapons; `ShipConfig.test.ts` fails |
| [src/game/state/persistence.ts](src/game/state/persistence.ts) `migrateShip` fallback | `"rapid-fire"` | Corrupted save → permanently weaponless player |
| [src/game/phaser/scenes/combat/DropController.ts](src/game/phaser/scenes/combat/DropController.ts) `nextWeaponUpgrade()` | `"rapid-fire"`, `"spread-shot"`, `"heavy-cannon"` | Mid-mission upgrade ladder skips a rung |
| [src/game/data/lootPools.ts](src/game/data/lootPools.ts) | spread-shot, heavy-cannon, spud-missile, tater-net (tutorial system); tail-gunner, side-spitter, plasma-whip, hailstorm (tubernovae) | Removed weapon stops appearing as a mission drop |
| [src/game/state/ShipConfig.test.ts](src/game/state/ShipConfig.test.ts) | `"rapid-fire"` (asserts DEFAULT_SHIP starts with it) | Test fails |

## Save-format safety net (REMOVE-friendly behavior already wired)

`migrateShip` in [src/game/state/persistence.ts](src/game/state/persistence.ts) silently DROPS unknown weapon and augment ids on hydrate. So existing players' saves are SAFE — the removed weapon falls out of their inventory next time they load. Server-side schema is permissive (`LegacyShipSchema`) and lets the client cleanup happen. **No DB migration is needed for removals.** The danger is purely the hard-coded reference list above.

## REMOVE — augment-specific notes

Augment removal is simpler than weapon removal because there are NO hard-coded augment ids in `DEFAULT_SHIP`, `migrateShip`, `DropController`, or `ShipConfig.test.ts` today. The migrate-save layer drops unknown augment ids the same way it drops unknown weapon ids. **However, grep for the augment id anyway** — `lootPools.ts`, mission rewards, and tests CAN reference augment ids, and any future code addition might.

## Steps

1. **Grep for the literal id string** across the entire `src/` tree: `grep -rn '"<id-being-removed>"' src/`. The table above lists today's references; grep catches anything new since the last skill update. Also grep test fixtures (some tests construct sample saves with specific weapon ids — `*.test.ts` files).
2. For each reference, replace it with a sensible fallback (a different known id) or delete the line if the reference is truly optional.
3. Remove the entry from `weapons.json` (or `augments.ts`).
4. Remove the id from the `WeaponId` / `AugmentId` union literal in [src/types/game.ts](src/types/game.ts).
5. Remove the id from the `WEAPON_IDS` / `AUGMENT_IDS` array in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) — the `satisfies` clause will fail to compile if the union and the array drift.
6. (Optional, low-priority) Remove the unused `BootScene.ts` sprite generator + the texture key registration. Leaving them is harmless dead code; removing keeps the file tidy.
7. Run `npm run typecheck && npm run lint && npm test`. The data tests + ShipConfig tests are the canary; if they pass, the removal is clean.

# Invariants this skill enforces

## Across all operations
- `WEAPON_IDS` array in `save.ts` and `WeaponId` union in `types/game.ts` stay in lockstep (the `satisfies` clause is the compile-time guard).
- Same for `AUGMENT_IDS` / `AugmentId`.
- No `any` types introduced (CLAUDE.md §5).
- No new comments unless explaining a non-obvious why.
- `npm run typecheck && npm test` passes.

## CREATE-specific
- New id is kebab-case and unique across its catalog.
- Weapon: `cost >= 0`, `energyCost > 0`, `damage > 0`, `fireRateMs > 0`, `bulletSpeed > 0`.
- If the weapon defines a `bulletSprite`, the matching texture key is registered via a BootScene generator. (Otherwise the bullet renders blank at fire time.)
- Augment carries at least one multiplier field.

## REMOVE-specific
- Every hard-coded reference in the table above is updated or deleted.
- `DEFAULT_SHIP.slots[0].id` resolves to a known WeaponId after the change.
- `migrateShip`'s fallback weapon resolves to a known WeaponId.
- `ShipConfig.test.ts:29` is updated to whatever the new starter weapon is.

# Files this skill modifies / never touches

## Always modifies
- `src/game/data/weapons.json` (weapon CRUD)
- `src/game/data/augments.ts` (augment CRUD)
- `src/types/game.ts` (`WeaponId`, `AugmentId` unions)
- `src/lib/schemas/save.ts` (`WEAPON_IDS`, `AUGMENT_IDS` arrays)

## Modifies for visual work
- `src/game/phaser/scenes/BootScene.ts` (procedural sprite generators + `generateTextures`)
- `src/game/phaser/scenes/combat/CombatHud.ts` (HUD bars only — rare)

## Modifies for parameter changes (reactor/shield/armor)
- `src/game/state/ShipConfig.ts` (base values, per-level deltas, cost curves)

## Modifies for REMOVE cleanup (only when removing)
- `src/game/state/ShipConfig.ts` (`DEFAULT_SHIP`)
- `src/game/state/persistence.ts` (`migrateShip` fallback)
- `src/game/phaser/scenes/combat/DropController.ts` (`nextWeaponUpgrade`)
- `src/game/data/lootPools.ts` (per-system mission drops)
- `src/game/state/ShipConfig.test.ts` (locked invariants)

## Does NOT touch
- `src/game/state/shipMutators.ts` — mutators are id-agnostic and self-adjust to new ids.
- `src/components/loadout/*` — UI is generic across all WeaponId / AugmentId values.
- `src/game/state/sync.ts` / save server route / `db/migrations/` — schema layer reads catalogs at runtime; no DB migration needed for catalog adds or removes.
- `src/lib/saveValidation.ts` — credit caps derive from waves + loot pools, NOT from weapon/equipment prices, so balance changes here don't shift the cap.
- `src/game/audio/itemSfx.ts` — generic per-category cues; new weapons/augments fire the right cue automatically.
