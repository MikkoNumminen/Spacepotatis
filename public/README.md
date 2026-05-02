# public/ — static assets

Served verbatim by Vercel. No build processing. Directory layout:

```
public/
  sprites/          — empty subdirs (player/, enemies/, bullets/, powerups/, explosions/) reserved for real PNG drops; today every visual is generated procedurally in BootScene.ts.
  audio/
    menu/           — system-briefing.mp3 + 4 idle-nudge clips (ui_idle_continue_nudge, ui_idle_play_nudge, ui_idle_final_warning, ui_idle_surrender)
    story/          — per-StoryEntry voice (`<storyId>-voice.mp3`) plus dedicated music for cinematic chapter openers (`great-potato-awakening-music.ogg`, `tubernovae-cluster-intro-music.ogg`)
    sfx/            — item-acquisition voice cues (4 shop/loot categories: gun / gun_mod / ship_upgrade / money) + ui_shield_pickup + 3 per-perk pickup voices (overdrive / hardened / emp). Combat SFX (laser / hit / explosion / pickup chime) are intentionally procedural Web Audio in src/game/audio/sfx.ts — no files.
    music/          — per-system galaxy beds (`menu-theme.ogg` for tutorial, `tubernovae-galaxy.ogg` for tubernovae) AND per-mission combat beds (`combat-tutorial.ogg` etc., referenced from missions.json `musicTrack`)
    leaderboard/    — hall-of-mediocrity.mp3 (lead-in voice for the leaderboard view)
  textures/
    planets/        — <missionId>.jpg diffuse maps (none shipped today — Three.js falls back to procedural surface noise; see src/game/three/planetTexture.ts)
```

Reference from code with root-relative URLs, e.g. `"/audio/music/menu-theme.ogg"`.

Naming conventions: lowercase, dash-separated. Mission music tracks are `combat-<missionId>.ogg`. Planet textures share the missionId as filename. Story audio pairs are `<storyId>-voice.mp3` + (optional) `<storyId>-music.ogg`.

Audio assets exceeding the 500 KB cap (galaxy beds, combat beds, story music) are de-facto exceptions to CLAUDE.md §13 — see the rationale on `<systemId>-galaxy.ogg` in the `/new-solar-system` skill.
