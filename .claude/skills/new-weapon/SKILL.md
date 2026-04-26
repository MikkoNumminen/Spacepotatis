---
name: new-weapon
description: Scaffold a new weapon — weapons.json entry, WeaponId union extension, optional shop unlock cost, default-equip wiring, and balance comparison vs existing weapons.
---

# When to use
User runs `/new-weapon` to add a ship weapon end-to-end. Do NOT use for: enemy bullet patterns or power-ups (use `/new-enemy` or `/new-perk` for those).

# Inputs the user must provide
- `weaponId` — kebab-case (matches existing `rapid-fire`, `spread-shot`, `heavy-cannon`, `spud-missile`, `tater-net`, `tail-gunner`, `side-spitter`, `plasma-whip`, `hailstorm`).
- `displayName` — human-readable, e.g. "Plasma Triad".
- `description` — one-line shop blurb.
- Stats: `damage` (int), `fireRateMs` (int ms), `bulletSpeed` (px/s), `projectileCount` (int), `spreadDegrees` (number).
- `slot` — `"front"` | `"rear"` | `"sidekick"` — which hardpoint kind this weapon mounts to. Front fires up, rear fires down, sidekick rotates ±45° outward (one mount per pod when actually equipped).
- `energyCost` — int, reactor energy drained per FIRE event (not per bullet). Sustainable rate at base reactor (cap 100, 25/s recharge) is roughly `25 / (energyCost * shotsPerSec)`. Use existing weapons as anchors: rapid-fire 4, spread-shot 8, heavy-cannon 18, hailstorm 14.
- `tint` — `#RRGGBB` accent for HUD/pickup notifications.
- Optional `homing: true` + `turnRateRadPerSec` (default 3.5) for missile-style steering. Only the front slot currently has a sensible target picker, but the field works on any slot.
- Unlock condition — one of: `starter` (cost 0, in `DEFAULT_SHIP.unlockedWeapons`) | `shop` (cost > 0, auto-listed by `ShopUI`) | `mission-reward` (cost 0, NOT in defaults; flag this — drop wiring exists in `CombatScene.rollDrop` for the existing pickup pool, ask the user how the new weapon should be unlocked).

If any required field is missing, ask once before editing.

# Steps
1. Add the weapon object to `src/game/phaser/data/weapons.json` under `weapons[]`. Required fields, in order: `id, name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost, tint, slot, energyCost`. Append `homing: true, turnRateRadPerSec: <n>` only if the user asked for homing. Use `cost: 0` for starter/reward, `cost > 0` for shop.
2. Extend the `WeaponId` union in `src/types/game.ts` (around line 8) by appending `| "<weaponId>"`. Do NOT change `WeaponDefinition` shape unless adding a brand-new optional field that doesn't exist on any current weapon.
3. If unlock is `starter`: append `weaponId` to `DEFAULT_SHIP.slots.front` (or another slot kind that matches the weapon's `slot`) AND to `DEFAULT_SHIP.unlockedWeapons` in `src/game/state/ShipConfig.ts`. Otherwise leave defaults alone — `ShopUI` (`src/components/ShopUI.tsx`) auto-renders every entry from `getAllWeapons()` filtered to un-owned, so a `cost > 0` entry needs no shop-list edit.
4. Update tests:
   - `src/game/state/ShipConfig.test.ts` — if you touched `DEFAULT_SHIP.slots` or `DEFAULT_SHIP.unlockedWeapons`, find the assertions about default ship state and update.
   - `src/game/phaser/data/data.test.ts` — covers all weapons via `it.each`; the per-weapon assertions check `slot ∈ {front, rear, sidekick}` and `energyCost > 0`. New entry is validated automatically.
5. Run `npm run typecheck && npm test`. Failures here are usually a missing `slot`/`energyCost`, a missed `WeaponId` union update, or a typo in the JSON.
6. Invoke the sibling `/balance-review` skill to compare DPS (`damage * projectileCount * 1000 / fireRateMs`), energy efficiency (`energyCost / DPS`), and TTK against existing enemies before committing.

# Invariants this skill enforces
- Weapon ids are unique and kebab-case.
- Every id in `weapons.json` has a matching literal in the `WeaponId` union — and vice versa.
- Every weapon has a `slot ∈ {front, rear, sidekick}` and `energyCost > 0`.
- `cost === 0` ⇔ weapon is either in `DEFAULT_SHIP.unlockedWeapons` or is a mission-reward (flagged for user).
- No game-balance numbers in `.ts` files — all stats live in `weapons.json` (CLAUDE.md §9).
- No `any`. No new server code paths.

# Files this skill modifies
- `src/game/phaser/data/weapons.json` (always)
- `src/types/game.ts` (always — `WeaponId` union)
- `src/game/state/ShipConfig.ts` (only if `starter` unlock changes the default loadout)
- `src/game/state/ShipConfig.test.ts` (only if `DEFAULT_SHIP.slots` or `unlockedWeapons` changed)

Files this skill does NOT modify (but reads): `src/game/phaser/data/weapons.ts`, `src/game/phaser/systems/WeaponSystem.ts`, `src/game/phaser/systems/weaponMath.ts`, `src/components/ShopUI.tsx`, `src/components/LoadoutMenu.tsx`.
