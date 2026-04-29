---
name: new-story
description: Add anything to the in-game Story log — new narrative beat, cinematic intro, voiceover, chapter, lore entry, or any combo of music + voice + popup text. Scaffolds the StoryId union, STORY_ENTRIES entry, and music + voice assets in one shot.
---

# When to use
**Invoke this skill for ANY request that adds, introduces, or extends story content in the game.** The Story system is the only narrative surface in the codebase, so any of the following phrasings should route here:
- explicit slash: "/new-story"
- "add a story", "add a new story", "add a story entry", "add a chapter"
- "add a cinematic", "add an intro cinematic", "add a cutscene", "add a narrative beat"
- "add a voiceover", "add a voice line for X", "add narration"
- "add lore", "add a lore entry", "add a backstory snippet"
- "add a popup that tells…", "show a story popup when…"
- "make a new story for X" / "the player should see a story when X happens"
- any sentence that combines a snippet of narrative text with a music or voice asset path

If the user's request mentions the Story log, story popup, narrative, cinematic, voiceover, or hands you a music/voice file alongside some prose — invoke this skill rather than re-deriving the contract.

Do NOT use for:
- Tweaking an existing story's text, music, or voice — edit `src/game/data/story.ts` and the asset file directly.
- Adjusting the cinematic UI itself (modal styling, fade timing, etc.) — those live in `src/components/story/StoryModal.tsx` and `src/game/audio/story.ts`.
- Adding a genuinely NEW auto-trigger kind (e.g. "after boss-1 cleared", "on first perk pickup", "when entering a specific solar system"). The current `StoryAutoTrigger` union supports `first-time`, `on-mission-select`, `on-shop-open`, and `on-system-cleared-idle`; anything else requires a new variant in the union AND a matching firing site (a `useEffect` somewhere that scans `STORY_ENTRIES` for the new kind and calls `storyAudio.play` / opens the modal). That's a feature, not a content addition. STOP and flag this to the user instead of silently inventing a new kind.

# Audio shape — music is optional, voice is required
Every entry MUST carry a voice track. The music track is optional and the runtime explicitly handles `musicTrack: null`:
- `storyAudio.play({ musicSrc: null, voiceSrc, voiceDelayMs })` skips creating the music HTMLAudioElement entirely — the voice plays solo over whatever ambient bed (menu, shop, galaxy) is already running.
- `StoryModal` (the popup) only ducks the menu bed when `entry.musicTrack !== null`. A modal with `musicTrack: null` sits on top of the existing bed without changing it — the narrator just speaks over the menu music.
- Replay-from-Story-log ALWAYS plays voice-only over the existing bed regardless of the original entry's music — `StoryModal` hard-codes `musicSrc: null` in replay mode (see `StoryModal.tsx#useEffect` `replay-from-log` branch).

Conventional pairings (what the existing entries do today):
- Cinematic intro: custom music + voice + delayed start (music establishes mood, voice comes in after `voiceDelayMs`).
- Mission/shop briefing: voice only (`musicTrack: null`, `voiceDelayMs: 0`) — the narrator rides on the menu/shop bed.

If the user hands you only a voice file, that is a valid story entry — set `musicTrack: null` and pick the briefing pattern below. Don't ask for a music file you don't need.

# Narrator persona — Grandma
Every spoken line in the game is read by the **same** in-character narrator: **Grandma**. She's the warm-but-no-nonsense voice of the entire storyline (cinematics, mission briefings, shop welcomes, system-cleared idle voice, item-acquisition cues — all of it). When you write a new story entry's `body` text, write it as something Grandma would say out loud: friendly tone, clear sentences that read well aloud, no UI jargon, no "click here" instructions. The TTS pipeline (Chatterbox in `MikkoNumminen/AudiobookMaker`) is keyed to one voice profile; consistency is intentional and helps the player recognize narrative beats vs system noise. If the user hands you a script that breaks Grandma's voice (clinical/sci-fi-jargon-heavy/multiple speakers), gently flag it before you ship — better to refine the script than ship inconsistent narration.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `storyId` — kebab-case, unique. Must NOT collide with existing ids in `src/game/data/story.ts` (`STORY_ENTRIES`).
2. `title` — display title shown above the body text in `StoryModal`.
3. `body` — one or more paragraphs of narration. Each paragraph becomes a `<p>` in the modal. Keep paragraphs short — the modal is a fixed-width 36rem panel.
4. **Voice asset** (REQUIRED) — local file path for the voiceover. Will be copied into `public/audio/story/<storyId>-voice.mp3`. Prefer `.mp3`; `.ogg` is acceptable. Must be < 500 KB to honor the asset budget in CLAUDE.md §13.
5. **Music asset** (OPTIONAL — omit for briefings) — local file path the user has on disk (typically under `C:\Users\<user>\Downloads\`). Will be copied into `public/audio/story/<storyId>-music.ogg`. Prefer `.ogg`; `.mp3` is acceptable. Same < 500 KB budget. If the user does not hand you a music file, set `musicTrack: null` in the entry and skip the music copy step — DO NOT prompt them for a music file they don't have. Briefing-style entries (overlay mode, on-mission-select, on-shop-open) typically have no music.
6. `voiceDelayMs` — milliseconds to wait after `play()` is called before voice starts. Use `3000` for cinematic intros so the music bed has time to establish mood. Use `0` for voice-only briefings (no bed to wait for). Default `3000` if the entry has music, `0` if it doesn't.
7. `autoTrigger` — one of:
   - `null` — replay-only; appears in the Story log once unlocked but never auto-fires. Use this for retrospectives or chapter recaps.
   - `{ kind: "first-time" }` — auto-fires on the player's first galaxy-view load if they haven't seen it. Currently only ONE entry can usefully carry this — the firing loop in `GameCanvas.tsx#useEffect` picks the first unseen `first-time` entry, so two such entries cascade across two consecutive sessions which is rarely the intended UX.
   - `{ kind: "on-mission-select", missionId: <MissionId> }` — auto-fires once the first time that mission's quest card is opened, GATED ON THE MISSION BEING UNLOCKED (locked "?" cards never trigger their briefing — `GameCanvas#handleMissionSelect` checks `unlockedPlanets`). Auto-expansion of the suggested card counts as a selection; the seen-set guards re-fires. Use for short briefings tied to a specific mission.
   - `{ kind: "on-shop-open" }` — auto-fires EVERY time the player lands on the `/shop` page (any shop). The seen-set is consulted only to decide whether to mark seen + save on the first dock — the audio plays unconditionally on every mount so returning players still get the welcome line. Wired in `ShopUI.tsx#useEffect`. Currently shop-id-agnostic — extend the variant with a `missionId` field if a specific shop needs its own briefing.
   - `{ kind: "on-system-cleared-idle", systemId: <SolarSystemId>, initialDelayMs: <ms>, intervalMs: <ms> }` — auto-fires repeatedly while the player idles in the named solar system AND every combat mission in that system has been completed. First fire after `initialDelayMs`, then loops every `intervalMs`. Cancels the moment the player opens the shop / Story log / a story modal, or warps to a different system. Wired in `GameCanvas.tsx#useEffect` (idle ticker). Existing usage: `sol-spudensis-cleared` with 5000ms initial + 20000ms interval.
   - If the user wants any OTHER trigger (e.g. "after boss-1 is cleared", "on first perk pickup", "when entering tubernovae system"), STOP — it requires a new variant in the `StoryAutoTrigger` union plus matching firing logic in a `useEffect` somewhere. Flag this to the user; do not silently invent a new kind.
8. `mode` — one of:
   - `"modal"` — cinematic popup, ducks the menu bed, plays its own music + voice. Default for big story beats with body text the player should read.
   - `"overlay"` — voice plays on top of the menu bed, NO popup, no music change. Use for short briefings where the audio carries the narrative and a popup would be intrusive. Set `musicTrack: null` for overlay entries since the bed is already playing. Replay from the Story log still opens the modal so body text + voice are accessible.

# Templates — pick one and fill it in
The four shapes that actually ship today. Match the user's intent to one and use it as your starting point instead of building from scratch.

**A. Cinematic intro / chapter card** — modal popup, custom music, voice on top, fires once for new players.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<paragraph 1>", "<paragraph 2>"],
  musicTrack: "/audio/story/<storyId>-music.ogg",
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 3000,
  autoTrigger: { kind: "first-time" },
  mode: "modal"
}
```

**B. Mission briefing** — voice-only overlay, fires when the player selects a specific mission card. No popup, narrator rides on the menu bed.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<single short paragraph>"],
  musicTrack: null,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 0,
  autoTrigger: { kind: "on-mission-select", missionId: "<missionId>" },
  mode: "overlay"
}
```

**C. Shop welcome** — voice-only overlay, fires every time the player docks at any shop.
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<single short paragraph>"],
  musicTrack: null,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 0,
  autoTrigger: { kind: "on-shop-open" },
  mode: "overlay"
}
```

**D. Replay-only entry** — never auto-fires; sits in the Story log once unlocked through some other means (currently no other unlock path is wired up, so prefer A/B/C and ask before shipping a D-shape entry).
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<paragraph 1>", "<paragraph 2>"],
  musicTrack: "/audio/story/<storyId>-music.ogg" /* or null */,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 3000 /* or 0 if no music */,
  autoTrigger: null,
  mode: "modal"
}
```

# Steps
1. Read `src/game/data/story.ts` to confirm the new id is unique.
2. Confirm the supplied asset files exist on the user's disk and are each under 500 KB. If oversized, ask the user to re-encode (e.g. `ffmpeg -i in.wav -c:a libvorbis -q:a 4 out.ogg` for music, `ffmpeg -i in.wav -c:a libmp3lame -q:a 5 out.mp3` for voice). Voice is required; music is optional.
3. Copy assets into place using `Bash` + `cp` (do NOT use `Write`, these are binaries):
   - ALWAYS: `public/audio/story/<storyId>-voice.mp3` (or `.ogg` if user supplied that).
   - ONLY IF the user supplied music: `public/audio/story/<storyId>-music.ogg` (or `.mp3` if user supplied that). Skip this entirely for briefing-style entries with `musicTrack: null`.
4. Edit `src/game/data/story.ts`:
   - Extend the `StoryId` type union with the new literal (alphabetical or narrative order, whichever fits the existing pattern).
   - Append a new `StoryEntry` to `STORY_ENTRIES` using one of the four templates above, filled in with the user's content. Order array entries by intended narrative sequence (the Story log `StoryListModal` filters by seen-set but renders in array order).
5. Run `npm run typecheck && npm run lint && npm test` and fix any failures.
6. Report back: the new story id, the asset paths actually written (voice always; music only if applicable), the trigger kind, and how the player will see it (auto on next galaxy load / next mission select / next shop dock / replay-only via user menu).

# Invariants this skill enforces
- New `storyId` is unique across `STORY_ENTRIES`.
- `StoryId` union literal in `src/game/data/story.ts` includes the new id (the `getStoryEntry` lookup throws on unknown ids — TypeScript catches drift at compile time via `STORY_IDS: readonly StoryId[] = STORY_ENTRIES.map(...)`).
- `voiceTrack` is non-null, starts with `/audio/story/`, AND the file exists at the corresponding path under `public/`.
- If `musicTrack !== null`: it starts with `/audio/story/` AND the file exists. If `musicTrack === null`: no music asset is referenced or copied.
- `voiceDelayMs >= 0`. Use `0` when `musicTrack === null` (nothing to wait for); use `~3000` when there's music to establish first.
- Asset files are each < 500 KB (CLAUDE.md §13 asset budget — heavy assets go to object storage, not `public/`).
- At most one entry has `autoTrigger.kind === "first-time"` set at a time (soft rule — multiple such entries technically work but cascade in unintended ways).
- `autoTrigger` is one of the five currently-supported shapes: `null`, `{kind: "first-time"}`, `{kind: "on-mission-select", missionId}`, `{kind: "on-shop-open"}`, `{kind: "on-system-cleared-idle", systemId, initialDelayMs, intervalMs}`. Anything else is a feature, not a content add.
- No `any` types introduced. No new comments unless explaining a non-obvious why.
- `npm run typecheck && npm test` passes after the change.

# Files this skill modifies / creates
Modifies:
- `src/game/data/story.ts` — extend `StoryId` union; append `STORY_ENTRIES` entry.

Creates (always):
- `public/audio/story/<storyId>-voice.{mp3|ogg}` — voiceover (single-shot, plays after `voiceDelayMs`).

Creates (only if the entry has its own music — `musicTrack !== null`):
- `public/audio/story/<storyId>-music.{ogg|mp3}` — story music bed (loops while modal is open).

Does NOT touch:
- `src/components/story/StoryModal.tsx` — the cinematic popup is fully data-driven from `StoryEntry`.
- `src/components/story/StoryListModal.tsx` — the Story log filters `STORY_ENTRIES` by the player's `seenStoryEntries` set and renders generically.
- `src/game/audio/story.ts` — the audio engine (StoryAudio singleton) is generic; new entries plug in via `play({ musicSrc, voiceSrc, voiceDelayMs })`.
- `src/game/state/stateCore.ts` / `persistence.ts` — `seenStoryEntries` is a generic `StoryId[]` and gets sanitized via `isKnownStoryId` on hydrate; unknown ids drop silently.
- `src/lib/schemas/save.ts` — `seenStoryEntries: z.array(z.string())` is intentionally permissive at the wire boundary; the `isKnownStoryId` filter in hydrate is the validation layer.
- `db/migrations/` — the `seen_story_entries TEXT[]` column added in `20260429000000_add_seen_story_entries.sql` already covers any number of story ids.
- `src/components/GameCanvas.tsx` — the auto-fire loop scans `STORY_ENTRIES` for the first unseen `first-time` entry; new entries plug in automatically. Only modify if the user requested a NEW trigger kind (see step "autoTrigger" above).
