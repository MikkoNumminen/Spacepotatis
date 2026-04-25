# ARCHITECTURE.md — Spacepotatis

High-level architecture, data flow, scene lifecycle, and API inventory. Keep this current as the implementation evolves.

## 1. High-level map

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (client-only)                       │
│                                                                   │
│   ┌──────────────────┐  GSAP   ┌──────────────────┐              │
│   │  Three.js        │◄fade───►│   Phaser 3       │              │
│   │  GalaxyScene     │ overlay │   CombatScene    │              │
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
│   │   GameCanvas · MissionSelect · ShopUI            │            │
│   │   Leaderboard · SignInButton · MuteToggle        │            │
│   └──────────────┬──────────────────────┬────────────┘            │
└──────────────────┼──────────────────────┼─────────────────────────┘
                   │ fetch                │ fetch
                   ▼                      ▼
          ┌────────────────┐     ┌────────────────┐
          │  /api/save     │     │ /api/leader-   │
          │  /api/auth/*   │     │   board        │
          │  (Node)        │     │  (Node, ISR)   │
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

`HUD.tsx` and `PauseMenu.tsx` exist as placeholder client components that
currently render `null`. The galaxy HUD frame and pause overlay live inline
in `GameCanvas.tsx` and `PauseScene.ts` respectively.

## 2. The core loop

```
Landing page (/)
      │
      ▼
Play (/play) — dynamically imports GameCanvas (ssr:false)
      │
      ▼  (first mount, mode = "galaxy")
┌── Three.js GalaxyScene ──┐
│  Sun, planets, orbits    │
│  Pointer raycast hover   │
│  Click → MissionSelect   │
└─────────────┬────────────┘
              │ GSAP fade overlay → opacity 1
              ▼
GameCanvas: setMode("combat"), unmount Three.js,
mount Phaser via createPhaserGame(parent, { missionId, onComplete })
              │
              ▼
┌── Phaser BootScene ────────┐
│  Generate placeholder      │
│  textures (no asset load)  │
└──────────┬─────────────────┘
           ▼
┌── Phaser CombatScene ────────┐
│  Waves → bosses inline       │
│  Pickups, perks, scoring     │
│  PauseScene launched on P/ESC│
└──────────┬───────────────────┘
           ▼
┌── Phaser ResultScene ──┐
│  Score tally, credits  │
└──────────┬─────────────┘
           │ onComplete callback fires:
           │  POST /api/save  (autosave; signed-in only)
           │  POST /api/leaderboard (victory only; signed-in only)
           ▼
GameCanvas: setMode("galaxy"), destroy Phaser game,
remount GalaxyScene
           │
           ▼
       Shop planet? → router.push("/shop")
       Next planet?  → loop
```

## 3. State management

**No Redux. No Zustand. No Context gymnastics.** A single module-level object called `GameState` holds the in-memory truth during a session.

- [src/game/state/GameState.ts](src/game/state/GameState.ts) — `credits`, `completedMissions`, `unlockedPlanets`, `playedTimeSeconds`, `ship` (`ShipConfig`), `saveSlot`. Mutations go through named functions (`addCredits`, `completeMission`, `grantWeapon`, `buyShieldUpgrade`, …) that produce immutable new snapshots and notify subscribers.
- [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) — `primaryWeapon`, `unlockedWeapons`, `shieldLevel`, `armorLevel`, plus pure helpers for shield/armor max and upgrade pricing.
- [src/game/state/useGameState.ts](src/game/state/useGameState.ts) — `useSyncExternalStore` hook for React selectors.
- [src/game/state/sync.ts](src/game/state/sync.ts) — `loadSave`, `saveNow`, `submitScore`. Best-effort fetches; failures and missing auth degrade silently so anonymous play keeps working.

Mid-mission perks (overdrive, hardened, EMP) live on the `Player` instance / `CombatScene` and are explicitly **not** in `GameState` — they reset on every combat boot.

**Why singleton-ish and not React context:**

- Phaser and Three.js don't live in React's render tree. Threading React context through them is painful.
- The React HUD reads from `GameState` via lightweight subscribe/snapshot helpers (`useSyncExternalStore`).
- Server round-trips happen at *boundaries* (mission complete, shop purchase, explicit save) — never on every frame.

**Persistence:**

- **Autosave** on mission complete via `POST /api/save` (only when authenticated).
- **Manual save** is a no-op if the user is not signed in (the game stays playable anonymously).
- **Load** happens once after sign-in becomes `authenticated` inside `GameCanvas`: `GET /api/save` → `hydrate(snapshot)`.

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
// GET /api/save → 200 (or 200 with `null` body when no save exists)
type SaveGame = {
  slot: number;
  credits: number;
  currentPlanet: string | null;
  shipConfig: Record<string, unknown>; // serialized ShipConfig
  completedMissions: string[];
  unlockedPlanets: string[];
  playedTimeSeconds: number;
  updatedAt: string; // ISO
};

// POST /api/save
type SaveRequest = Omit<SaveGame, "updatedAt" | "slot">;
// → 204 on success. The server always writes slot=1 in MVP.

// GET /api/leaderboard?mission=<id>&limit=20 → 200
// Response: { missionId: string, entries: LeaderboardEntry[] }
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
// → 201, empty body. (No rank computation yet.)
```

## 5. Phaser scene lifecycle

Registered scenes (see [src/game/phaser/config.ts](src/game/phaser/config.ts)):
`BootScene`, `CombatScene`, `ResultScene`, `PauseScene`. `BossScene` exists as
a stub but is **not** in the scene list yet — boss encounters currently route
through `CombatScene` with an enemy whose `behavior === "boss"`.

```
BootScene             CombatScene                       ResultScene
  │                        │                                  │
  │ generate placeholder   │ start waves (WaveManager)        │ tally score
  │ textures programmat-   │ spawn enemies, bullets, perks    │ award credits
  │ ically (no preload)    │ handle pickups & collisions      │ display summary
  │                        │ all waves clear  ─► finish(true) │ wait for input
  └──► CombatScene  ───────┤ player dies      ─► finish(false)│
                           │ ESC/P            ─► PauseScene   └──► onComplete()
                           │                                       (back to Galaxy)
                           ▼
                     PauseScene (overlay; pauses CombatScene;
                       P resume · ESC abandon)
```

- **BootScene** does **not** preload any disk assets. Every sprite is drawn
  procedurally with `Phaser.GameObjects.Graphics` and registered via
  `generateTexture`. Real PNGs can be dropped into `/public/sprites` later
  by rewriting this scene as a proper preloader.
- **CombatScene** owns: `Player`, `BulletPool` (×2), `EnemyPool`, `PowerUpPool`,
  `WaveManager`, `ScoreSystem`, the inline HUD layer, and the perk state
  (`activePerks`, `empCharges`). Collisions are wired by `wireCollisions(...)`
  from [systems/CollisionSystem.ts](src/game/phaser/systems/CollisionSystem.ts).
- **ResultScene** reads `summary` from the Phaser registry, animates a count-up,
  and on input fires `bootData.onComplete()`. The `/api/save` and
  `/api/leaderboard` writes happen back in `GameCanvas.handleMissionComplete`,
  not inside the scene itself.
- **PauseScene** is launched on top of a paused `CombatScene` and owns its own
  input (`P` resume, `ESC` abandon → emits `"abandon"` on the combat scene).
- **BossScene** (planned). Currently a no-op placeholder reserved for scripted
  phase logic in a later phase.

## 6. Transition flow (galaxy ↔ combat)

Mode switching is owned by [src/components/GameCanvas.tsx](src/components/GameCanvas.tsx)
via a single `mode: "galaxy" | "combat"` state.
[src/game/three/TransitionManager.ts](src/game/three/TransitionManager.ts) is a
small helper that exports `fade(element, opacity, duration)` — a GSAP-driven
opacity tween over a black overlay div. There is **no camera-zoom transition
yet**; that's planned polish.

```
Galaxy → Combat (handleLaunch):
  1. Close MissionSelect panel
  2. await fade(overlay, 1)            // overlay opaque
  3. setLaunching(mission); setMode("combat")
  4. Galaxy useEffect cleanup runs → GalaxyScene.dispose()
  5. Combat useEffect runs → createPhaserGame(parent, { missionId, onComplete })
  6. requestAnimationFrame → fade(overlay, 0)

Combat → Galaxy (handleMissionComplete, summary):
  1. Save summary + best-effort POST /api/save and /api/leaderboard
  2. await fade(overlay, 1)
  3. setLaunching(null); setMode("galaxy")
  4. Combat useEffect cleanup → game.destroy(true)
  5. Galaxy useEffect runs → new GalaxyScene().start()
  6. requestAnimationFrame → fade(overlay, 0)
```

Only one engine is live at a time — the other's canvas/parent is unmounted by
React, so GPU resources are released by the dispose hooks.

## 7. Asset pipeline

The MVP ships **without binary art or audio assets**. Everything visible and
audible is generated procedurally at runtime:

- **Phaser sprites** — drawn programmatically in
  [BootScene.generateTextures()](src/game/phaser/scenes/BootScene.ts) using
  `Phaser.GameObjects.Graphics` and registered with `generateTexture(key, …)`.
  Active texture keys: `player-ship`, `bullet-friendly`, `bullet-hostile`,
  `enemy-basic`, `enemy-zigzag`, `enemy-kamikaze`, `boss-1`,
  `powerup-shield`, `powerup-credit`, `powerup-weapon`,
  `perk-overdrive`, `perk-hardened`, `perk-emp`, `particle-spark`.
- **Galaxy planets / sun / starfield** — built procedurally in
  [src/game/three/](src/game/three/) (`Sun.ts`, `Starfield.ts`, `Planet.ts`,
  `planetTexture.ts`). `planetTexture.ts` paints surface noise onto a canvas;
  `Planet.ts` synthesises ring textures the same way.
- **SFX** — Web Audio oscillators in [src/game/audio/sfx.ts](src/game/audio/sfx.ts).
  Globally mutable via `MuteToggle`.
- **Music** — `MissionDefinition.musicTrack` paths exist in `missions.json`
  pointing at `/audio/music/...`, but no music player is wired in yet and the
  files are not shipped.

The `public/` tree therefore only contains `.gitkeep` placeholders today:

```
public/
  sprites/   (player, enemies, bullets, powerups, explosions — all .gitkeep)
  audio/     (sfx, music — .gitkeep)
  textures/  (planets — .gitkeep)
  README.md
```

### When real art arrives

- Drop PNGs into `/public/sprites/...` and rewrite `BootScene` as a proper
  preloader (`this.load.image(key, "/sprites/...")` in `preload()`).
- Texture keys consumed across the codebase are listed above — keep them
  identical when wiring real assets so entity code does not need to change.
- Lowercase, dash-separated naming. Atlas JSON shares its PNG basename
  (`ship.png` ↔ `ship.json`). Mission music is `combat-<mission-id>.ogg`.
- Planet textures use the same `id` as in
  [missions.json](src/game/phaser/data/missions.json) (`MissionDefinition.texture`
  is already a `/textures/planets/<id>.jpg` path).

### Referencing from code

Use plain root-relative URLs: `"/sprites/player/ship.png"`. Phaser's loader
accepts them directly. Three.js `TextureLoader` too.

## 8. Database schema — at a glance

Canonical DDL is [db/migrations/20260424120000_initial_schema.sql](db/migrations/20260424120000_initial_schema.sql). The Kysely TypeScript shape is in [src/lib/db.ts](src/lib/db.ts) — keep the two in lockstep when migrating.

```
players ───┬── save_games (player_id FK, UNIQUE(player_id, slot))
           └── leaderboard (player_id FK, mission_id)
```

**Constraints / indexes** (initial migration):

- `save_games` — `UNIQUE (player_id, slot)`. The unique index also covers
  lookup-by-player.
- `leaderboard_mission_score_idx` on
  `leaderboard (mission_id, score DESC, created_at DESC)` — for top-N reads
  with deterministic tie-break.

## 9. Build-time expectations

- `next build` produces static HTML for `/`, `/play`, `/shop`, `/leaderboard`.
  (`/play` is a thin client wrapper around a `next/dynamic({ ssr: false })`
  import of `GameCanvas`.)
- Phaser and Three.js are dynamically imported inside `GameCanvas` and split
  into their own chunks.
- Total First Load JS for `/play` ≈ engine chunks + game code. Acceptable
  target: **< 800 KB gz** at MVP.
- No `next/image` remote loaders; all visuals are procedural (see §7).

## 10. Things worth noting for future work

- **Starfield perf** — the galaxy starfield is currently 2,000 `THREE.Points`
  (`src/game/three/Starfield.ts`). If it becomes a bottleneck on low-end
  GPUs, consider a single full-sphere shader. Measure first.
- **Camera-zoom transition** — `TransitionManager.fade()` is the only effect
  today. A planet-zoom on launch and an orbital reframing on return are
  planned polish; keep the GameCanvas mode toggle as the source of truth.
- **BossScene** — currently a stub. When scripted phase logic is added, route
  boss missions through it instead of `CombatScene`.
- **Music playback** — `MissionDefinition.musicTrack` paths exist but no
  HTMLAudio / Howler player is wired in. SFX-only for now.
- **Multiplayer / ghost replays** would require server state — explicitly out
  of scope, revisit post-MVP.
- **Mobile controls** are out of scope for MVP. The `Controls` abstraction in
  [systems/Controls.ts](src/game/phaser/systems/Controls.ts) keeps virtual
  sticks a drop-in away.
- **Achievements** are a database table we do not have yet. Don't sneak a
  column into `save_games`; open a new migration.
