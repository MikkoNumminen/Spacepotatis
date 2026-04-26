# Game data

All game balance data lives here as JSON, deliberately separated from code.

Editing these files changes damage numbers, wave patterns, enemy HP, mission difficulty, and planet layout without touching any TypeScript.

| File                                   | Shape (see [src/types/game.ts](../../types/game.ts)) |
| -------------------------------------- | ----------------------------------------------------- |
| [weapons.json](weapons.json)           | `{ weapons: WeaponDefinition[] }`                     |
| [enemies.json](enemies.json)           | `{ enemies: EnemyDefinition[] }`                      |
| [waves.json](waves.json)               | `{ missions: MissionWaves[] }`                        |
| [missions.json](missions.json)         | `{ missions: MissionDefinition[] }`                   |

## Conventions

- `id` fields are kebab-case and stable — save games and leaderboards reference them. Never rename an `id` without a migration plan.
- Time values are milliseconds (`fireRateMs`, `delayMs`, `intervalMs`, `durationMs`).
- Speeds are pixels/second (Phaser) or radians/second (Three.js orbit).
- `xPercent` is 0..1 across the viewport width.
- Money is in `credits` — one in-game unit.

## Cross-file references

- [missions.json](missions.json) `id` ↔ [waves.json](waves.json) `missionId`
- [waves.json](waves.json) `spawns[].enemy` ↔ [enemies.json](enemies.json) `id`
- [missions.json](missions.json) `texture` ↔ file under `public/textures/planets/`
- [missions.json](missions.json) `musicTrack` ↔ file under `public/audio/music/`

Breaking any of these links will cause a runtime load failure. Keep them in sync.
