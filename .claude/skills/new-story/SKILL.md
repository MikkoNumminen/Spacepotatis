---
name: new-story
description: Add, modify, or remove story content — cinematic popups, voiceovers, music beds, body text, written synopses, and auto-trigger wiring. Covers the full CRUD lifecycle for the Story log.
---

# When to use

**Invoke this skill for ANY request that touches story content** — adding a new beat, rewriting an existing one, changing when it auto-fires, replacing the audio, or removing one entirely. The Story system is the only narrative surface in the codebase, so any of the phrasings below should route here.

## Triggers — creation
- "/new-story", "/edit-story", "/story"
- "add a story", "add a new story", "add a story entry", "add a chapter"
- "add a cinematic", "add an intro cinematic", "add a cutscene", "add a narrative beat"
- "add a voiceover", "add a voice line for X", "add narration"
- "add lore", "add a lore entry", "add a backstory snippet"
- "add a popup that tells…", "show a story popup when…"
- "make a new story for X" / "the player should see a story when X happens"

## Triggers — modification (text / audio / trigger)
- "rewrite the X synopsis / body / log summary"
- "edit the X cinematic", "tweak the X briefing", "punch up X"
- "rerecord X's voice", "swap X's music", "replace the audio for X"
- "make X auto-fire on Y instead of Z", "change when X fires"
- "X's title should be …", "rename X to …"
- "X feels too long / too short / too dry" (sentiment ask — still in scope; treat as a content edit)
- "make the synopsis more extensive", "the log entry should say more about Y"

## Triggers — removal
- "remove the X story", "delete the X cinematic", "drop X"
- "rip out / kill / scrap / retire the X story"
- "we're not shipping X anymore"
- "X is duplicate, get rid of one"

If the request mentions any specific story id, the words `Story log / cinematic / voiceover / narration / chapter / lore / synopsis / log summary / briefing` alongside an action verb (`add / remove / change / edit / rewrite / tweak / rerecord / replace / scrap / rip out`), or a sentiment about an existing story feeling too X, invoke this skill.

## Boundary — do NOT use for
- **Adjusting the cinematic UI itself** (modal styling, fade timing, panel width, button position) — those live in `src/components/story/StoryModal.tsx`, `src/components/story/StoryListModal.tsx`, and `src/game/audio/story.ts`. Code-edit ask, not a content task.
- **Adding a genuinely NEW auto-trigger kind** (e.g. "after boss-1 cleared", "on first perk pickup", "when entering tubernovae system"). The `StoryAutoTrigger` union currently supports `null`, `first-time`, `on-mission-select`, `on-shop-open`, and `on-system-cleared-idle` — anything else requires a new variant in the union AND a matching firing site (a `useEffect` somewhere that scans `STORY_ENTRIES` for the new kind and calls `storyAudio.play` / opens the modal). That's a feature, not a content addition. STOP and flag.
- **Restructuring `StoryEntry`** (adding a 6th trigger kind, splitting `body` from `logSummary` into something else, changing the audio engine semantics). STOP and flag.
- **Changing the master mute behaviour or the audio engine** in `src/game/audio/story.ts` / `music.ts`. Code-edit ask.

# Audio shape — music is optional, voice is required

Every entry MUST carry a voice track. The music track is optional and the runtime explicitly handles `musicTrack: null`:
- `storyAudio.play({ musicSrc: null, voiceSrc, voiceDelayMs })` skips creating the music HTMLAudioElement entirely — the voice plays solo over whatever ambient bed (menu, shop, galaxy) is already running.
- `StoryModal` (the popup) only ducks the menu bed when `entry.musicTrack !== null`. A modal with `musicTrack: null` sits on top of the existing bed without changing it — the narrator just speaks over the menu music.
- Replay-from-Story-log ALWAYS plays voice-only over the existing bed regardless of the original entry's music — `StoryModal` hard-codes `musicSrc: null` in replay mode (see `StoryModal.tsx#useEffect` `replay-from-log` branch).

Conventional pairings (what the existing entries do today):
- Cinematic intro: custom music + voice + delayed start (music establishes mood, voice comes in after `voiceDelayMs`).
- Mission/shop/system-cleared briefing: voice only (`musicTrack: null`, `voiceDelayMs: 0`) — the narrator rides on the menu/shop bed.

If the user hands you only a voice file, that is a valid story entry — set `musicTrack: null` and pick a briefing template. Don't ask for a music file you don't need.

# Body vs logSummary — two parallel text fields

Every entry has two text fields with different jobs:

- **`body`** — the SPOKEN text. What Grandma reads aloud in the cinematic / overlay narration. Keep it short and sentence-clean so it breathes when spoken. Each string is a paragraph in `StoryModal`.
- **`logSummary`** — the WRITTEN deeper synopsis surfaced in the Story log list (`StoryListModal`). Can go further than the spoken track: lore, context, foreshadowing, what's at stake, who's involved. Each string is a paragraph in the list row. 2–4 paragraphs, ~80–150 words total is the sweet spot.

The two fields are independent. A short overlay briefing might have a 1-paragraph `body` and a 3-paragraph `logSummary`. The user explicitly wants the written synopsis to be MORE extensive than the audio — don't shrink `logSummary` to match `body`.

# Narrator persona — Grandma

Every spoken line in the game is read by the **same** in-character narrator: **Grandma**. She's the warm-but-no-nonsense voice of the entire storyline (cinematics, mission briefings, shop welcomes, system-cleared idle voice, item-acquisition cues — all of it). When you write a new story entry's `body` text, write it as something Grandma would say out loud: friendly tone, clear sentences that read well aloud, no UI jargon, no "click here" instructions. The TTS pipeline (Chatterbox in `MikkoNumminen/AudiobookMaker`) is keyed to one voice profile; consistency is intentional and helps the player recognize narrative beats vs system noise.

`logSummary` text is read silently by the player, so it has more freedom — denser sentences, longer paragraphs, callbacks to other entries. But keep the voice consistent: still warm-but-no-nonsense, still tongue-in-cheek potato-fights-bugs.

# Surface map

| Concern | Where it lives |
|---|---|
| Catalog | [src/game/data/story.ts](src/game/data/story.ts) — `STORY_ENTRIES` array |
| Type union | `StoryId` in the same file (literal union, derived `STORY_IDS` array via `.map`) |
| Trigger union | `StoryAutoTrigger` in the same file |
| Cinematic popup | `src/components/story/StoryModal.tsx` (renders `body` paragraphs) |
| Story log list | `src/components/story/StoryListModal.tsx` (renders `title` + `logSummary` paragraphs) |
| Audio engine | [src/game/audio/story.ts](src/game/audio/story.ts) — generic `play({ musicSrc, voiceSrc, voiceDelayMs })` |
| Auto-fire — first-time | `src/components/GameCanvas.tsx` `useEffect` scanning for unseen `first-time` |
| Auto-fire — on-mission-select | `GameCanvas#handleMissionSelect` (gated on `unlockedPlanets`) |
| Auto-fire — on-shop-open | `src/components/ShopUI.tsx` `useEffect` on mount |
| Auto-fire — on-system-cleared-idle | `GameCanvas` idle ticker |
| Persistence | `seenStoryEntries: StoryId[]` in `src/game/state/stateCore.ts`. Hydrate sanitises via `isKnownStoryId` — unknown ids drop silently. |
| DB column | `seen_story_entries TEXT[]` (added in `db/migrations/20260429000000_add_seen_story_entries.sql`) — column already covers any number of ids, no migration needed for content adds/removes. |
| Audio assets | `public/audio/story/<storyId>-voice.{mp3\|ogg}` and `public/audio/story/<storyId>-music.{ogg\|mp3}` |

# Inputs the user must provide

Ask once, in a single message, for any missing fields:

1. `storyId` — kebab-case, unique. Must NOT collide with existing ids in `STORY_ENTRIES`.
2. `title` — short display title shown above the body in `StoryModal` and as the row heading in `StoryListModal`.
3. `body` — one or more paragraphs of SPOKEN narration. Each paragraph becomes a `<p>` in the cinematic modal. Keep paragraphs short — they're meant to be read aloud.
4. **`logSummary`** (REQUIRED) — one or more paragraphs of WRITTEN synopsis, shown in the Story log list. Goes deeper than the spoken `body`: lore, context, what's at stake. 2–4 paragraphs, ~80–150 words total.
5. **Voice asset** (REQUIRED) — local file path for the voiceover. Will be copied into `public/audio/story/<storyId>-voice.mp3`. Prefer `.mp3`; `.ogg` is acceptable. Must be < 500 KB to honor the asset budget in CLAUDE.md §13.
6. **Music asset** (OPTIONAL — omit for briefings) — local file path. Will be copied into `public/audio/story/<storyId>-music.ogg`. Prefer `.ogg`; `.mp3` is acceptable. Same < 500 KB budget. If the user does not hand you a music file, set `musicTrack: null` in the entry and skip the music copy step — DO NOT prompt them for a music file they don't have.
7. `voiceDelayMs` — milliseconds to wait after `play()` before voice starts. Use `3000` for cinematic intros (lets the music bed establish mood). Use `0` for voice-only briefings. Default `3000` if the entry has music, `0` if it doesn't.
8. `autoTrigger` — one of:
   - `null` — replay-only via the Story log; never auto-fires.
   - `{ kind: "first-time" }` — fires on the player's first galaxy-view load. Only ONE entry can usefully carry this; the firing loop picks the first unseen `first-time` entry.
   - `{ kind: "on-mission-select", missionId: <MissionId> }` — fires once when the named mission's quest card is opened, gated on `unlockedPlanets` (locked "?" cards never fire).
   - `{ kind: "on-shop-open" }` — fires every time the player lands on `/shop` (any shop). Audio plays unconditionally; only the seen-set marking is once-only.
   - `{ kind: "on-system-cleared-idle", systemId: <SolarSystemId>, initialDelayMs: <ms>, intervalMs: <ms> }` — fires repeatedly while the player idles in the named system AND every combat mission in that system has been completed.
   - Anything else → STOP and flag (see boundary).
9. `mode` — one of:
   - `"modal"` — cinematic popup, ducks the menu bed (when music is set), Continue button. Default for big story beats with text the player should read.
   - `"overlay"` — voice plays on top of the menu bed, NO popup, no music change. Use for short briefings where the audio carries the narrative. Set `musicTrack: null` (the menu bed is already playing). Replay from the Story log still opens the modal so body text + voice are accessible.

# Templates — pick one and fill it in

The four shapes that ship today. Match the user's intent to one and fill it in instead of building from scratch.

**A. Cinematic intro / chapter card** — modal popup, custom music, voice on top, fires once for new players.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<paragraph 1 — spoken aloud>", "<paragraph 2 — spoken aloud>"],
  logSummary: [
    "<paragraph 1 — written synopsis, sets the scene>",
    "<paragraph 2 — what's happening, what's at stake>",
    "<paragraph 3 — foreshadowing or hook>"
  ],
  musicTrack: "/audio/story/<storyId>-music.ogg",
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 3000,
  autoTrigger: { kind: "first-time" },
  mode: "modal"
}
```

**B. Mission briefing** — voice-only overlay, fires when the player selects a specific mission card.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<single short spoken paragraph>"],
  logSummary: [
    "<paragraph 1 — what the location is, why it matters>",
    "<paragraph 2 — threat profile, what to watch for>",
    "<paragraph 3 — what success looks like>"
  ],
  musicTrack: null,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 0,
  autoTrigger: { kind: "on-mission-select", missionId: "<missionId>" },
  mode: "overlay"
}
```

**C. Shop welcome / dock briefing** — voice-only overlay, fires every time the player docks at a shop.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<single short spoken paragraph>"],
  logSummary: [
    "<paragraph 1 — what the station is, who runs it>",
    "<paragraph 2 — what's stocked, the tone of the place>"
  ],
  musicTrack: null,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 0,
  autoTrigger: { kind: "on-shop-open" },
  mode: "overlay"
}
```

**D. System-cleared idle / chapter close** — voice-only overlay, fires repeatedly while the player idles in a fully-cleared system.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<single short reflective spoken paragraph>"],
  logSummary: [
    "<paragraph 1 — what was won, what's now quiet>",
    "<paragraph 2 — reflection on the cost / the journey>",
    "<paragraph 3 — hook to the next system>"
  ],
  musicTrack: null,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 0,
  autoTrigger: {
    kind: "on-system-cleared-idle",
    systemId: "<solarSystemId>",
    initialDelayMs: 5000,
    intervalMs: 30000
  },
  mode: "overlay"
}
```

# Operation: CREATE

## Steps
1. Read `src/game/data/story.ts` to confirm the new id is unique.
2. Confirm the supplied asset files exist on the user's disk and are each under 500 KB. If oversized, ask the user to re-encode (e.g. `ffmpeg -i in.wav -c:a libvorbis -q:a 4 out.ogg` for music, `ffmpeg -i in.wav -c:a libmp3lame -q:a 5 out.mp3` for voice). Voice is required; music is optional.
3. Copy assets into place using `Bash` + `cp` (do NOT use `Write`, these are binaries):
   - ALWAYS: `public/audio/story/<storyId>-voice.mp3` (or `.ogg` if user supplied that).
   - ONLY IF the user supplied music: `public/audio/story/<storyId>-music.ogg` (or `.mp3` if user supplied that).
4. Edit `src/game/data/story.ts`:
   - Extend the `StoryId` type union with the new literal (in narrative order).
   - Append the new `StoryEntry` to `STORY_ENTRIES` using one of the four templates, filled with the user's content. Both `body` and `logSummary` are required.
5. Run `npm run typecheck && npm run lint && npm test` and fix any failures.
6. Report back: the new story id, the asset paths actually written (voice always; music only if applicable), the trigger kind, and how the player will see it (auto on next galaxy load / next mission select / next shop dock / next idle in cleared system / replay-only via user menu).

# Operation: MODIFY

## Text-only edit (title, body, logSummary, voiceDelayMs, mode)
Single-edit operations in `src/game/data/story.ts`. No asset work, no schema changes. Run `npm run typecheck && npm run lint && npm test` after.

If the user only wants to expand the `logSummary` (the most common modify request given the field is new), edit just that array — leave `body` alone unless they explicitly ask. The two fields have different jobs (see "Body vs logSummary" above).

## Audio replacement (voice or music re-record)
1. Confirm the new file is < 500 KB. Re-encode if needed.
2. Overwrite the existing file at `public/audio/story/<storyId>-voice.{mp3|ogg}` (or `-music.{ogg|mp3}`) using `Bash` + `cp`.
3. The entry's `voiceTrack` / `musicTrack` path field stays the same — only the file content changes.
4. NO DB migration needed. Players' next page load gets the new audio (HTTP cache permitting; in development, hard-refresh).

## Auto-trigger change
1. Edit only the `autoTrigger` field on the existing entry. Keep within the supported union (see boundary section).
2. If the entry was previously seen by players (already in their `seenStoryEntries`), changing the trigger does NOT re-fire it — the seen-set is keyed on `id`, not trigger. If the user wants the new trigger to actually fire for existing players, they need to either (a) accept that only NEW players see it auto-fire, or (b) ship a one-shot client routine that drops the id from seen-sets. Option (b) is a feature, not a content tweak; flag it.
3. Run `npm run typecheck && npm run lint && npm test`.

## Adding logSummary to an existing entry
Already done (every shipped entry has one). If you find an entry missing `logSummary`, that's a contract violation — `StoryEntry.logSummary` is REQUIRED. The compiler will catch it at typecheck time.

# Operation: REMOVE

Removing a story entry is mostly safe because `seenStoryEntries` migration silently drops unknown ids on hydrate via `isKnownStoryId`. Existing players' saves stay valid. The danger is hard-coded references to specific story ids in code or tests.

## Hard-coded references (must clean up)

| File | What it references | What breaks if you remove |
|---|---|---|
| `src/app/api/save/route.test.ts` (lines 102, 116) | `"great-potato-awakening"` (used as a test fixture for the seen_story_entries roundtrip) | Test fails. If you remove `great-potato-awakening`, replace the fixture with another known story id, OR remove the assertion entirely if no entry is left to test with. |

That's it today. Story ids do NOT appear in the data layer's mission/weapon/perk/enemy catalogs, in `lootPools.ts`, in the auth/save guards, or in any user-facing component (all components iterate `STORY_ENTRIES` generically). Every other reference is inside `story.ts` itself.

## Steps

1. **Grep for the literal id string** across the entire `src/` tree to catch anything new since the last skill update: `grep -rn '"<id-being-removed>"' src/`. The table above lists today's references.
2. For each reference outside `story.ts`, replace with another known story id or delete the test/fixture.
3. Remove the entry from `STORY_ENTRIES` in `src/game/data/story.ts`.
4. Remove the id from the `StoryId` union literal in the same file. The derived `STORY_IDS` array updates automatically.
5. (Optional) Delete `public/audio/story/<storyId>-voice.{mp3|ogg}` and `-music.{ogg|mp3}` if they exist. Leaving them is harmless but keeps the directory tidy.
6. Run `npm run typecheck && npm run lint && npm test`. The test in `route.test.ts` is the canary; if it still references the removed id, it'll fail.
7. Note for the user: existing players' `seenStoryEntries` may still contain the removed id — `isKnownStoryId` filters it out on hydrate, so it's harmless. No DB migration needed.

# Invariants this skill enforces

## Across all operations
- `StoryId` union literal in `src/game/data/story.ts` includes exactly the ids present in `STORY_ENTRIES` (the derived `STORY_IDS = STORY_ENTRIES.map(...)` is the parity guard; `getStoryEntry` throws on unknown ids).
- No `any` types introduced. No new comments unless explaining a non-obvious why.
- `npm run typecheck && npm test` passes.

## CREATE-specific
- New `storyId` is unique across `STORY_ENTRIES`.
- `body` is non-empty (≥ 1 paragraph).
- `logSummary` is non-empty (≥ 1 paragraph; 2–4 recommended for proper Story log presence).
- `voiceTrack` is non-null, starts with `/audio/story/`, AND the file exists at the corresponding path under `public/`.
- If `musicTrack !== null`: it starts with `/audio/story/` AND the file exists. If `musicTrack === null`: no music asset is referenced or copied.
- `voiceDelayMs >= 0`. Use `0` when `musicTrack === null`; use `~3000` when there's music to establish first.
- Asset files are each < 500 KB (CLAUDE.md §13 asset budget).
- At most one entry has `autoTrigger.kind === "first-time"` set at a time (soft rule — multiple such entries cascade across consecutive sessions in unintended ways).
- `autoTrigger` is one of the five currently-supported shapes. Anything else is a feature, not a content add.

## MODIFY-specific
- Audio replacements keep the same path; only file content changes.
- Trigger changes don't unseen the entry for existing players (seen-set is id-keyed).

## REMOVE-specific
- Every hard-coded reference (see table) is updated or deleted.
- The `route.test.ts` fixture still references a known story id after the change, OR the assertion is rewritten.

# Files this skill modifies / creates / never touches

## Always modifies
- `src/game/data/story.ts` — `StoryEntry` entries, `StoryId` union.

## Modifies for asset work (CREATE / audio MODIFY)
- `public/audio/story/<storyId>-voice.{mp3|ogg}` — voiceover.
- `public/audio/story/<storyId>-music.{ogg|mp3}` — story music bed (only when `musicTrack !== null`).

## Modifies for REMOVE cleanup
- `src/app/api/save/route.test.ts` — only if the removed id appears as a test fixture (currently only `great-potato-awakening`).

## Does NOT touch
- `src/components/story/StoryModal.tsx` — cinematic popup is fully data-driven from `StoryEntry`.
- `src/components/story/StoryListModal.tsx` — Story log filters `STORY_ENTRIES` by `seenStoryEntries` and renders generically (title + logSummary).
- `src/game/audio/story.ts` — audio engine is generic; new entries plug in via `play({ musicSrc, voiceSrc, voiceDelayMs })`.
- `src/game/state/stateCore.ts` / `persistence.ts` — `seenStoryEntries` is `StoryId[]` and gets sanitised via `isKnownStoryId` on hydrate; unknown ids drop silently.
- `src/lib/schemas/save.ts` — `seenStoryEntries: z.array(z.string())` is intentionally permissive at the wire boundary; the `isKnownStoryId` filter in hydrate is the validation layer.
- `db/migrations/` — the `seen_story_entries TEXT[]` column already covers any number of ids; no migration needed for content adds OR removes.
- `src/components/GameCanvas.tsx` / `src/components/ShopUI.tsx` — auto-fire `useEffect`s scan `STORY_ENTRIES` generically. Only modify if the user requested a NEW trigger kind (see boundary).
