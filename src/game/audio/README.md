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

The `audio` module exposes, via the barrel, one bus + nine singleton engines
plus three function-level surfaces: the UI action cues (`uiCues.ts`), the
cleared-state cue (`clearedStateCue.ts`), and the user-activation gate
(`userActivation.ts`). The "Internal" section below lists what stays private;
do not assume a file is internal just because it isn't an engine — check
`index.ts`.

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

### Function-level cue surfaces (no own engine singleton)

- **`playUiCue(id: UiCueId)`** + the **`UI_CUE`** map (`uiCues.ts`) — one-shot
  Grandma voice cues for shop/loadout UI **actions** (equip / unequip / sell /
  upgrade-mark / picker-open / install-augment). Reuses `storyAudio`'s single
  voice slot, so a new cue **preempts** the previous one — desired on
  click-spam (no overlapping voices). Voice path convention
  `/audio/ui/<action>-voice.mp3` with silent-404 drop-in. Callers
  fire-and-forget — there is intentionally **no** `useEffect` cleanup, since a
  click that fires the cue often immediately unmounts the picker that fired it.
  Distinct from `itemSfx`, which fires on item **ACQUISITION** (purchase/drop):
  `uiCues` fires on a UI **ACTION**. `UI_CUE` already carries
  `installAugment` / `augmentPickerOpen` (and the `systemCleared` /
  `everythingCleared` entries under `/audio/sfx/`) — check the map before
  adding a new cue id.
- **`maybePlayClearedCue(input)`** (`clearedStateCue.ts`) — fires at most one
  cleared-state cue (`systemCleared` / `everythingCleared`) after a mission
  victory, given the content-computed verdict (`evaluateClearedBoundaries`)
  passed in by the `ui` caller. Uses its **own** versioned localStorage key
  (`spacepotatis:ui_everything_cleared_fired_v1`) for once-per-device
  semantics; re-arms when the player drops back below all-cleared. This is the
  one localStorage write in the module — it is a player-feel flag, NOT mute
  state (see invariant 1).
- **`onUserActivation(cb)`** / **`isUserActivated()`** (`userActivation.ts`) —
  shared first-gesture gate. Engines (notably `story.ts`) call
  `onUserActivation(cb)` instead of `el.play()` directly so a play() rejected
  before the first user gesture isn't silently stranded; `cb` runs inline if
  already activated, else queues for the first pointerdown / keydown /
  touchstart.

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

1. **Never persist MUTE STATE.** Never read or write
   `localStorage["spacepotatis:muted"]` from new code (PR #70 explicitly
   removed this), and never reintroduce a `setAllMuted` fan-out hub. This is
   scoped to mute — non-mute, player-feel flags (e.g. `clearedStateCue`'s
   once-per-device key) may use their own versioned localStorage key.
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
| `MusicEngine.ts` | 484 | The `MusicEngine` class (element lifecycle, fade/silence loop, watchdog, autoplay recovery). INTERNAL — not re-exported from the barrel; only `music.ts` constructs instances. |
| `music.ts` | 84 | `menuMusic` / `combatMusic` / `shopMusic` singletons + `DEFAULT_COMBAT_MUSIC` / `resolveCombatTrack`. The public surface re-exported via `index.ts`. |
| `story.ts` | 199 | StoryModal cinematic player |
| `storyLogAudio.ts` | 92 | Story-log bed |
| `menuBriefingAudio.ts` | 126 | Landing-page voice queue |
| `itemSfx.ts` | 112 | Per-category drop/shop cues |
| `leaderboardAudio.ts` | 73 | Hall of Mediocrity intro |
| `sfx.ts` | 186 | Procedural Web Audio combat SFX |
| `uiCues.ts` | 53 | `playUiCue` + `UI_CUE` map (shop/loadout UI action cues) |
| `clearedStateCue.ts` | 106 | `maybePlayClearedCue` — once-per-device cleared-state cues |
| `userActivation.ts` | 109 | `onUserActivation` / `isUserActivated` first-gesture gate |
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
