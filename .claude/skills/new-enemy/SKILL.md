---
name: new-enemy
description: Scaffold a new enemy — enemies.json entry, BootScene placeholder sprite generator, optional test wave, and integrity test verification.
---

# When to use
Run `/new-enemy` to add a new enemy end-to-end. The skill writes JSON balance data, registers a placeholder texture, optionally appends a test wave, and verifies referential integrity via the existing data tests. Do NOT use it to retune existing enemies — edit `enemies.json` directly for that.

# Inputs the user must provide
- `enemyId` — kebab-case, must be unique in `enemies.json` (e.g. `scout`, `bomber`). Also added to `EnemyId` union in `src/types/game.ts`.
- `displayName` — human-readable `name`.
- `hp` (>0), `speed` (>0, px/s), `scoreValue` (>=0), `creditValue` (>=0), `collisionDamage` (>=0).
- `behavior` — must be one of: `straight`, `zigzag`, `homing`, `boss`. (See "Invariants".)
- `fireRateMs` — positive number, or `null` for non-shooters (kamikaze pattern).
- `addTestWave` — default yes. Appends one spawn line to the `tutorial-1` wave in `waves.json` for fast playtest. Ask which mission if the user prefers another.

# Steps
1. Add the entry to `src/game/phaser/data/enemies.json` under `enemies[]`. Required fields: `id, name, hp, speed, behavior, scoreValue, creditValue, spriteKey, fireRateMs, collisionDamage`. Sprite-key convention: `spriteKey = "enemy-<enemyId>"` for regular enemies; for bosses the `id` should itself start with `boss-` and `spriteKey` equals the id (e.g. id `boss-1` → spriteKey `boss-1`). Do NOT prefix `boss-` to an existing id.
2. Extend the `EnemyId` union in `src/types/game.ts` with the new id literal so `getEnemy` stays type-safe.
3. Behavior gate: if the requested `behavior` is not in `{straight, zigzag, homing, boss}`, STOP and tell the user — `Enemy.ts#preUpdate` switch will silently skip it at runtime. Adding a new behavior requires editing `src/game/phaser/entities/Enemy.ts`; that is out of scope for this skill.
4. Add a placeholder sprite for the new `spriteKey` in `src/game/phaser/scenes/BootScene.ts#generateTextures` by calling one of the existing helpers: `drawEnemyBasic`, `drawEnemyDiamond`, `drawTriangleDown`, or `drawBoss`. Pick the helper closest to the new behavior (e.g. `drawTriangleDown` for kamikaze-style, `drawBoss` for `behavior === "boss"`). Do NOT add new asset files.
5. If `addTestWave`: append one `WaveSpawn` to the chosen mission's wave in `src/game/phaser/data/waves.json`. Ensure `delayMs + (count - 1) * intervalMs <= durationMs` (the test enforces this). For `tutorial-1` (`durationMs: 30000`), a safe default is `{ "enemy": "<enemyId>", "count": 3, "delayMs": 16000, "intervalMs": 2400, "formation": "scatter", "xPercent": 0.5 }`.
6. Run `npm test` (vitest). The `enemies.json` and `waves.json referential integrity` suites in `src/game/phaser/data/data.test.ts` will fail loudly if `behavior` is unknown, ids collide, numeric fields are non-positive, `spriteKey` is empty, or any wave references a missing enemy.
7. Run `npm run typecheck` to confirm the `EnemyId` union update compiles.

# Invariants this skill enforces
- `behavior` ∈ {`straight`, `zigzag`, `homing`, `boss`} — anything else is rejected before any file is touched.
- `id` is unique across `enemies.json`.
- Every `spriteKey` referenced in JSON is registered in `BootScene.generateTextures`; otherwise Phaser renders a missing-texture placeholder at runtime.
- `fireRateMs` is either `null` or `> 0`.
- No game-balance numbers are added to `.ts` files — all stats live in `enemies.json` (per CLAUDE.md §9).
- No `any` types introduced. The `EnemyId` literal union update is the only TS edit.

# Files this skill modifies
- `src/game/phaser/data/enemies.json` — new entry appended.
- `src/types/game.ts` — `EnemyId` union extended.
- `src/game/phaser/scenes/BootScene.ts` — one new draw call inside `generateTextures`.
- `src/game/phaser/data/waves.json` — one new spawn appended (only if `addTestWave`).
