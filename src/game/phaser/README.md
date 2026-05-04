# phaser

## Purpose

The Phaser combat layer — top-down vertical-scrolling shooter scenes, entities, and systems. Owns the Boot/Combat/Pause scene lifecycle, every Player/Enemy/Bullet/PowerUp game object, the wave spawner, the weapon system, the typed event bus, and the typed registry. Loaded **only client-side** via `next/dynamic({ ssr: false })`.

The combat view is the second pillar of the game (CLAUDE.md §1). All combat logic lives here; everything 3D lives in `three`.

## Public API

The module's contract is intentionally narrow — **almost everything** in the directory is INTERNAL. The outside world consumes only:

- **`createPhaserGame(parent, opts)`** in [config.ts](./config.ts) — the entry point. The `usePhaserGame` React hook constructs a game per mission and tears it down on unmount. `opts` carries the `missionId` + an `onComplete(summary)` callback.
- **`SCENE_KEYS`** in [config.ts](./config.ts) — typed constant. Use this anywhere you need to reference a scene by key.
- **`BootData`, `CombatSummary`** types in [config.ts](./config.ts) — the data shape passed into the boot scene + the result shape produced by `CombatScene.finish()`.
- **The typed event bus** in [events.ts](./events.ts) — `emit(scene, event)`, `on(scene, handler)`, the `PhaserEvent` discriminated union. Cross-scene communication MUST go through these wrappers.
- **The typed registry** in [registry.ts](./registry.ts) — `registry.set(game, key, value)`, `registry.get(game, key)`, `setBootData`, `getSummary`, the typed registry keys. Shared scene-graph state MUST go through these wrappers.

> **Hard invariant** (ADR 0006 + CLAUDE.md §5 + §9): NEVER call `scene.events.emit("string-name")` or `game.registry.set("string-key", ...)` directly. The audit confirmed ZERO violations across the entire zone — that's the bar to maintain. Adding a `// @ts-expect-error` to defeat the typed wrapper is a security-equivalent footgun for the gameplay layer.

## Internal

Every other file in this folder is INTERNAL — scenes, entities, systems, helpers, the test harness. They may be reorganized, renamed, or split without notice. The contract above (`createPhaserGame`, `SCENE_KEYS`, `BootData`, `CombatSummary`, the typed bus, the typed registry) is the only stable surface.

Notable internals you'll touch when working in the module:

- **Scenes** (`scenes/`):
  - `BootScene.ts` — **1819-LOC documented placeholder**. Procedurally generates every weapon-bullet, pod, enemy sprite, perk icon, and powerup sprite at boot via Phaser Graphics. Each generator is its own helper method; the file is large because the game ships with no PNG assets yet. Splitting it preemptively creates churn — defer until real art lands.
  - **Note**: `BossScene.ts` is scheduled for deletion in a separate hot-fix PR (#142) — the MVP delegates boss encounters to `CombatScene`; the dead scene file misled scene-routing readers. Once #142 lands, the `Boss: "BossScene"` entry leaves `SCENE_KEYS` and the file disappears.
  - `CombatScene.ts` — the orchestrator. Wires the wave spawner, player, enemies, bullets, powerups, HUD, perk controller, drop controller, and VFX layer. Owns the mission lifecycle (`finish()` posts the summary into the registry).
  - `PauseScene.ts` — pause overlay (P/ESC).
- **Entities** (`entities/`): `Player.ts`, `Enemy.ts`, `Bullet.ts`, `PowerUp.ts`. Each extends a Phaser `GameObject`. Player composes helpers from `entities/player/` (SlotModResolver, PlayerCombatant, PlayerFireController, PodController, slotLayout).
- **Systems** (`systems/`): `WeaponSystem.ts`, `weaponMath.ts`, `Controls.ts`, `wave/*` (formation generators), `MotionTilt.ts`. Stateless helpers or per-scene managers; no global singletons.
- **Combat scene helpers** (`scenes/combat/`): `CombatHud.ts`, `CombatVfx.ts`, `DropController.ts`, `PerkController.ts`. Each is a single-responsibility helper instantiated by `CombatScene` and held for the scene lifetime.
- **Test harness** (`__tests__/`): `fakeScene.ts` is the canonical fake-scene + time-queue for unit-testing systems and entities without a real Phaser runtime.

## Dependencies

| Dependency | Used by | Why |
|---|---|---|
| `phaser` | every scene + entity | The 2D game engine. |
| `@/game/data/*` | most files | Catalog reads (weapons, enemies, missions, augments, etc.). One-way `phaser` → `content`. |
| `@/game/state/*` | `CombatScene`, `DropController`, `PlayerCombatant`, `PerkController` | State mutators (credits, mission completion, weapon grants, mission rewards). One-way `phaser` → `state`. |
| `@/game/audio/*` | `PlayerCombatant`, `CombatScene`, `PerkController`, `DropController`, `CombatVfx` | Sfx triggers (laser, hit, explosion, pickup) + itemSfx for drops. One-way `phaser` → `audio`. |
| `@/types/game` | many | Shared types. |

NEVER `three` (cross-domain — CLAUDE.md §5), NEVER `ui` / `app` / `infra` directly.

## Invariants

The Phaser module's invariants are some of the strongest in the codebase:

- **NO STRING-KEYED EVENTS OR REGISTRY ACCESS.** All cross-scene communication MUST go through `events.ts` / `registry.ts`. CLAUDE.md §5 + §9 + ADR 0006. Audit confirmed zero violations.
- **NO HARD-CODED GAME BALANCE NUMBERS.** Every damage value, HP, fire rate, spawn count comes from `src/game/data/*.json` via accessors. CLAUDE.md §5. The accessors do exactly one `as` cast at module load (no runtime Zod) — soundness is enforced by `jsonSchemaValidation.test.ts`. **Don't re-add `Schema.parse(jsonData)` at module load** — that's exactly what cost ~98 kB of first-load JS before this pattern landed.
- **One scene per file. One entity per file.** Players + entities extend Phaser `GameObjects`. Systems are stateless helpers or per-scene manager instances; no global singletons.
- **CombatScene's PerkController ↔ DropController construction-order dance** is solved with lazy `() => x` accessors. Don't refactor that to direct refs without understanding why — the two helpers each need a back-reference to the other, and the lazy accessor is what breaks the cycle at construction time.
- **`__tests__/fakeScene.ts` is the canonical test harness.** Don't try to instantiate real `Phaser.Scene` in tests; the headless DOM doesn't have WebGL.

## Common pitfalls

- **Re-introducing string-keyed events.** The typed wrapper rejects them at compile time, but a `// @ts-expect-error` would defeat that. Never do that.
- **Hard-coding a damage value or HP** "for now" in a scene. It always becomes "forever". Add the value to the JSON catalog and read through the accessor.
- **Forgetting that `BootScene.ts` is a placeholder.** Every `draw*Bullet` helper exists pending real PNGs. Don't split BootScene preemptively — the audit explicitly defers that to post-real-art work.
- **Mutating game.registry directly** (`game.registry.set("...", ...)`). Use `registry.set(game, key, value)` from `registry.ts`. The typed wrapper guarantees the key + value type pair.
- **Wiring scene-to-scene communication via `scene.scene.get(key)` plus direct property reads.** Use `emit`/`on` from `events.ts`. The bus decouples scenes and is the only way to keep the typed event union honest.
- **Re-implementing `CombatHud` or `CombatVfx` inside CombatScene.** Each helper is single-responsibility and tested separately; merging them back into the scene re-creates the god-file.
- **Forgetting to clean up tweens/timers/groups on scene shutdown.** Phaser's `shutdown` hook is the right place; the existing scenes use it.

## How to test changes

```bash
# Whole module
npm test src/game/phaser

# Specific files (the most-exercised ones)
npm test src/game/phaser/__tests__/fakeScene.test.ts
npm test src/game/phaser/systems/WeaponSystem.test.ts
npm test src/game/phaser/systems/weaponMath.test.ts
npm test src/game/phaser/entities/Bullet.test.ts
npm test src/game/phaser/entities/Enemy.test.ts
npm test src/game/phaser/entities/player

# Type-only
npm run typecheck

# Manual smoke
npm run dev
# Then: launch any combat mission, confirm:
#  - Bullets fire + collide
#  - Wave spawning + boss phase transitions
#  - Drops spawn + apply on pickup
#  - Pause/resume + abandon (ESC) flows
#  - HUD updates (score, credits, shield/armor/reactor bars, perk chips)
#  - VFX particles fire on hits + explosions
```

## See also

- ADR 0005 — content as JSON (catalog + drift gate). The reason `phaser` reads everything through accessors.
- ADR 0006 — typed Phaser event bus + registry (the strongest invariant in this module).
- ADR 0007 — the modular-architecture audit.
- CLAUDE.md §5, §9 — the load-bearing rules behind every invariant in this README.
- `src/game/data/README.md` — the catalog this module reads from.
- `src/game/state/README.md` — the state surface this module mutates.
- `src/game/audio/README.md` — the audio engines this module fires.
