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
- Adding a NEW trigger kind such as "fire after mission X complete" — the StoryEntry trigger union currently only supports `null` and `{ kind: "first-time" }`. Extending it requires a code change in both `story.ts` (union variant) AND `GameCanvas.tsx` (firing loop), which is a feature, not a content addition. STOP and flag this to the user instead of silently inventing a new trigger kind.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `storyId` — kebab-case, unique. Must NOT collide with existing ids in `src/game/data/story.ts` (`STORY_ENTRIES`).
2. `title` — display title shown above the body text in `StoryModal`.
3. `body` — one or more paragraphs of narration. Each paragraph becomes a `<p>` in the modal. Keep paragraphs short — the modal is a fixed-width 36rem panel.
4. **Music asset** — local file path the user has on disk (typically under `C:\Users\<user>\Downloads\`). Will be copied into `public/audio/story/<storyId>-music.ogg`. Prefer `.ogg`; `.mp3` is acceptable. Must be < 500 KB to honor the asset budget in CLAUDE.md §13.
5. **Voice asset** — local file path for the voiceover. Will be copied into `public/audio/story/<storyId>-voice.mp3`. Prefer `.mp3`; `.ogg` is acceptable. Same < 500 KB budget.
6. `voiceDelayMs` — milliseconds to wait after music starts before voice plays (so the bed establishes mood before narration). Default `3000` if the user does not say.
7. `autoTrigger` — one of:
   - `null` — replay-only; appears in the Story log once unlocked but never auto-fires. Use this for retrospectives or chapter recaps.
   - `{ kind: "first-time" }` — auto-fires on the player's first galaxy-view load if they haven't seen it. Currently only ONE entry can usefully carry this — the firing loop in `GameCanvas.tsx#useEffect` picks the first unseen `first-time` entry, so two such entries cascade across two consecutive sessions which is rarely the intended UX.
   - `{ kind: "on-mission-select", missionId: <MissionId> }` — auto-fires once the first time that mission's quest card is opened (auto-expansion of the suggested card counts as a selection; the seen-set guards re-fires). Use for short briefings tied to a specific mission.
   - If the user wants any OTHER trigger (e.g. "after boss-1 cleared", "on first dock at the Market"), STOP — it requires a new variant in the `StoryAutoTrigger` union plus matching firing logic in `GameCanvas.tsx`. Flag this to the user; do not silently invent a new kind.
8. `mode` — one of:
   - `"modal"` — cinematic popup, ducks the menu bed, plays its own music + voice. Default for big story beats with body text the player should read.
   - `"overlay"` — voice plays on top of the menu bed, NO popup, no music change. Use for short briefings where the audio carries the narrative and a popup would be intrusive. Set `musicTrack: null` for overlay entries since the bed is already playing. Replay from the Story log still opens the modal so body text + voice are accessible.

# Steps
1. Read `src/game/data/story.ts` to confirm the new id is unique.
2. Confirm both asset files exist on the user's disk and are under 500 KB. If oversized, ask the user to re-encode (e.g. `ffmpeg -i in.wav -c:a libvorbis -q:a 4 out.ogg` for music, `ffmpeg -i in.wav -c:a libmp3lame -q:a 5 out.mp3` for voice).
3. Copy both assets into place:
   - `public/audio/story/<storyId>-music.ogg` (or `.mp3` if user supplied that)
   - `public/audio/story/<storyId>-voice.mp3` (or `.ogg` if user supplied that)
   Use the `Bash` tool with `cp` — do NOT use `Write`, since these are binaries.
4. Edit `src/game/data/story.ts`:
   - Extend the `StoryId` type union with the new literal: `export type StoryId = "great-potato-awakening" | "<new-id>";`
   - Append a new `StoryEntry` to `STORY_ENTRIES` matching the canonical shape:
     ```ts
     {
       id: "<storyId>",
       title: "<title>",
       body: ["<paragraph 1>", "<paragraph 2>"],
       musicTrack: "/audio/story/<storyId>-music.ogg" | null, // null for overlay
       voiceTrack: "/audio/story/<storyId>-voice.mp3",
       voiceDelayMs: <voiceDelayMs>,
       autoTrigger: null | { kind: "first-time" } | { kind: "on-mission-select", missionId: "<id>" },
       mode: "modal" | "overlay"
     }
     ```
   - Order entries by intended narrative sequence (the Story log `StoryListModal` filters by seen-set but renders in array order).
5. Run `npm run typecheck && npm run lint && npm test` and fix any failures.
6. Report back: the new story id, the asset paths, whether `autoTrigger` is set, and a one-liner reminder that the player needs to either (a) be a fresh save for the auto-fire path, or (b) hit the user-menu Story log to replay it.

# Invariants this skill enforces
- New `storyId` is unique across `STORY_ENTRIES`.
- `StoryId` union literal in `src/game/data/story.ts` includes the new id (the `getStoryEntry` lookup throws on unknown ids — TypeScript catches drift at compile time via `STORY_IDS: readonly StoryId[] = STORY_ENTRIES.map(...)`).
- `musicTrack` starts with `/audio/story/` AND the file exists at the corresponding path under `public/`.
- `voiceTrack` starts with `/audio/story/` AND the file exists at the corresponding path under `public/`.
- `voiceDelayMs >= 0`.
- Asset files are each < 500 KB (CLAUDE.md §13 asset budget — heavy assets go to object storage, not `public/`).
- At most one entry has `autoTrigger.kind === "first-time"` set at a time (soft rule — multiple such entries technically work but cascade in unintended ways).
- No `any` types introduced. No new comments unless explaining a non-obvious why.
- `npm run typecheck && npm test` passes after the change.

# Files this skill modifies / creates
Modifies:
- `src/game/data/story.ts` — extend `StoryId` union; append `STORY_ENTRIES` entry.

Creates:
- `public/audio/story/<storyId>-music.{ogg|mp3}` — story music bed (loops while modal is open).
- `public/audio/story/<storyId>-voice.{mp3|ogg}` — voiceover (single-shot, plays after `voiceDelayMs`).

Does NOT touch:
- `src/components/story/StoryModal.tsx` — the cinematic popup is fully data-driven from `StoryEntry`.
- `src/components/story/StoryListModal.tsx` — the Story log filters `STORY_ENTRIES` by the player's `seenStoryEntries` set and renders generically.
- `src/game/audio/story.ts` — the audio engine (StoryAudio singleton) is generic; new entries plug in via `play({ musicSrc, voiceSrc, voiceDelayMs })`.
- `src/game/state/stateCore.ts` / `persistence.ts` — `seenStoryEntries` is a generic `StoryId[]` and gets sanitized via `isKnownStoryId` on hydrate; unknown ids drop silently.
- `src/lib/schemas/save.ts` — `seenStoryEntries: z.array(z.string())` is intentionally permissive at the wire boundary; the `isKnownStoryId` filter in hydrate is the validation layer.
- `db/migrations/` — the `seen_story_entries TEXT[]` column added in `20260429000000_add_seen_story_entries.sql` already covers any number of story ids.
- `src/components/GameCanvas.tsx` — the auto-fire loop scans `STORY_ENTRIES` for the first unseen `first-time` entry; new entries plug in automatically. Only modify if the user requested a NEW trigger kind (see step "autoTrigger" above).
