---
name: voice-asset
description: Add or replace a non-story Grandma voice line — shop DETAILS modals (weapon/augment/upgrade/stat), UI action cues, menu briefings, leaderboard intro, item/browse cues. Covers script-writing for the AudiobookMaker handoff, the <id>-voice.mp3 naming conventions, mono-24kHz-128kbps encoding, and silent-404 drop-in. Story cinematics/briefings → /new-story.
---

# When to use

Invoke on `/voice-asset`, "add a voice line for X", "Grandma should say something when the player does Y", "re-record the Z voice", or when a new catalog entry (weapon/augment/upgrade) needs its DETAILS voice. Everything voice-related that is NOT a `StoryEntry`.

## Boundary

- **Story content** (cinematics, mission briefings, shop-arrival, idle voices — anything in `STORY_ENTRIES`) → `/new-story`.
- **Music beds** → `/new-story` (cinematic) or `/new-solar-system` (galaxy bed).
- **Procedural combat SFX** ([src/game/audio/sfx.ts](src/game/audio/sfx.ts)) stay procedural Web Audio by design — don't replace with files.
- **A NEW voice surface** (a new modal/engine that plays voice where nothing plays today) is a code task — the conventions below cover dropping files into EXISTING surfaces plus the one-line `UI_CUE` extension. Anything bigger: STOP and flag.

# Surface map — where a voice file can land

| Surface | Path convention | Wiring | New file needs code? |
|---|---|---|---|
| Weapon DETAILS modal | `public/audio/weapons/<weaponId>-voice.mp3` | `voicePathFor` in [WeaponDetailsModal.tsx](src/components/loadout/WeaponDetailsModal.tsx) | NO — path derived from id; drop the file |
| Augment DETAILS modal | `public/audio/augments/<augmentId>-voice.mp3` | [AugmentDetailsModal.tsx](src/components/loadout/AugmentDetailsModal.tsx) | NO |
| Upgrade DETAILS modal | `public/audio/upgrades/<upgradeId>-voice.mp3` | [UpgradeDetailsModal.tsx](src/components/loadout/UpgradeDetailsModal.tsx) | NO |
| Stat DETAILS modal | `public/audio/stats/<statId>-voice.mp3` | [StatDetailsModal.tsx](src/components/loadout/StatDetailsModal.tsx) | NO |
| UI action cue (equip, sell, picker-open, …) | `public/audio/ui/<action>-voice.mp3` | `UI_CUE` map in [src/game/audio/uiCues.ts](src/game/audio/uiCues.ts) + `playUiCue(id)` at the click site | YES — one `UI_CUE` entry (+ the call site if the action is new) |
| Menu briefing queue | `public/audio/menu/*.mp3` | [src/game/audio/menuBriefingAudio.ts](src/game/audio/menuBriefingAudio.ts) | YES — queue entry |
| Leaderboard intro | `public/audio/leaderboard/hall-of-mediocrity.mp3` | `VOICE_PATH` in [src/game/audio/leaderboardAudio.ts](src/game/audio/leaderboardAudio.ts) | replace-in-place only |
| Item acquisition / shop-browse cues | `public/audio/sfx/ui_shop_*.mp3`, `ui_browse_*.mp3`, `ui_perk_*.mp3` | maps in [src/game/audio/itemSfx.ts](src/game/audio/itemSfx.ts) | YES — map entry |

**Every surface fails silently on a missing file** (`HTMLAudioElement` doesn't throw on 404) — it is safe and normal to wire the path before the recording exists; the modal/cue just plays nothing until the mp3 lands.

# The pipeline (two halves)

## Half 1 — script + handoff (agent does this)

1. Write the line(s) in Grandma's voice: warm-but-no-nonsense, in-character, no UI jargon, no "click here" (CLAUDE.md §1 pillar 3). DETAILS lines run ~5s (one or two sentences); UI cues run 1–3s. For pirate gear, lean into Grandma not quite understanding the hardware.
2. Hand the operator a table: `<target filename> → <exact line text>`. Generation happens OUTSIDE this repo in `MikkoNumminen/AudiobookMaker` (Chatterbox TTS, local clone at `/Users/mikko/koodailua/AudiobookMaker`, output under `out/`). The agent cannot generate audio — stop here until files come back.

## Half 2 — encode + drop-in (when the user supplies files)

3. Encode to the house voice format — mono, 24 kHz, 128 kbps MP3 (verified shipped spec):
   ```bash
   ffmpeg -i in.wav -ac 1 -ar 24000 -b:a 128k public/audio/<surface>/<name>.mp3
   ```
4. Copy with `Bash` + `cp` (binaries, never `Write`). Confirm each file < 500 KB (CLAUDE.md §13; a 5s line at this spec is ~80 KB).
5. Wire code only where the surface table says YES (e.g. one `UI_CUE` entry; cue ids are camelCase, filenames kebab-case `<action>-voice.mp3`).
6. `npm run typecheck && npm test` if code changed; smoke-test the surface (open the modal / click the action) with `npm run dev`.

# Invariants

- One narrator: every voice line is Grandma. No second voices on non-story surfaces.
- Filenames follow the per-surface convention exactly — DETAILS modals derive the path from the catalog id, so a typo'd filename silently never plays.
- Voice files are mono 24 kHz 128 kbps MP3, < 500 KB.
- Don't add cleanup `storyAudio.stop()` calls for UI cues — fire-and-forget is intentional (see the lifecycle note in `uiCues.ts`).

## Freshness check

```toml
[[check]]
kind = "path_exists"
path = "public/audio/ui"
root = "scope_root"

[[check]]
kind = "path_exists"
path = "public/audio/weapons"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/game/audio/uiCues.ts"
pattern = "UI_CUE"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "src/components/loadout/WeaponDetailsModal.tsx"
pattern = "voicePathFor"
root = "scope_root"

[[check]]
kind = "command_exists"
command = "ffmpeg"
```
