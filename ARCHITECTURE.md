# ARCHITECTURE.md — Spacepotatis

High-level architecture, data flow, scene lifecycle, and API inventory. Keep this current as the implementation evolves.

## 1. High-level map

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (client-only)                       │
│                                                                   │
│   ┌──────────────────┐  GSAP   ┌──────────────────┐              │
│   │  Three.js        │◄───────►│   Phaser 3       │              │
│   │  GalaxyScene     │ transit │   CombatScene    │              │
│   │  (overworld)     │         │   (shooter)      │              │
│   └──────────────────┘         └──────────────────┘              │
│            ▲                            ▲                         │
│            │        GameState           │                         │
│            └──────────── + ─────────────┘                         │
│                     ShipConfig                                    │
│                         ▲                                         │
│                         │  credits, ship, progress                │
│   ┌─────────────────────┴────────────────────────────┐            │
│   │        React shell (Next.js App Router)          │            │
│   │   HUD · PauseMenu · ShopUI · MissionSelect       │            │
│   │   Leaderboard                                    │            │
│   └──────────────┬──────────────────────┬────────────┘            │
└──────────────────┼──────────────────────┼─────────────────────────┘
                   │ fetch                │ fetch
                   ▼                      ▼
          ┌────────────────┐     ┌────────────────┐
          │  /api/save     │     │ /api/leader-   │
          │  /api/auth/*   │     │   board        │
          │  (Edge/Node)   │     │  (Edge, ISR)   │
          └──────┬─────────┘     └────────┬───────┘
                 │                        │
                 └───────── Kysely ───────┘
                            │
                            ▼
                 ┌──────────────────┐
                 │ Neon Postgres    │
                 │ (players,        │
                 │  save_games,     │
                 │  leaderboard)    │
                 └──────────────────┘
```

## 2. The core loop

```
Landing page (/)
      │
      ▼
Play (/play) — mounts GameCanvas
      │
      ▼  (first mount)
┌── Three.js GalaxyScene ──┐
│  Render planets, orbits  │
│  Player selects planet   │
└─────────────┬────────────┘
              │ GSAP zoom into planet
              ▼
TransitionManager.toCombat(missionId)
  → unmount Three.js
  → mount Phaser
              │
              ▼
┌── Phaser BootScene ──┐
│  Preload sprites/sfx │
│  for this mission    │
└──────────┬───────────┘
           ▼
┌── Phaser CombatScene ──┐
│  Waves → boss → result │
└──────────┬─────────────┘
           ▼
┌── Phaser ResultScene ──┐
│  Score tally, credits  │
└──────────┬─────────────┘
           │ POST /api/save (autosave)
           │ POST /api/leaderboard (if top)
           ▼
TransitionManager.toGalaxy()
  → unmount Phaser
  → remount Three.js
           │
           ▼
       Shop? → /shop
       Next planet? → loop
```

## 3. State management

**No Redux. No Zustand. No Context gymnastics.** A single module-level object called `GameState` holds the in-memory truth during a session.

- [src/game/state/GameState.ts](src/game/state/GameState.ts) — `credits`, `currentPlanet`, `completedMissions`, `unlockedPlanets`, `playedTimeSeconds`, last-saved snapshot.
- [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) — current ship loadout: primary weapon, secondary, shield level, armor level, active power-ups.

**Why singleton-ish and not React context:**

- Phaser and Three.js don't live in React's render tree. Threading React context through them is painful.
- The React HUD reads from `GameState` via lightweight subscribe/snapshot helpers (`useSyncExternalStore`).
- Server round-trips happen at *boundaries* (mission complete, shop purchase, explicit save) — never on every frame.

**Persistence:**

- **Autosave** on mission complete via `POST /api/save`.
- **Manual save** is a no-op if the user is not signed in (the game stays playable anonymously).
- **Load** happens once on `/play` mount: `GET /api/save` → hydrate `GameState`.

## 4. API route inventory

All routes live under [src/app/api/](src/app/api/). Keep the list short — every added route burns Vercel CPU budget.

| Route                          | Method | Runtime | Auth  | Purpose                                    |
| ------------------------------ | ------ | ------- | ----- | ------------------------------------------ |
| `/api/auth/[...nextauth]`      | GET/POST | Node  | —     | NextAuth v5 handler (Google OAuth).        |
| `/api/save`                    | GET    | Node    | req'd | Load the signed-in player's save game.     |
| `/api/save`                    | POST   | Node    | req'd | Upsert the signed-in player's save game.   |
| `/api/leaderboard?mission=X`   | GET    | Node    | —     | Top N scores for a mission. ISR, revalidate 60s. |
| `/api/leaderboard`             | POST   | Node    | req'd | Submit a score.                            |

All routes are Node-runtime — the `pg` Pool isn't Edge-compatible yet. If the Neon serverless driver becomes viable, migrate save/leaderboard reads to Edge first (writes remain Node for simplicity).

### Request / response shapes

```ts
// GET /api/save → 200
type SaveGame = {
  slot: number;
  credits: number;
  currentPlanet: string | null;
  shipConfig: ShipConfig;
  completedMissions: string[];
  unlockedPlanets: string[];
  playedTimeSeconds: number;
  updatedAt: string; // ISO
};

// POST /api/save
type SaveRequest = Omit<SaveGame, "updatedAt">;
// → 204 on success

// GET /api/leaderboard?mission=<id>&limit=20 → 200
type LeaderboardEntry = {
  playerName: string;
  score: number;
  timeSeconds: number | null;
  createdAt: string;
};

// POST /api/leaderboard
type SubmitScore = {
  missionId: string;
  score: number;
  timeSeconds: number;
};
// → 201 { rank: number }
```

## 5. Phaser scene lifecycle

```
BootScene        CombatScene        BossScene       ResultScene
  │                    │                 │                │
  │ preload  ─────────►│ start wave 1    │ intro cinema   │ tally score
  │ (mission-          │ spawn enemies   │ phase 1..N     │ award credits
  │  scoped assets)    │ handle power-ups│ death          │ POST save
  │                    │ wave N done?    │                │ POST score
  └────► CombatScene ──┤                 │                └──► onDone()
                       └── if boss? ─────►                     → Three.js
```

- **BootScene** loads *only* the assets needed for the current mission. Global UI assets load once at the outermost shell level.
- **CombatScene** owns: the player, active enemies, active bullets, active power-ups, the WaveManager, the CollisionSystem.
- **BossScene** is a specialization — same systems, scripted phases. May reuse CombatScene via composition rather than inheritance.
- **ResultScene** is short-lived; it reads GameState, computes deltas, fires one `POST /api/save`, and calls back into `TransitionManager` to return to the galaxy.

## 6. Transition flow (galaxy ↔ combat)

Owned by [src/game/three/TransitionManager.ts](src/game/three/TransitionManager.ts).

```
toCombat(missionId):
  1. GSAP: fade overworld out + camera zoom into selected planet
  2. Dispose Three.js scene (renderer kept, or recreate)
  3. Mount Phaser game with { sceneKey: "BootScene", missionId }
  4. GSAP: fade canvas in

toGalaxy():
  1. Phaser game.destroy(true)
  2. Rebuild Three.js scene (or resume paused one)
  3. GSAP: zoom camera out to overworld default framing
  4. Re-bind input to GalaxyScene
```

Only one engine is "live" at a time. The other's canvas is unmounted to free GPU resources.

## 7. Asset pipeline

Everything is a static file under [public/](public/):

```
public/
  sprites/
    player/
      ship.png               — base sprite sheet
      ship.json              — Phaser atlas
    enemies/
      basic.png
      zigzag.png
      kamikaze.png
      boss.png
    bullets/
      player-laser.png
      enemy-bullet.png
    powerups/
      weapon.png · shield.png · credit.png · invuln.png
    explosions/
      small.png · large.png
  audio/
    sfx/
      laser.wav · explosion.wav · pickup.wav · menu.wav
    music/
      galaxy-theme.ogg
      combat-mission-1.ogg · combat-mission-2.ogg · combat-mission-3.ogg
  textures/
    planets/
      <planet-id>.jpg        — diffuse map
    starfield.jpg
```

### Naming conventions

- Lowercase, dash-separated.
- Atlas JSON has the same basename as its PNG (`ship.png` ↔ `ship.json`).
- Mission-specific music is `combat-<mission-id>.ogg`.
- Planet textures use the same `id` as in [missions.json](src/game/phaser/data/missions.json).

### Referencing from code

Use plain root-relative URLs: `"/sprites/player/ship.png"`. Phaser's loader accepts them directly. Three.js `TextureLoader` too.

## 8. Database schema — at a glance

Canonical DDL is [db/migrations/20260424120000_initial_schema.sql](db/migrations/20260424120000_initial_schema.sql). The Kysely TypeScript shape is in [src/lib/db.ts](src/lib/db.ts) — keep the two in lockstep when migrating.

```
players ───┬── save_games (player_id FK, UNIQUE(player_id, slot))
           └── leaderboard (player_id FK, mission_id)
```

**Indexes** (added in initial migration):

- `save_games (player_id, slot)` — covered by the unique constraint.
- `leaderboard (mission_id, score DESC)` — for top-N reads.

## 9. Build-time expectations

- `next build` produces static HTML for `/`, `/play`, `/shop`.
- Phaser and Three.js get split into their own chunks (dynamic import).
- Total First Load JS for `/play` ≈ engine chunks + game code. Acceptable target: **< 800 KB gz** at MVP.
- No `next/image` remote loaders; game art is local and sized to source.

## 10. Things worth noting for future work

- **Procedural starfield** can be a shader instead of a sprite — but only if it saves asset size. Measure first.
- **Multiplayer / ghost replays** would require server state — explicitly out of scope, revisit post-MVP.
- **Mobile controls** are out of scope for MVP. Design the input layer with a `Controls` abstraction so adding virtual sticks later is a drop-in.
- **Achievements** are a database table we do not have yet. Don't sneak a column into `save_games`; open a new migration.
