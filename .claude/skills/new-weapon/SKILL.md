---
name: new-weapon
description: Scaffold a new weapon — weapons.json entry, WeaponId union extension, optional shop unlock cost, default-equip wiring, and balance comparison vs existing weapons.
---

# When to use
User runs `/new-weapon` to add a primary weapon end-to-end. Do NOT use for: enemy bullet patterns, power-ups, or special-firing modes (homing/beam/charged) — those need WeaponSystem changes that this skill explicitly flags.

# Inputs the user must provide
- `weaponId` — kebab-case (matches existing `rapid-fire`, `spread-shot`, `heavy-cannon`).
- `displayName` — human-readable, e.g. "Plasma Lance".
- `description` — one-line shop blurb.
- Stats: `damage` (int), `fireRateMs` (int ms), `bulletSpeed` (px/s), `projectileCount` (int), `spreadDegrees` (number).
- `tint` — `#RRGGBB` accent for HUD/pickup notifications.
- Unlock condition — one of: `starter` (cost 0, in `DEFAULT_SHIP.unlockedWeapons`) | `shop` (cost > 0, auto-listed by `ShopUI`) | `mission-reward` (cost 0, NOT in defaults; flag this — no reward plumbing exists yet, ask user).

If any field is missing, ask once before editing.

# Steps
1. Add the weapon object to `src/game/phaser/data/weapons.json` under `weapons[]`. Required fields, in order: `id, name, description, damage, fireRateMs, bulletSpeed, projectileCount, spreadDegrees, cost, tint`. Use `cost: 0` for starter/reward, `cost > 0` for shop.
2. Extend the `WeaponId` union in `src/types/game.ts` (line 8) by appending `| "<weaponId>"`. Do NOT change `WeaponDefinition` shape unless the user asked for a new field.
3. If unlock is `starter`: append `weaponId` to `DEFAULT_SHIP.unlockedWeapons` in `src/game/state/ShipConfig.ts`. Otherwise leave defaults alone — `ShopUI` (`src/components/ShopUI.tsx`) auto-renders every entry from `getAllWeapons()`, so a `cost > 0` entry needs no shop-list edit.
4. Update tests:
   - `src/game/state/ShipConfig.test.ts` — if you touched `DEFAULT_SHIP.unlockedWeapons`, fix the `expect([...])` assertion on line ~17 and the `isWeaponUnlocked` rejection list.
   - `src/game/phaser/data/data.test.ts` — covers all weapons via `it.each`; new entry is validated automatically. No edit needed unless the test asserts a fixed count.
5. Special-case audit — if the weapon needs any of: homing, piercing, beam (continuous), charge-up, area-of-effect, or per-shot energy cost, STOP and tell the user: "WeaponSystem (`src/game/phaser/systems/WeaponSystem.ts`) only supports straight-line bullets via `spreadVectors`. Adding <feature> requires extending WeaponSystem + Bullet + weaponMath. Proceed?"
6. Run `npm run typecheck && npm test` — the `data.test.ts` suite enforces unique ids and sane numerics; failures here are usually a typo in the JSON or a missed `WeaponId` union update.
7. Invoke the sibling `/balance-review` skill to compare DPS (`damage * 1000 / fireRateMs * projectileCount`) and TTK against existing enemies before committing.

# Invariants this skill enforces
- Weapon ids are unique and kebab-case.
- Every id in `weapons.json` has a matching literal in the `WeaponId` union — and vice versa.
- `cost === 0` ⇔ weapon is either in `DEFAULT_SHIP.unlockedWeapons` or is a mission-reward (flagged for user).
- No game-balance numbers in `.ts` files — all stats live in `weapons.json` (CLAUDE.md §9).
- No `any`. No new server code paths.

# Files this skill modifies
- `src/game/phaser/data/weapons.json` (always)
- `src/types/game.ts` (always — `WeaponId` union)
- `src/game/state/ShipConfig.ts` (only if `starter` unlock)
- `src/game/state/ShipConfig.test.ts` (only if `DEFAULT_SHIP.unlockedWeapons` changed)

Files this skill does NOT modify (but reads): `src/game/phaser/data/weapons.ts`, `src/game/phaser/systems/WeaponSystem.ts`, `src/game/phaser/systems/weaponMath.ts`, `src/components/ShopUI.tsx`.

# TODO — future direction (do NOT implement now)
- **Slot-based loadouts (Tyrian-style: front, rear, sidekickL, sidekickR, generator, shield).** When this lands, add a `slot` field to `WeaponDefinition` and update step 1 to require it.
- **Reactor energy.** When this lands, add an `energyCost` field per weapon and have `/balance-review` factor it into the DPS-per-energy comparison.
