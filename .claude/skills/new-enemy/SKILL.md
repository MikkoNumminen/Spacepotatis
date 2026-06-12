---
name: new-enemy
description: Scaffold a new enemy — enemies.json entry, BootScene placeholder sprite generator, optional test wave, and integrity test verification.
---

# When to use
`/new-enemy` adds an enemy end-to-end. For retuning an existing enemy, edit `enemies.json` directly.

# Inputs
- `enemyId` — kebab-case, unique. Family-prefixed: `aphid-*`, `beetle-*`, `caterpillar-*`, `spider-*`, `dragonfly-*`, `pirate-*` (e.g. `dragonfly-bomber`, `pirate-schooner`).
- `displayName`, `hp` (>0), `speed` (>0 px/s), `scoreValue` (≥0), `creditValue` (≥0), `collisionDamage` (≥0).
- `behavior` ∈ {`straight`, `zigzag`, `homing`, `boss`}.
- `fireRateMs` — `> 0` or `null` (collision-only).
- `addTestWave` — default yes, appends to `tutorial-1`; ask if user wants another mission.

# Steps
1. Append entry to `src/game/data/enemies.json`. Required: `id, name, hp, speed, behavior, scoreValue, creditValue, spriteKey, fireRateMs, collisionDamage`. Sprite-key: `spriteKey = "enemy-<enemyId>"` for ALL enemies, bosses included. **Bosses use a themed family id with NO `boss-` prefix** plus a species-rank suffix — existing bosses: `aphid-empress`, `caterpillar-monarch`, `pirate-dreadnought`.
2. Extend `EnemyId` union in `src/types/game.ts` AND its lockstep runtime list `ENEMY_IDS` in `src/lib/schemas/enemies.ts` (feeds `z.enum` — forgetting it fails `jsonSchemaValidation.test.ts` and the wave schema; typecheck alone won't catch it).
3. If `behavior` is outside the allowed set, STOP — `Enemy.ts#preUpdate` silently skips unknowns. Adding behaviors is out of scope.
4. Add a placeholder sprite in `src/game/phaser/scenes/BootScene.ts#generateTextures` by calling one of the six existing helpers: `drawAphid`, `drawBeetle`, `drawCaterpillar`, `drawSpider`, `drawDragonfly`, `drawPirateShip`. Pick the helper matching the family prefix. See existing call sites for the `opts` shape (size, body/accent color, helper-specific extras like `crown` / `wings` / `marking` / `cannons` / `sail` / `skull`). **Each helper internally calls `setEnemyHitbox(key, w, h, ox, oy)` so the physics body matches the sprite — reusing one is free.** Do NOT add new asset files. If no helper fits, ask the user before adding one — and the new helper MUST call `setEnemyHitbox` at the end or `Enemy.ts` falls back to default sizing.
5. If `addTestWave`: append a `WaveSpawn` to the chosen wave in `src/game/data/waves.json` (`tutorial-1` is the first wave of mission `tutorial`). Constraint: `delayMs + (count - 1) * intervalMs <= durationMs`. Safe `tutorial-1` default (`durationMs: 30000`): `{ "enemy": "<enemyId>", "count": 3, "delayMs": 16000, "intervalMs": 2400, "formation": "scatter", "xPercent": 0.5 }`.
6. `npm test` — `data.test.ts` catches unknown behavior, id collisions, non-positive numerics, empty `spriteKey`, missing wave refs.
7. `npm run typecheck` — confirms the `EnemyId` update.

# Invariants
- NOT test-enforced — check by hand: every JSON `spriteKey` is registered in `BootScene.generateTextures` with a matching `setEnemyHitbox` call (the six helpers do this automatically; only matters for a new helper).
- The rest (behavior set, unique ids, positive numerics, `fireRateMs` null-or-positive) is test-enforced by step 6. Balance stays in JSON (CLAUDE.md §9).

# Files modified
- `src/game/data/enemies.json` — entry appended.
- `src/types/game.ts` — `EnemyId` extended.
- `src/lib/schemas/enemies.ts` — `ENEMY_IDS` extended in lockstep.
- `src/game/phaser/scenes/BootScene.ts` — one draw call.
- `src/game/data/waves.json` — one spawn (only if `addTestWave`).

## Freshness check

Paths resolve from the repo root.

```toml
[[check]]
kind = "path_exists"
path = "src/game/data/enemies.json"
root = "scope_root"

[[check]]
kind = "path_exists"
path = "src/game/data/waves.json"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/types/game.ts"
pattern = "export type EnemyId\\s*="
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/types/game.ts"
pattern = "EnemyBehavior\\s*=\\s*\"straight\"\\s*\\|\\s*\"zigzag\"\\s*\\|\\s*\"homing\"\\s*\\|\\s*\"boss\""
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/phaser/scenes/BootScene.ts"
pattern = "private setEnemyHitbox"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/phaser/scenes/BootScene.ts"
pattern = "private generateTextures"
root = "scope_root"
```
