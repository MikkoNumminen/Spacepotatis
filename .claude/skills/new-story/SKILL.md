---
name: new-story
description: Add, modify, or remove story content — cinematic popups, voiceovers, music beds, body text, written synopses, and auto-trigger wiring. Covers the full CRUD lifecycle for the Story log.
---

# When to use

Invoke for ANY request touching story content — adding, rewriting, retriggering, re-recording, or removing a beat. Story is the only narrative surface in the codebase.

## Triggers

- **Slash:** `/new-story`, `/edit-story`, `/story`
- **Create:** "add a story / chapter / cinematic / cutscene / voiceover / narration / lore / popup"; "show a story when X happens"
- **Modify:** "rewrite / edit / tweak / punch up / trim / extend the X synopsis | body | log summary"; "rerecord / regenerate / fix X's voice"; "swap X's music"; "make X auto-fire on Y"; "X feels too long / short / dry"
- **Remove:** "remove / delete / drop / scrap / rip out / kill / retire / disable / mute the X story | cinematic | briefing | voice"

If the request names a story id, uses any word in {Story log, cinematic, voiceover, narration, chapter, lore, synopsis, log summary, briefing} alongside an action verb, or expresses sentiment about an existing story, invoke this skill.

Renaming an entry's `id` is REMOVE + CREATE — see REMOVE.

## Boundary — STOP and flag

- **UI styling** of `StoryModal.tsx`, `StoryListModal.tsx`, or audio engine `story.ts`. Code task.
- **New `autoTrigger` kind** beyond the six listed below. Requires four coordinated edits: (a) variant in `StoryAutoTrigger` union in `src/game/data/story.ts`; (b) helper in `src/game/data/storyTriggers.ts` (mirror `selectFirstTimeEntry` / `selectOnSystemEnterEntry`); (c) firing site in `src/components/hooks/useStoryTriggers.ts`; (d) `describe` block in `src/game/data/storyTriggers.test.ts` covering fires-when-fresh, no-fire-when-seen, no-fire-when-auto-fired, no-fire-on-mismatch.
- **Restructuring `StoryEntry`** (new field, splitting `body`/`logSummary` semantics).
- **Master-mute or audio engine changes** in `story.ts` / `music.ts`.
- **DB / state-slice changes** (per-character `seenStoryEntries`, `seenAt` timestamp).

## Adjacent skills

- `/new-solar-system` just ran → likely wants `on-system-enter` cinematic (Template E) + `on-system-cleared-idle` close (Template D).
- `/new-mission` just ran → may want `on-mission-select` briefing (Template B).
- New shop planet → `on-shop-open` briefing (Template C). Trigger is shop-id-agnostic today; a second shop story replaces `market-arrival` or requires extending the trigger union with a `missionId`.

# Audio shape — voice required, music optional

- `musicTrack: null` → `storyAudio.play` skips the music element; voice plays solo over the existing bed (menu/shop/galaxy).
- `StoryModal` only ducks the menu bed when `musicTrack !== null`.
- Replay from Story log is ALWAYS voice-only over the existing bed (`StoryModal.tsx#useEffect` `replay-from-log` hard-codes `musicSrc: null`).

Pairings: cinematic = music + voice + `voiceDelayMs: 3000`. Briefing = `musicTrack: null` + `voiceDelayMs: 0`. If user gives only voice, that's valid — don't prompt for music.

# Body vs logSummary

Two parallel text fields, independent jobs:

- **`body`** — SPOKEN. What Grandma reads aloud. Short, sentence-clean, each string is a `<p>` in `StoryModal`.
- **`logSummary`** — WRITTEN deeper synopsis in `StoryListModal`. Lore, context, foreshadowing, stakes. 2–4 paragraphs, ~80–150 words. Designed to go further than `body` — don't shrink it to match.

# Narrator — Grandma

All voice in the game = one in-character narrator (Grandma), generated via Chatterbox in `MikkoNumminen/AudiobookMaker`. Write `body` as Grandma speaking aloud: warm-but-no-nonsense, friendly, no UI jargon, no "click here". `logSummary` is read silently — denser sentences OK, same voice.

# Surface map

| Concern | Where |
|---|---|
| Catalog | `src/game/data/story.ts` — `STORY_ENTRIES` |
| Type / trigger unions | `StoryId`, `StoryAutoTrigger` in same file (derived `STORY_IDS` via `.map`) |
| Cinematic popup | `src/components/story/StoryModal.tsx` (renders `body`) |
| Story log list | `src/components/story/StoryListModal.tsx` (renders `title` + `logSummary`) |
| Audio engine | `src/game/audio/story.ts` — `play({ musicSrc, voiceSrc, voiceDelayMs })` |
| Trigger helpers | `src/game/data/storyTriggers.ts` — `selectFirstTimeEntry`, `selectOnSystemEnterEntry`, `selectOnMissionSelectEntry`, `selectReadyClearedIdleEntries`; tested in `storyTriggers.test.ts` against real `STORY_ENTRIES` |
| Auto-fire (firstTime, onMissionSelect, onSystemEnter, onSystemClearedIdle) | `src/components/hooks/useStoryTriggers.ts` |
| Auto-fire (onShopOpen) | `src/components/ShopUI.tsx` `useEffect` on mount |
| Story-log replay bed | `src/game/audio/storyLogAudio.ts` — **hard-codes** `/audio/story/great-potato-awakening-music.ogg`. See REMOVE table. |
| Persistence | `seenStoryEntries: StoryId[]` in `src/game/state/stateCore.ts`; hydrate filters via `isKnownStoryId` |
| DB column | `seen_story_entries TEXT[]` (migration `20260429000000_add_seen_story_entries.sql`) — covers any size; no migration needed for content adds/removes |
| Audio assets | `public/audio/story/<storyId>-voice.{mp3\|ogg}`, `public/audio/story/<storyId>-music.{ogg\|mp3}` |

# Inputs to ask for (single message)

1. `storyId` — kebab-case, unique within `STORY_ENTRIES`.
2. `title` — heading for `StoryModal` and `StoryListModal` row.
3. `body` — array of SPOKEN paragraphs (each → `<p>`).
4. `logSummary` — REQUIRED array of WRITTEN paragraphs (2–4, ~80–150 words).
5. **Voice** — REQUIRED file path, < 500 KB. Will land at `public/audio/story/<storyId>-voice.mp3` (or `.ogg`).
6. **Music** — OPTIONAL. < 500 KB. Lands at `public/audio/story/<storyId>-music.ogg` (or `.mp3`). If absent, set `musicTrack: null` — don't prompt.
7. `voiceDelayMs` — `3000` if music present, `0` if not.
8. `autoTrigger`:
   - `null` — replay-only via Story log; never auto-fires. (Caveat: never reaches `seenStoryEntries`, so won't surface in the log unless something else marks it seen.)
   - `{ kind: "first-time" }` — first galaxy load. Firing loop picks the FIRST unseen `first-time` entry; ship at most one usefully.
   - `{ kind: "on-mission-select", missionId }` — fires once when the mission card opens; gated on `unlockedPlanets`.
   - `{ kind: "on-shop-open" }` — fires every time the player lands on `/shop` (any shop); audio replays unconditionally, seen-set marks once.
   - `{ kind: "on-system-enter", systemId, repeatable? }` — fires on first warp into the system. Pairs with `mode: "modal"` + custom music. Optional `repeatable: true` re-fires the cinematic every time the player transitions into the system (in-session `autoFired` still gates so it can't loop while idle in-system); leave unset / false for once-ever default. Shipping `repeatable: true` to players means they re-watch the chapter on every warp — fine for short beats, tedious for 30s+ chapters.
   - `{ kind: "on-system-cleared-idle", systemId, initialDelayMs, intervalMs }` — repeats while idling in fully-cleared system; cancels on shop / Story log / story modal / system warp.
   - Anything else → STOP (see boundary).
9. `mode`:
   - `"modal"` — popup, ducks menu bed when music set, Continue button. Default for big beats.
   - `"overlay"` — voice over existing bed, no popup. Set `musicTrack: null`. Replay still opens the modal.

# Templates

A–E ship today; F is reserved for future replay-only/lore drops.

**A. Cinematic intro (`first-time`, modal, music + voice)**
```ts
{
  id: "<storyId>",
  title: "<Title>",
  body: ["<spoken 1>", "<spoken 2>"],
  logSummary: ["<scene>", "<stakes>", "<hook>"],
  musicTrack: "/audio/story/<storyId>-music.ogg",
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 3000,
  autoTrigger: { kind: "first-time" },
  mode: "modal"
}
```

**B. Mission briefing (`on-mission-select`, overlay, voice-only)**
```ts
{
  id: "<storyId>", title: "<Title>",
  body: ["<single spoken paragraph>"],
  logSummary: ["<location>", "<threat>", "<success>"],
  musicTrack: null,
  voiceTrack: "/audio/story/<storyId>-voice.mp3",
  voiceDelayMs: 0,
  autoTrigger: { kind: "on-mission-select", missionId: "<missionId>" },
  mode: "overlay"
}
```

**C. Shop welcome (`on-shop-open`, overlay, voice-only)** — same shape as B but `autoTrigger: { kind: "on-shop-open" }`, 2-paragraph `logSummary` (station, stock/tone).

**D. System-cleared idle (`on-system-cleared-idle`, overlay, voice-only)** — same shape as B with:
```ts
autoTrigger: {
  kind: "on-system-cleared-idle",
  systemId: "<solarSystemId>",
  initialDelayMs: 5000,
  intervalMs: 30000
}
```
`logSummary`: what was won, reflection, hook to next system.

**E. System-entry chapter cinematic (`on-system-enter`, modal, music + voice)** — same shape as A but `autoTrigger: { kind: "on-system-enter", systemId: "<solarSystemId>" }`. Add `repeatable: true` to the trigger to re-fire on every system entry (default: once-ever). Today's example: `tubernovae-cluster-intro` (currently ships repeatable for chapter-replayability — flip to false / drop the field for short beats players shouldn't re-watch).

**F. Replay-only / lore drop (`null`, modal)** — `autoTrigger: null`. See caveat in input #8.

# Operation: CREATE

1. Read `story.ts`, confirm id is unique.
2. Confirm asset files exist + each < 500 KB. If oversized: `ffmpeg -i in.wav -c:a libvorbis -q:a 4 out.ogg` (music) / `ffmpeg -i in.wav -c:a libmp3lame -q:a 5 out.mp3` (voice).
3. Copy assets via `Bash` + `cp` (binaries, not `Write`):
   - Always: `public/audio/story/<storyId>-voice.{mp3|ogg}`.
   - If music supplied: `public/audio/story/<storyId>-music.{ogg|mp3}`.
4. Edit `src/game/data/story.ts`: extend `StoryId` union (narrative order), append entry to `STORY_ENTRIES` using a template.
5. `npm run typecheck && npm run lint && npm test`.
6. Report: id, asset paths, trigger kind, how player will see it.

# Operation: MODIFY

**Text-only** (`title`, `body`, `logSummary`, `voiceDelayMs`, `mode`) — single edit in `story.ts`. If user wants `logSummary` extended, leave `body` alone unless asked.

**Audio replacement** — overwrite file at `public/audio/story/<storyId>-voice|music.{ext}` via `Bash` + `cp`. Path field stays the same. No DB migration. Smoke test: galaxy → user menu → Story log → REPLAY.

**Auto-trigger change** — edit only `autoTrigger`. Stay within union. Existing players who already saw it WON'T re-fire (seen-set is id-keyed). Re-firing for existing players = feature, flag it.

**Renaming `id`** — REMOVE + CREATE. `isKnownStoryId` silently drops the old id from every player's seen-set on hydrate, the new id appears unseen, log-replay button briefly disappears. Surface this before agreeing.

# Operation: REMOVE

Mostly safe — `isKnownStoryId` drops unknown ids on hydrate. The danger is hard-coded id references.

## Hard-coded references — must clean up

| File | Reference | Fix |
|---|---|---|
| `src/app/api/save/route.test.ts` (lines 102, 116) | `"great-potato-awakening"` test fixture for seen_story_entries roundtrip | Replace with another known id, OR drop the assertion. |
| `src/game/audio/storyLogAudio.ts` (`STORY_LOG_MUSIC_PATH`) | Hard-coded `/audio/story/great-potato-awakening-music.ogg` — Story log + replay bed | **Blocker** on deleting the Awakening's music asset. Repoint `STORY_LOG_MUSIC_PATH` at another committed file first. |
| `src/game/data/story.ts` (line 187) | `tubernovae-cluster-intro.musicTrack` ALSO points at `/audio/story/great-potato-awakening-music.ogg` (deliberate shared bed) | Repoint Tubernovae's `musicTrack` first, OR keep the Awakening music asset on disk. |
| `src/game/data/storyTriggers.test.ts` (lines 23, 25, 30, 36) | `"great-potato-awakening"` fixture across `selectFirstTimeEntry` describe block | Replace with another `first-time` id, OR rewrite to assert `entry?.autoTrigger?.kind === "first-time"`. |

Story ids do not appear in mission/weapon/perk/enemy catalogs, `lootPools.ts`, auth/save guards, or user-facing components.

**Grep is non-optional** — catches any id reference added since this skill was last updated.

## Steps

1. `grep -rn '"<id>"' src/` — catch new references.
2. Replace each non-`story.ts` reference with another known id, or delete.
3. Remove entry from `STORY_ENTRIES`.
4. Remove the literal from the `StoryId` union (derived `STORY_IDS` updates auto).
5. (Optional) Delete `public/audio/story/<storyId>-voice|music.*`.
6. `npm run typecheck && npm run lint && npm test`.
7. Note: existing players' `seenStoryEntries` may still contain the id — `isKnownStoryId` filters on hydrate. No DB migration.

# Invariants

**All ops** — `StoryId` union matches `STORY_ENTRIES` (parity guard: `STORY_IDS = STORY_ENTRIES.map(...)`; `getStoryEntry` throws on unknown). No `any`. `npm run typecheck && npm test` passes.

**CREATE** — id unique; `body` ≥ 1 paragraph; `logSummary` ≥ 1 (2–4 recommended); `voiceTrack` non-null + starts with `/audio/story/` + file exists; if `musicTrack !== null`, same checks; assets each < 500 KB (CLAUDE.md §13); at most one `first-time` entry; `autoTrigger` ∈ supported six.

**MODIFY** — audio replacements keep path; trigger changes don't unseen for existing players.

**REMOVE** — every hard-coded reference updated or deleted; `route.test.ts` fixture still references a known id (or assertion rewritten).

# Files this skill touches

**Always:** `src/game/data/story.ts`.

**Asset work:** `public/audio/story/<storyId>-voice.{mp3|ogg}`, `-music.{ogg|mp3}` (only when music set).

**REMOVE cleanup:** `src/app/api/save/route.test.ts` (only if removed id is the test fixture), plus the `storyTriggers.test.ts` / `storyLogAudio.ts` / `story.ts` references in the REMOVE table.

**Never:** `StoryModal.tsx`, `StoryListModal.tsx` (data-driven from `StoryEntry`); `story.ts` audio engine (generic); `stateCore.ts` / `persistence.ts` (sanitised via `isKnownStoryId`); `src/lib/schemas/save.ts` (`z.array(z.string())` is intentionally permissive at the wire boundary); `db/migrations/`; `useStoryTriggers.ts` / `ShopUI.tsx` (only modify for a NEW trigger kind — see boundary).
