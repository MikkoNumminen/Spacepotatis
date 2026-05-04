# audio

> **Module status:** Tier-1 leaf in the proposed module graph
> ([docs/audit/02-target-architecture.md §"Module: audio"](../../../docs/audit/02-target-architecture.md)).
> Already cohesive and dependency-free — only depends on `types`. Safe to extract first.

## Purpose

Every audio engine and the **mute fan-out bus**. Owns playback lifecycle and
category-based mute. Engines are HTMLAudioElement-based for music + voice
surfaces (menu/combat/shop beds, story cinematics, story-log replay bed,
landing-page nudge queue, item-acquisition cues, leaderboard intro). Combat
impact sounds (laser/hit/explosion/pickup) are procedural Web Audio in
`sfx.ts`.

The bus (`AudioBus.ts`) is the single source of truth for mute. Engines
self-register in their constructor under one of `music | voice | sfx`; the
bus drives every engine's `setMuted(boolean)` whenever the effective mute
for that category flips. UI flips state via `audioBus.setMasterMuted` /
`setCategoryMuted` — **never** by reaching into individual engines.

## Public API

The `audio` module exposes one bus + nine singleton engines. Anything else in
this folder is internal.

### Bus

- **`audioBus`** (`AudioBus.ts`) — the mute fan-out hub. Engines self-register
  via `audioBus.register(category, this)` in their constructor. UI consumers
  call `audioBus.setMasterMuted(boolean)` / `audioBus.setCategoryMuted(cat,
  boolean)` and `audioBus.subscribe(cb)` to mirror state in a button/icon.

### Music engines (category: `music`)

- **`menuMusic`** (`music.ts`) — ambient menu bed. Native loop, gapless.
  `keepAlive` is set, so duck/unduck never pauses it (only volume changes).
  Survives client-side nav between root layout pages.
- **`combatMusic`** (`music.ts`) — per-mission combat bed. `loadTrack(src)`
  hot-swaps. Manual fade-out → silence → fade-in seam between loops; not
  native loop.
- **`shopMusic`** (`music.ts`) — shop bed. Native loop (gapless) like
  `menuMusic`. `loadTrack(src)` per shop.

### Voice + voice-context engines (category: `voice` — except where noted)

- **`storyAudio`** (`story.ts`) — StoryModal cinematic player (bed + delayed
  voice). **Currently registered as `music`** so the bed and voice fade
  together under one mute toggle; the constructor has a TODO to revisit this
  if per-category sliders ever ship. Story modals duck `menuMusic` while
  playing so the cinematic isn't competing with the galaxy bed.
- **`storyLogAudio`** (`storyLogAudio.ts`) — looping bed for the Story log
  view (list + replay). Registered as `music`. The replay voice goes through
  `storyAudio` (with `musicSrc: null`) so it layers on top.
- **`menuBriefingAudio`** (`menuBriefingAudio.ts`) — landing-page voice
  queue. Plays a series of nudge clips with configurable gaps, ending with
  the system briefing. Independent of `menuMusic` (which keeps playing
  underneath). Cancels when the player commits to the game.
- **`itemSfx`** (`itemSfx.ts`) — per-category drop/shop voice cues
  (`weapon()`, `augment()`, `upgrade()`, `money()`, `shield()`, `perk(id)`).
  Spawn-and-release per fire — **no persistent template elements**. See
  invariant below.
- **`leaderboardAudio`** (`leaderboardAudio.ts`) — Hall of Mediocrity intro
  voice on the Leaderboard page. One-shot with a configurable lead-in delay.

### Procedural SFX engine (category: `sfx`)

- **`sfx`** (`sfx.ts`) — Web Audio combat sounds: `laser()`, `explosion()`,
  `hit()`, `pickup()`. No asset files; everything synthesized from oscillators
  + filtered noise. See the disposal invariant below — every chain MUST
  terminate at the shared master `GainNode` (not `ctx.destination`) so the
  bus can flip in-flight sounds silent in a single assignment, and every
  `play*` call MUST wire `autoDispose(stopper, ...rest)` so nodes disconnect
  on `ended`.

## Internal

These are not part of the contract — do not import them from outside the
`audio` module:

- The `MusicEngine`, `StoryAudio`, `StoryLogAudio`, `MenuBriefingAudio`,
  `ItemSfxEngine`, `LeaderboardAudio`, `SoundEngine` classes themselves —
  they're only exported via their singleton instances.
- The `register(category, this)` calls in each constructor — they happen
  once at module load and are not re-exposed.
- Categories `"music" | "voice" | "sfx"` — type is exported (`AudioCategory`)
  for use INSIDE the module, but consumers should only ever pass the literal
  strings to `setCategoryMuted`. The set is closed.
- Tweening helpers (`tweenVolume`, `tween`), buffer helpers
  (`getNoiseBuffer`), and disposal wiring (`autoDispose`).
- The fake-DOM test harness in `__tests__/fakeAudio.ts` — for tests within
  this module only.

## Dependencies

- **`types`** only (today via `import type { PerkId } from
  "@/game/data/perks"` in `itemSfx.ts` — when the `content` module lands,
  this becomes a `content` re-export through `types`).
- **NEVER**: `state`, `content` (logic), `infra`, `phaser`, `three`, `ui`,
  `app`. The audio cluster is a leaf — it gets called, it does not call
  upward.

## Invariants

The load-bearing rules. Breaking any of these silently corrupts mute
behavior, leaks HTMLAudioElement slots on iOS, or pins Web Audio nodes for
the lifetime of an `AudioContext`.

1. **Mute is session-only.** Never read or write
   `localStorage["spacepotatis:muted"]` from new code (PR #70 explicitly
   removed this). Never reintroduce a manual fan-out hub like the old
   `setAllMuted`.
2. **Every engine MUST register with `audioBus` in its constructor** under
   one of `music | voice | sfx`. The bus drives every engine's
   `setMuted(boolean)` when the effective mute flips. A new engine that
   forgets to register simply never gets muted.
3. **Every `sfx.play*` call MUST wire `autoDispose(stopper, ...rest)`** so
   nodes disconnect on `ended`. Web Audio nodes that remain `connect()`-ed
   are GC-pinned even after they've stopped producing sound; in a 3-minute
   combat with ~30 lasers/s, that adds up to thousands of detached-but-pinned
   nodes by mission end.
4. **Every `sfx` chain MUST terminate at `this.sink`** — the shared master
   `GainNode` returned from `ensureCtx()` — **not at `ctx.destination`**.
   That's how `setMuted(true)` flips in-flight sounds silent in one
   assignment. Routing past the master defeats the bus.
5. **HTMLAudioElement engines release their element on `ended`** by setting
   `el.src = ""` (and `removeAttribute("src")` / `el.load()` where the
   browser needs prodding). iOS Safari caps simultaneous HTMLAudioElement
   instances at ~6 per page; any element with `src` set + `readyState > 0`
   counts toward the budget even if not playing. The only persistent element
   in the cluster is `menuMusic` (native loop, never released).
6. **`itemSfx` does NOT cache template elements.** PR #69 removed the
   8-element `Map<Category, HTMLAudioElement>` template cache for exactly
   the iOS-budget reason above. Every fire is spawn-and-release.

## Common pitfalls

- **Forgetting to register a new engine with the bus** → mute toggle
  silently misses it. The engine plays through "muted" cleanly.
- **Calling `ctx.destination` directly in `sfx.ts`** → in-flight sounds keep
  playing through a mute toggle because they bypass the master gain. The
  engine looks correct in unit tests but breaks on actual mute toggles
  during play.
- **Persisting mute to `localStorage`** → mute leaks across sessions and
  surprises returning players who toggled it once weeks ago. PR #70
  explicitly removed this; do not bring it back.
- **Caching template `<audio>` elements** for "performance" → re-introduces
  the iOS ~6-element budget bug (PR #69). The browser HTTP-caches the file
  body anyway, so the only saving was a couple ms per fire — not worth the
  silent failure on iPhone.
- **Connecting `connect(ctx.destination)` instead of `connect(sink)`** in a
  new `sfx` method → bypasses the master gain, breaking mute. There's no
  type-level guard against this; the invariant lives in code review and
  this README.
- **Forgetting `autoDispose` in a new `sfx` method** → leaks Web Audio nodes
  for the lifetime of the `AudioContext` (i.e. the whole tab session). Hard
  to detect during dev because the leak is gradual; surface in long-running
  combat sessions.
- **Adding a new music engine that omits `loop: true` for an ambient bed**
  → players hit the silence window during navigation. The manual
  fade-out → silence → fade-in routine is for finite per-mission tracks; for
  beds that play forever, set `loop: true` (and `keepAlive: true` if it
  should never be paused by ducking).

## Files

| File | LOC | Role |
|---|---|---|
| `AudioBus.ts` | 142 | Bus + category state + register API |
| `music.ts` | **441** | `MusicEngine` + `menuMusic` / `combatMusic` / `shopMusic` singletons. Flagged as a god-file by the audit (`02-target-architecture.md`); split deferred. |
| `story.ts` | 199 | StoryModal cinematic player |
| `storyLogAudio.ts` | 92 | Story-log bed |
| `menuBriefingAudio.ts` | 126 | Landing-page voice queue |
| `itemSfx.ts` | 112 | Per-category drop/shop cues |
| `leaderboardAudio.ts` | 73 | Hall of Mediocrity intro |
| `sfx.ts` | 186 | Procedural Web Audio combat SFX |
| `__tests__/fakeAudio.ts` | 385 | Hand-rolled DOM/Web-Audio fakes |
| `*.test.ts` | — | Per-engine unit tests |

## How to test changes

```
npm test src/game/audio
```

The `__tests__/fakeAudio.ts` harness is the testing aid. Pattern:

```ts
import { installAudioFakes, uninstallAudioFakes } from "./__tests__/fakeAudio";

beforeEach(() => { fakes = installAudioFakes(); });
afterEach(() => { uninstallAudioFakes(); });

// Then `await import("../music")` AFTER install so the singletons are
// born under the fakes. vi.resetModules() (called by uninstall) gives
// each test fresh singletons.
```

The fakes give you introspection (`audio.playCalls`, `osc.disconnectCalls`,
`fakes.context().oscillators`) that a real DOM doesn't expose, and
deterministic control over `play()`-promise resolution to simulate the
autoplay block.
