---
name: new-perk
description: Scaffold a new mission-only perk — perks.ts entry, BootScene icon generator, HUD chip wiring, and (for actives) a switch case in PerkController.apply / triggerActive.
---

# When to use
User says "/new-perk", "add a perk", or asks for a new mid-mission buff drop. NOT for permanent ship upgrades or shop items — perks are mission-only and reset every CombatScene boot.

# Inputs (ask once, all at once)
1. `perkId` — kebab-case, unique. Must not collide with existing ids in `src/game/data/perks.ts` (`overdrive`, `hardened`, `emp`).
2. `displayName` — chip + pickup popup label.
3. `kind` — `"passive"` | `"active"`.
4. `tint` — accent hex (e.g. `0x66ffaa`).
5. `dropWeight` — current pool in `randomPerkId()` is **uniform**; weight is recorded but ignored unless user also requests a weighted-roll refactor.
6. Passive only: stat modifier + which entity reads it (`Player`, `WeaponSystem`, etc.).
7. Active only: keybind (default `CTRL`, already wired) + effect description.
8. Icon — reuse `"bolt" | "hex" | "pulse"` or name a new shape (adds branch in `drawMissionPerk`).

# Steps
1. **`src/game/data/perks.ts`** — Extend `PerkId` union. Add entry to `PERKS` with `id`, `name`, `type`, `textureKey: "perk-<id>"`, `tint`, `hint`. `PERK_IDS` derives from `Object.keys(PERKS)` — auto-joins drop pool.
2. **`src/game/phaser/scenes/BootScene.ts`** — Add `this.drawMissionPerk("perk-<id>", <tint>, "<icon>");` in `generateTextures()`. New icon name → extend the `icon` union and add an `else if` branch. Keep magenta star frame + "M" tab.
3. **`src/game/phaser/scenes/combat/PerkController.ts`** — Add case in `apply()` switch. Passives: set flag/multiplier via `this.player()`. Actives: increment a charge counter (mirror `this.empCharges += 1`). PerkController owns `activePerks` and charge counters; CombatScene only wires the keybind.
4. **Active perks only** — Extend `triggerActive()` with a case that consumes a charge, runs the effect, calls `this.onChange()` (CombatScene wires this to `hud.refreshPerkChips`). The `keydown-CTRL` handler is already wired. Multiple actives later → single-keybind dispatch needs to switch on most-recent active perk; flag this. **CRITICAL — adding a NEW active perk with charges requires:**
   - Extending the `PerkState` interface in `src/game/phaser/scenes/combat/PerkController.ts:7` (today only `empCharges` is exposed).
   - Adding a branch to the `perkId === "emp"` ternary in `CombatHud.refreshPerkChips()` (around line 127: ``CTRL × ${perkId === "emp" ? s.empCharges : 1}``).
   Without both edits the chip silently renders "CTRL × 1" forever.
5. **Passive perks only** — Add the read-site flag. Player-scoped: add `hasFoo = false;` near `hasOverdrive` / `hasHardened` in `src/game/phaser/entities/Player.ts`, consume in `preUpdate` / `takeDamage`. Weapon-scoped: plumb a multiplier through `WeaponSystem.tryFire` like `fireRateMul`. Reset on boot is automatic — Player is reconstructed each CombatScene start.
6. **HUD chip** — No React work. `CombatHud.refreshPerkChips()` (NOT `CombatScene.refreshPerkChips()`) iterates `activePerks` and reads `PERKS[perkId]` automatically. Actives with a charge counter must expose a getter on PerkController and mirror the `empCharges` plumbing in `CombatHud`.
7. Run `npm run typecheck && npm test`. Report perk id, files modified, kind.

# Invariants
- Perks are **mission-only**. Do NOT add perk state to `src/game/state/GameState.ts` or `ShipConfig` — flags live on Phaser entities or scene-local fields and reset every CombatScene boot.
- `PerkId` union includes the new id. No `any`.
- `textureKey` follows `"perk-<id>"` and a matching `drawMissionPerk` call exists in `BootScene`.
- Active perks: case in BOTH `PerkController.apply()` AND `triggerActive()`, plus existing `keydown-CTRL` handler. Charge-counter actives also extend `PerkState` (PerkController.ts:7) AND the `perkId === "emp"` ternary in `CombatHud.refreshPerkChips()`.
- Passive perks: flag/modifier read by the affected system every relevant tick.
- Drop weights uniform — adding a perk dilutes every existing perk's chance by `1/n`. Non-uniform weights require extending `PerkDef` with `dropWeight: number` AND rewriting `randomPerkId()` to do a weighted roll (out of scope; flag and ask).
- `npm test` passes.

# Files modified
Always:
- `src/game/data/perks.ts`
- `src/game/phaser/scenes/BootScene.ts`
- `src/game/phaser/scenes/combat/PerkController.ts`

Conditionally:
- `src/game/phaser/entities/Player.ts` — player-scoped passive flag.
- `src/game/phaser/systems/WeaponSystem.ts` or `weaponMath.ts` — weapon-scoped modifier.

Never:
- `src/components/HUD.tsx` — stub; perk chips are Phaser-side via `CombatHud.refreshPerkChips()`.
- `src/game/state/GameState.ts` / `ShipConfig.ts` — perks are mission-only.
- `src/game/phaser/entities/PowerUp.ts` — generic; reads `PERKS[id].textureKey` automatically.
