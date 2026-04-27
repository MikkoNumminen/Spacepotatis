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
          ┌────────────────┐     ┌─────────────────┐
          │  /api/save     │     │ /api/leaderboard│
          │  (Edge)        │     │ (Edge, cached)  │
          │  /api/auth/*   │     │                 │
          │  (Node, OAuth) │     │                 │
          └──────┬─────────┘     └────────┬────────┘
                 │                        │
                 └─── Kysely ── @neondatabase/serverless (WS Pool)
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

**`GameState` is split across four cohesive files (post-2026-04-27 audit) plus a barrel:**

- [src/game/state/GameState.ts](src/game/state/GameState.ts) — thin barrel that re-exports the slices below. `import * as GameState from "@/game/state/GameState"` still works for Phaser scenes and tests.
- [src/game/state/stateCore.ts](src/game/state/stateCore.ts) — the singleton: `GameStateShape`, module-level `let state`, `listeners`, `getState`, `subscribe`, `commit`, plus non-ship mutators (`addCredits`, `spendCredits`, `addPlayedTime`, `completeMission`, `setSolarSystem`, `isMissionCompleted`, `isPlanetUnlocked`, `resetForTests`). Owns `INITIAL_STATE`, `MISSIONS`, `SYSTEM_UNLOCK_GATES` (mission-completion → solar-system-unlock).
- [src/game/state/shipMutators.ts](src/game/state/shipMutators.ts) — every ship-shape mutator: `equipWeapon`, `grantWeapon`, `sellWeapon`, `buyWeapon`, `buyShieldUpgrade`, `buyArmorUpgrade`, `buyReactorCapacityUpgrade`, `buyReactorRechargeUpgrade`, `buyWeaponUpgrade`, `buyAugment`, `grantAugment`, `installAugment`. Imports `commit` and `getState` from `stateCore`.
- [src/game/state/persistence.ts](src/game/state/persistence.ts) — `StateSnapshot`, `toSnapshot`, `hydrate`, `migrateShip`, `cloneWeaponAugments`, legacy-snapshot helpers. Migrates pre-multi-slot saves (`ship.primaryWeapon`) into the current shape.
- [src/game/state/pricing.ts](src/game/state/pricing.ts) — `SELL_RATE` constant + `getSellPrice(weapon)`. Pure.
- [src/game/state/ShipConfig.ts](src/game/state/ShipConfig.ts) — Tyrian-style modular loadout: `slots: { front, rear, sidekickLeft, sidekickRight }` (each `WeaponId | null`), `unlockedWeapons`, `shieldLevel`, `armorLevel`, `reactor: { capacityLevel, rechargeLevel }`, plus pure helpers for shield/armor/reactor max and upgrade pricing. Runtime energy value is NOT here — it's mutable per-mission state on `Player`.
- [src/game/state/useGameState.ts](src/game/state/useGameState.ts) — `useSyncExternalStore` hook for React selectors.
- [src/game/state/sync.ts](src/game/state/sync.ts) — `loadSave`, `saveNow`, `submitScore`. Best-effort fetches; failures and missing auth degrade silently so anonymous play keeps working. **All wire payloads validated by Zod schemas** in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) — a malformed remote save is rejected with `loadSave()` returning `false`, not silently hydrated.

Mid-mission perks (overdrive, hardened, EMP) live on the `Player` instance / `CombatScene` and are explicitly **not** in `GameState` — they reset on every combat boot.

**Why singleton-ish and not React context:**

- Phaser and Three.js don't live in React's render tree. Threading React context through them is painful.
- The React HUD reads from `GameState` via lightweight subscribe/snapshot helpers (`useSyncExternalStore`).
- Server round-trips happen at *boundaries* (mission complete, shop purchase, explicit save) — never on every frame.

**Persistence:**

- **Autosave** on mission complete via `POST /api/save` (only when authenticated).
- **Manual save** is a no-op if the user is not signed in (the game stays playable anonymously).
- **Load** happens once after sign-in becomes `authenticated` inside `GameCanvas`: `GET /api/save` → `hydrate(snapshot)`.

### Ship loadout (slot system)

Player ships have four hardpoints: `front`, `rear`, `sidekickLeft`, `sidekickRight`. A weapon definition declares its `slot` *kind* (`front | rear | sidekick`); equipping checks the kind matches the position. Each slot owns its own `WeaponSystem` cooldown — different weapons in left/right sidekicks fire on independent rate limits.

Bullet direction is per-slot (`weaponMath.slotVectors`): front fires up, rear fires down, each sidekick rotates its straight pattern ±45° outward. Bullet spawn position is also per-slot (`Player.SPAWN_OFFSET`) so projectiles emerge from the right point on the sprite.

Pickups still auto-equip the next weapon in the upgrade ladder via `CombatScene.nextWeaponUpgrade` and `GameState.grantWeapon`. Manual swaps go through `LoadoutMenu` (galaxy HUD modal + Market shop section), which calls `GameState.equipWeapon(slot, id)`.

### Reactor energy

Every weapon has an `energyCost` (per FIRE event, not per bullet). Player runtime tracks `energy` (mutable, not in `ShipConfig`), drained on each successful fire and recharged at `getReactorRecharge(ship)` per second. Cap and recharge scale with `reactor.capacityLevel` and `reactor.rechargeLevel`, both upgradable in the shop. Below 25% energy the HUD bar pulses; at 0 the fire request is silently rejected.

### Multi-solar-system overworld

`solarSystems.json` lists each system (id, name, description, sun color/size, ambient hue). Every `MissionDefinition` carries a `solarSystemId`. `GalaxyScene` reads the current system from `GameState.currentSolarSystemId`, filters planets to that system, and tints `Sun.ts` from the system metadata. Players warp between unlocked systems via the `WarpPicker` modal in `GameCanvas`. Unlock gating lives in `GameState.SYSTEM_UNLOCK_GATES` — completing the gating mission pushes the target system into `unlockedSolarSystems`.

## 4. API route inventory

All routes live under [src/app/api/](src/app/api/). Keep the list short — every added route burns Vercel CPU budget.

| Route                          | Method | Runtime | Auth  | Purpose                                    |
| ------------------------------ | ------ | ------- | ----- | ------------------------------------------ |
| `/api/auth/[...nextauth]`      | GET/POST | Node  | —     | NextAuth v5 handler (Google OAuth).        |
| `/api/save`                    | GET    | Edge    | req'd | Load the signed-in player's save game.     |
| `/api/save`                    | POST   | Edge    | req'd | Upsert the signed-in player's save game.   |
| `/api/leaderboard?mission=X`   | GET    | Edge    | —     | Top N scores for a mission. Cached via `unstable_cache`, 60s revalidate. |
| `/api/leaderboard`             | POST   | Edge    | req'd | Submit a score; `revalidateTag('leaderboard')`. |

`/api/save` and `/api/leaderboard` run on the Edge runtime via `@neondatabase/serverless` (WebSocket-backed `Pool` that's API-compatible with `pg.Pool`). NextAuth's `auth()` is JWT-cookie based and works in Edge. `/api/auth/[...nextauth]` stays on Node because Google OAuth's callback handshake isn't Edge-safe.

**Every request and response is validated by Zod schemas** in [src/lib/schemas/save.ts](src/lib/schemas/save.ts) — the source of truth for the wire format. The save and leaderboard routes both `safeParse()` request bodies and reject malformed input with `{ error: "validation_failed", issues: [...] }` at status 400. The client (`sync.ts`) parses server responses through `RemoteSaveSchema` so a server-side schema drift can't corrupt local state. Path strings are centralized in [src/lib/routes.ts](src/lib/routes.ts) (`ROUTES.api.save`, etc.) — never hard-code `"/api/..."` strings in components.

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
- **CombatScene** is now a thin orchestrator (~216 LOC after the audit) that wires together: `Player`, `BulletPool` (×2), `EnemyPool`, `PowerUpPool`, `WaveManager`, `ScoreSystem`, plus four extracted helpers under [src/game/phaser/scenes/combat/](src/game/phaser/scenes/combat/):
  - **`CombatHud`** — score/credit/shield/armor/energy bars + perk chips.
  - **`CombatVfx`** — background, explosion particles, target-finding glue.
  - **`DropController`** — `rollDrop`, `applyPowerUp`, `flashPickup`, weapon-upgrade ladder.
  - **`PerkController`** — `applyPerk` (gain), `useActivePerk` (consume), `detonateEmp`. Holds `activePerks` + `empCharges`.
  Collisions are wired by `wireCollisions(...)` from [systems/CollisionSystem.ts](src/game/phaser/systems/CollisionSystem.ts).
- **`Player`** is also an orchestrator that composes helpers from [src/game/phaser/entities/player/](src/game/phaser/entities/player/): `SlotModResolver` (pure mod resolution per slot), `PlayerCombatant` (shield/armor/energy/regen/`takeDamage`), `PlayerFireController` (`tryFireSlot`). CombatScene's reads (`player.shield`, `player.takeDamage(...)`) flow through unchanged passthroughs.
- **ResultScene** reads `summary` from the Phaser registry via the typed accessor `getSummary(this.game)` (see §5.5), animates a count-up, and on input fires `bootData.onComplete()`. The `/api/save` and `/api/leaderboard` writes happen back in `GameCanvas.handleMissionComplete`, not inside the scene itself.
- **PauseScene** is launched on top of a paused `CombatScene` and owns its own input (`P` resume, `ESC` abandon → `emit(combat, { type: "abandon" })` via the typed bus).
- **BossScene** (planned). Currently a no-op placeholder reserved for scripted phase logic in a later phase.

### 5.5 Phaser communication contracts (typed bus + typed registry)

Cross-scene communication and shared scene-graph state both go through typed wrappers. **No string-keyed `scene.events.emit(...)` or `game.registry.set(...)` calls** — they're compile-blind and hide rename regressions.

- [src/game/phaser/events.ts](src/game/phaser/events.ts) exports a discriminated `CombatEvent` union (`playerDied | allWavesComplete | abandon`) plus `emit<E>(scene, event)` and `on<T>(scene, type, handler)` wrappers. Adding a new event means extending the union; renaming one is a compile error in every consumer.
- [src/game/phaser/registry.ts](src/game/phaser/registry.ts) exports `REGISTRY_KEYS` plus typed `getSummary` / `setSummary` / `getBootData` / `setBootData`. The `CombatSummary` and `BootData` shapes ride a typed channel between CombatScene → Phaser registry → ResultScene without any `as` casts.

Two historical events (`enemyKilled`, `waveComplete`) were emitted but had no listeners; the audit deleted both. The kill path now flows through the `wireCollisions(...)` callback (`onEnemyHit(enemy, _bullet, killed)`) rather than a separate event.

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

Only one engine is live at a time — the other's canvas/parent is unmounted by React, so GPU resources are released by the dispose hooks.

**Auth-flip invariant in `GameCanvas`.** The Phaser-mount effect captures `handleMissionComplete` indirectly through a `completeRef` so that a sign-in event during combat (`useSession` flips `"loading"` → `"authenticated"`) doesn't leave Phaser holding a stale closure that skips `saveNow()` / `submitScore()` on completion. Re-instantiating Phaser on auth changes would tear down the active game, so the ref pattern is the correct fix. **Don't refactor the Phaser-mount effect to inline `handleMissionComplete` directly** — that re-introduces the bug.

`GameCanvas` itself is now a thin orchestrator (~159 LOC). The galaxy chrome (`HudFrame`, `WarpPicker`, `LoadoutModal`) lives under [src/components/galaxy/](src/components/galaxy/). The lifecycle effects are extracted into hooks under [src/components/hooks/](src/components/hooks/): `useGalaxyScene`, `usePhaserGame`, `useCloudSaveSync`, `useNextMissionAutoSelect`.

**Three.js scaffolding is shared.** `GalaxyScene` and `LandingScene` both call [src/game/three/SceneRig.ts](src/game/three/SceneRig.ts) `createSceneRig(canvas, opts)` for the renderer, scene+fog, ambient+rim light, starfield, sun, and planet add-loop. Each scene only owns its camera, controls, and per-scene specifics (raycaster + OrbitControls vs auto-orbit camera).

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
  [missions.json](src/game/data/missions.json) (`MissionDefinition.texture`
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
