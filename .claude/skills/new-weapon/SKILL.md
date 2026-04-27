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
- `energyCost` — int, reactor energy drained per FIRE event (not per bullet). Sustainable rate at base reactor (cap 100, 25/s recharge) is roughly `25 / (energyCost * shotsPerSec)`. Use existing weapons as anchors: rapid-fire 4, spread-shot 8, heavy-cannon 18, hailstorm 14.
- `tint` — `#RRGGBB` accent for HUD/pickup notifications.
- Optional `homing: true` + `turnRateRadPerSec` (default 3.5) for missile-style steering. Works in any slot — every weapon fires straight up the screen now, and the homing target picker steers toward the nearest enemy.
- Unlock condition — one of: `starter` (cost 0, in `DEFAULT_SHIP.unlockedWeapons`) | `shop` (cost > 0, auto-listed by `ShopUI`) | `mission-reward` (cost 0, NOT in defaults; flag this — drop wiring exists in `CombatScene.rollDrop` for the existing pickup pool, ask the user how the new weapon should be unlocked).

If any required field is missing, ask once before editing.

# Slot model (post slot-array refactor)
There is **no** `slot` field on weapons any more. The ship's `slots` is a variable-length `(WeaponId | null)[]`: index 0 is the main mount (always present), higher indices are expansion mounts the player buys at the shop. Every weapon fires forward — front / rear / sidekick kinds are gone. A weapon may be equipped in any slot of the array; bullets always travel up the screen, with each slot tracking its own cooldown.

# Steps
1. Add the weapon object to `src/game/data/weapons.json` under `weapons[]`. Required fields, in order: `id, name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost, tint, energyCost`. Append `homing: true, turnRateRadPerSec: <n>` only if the user asked for homing. Use `cost: 0` for starter/reward, `cost > 0` for shop. Do NOT add a `slot` field — it no longer exists on `WeaponDefinition`.
2. Extend the `WeaponId` union in `src/types/game.ts` (around line 8) by appending `| "<weaponId>"`. Do NOT change `WeaponDefinition` shape unless adding a brand-new optional field that doesn't exist on any current weapon.
3. If unlock is `starter`: append `weaponId` to `DEFAULT_SHIP.slots[0]` (replace the existing main-mount weapon, e.g. `slots: ["rapid-fire"]` → `slots: ["<weaponId>"]`) AND to `DEFAULT_SHIP.unlockedWeapons` in `src/game/state/ShipConfig.ts`. If you want both the existing starter and the new one available immediately, just add the id to `unlockedWeapons` and leave `slots` alone — the player can equip it from the loadout menu. Otherwise leave defaults alone — `ShopUI` (`src/components/ShopUI.tsx`) auto-renders every entry from `getAllWeapons()` filtered to un-owned, so a `cost > 0` entry needs no shop-list edit.
4. Wire a placeholder bullet sprite in `src/game/phaser/scenes/BootScene.ts` if the new weapon needs a distinct bullet visual. Most weapons reuse the shared bullet texture tinted by `tint`; only add a generator if the silhouette has to differ.
5. Update tests:
   - `src/game/state/ShipConfig.test.ts` — if you touched `DEFAULT_SHIP.slots` or `DEFAULT_SHIP.unlockedWeapons`, find the assertions about default ship state and update.
   - `src/game/data/data.test.ts` — covers all weapons via `it.each`; the per-weapon assertions check `damage > 0`, `fireRateMs > 0`, `energyCost > 0`, etc. New entry is validated automatically.
6. Run `npm run typecheck && npm test`. Failures here are usually a missing `energyCost`, a missed `WeaponId` union update, or a typo in the JSON.
7. Invoke the sibling `/balance-review` skill to compare DPS (`damage * projectileCount * 1000 / fireRateMs`), energy efficiency (`energyCost / DPS`), and TTK against existing enemies before committing.

# Invariants this skill enforces
- Weapon ids are unique and kebab-case.
- Every id in `weapons.json` has a matching literal in the `WeaponId` union — and vice versa.
- Every weapon has `energyCost > 0`.
- No weapon has a `slot` field — the field was removed in the slot-array refactor.
- `cost === 0` ⇔ weapon is either in `DEFAULT_SHIP.unlockedWeapons` or is a mission-reward (flagged for user).
- No game-balance numbers in `.ts` files — all stats live in `weapons.json` (CLAUDE.md §9).
- No `any`. No new server code paths.

# Files this skill modifies
- `src/game/data/weapons.json` (always)
- `src/types/game.ts` (always — `WeaponId` union)
- `src/game/state/ShipConfig.ts` (only if `starter` unlock changes the default loadout)
- `src/game/state/ShipConfig.test.ts` (only if `DEFAULT_SHIP.slots` or `unlockedWeapons` changed)
- `src/game/phaser/scenes/BootScene.ts` (only if a custom bullet placeholder is needed)

Files this skill does NOT modify (but reads): `src/game/data/weapons.ts`, `src/game/phaser/systems/WeaponSystem.ts`, `src/game/phaser/systems/weaponMath.ts`, `src/components/ShopUI.tsx`, `src/components/LoadoutMenu.tsx`.
