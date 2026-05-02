---
name: new-enemy
description: Scaffold a new enemy — enemies.json entry, BootScene placeholder sprite generator, optional test wave, and integrity test verification.
---

# When to use
`/new-enemy` adds an enemy end-to-end. For retuning an existing enemy, edit `enemies.json` directly.

# Inputs
- `enemyId` — kebab-case, unique. Family-prefixed: `aphid-*`, `beetle-*`, `caterpillar-*`, `spider-*`, `dragonfly-*`, `pirate-*` (e.g. `dragonfly-bomber`, `pirate-galleon`).
- `displayName`, `hp` (>0), `speed` (>0 px/s), `scoreValue` (≥0), `creditValue` (≥0), `collisionDamage` (≥0).
- `behavior` ∈ {`straight`, `zigzag`, `homing`, `boss`}.
- `fireRateMs` — `> 0` or `null` (collision-only).
- `addTestWave` — default yes, appends to `tutorial-1`; ask if user wants another mission.

# Steps
1. Append entry to `src/game/data/enemies.json`. Required: `id, name, hp, speed, behavior, scoreValue, creditValue, spriteKey, fireRateMs, collisionDamage`. Sprite-key: `spriteKey = "enemy-<enemyId>"` for regulars. **Bosses use a themed family id with NO `boss-` prefix AND `spriteKey === id`** — e.g. `aphid-empress`, `caterpillar-monarch`. Pick a species-rank suffix (`-empress`, `-monarch`, `-tyrant`, `-warlord`).
2. Extend `EnemyId` union in `src/types/game.ts` with the new id literal.
3. If `behavior` is outside the allowed set, STOP — `Enemy.ts#preUpdate` silently skips unknowns. Adding behaviors is out of scope.
4. Add a placeholder sprite in `src/game/phaser/scenes/BootScene.ts#generateTextures` by calling one of the six existing helpers: `drawAphid`, `drawBeetle`, `drawCaterpillar`, `drawSpider`, `drawDragonfly`, `drawPirateShip`. Pick the helper matching the family prefix. See existing call sites for the `opts` shape (size, body/accent color, helper-specific extras like `crown` / `wings` / `marking` / `cannons` / `sail` / `skull`). **Each helper internally calls `setEnemyHitbox(key, w, h, ox, oy)` so the physics body matches the sprite — reusing one is free.** Do NOT add new asset files. If no helper fits, ask the user before adding one — and the new helper MUST call `setEnemyHitbox` at the end or `Enemy.ts` falls back to default sizing.
5. If `addTestWave`: append a `WaveSpawn` to the chosen mission in `src/game/data/waves.json`. Constraint: `delayMs + (count - 1) * intervalMs <= durationMs`. Safe `tutorial-1` default (`durationMs: 30000`): `{ "enemy": "<enemyId>", "count": 3, "delayMs": 16000, "intervalMs": 2400, "formation": "scatter", "xPercent": 0.5 }`.
6. `npm test` — `data.test.ts` catches unknown behavior, id collisions, non-positive numerics, empty `spriteKey`, missing wave refs.
7. `npm run typecheck` — confirms the `EnemyId` update.

# Invariants
- `behavior` ∈ {`straight`, `zigzag`, `homing`, `boss`}.
- `id` unique in `enemies.json`.
- Every JSON `spriteKey` is registered in `BootScene.generateTextures`.
- Every registered `spriteKey` has a matching `setEnemyHitbox` call (the five helpers handle this; only matters if a new helper is introduced).
- `fireRateMs` is `null` or `> 0`.
- Balance numbers stay in `enemies.json` (CLAUDE.md §9). No `any`.

# Files modified
- `src/game/data/enemies.json` — entry appended.
- `src/types/game.ts` — `EnemyId` extended.
- `src/game/phaser/scenes/BootScene.ts` — one draw call.
- `src/game/data/waves.json` — one spawn (only if `addTestWave`).
