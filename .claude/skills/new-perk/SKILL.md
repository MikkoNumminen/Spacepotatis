---
name: new-perk
description: Scaffold a new mission-only perk — perks.ts entry, BootScene icon generator, HUD chip wiring, and (for actives) a switch case in PerkController.apply / triggerActive.
---

# When to use
The user says "/new-perk", "add a perk", or asks for a new mid-mission buff drop. Do NOT use for tweaking permanent ship upgrades (shield/credit/weapon) or for shop items — perks are mission-only and reset every CombatScene boot.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `perkId` — kebab-case, unique. Must NOT collide with existing ids in `src/game/data/perks.ts` (`overdrive`, `hardened`, `emp`).
2. `displayName` — shown on the chip and pickup popup (e.g. "Shield Burst").
3. `kind` — `"passive"` | `"active"`.
4. `tint` — accent hex (e.g. `0x66ffaa`); used for chip border, popup color, icon.
5. `dropWeight` — relative weight in the perk drop pool. NOTE: the current pool in `randomPerkId()` is **uniform** (no weights). State the desired weight, but the skill will simply add the perk to the pool unless the user also asks for a weighted-roll refactor (see TODO).
6. For passive: the stat modifier (e.g. "+25% damage", "-20% incoming damage") AND which entity reads it (`Player`, `WeaponSystem`, etc.).
7. For active: the keybind (default `CTRL` — already wired) and the effect description.
8. Icon hint — one of `"bolt" | "hex" | "pulse"` to reuse, or pick a new shape name (skill will add a new branch in `drawMissionPerk`).

# Steps
1. **`src/game/data/perks.ts`** — Extend the `PerkId` union to include the new id. Add an entry to `PERKS` with `id`, `name`, `type` (`"passive"` | `"active"`), `textureKey: "perk-<id>"`, `tint`, `hint` (short blurb shown on the pickup popup, e.g. `"CTRL: clear all enemy bullets"` for actives or `"+50% fire rate"` for passives). The exported `PERK_IDS` array is derived from `Object.keys(PERKS)`, so the new perk auto-joins the drop pool.
2. **`src/game/phaser/scenes/BootScene.ts`** — In `generateTextures()`, add `this.drawMissionPerk("perk-<id>", <tint>, "<icon>");`. If the icon name is new, extend the `icon` union parameter of `drawMissionPerk` and add a new `else if` branch with the procedural drawing. Keep the magenta star frame and "M" tab — they signal "mission only" to the player.
3. **`src/game/phaser/scenes/combat/PerkController.ts`** — In `apply()` (the switch on `perkId`), add a case that mutates per-mission perk state. For passives, set a flag/multiplier on the player via `this.player()` (e.g. `this.player().hasShieldBurst = true`). For actives, increment a charge counter on PerkController (mirror `this.empCharges += 1`). PerkController is the single owner of `activePerks` and per-perk charge counters; CombatScene only wires the keybind.
4. **For active perks only**: also extend `triggerActive()` in PerkController with a case that consumes a charge, runs the effect, and calls `this.onChange()` (which CombatScene wires to `hud.refreshPerkChips`). The `CTRL` keybind in CombatScene is already wired (`this.input.keyboard?.on("keydown-CTRL", () => this.perks.triggerActive())`). If multiple actives are added later, the current single-keybind dispatch (which only handles `emp`) needs to switch on the most-recently-acquired active perk — flag this refactor to the user.
5. **For passive perks only**: add the corresponding flag to the read-site. For Player-affecting passives, add `hasFoo = false;` near `hasOverdrive` / `hasHardened` in `src/game/phaser/entities/Player.ts` and consume it in `preUpdate` / `takeDamage`. For weapon-affecting passives, plumb a multiplier through `WeaponSystem.tryFire` like `fireRateMul` already does. Reset on scene boot is automatic — the Player is reconstructed each CombatScene start.
6. **HUD chip rendering** — No React component to touch. The HUD perk chips are rendered inside Phaser by `CombatHud.refreshPerkChips()` (top-right of the combat canvas) reading `PerkController.getState()`. It iterates `activePerks` and reads `PERKS[perkId]` for the icon/tint/name automatically — the new perk shows up with no extra wiring. For actives that show a charge counter, expose a getter on PerkController and mirror the existing `empCharges` plumbing in `CombatHud`.
7. Run `npm run typecheck && npm test` and fix any failures. Report back the perk id, files modified, and whether the perk is passive or active.

# Invariants this skill enforces
- Perks are **mission-only**. Do NOT add perk state to `src/game/state/GameState.ts` or `ShipConfig` — perk flags live on Phaser entities (`Player`) or scene-local fields (`empCharges`, `activePerks`) and reset every CombatScene boot.
- `PerkId` union in `perks.ts` includes the new id. No `any` introduced.
- `textureKey` follows `"perk-<id>"` and a matching `drawMissionPerk` call exists in `BootScene` so the texture is generated before CombatScene starts.
- Active perks have a case in BOTH `PerkController.apply()` (charge gain) and `PerkController.triggerActive()` (charge consume), plus the existing `keydown-CTRL` handler in CombatScene that calls `triggerActive()`.
- Passive perks have a flag/modifier read by the affected system on every relevant tick.
- Drop weights are relative and currently uniform — remind the author that adding a perk dilutes every existing perk's drop chance by `1/n`. If they want non-uniform weights, that requires extending `PerkDef` with `dropWeight: number` AND rewriting `randomPerkId()` to do a weighted roll (out of scope for this skill — flag and ask).
- `npm test` passes after the change.

# Files this skill modifies
Always:
- `src/game/data/perks.ts` — add `PerkId` literal + `PERKS` entry.
- `src/game/phaser/scenes/BootScene.ts` — add `drawMissionPerk` call (and possibly a new icon branch).
- `src/game/phaser/scenes/combat/PerkController.ts` — add a case in `apply()` (and `triggerActive()` for actives).

Conditionally:
- `src/game/phaser/entities/Player.ts` — new passive flag + read-site, when the modifier is player-scoped.
- `src/game/phaser/systems/WeaponSystem.ts` or `weaponMath.ts` — when the modifier is weapon-scoped.

Does NOT touch:
- `src/components/HUD.tsx` — currently a stub; perk chips are drawn inside Phaser by `CombatScene.refreshPerkChips()`.
- `src/game/state/GameState.ts` / `ShipConfig.ts` — perks are mission-only, never persisted.
- `src/game/phaser/entities/PowerUp.ts` — generic; reads `PERKS[id].textureKey` automatically once the perk and texture exist.
