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
│  finish(victory) → setSummary│
└──────────┬───────────────────┘
           │ onComplete callback fires:
           │  await saveNow()         (autosave; signed-in only — sequenced
           │                           BEFORE submitScore so the leaderboard
           │                           mission-completion guard sees the new
           │                           clear in the player's save row)
           │  void submitScore()      (victory only; signed-in only)
           ▼
GameCanvas: setMode("galaxy"), destroy Phaser game,
remount GalaxyScene, then mount React VictoryModal showing
score / credits / first-clear loot rewards.
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

### 4.1 Server-side cheat guards

On top of Zod schema validation, both write routes enforce **gameplay invariants** in [src/lib/saveValidation.ts](src/lib/saveValidation.ts) — pure functions, separately tested. A 422 status carries a specific `error` code so client logging surfaces *which* guard fired, not just "rejected". `sync.ts` calls `console.warn` on any non-OK response so a legitimate player who somehow trips a guard has a breadcrumb to follow.

| Guard | Where | Trigger | Response code |
|---|---|---|---|
| `validateMissionGraph` | `/api/save` POST | `completedMissions` or combat-mission `unlockedPlanets` entries whose `requires` chain isn't satisfied | 422 `mission_graph_invalid` |
| `validatePlaytimeDelta` | `/api/save` POST | claimed `playedTimeSeconds` grew by more than wall-clock seconds since last save's `updated_at` (+60s slack) | 422 `playtime_delta_invalid` |
| `validateCreditsDelta` | `/api/save` POST | `credits` jumped by more than `delta_time × maxPerSecond + delta_completed × maxPerFirstClear + 100` | 422 `credits_delta_invalid` |
| Mission-completion check | `/api/leaderboard` POST | submitted `missionId` not in player's stored `completed_missions` | 422 `mission_not_completed` |
| Strict `MissionId` enum | `/api/leaderboard` POST schema | submitted `missionId` not in the `MissionId` union | 400 `validation_failed` |

**Per-player progression-aware caps.** `MAX_CREDITS_PER_SECOND` and `MAX_CREDITS_PER_FIRST_CLEAR` aren't single constants — they're computed per request from the player's *server-stored* `completedMissions`:

1. `getReachableSolarSystems(completedMissions)` walks `SYSTEM_UNLOCK_GATES` and the missions' `solarSystemId` to derive which systems the player can play. Tutorial is always reachable.
2. `computeCreditCapsForSystems(reachableSystems)` walks every wave of every combat mission in those systems, takes the peak non-boss `creditValue` (drives `maxPerSecond`), and unions in loot-pool `credits.max` + max boss `creditValue` (drives `maxPerFirstClear`).
3. Caps multiply by `KILL_CADENCE_CEILING (5) × PER_SECOND_SAFETY_FACTOR (3)` and `× PER_CLEAR_SAFETY_FACTOR (1.5)` respectively.

A new player gets tutorial-only caps; clearing `boss-1` lights up tubernovae caps automatically; new systems lift caps only for players who've cleared their gating mission. **A 10× balance change to enemy creditValues or loot-pool maxes scales the caps 10× with no code edits.** The tutorial-only baseline is logged on cold start (`[saveValidation] tutorial-only caps (floor)`) so a regression after rebalance shows up in Vercel function logs.

**Debugging a 422 in production:**
1. Check the browser console for `saveNow: server rejected save 422 ...` — gives the specific error code.
2. Check Vercel function logs for `[/api/save] <guard> violation <email> <message>` — gives the player + reason.
3. Check `[saveValidation] tutorial-only caps (floor)` to see what the current derived baseline is.
4. If the cap looks wrong: someone changed enemy `creditValue` or loot-pool `credits.max` without realizing the cap auto-derives from those.

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
`BootScene`, `CombatScene`, `PauseScene`. ResultScene was retired — the
post-mission summary is now a React component ([VictoryModal](src/components/galaxy/VictoryModal.tsx))
mounted over the galaxy view, which gives us full Tailwind styling and
React state for showing first-clear loot rewards. `BossScene` exists as
a stub but is **not** in the scene list yet — boss encounters currently
route through `CombatScene` with an enemy whose `behavior === "boss"`
(today: the Monarch Caterpillar).

```
BootScene             CombatScene
  │                        │
  │ generate placeholder   │ start waves (WaveManager)
  │ textures programmat-   │ spawn enemies, bullets, perks
  │ ically (no preload)    │ handle pickups & collisions
  │                        │ all waves clear  ─► finish(true)  ┐
  └──► CombatScene  ───────┤ player dies      ─► finish(false) │
                           │ ESC/P            ─► PauseScene    │
                           │                                   ▼
                           │                          setSummary(this.game,...)
                           │                          bootData.onComplete()
                           ▼                                   │
                     PauseScene (overlay; pauses CombatScene;  │
                       P resume · ESC abandon)                 ▼
                                                  React: VictoryModal opens,
                                                  reads summary via getSummary,
                                                  await saveNow() then submitScore.
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
- **VictoryModal** (React, not Phaser) reads `summary` from the Phaser registry via `getSummary(this.game)` in `GameCanvas.handleMissionComplete`, then opens a Tailwind-styled modal over the galaxy view showing the count-up and any first-clear loot rewards (see [DropController.firstClearReward](src/game/phaser/scenes/combat/DropController.ts) for the loot-pool roll). The `/api/save` and `/api/leaderboard` writes happen in `handleMissionComplete` — `await saveNow()` before `submitScore()` so the leaderboard mission-completion guard sees the new clear in the player's save row.
- **PauseScene** is launched on top of a paused `CombatScene` and owns its own input (`P` resume, `ESC` abandon → `emit(combat, { type: "abandon" })` via the typed bus).
- **BossScene** (planned). Currently a no-op placeholder reserved for scripted phase logic in a later phase.

### 5.5 Phaser communication contracts (typed bus + typed registry)

Cross-scene communication and shared scene-graph state both go through typed wrappers. **No string-keyed `scene.events.emit(...)` or `game.registry.set(...)` calls** — they're compile-blind and hide rename regressions.

- [src/game/phaser/events.ts](src/game/phaser/events.ts) exports a discriminated `CombatEvent` union (`playerDied | allWavesComplete | abandon`) plus `emit<E>(scene, event)` and `on<T>(scene, type, handler)` wrappers. Adding a new event means extending the union; renaming one is a compile error in every consumer.
- [src/game/phaser/registry.ts](src/game/phaser/registry.ts) exports `REGISTRY_KEYS` plus typed `getSummary` / `setSummary` / `getBootData` / `setBootData`. The `CombatSummary` and `BootData` shapes ride a typed channel between CombatScene → Phaser registry → React VictoryModal (via `GameCanvas.handleMissionComplete` reading `getSummary(this.game)`) without any `as` casts.

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

**Visual** assets are still generated procedurally at runtime; **audio** assets are real mp3/ogg files under `public/audio/...`. The audio storyline is a flagship feature (see README "Audio storyline" section) and ships with a substantial asset library.

### Visuals (procedural)

- **Phaser sprites** — drawn programmatically in
  [BootScene.generateTextures()](src/game/phaser/scenes/BootScene.ts) using
  `Phaser.GameObjects.Graphics` and registered with `generateTexture(key, …)`.
  Active texture keys (post-2026-04-28 bug-themed redesign):
  - `player-ship`, `bullet-friendly`, `bullet-hostile`, `particle-spark`
  - **Aphids** (drawAphid): `enemy-aphid`, `enemy-aphid-giant`, `enemy-aphid-queen`
  - **Beetles** (drawBeetle): `enemy-beetle-scarab`, `enemy-beetle-rhino`, `enemy-beetle-stag`
  - **Caterpillars** (drawCaterpillar): `enemy-caterpillar-hornworm`, `enemy-caterpillar-army`, `enemy-caterpillar-monarch` (boss)
  - **Spiders** (drawSpider): `enemy-spider-wolf`, `enemy-spider-widow`, `enemy-spider-jumper`
  - **Dragonflies** (drawDragonfly): `enemy-dragonfly-common`, `enemy-dragonfly-heli`, `enemy-dragonfly-damsel`
  - Pickups / perks: `powerup-shield`, `powerup-credit`, `powerup-weapon`, `perk-overdrive`, `perk-hardened`, `perk-emp`
- **Galaxy planets / sun / starfield** — built procedurally in
  [src/game/three/](src/game/three/) (`Sun.ts`, `Starfield.ts`, `Planet.ts`,
  `planetTexture.ts`). `planetTexture.ts` paints surface noise onto a canvas;
  `Planet.ts` synthesises ring textures the same way.

### Audio (real assets)

Every voice line in the game is generated by Mikko's **AudiobookMaker** app (<https://github.com/MikkoNumminen/AudiobookMaker>) — a Chatterbox-TTS pipeline that runs locally — and shipped as mp3. Music beds are exported from **strudel-patterns** (<https://github.com/MikkoNumminen/strudel-patterns>). One narrator persona — **Grandma** — voices every spoken line for cross-surface consistency.

- **Combat SFX** ([src/game/audio/sfx.ts](src/game/audio/sfx.ts)) — Web Audio oscillators (laser, hit, explosion, pickup chime). Procedural; no asset files. Honors `setAllMuted`.
- **Music engines** ([src/game/audio/music.ts](src/game/audio/music.ts)) — `menuMusic` (looping bed under landing/galaxy/shop, native gapless loop, ducks during combat + Story log) and `combatMusic` (per-mission bed via `loadTrack(src)`, fades cleanly between missions).
- **Item-acquisition cues** ([src/game/audio/itemSfx.ts](src/game/audio/itemSfx.ts)) — four short voice clips, one per permanent-item category (`weapon`, `augment`, `upgrade`, `money`). Templates cached and cloned per fire so back-to-back receives overlap. Wired into `VictoryModal.tsx` (first-clear reward) AND every buy handler in `ShopUI.tsx` so the same cue plays on both surfaces.
- **Story audio** ([src/game/audio/story.ts](src/game/audio/story.ts)) — `StoryAudio` singleton plays one music+voice pair at a time with fade-in/out. Used by `StoryModal.tsx` for cinematics and by overlay-mode briefings (mission-select, shop-open, system-cleared-idle) which pass `musicSrc: null` to ride on top of the existing menu bed.
- **Story-log music** ([src/game/audio/storyLogAudio.ts](src/game/audio/storyLogAudio.ts)) — dedicated bed that plays while the player is browsing the Story log OR replaying any entry from it. Continuous across both views — opening a replay does not restart the bed.
- **Menu briefing queue** ([src/game/audio/menuBriefingAudio.ts](src/game/audio/menuBriefingAudio.ts)) — voice queue on the landing page. `playSequence(items)` runs a list of `{ src, gapBeforeMs }` items and advances on each `ended` event. Tracks `startFailed` to cope with cold-load autoplay block; `arm()` retries the stalled head on the first user gesture. PLAY/CONTINUE click calls `stop()` to cancel the whole queue.
- **Master mute** — every engine registers with `setAllMuted(muted)` exported from `music.ts`. The MuteToggle button in the HUD is the single switch.

### `public/audio/` tree (shipped, not placeholders)

```
public/audio/
  menu/          system-briefing.mp3 + 4 nudge clips (continue_nudge, play_nudge, final_warning, surrender)
  story/         music.ogg + voice.mp3 per StoryEntry (great-potato-awakening, spud-prime-arrival, yamsteroid-belt-arrival, dreadfruit-arrival, market-arrival, sol-spudensis-cleared)
  sfx/           ui_shop_gun, ui_shop_gun_mod, ui_shop_ship_upgrade, ui_shop_money — the 4 itemSfx cues
  music/         per-mission combat beds (referenced by missions.json `musicTrack`)
```

### Story content shape

`StoryEntry` in [src/game/data/story.ts](src/game/data/story.ts) carries two parallel text fields:
- `body: readonly string[]` — paragraphs Grandma reads aloud. Kept short and sentence-clean so the spoken narration breathes. Rendered in `StoryModal` (the cinematic popup).
- `logSummary: readonly string[]` — the deeper written synopsis rendered in the Story log list view (`StoryListModal`). Free to go further than the spoken track: lore, context, what's at stake. 2-4 paragraphs is the typical length. The user-facing rationale: browsing the log gets the richer read; REPLAY plays the spoken short version with its music bed.

Both fields are required on every entry. The `/new-story` skill enforces this for create / modify / remove operations.

### Story trigger system

The `StoryAutoTrigger` discriminated union in [src/game/data/story.ts](src/game/data/story.ts) currently supports four kinds. Each kind has exactly one firing site in the codebase that scans `STORY_ENTRIES` for matches.

| Kind                           | Firing site                                          | Behavior                                                                |
|--------------------------------|------------------------------------------------------|-------------------------------------------------------------------------|
| `first-time`                   | `GameCanvas.tsx` first-time effect                   | Fires once on first galaxy load if not in `seenStoryEntries`.           |
| `on-mission-select`            | `GameCanvas.handleMissionSelect`                     | 2s debounced; cancels on next click; locked planets skipped.            |
| `on-shop-open`                 | `ShopUI.tsx` mount effect                            | Fires on every shop mount regardless of seen-set.                       |
| `on-system-cleared-idle`       | `GameCanvas.tsx` idle-ticker effect                  | 5s initial delay then 20s loop while idle in a fully-cleared system.    |

Adding a fifth kind requires both a union variant in `story.ts` AND a matching firing site. The `/new-story` skill stops and flags such requests instead of inventing a new kind silently.

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
- **Music + voice playback** — fully wired (see §7 Audio). `combatMusic.loadTrack(src)` plays per-mission beds; `menuMusic` is the ambient bed. Story voice + menu briefing queue + per-category item cues all live under [src/game/audio/](src/game/audio/) and register with `setAllMuted`.
- **Multiplayer / ghost replays** would require server state — explicitly out
  of scope, revisit post-MVP.
- **Mobile controls** are out of scope for MVP. The `Controls` abstraction in
  [systems/Controls.ts](src/game/phaser/systems/Controls.ts) keeps virtual
  sticks a drop-in away.
- **Achievements** are a database table we do not have yet. Don't sneak a
  column into `save_games`; open a new migration.
