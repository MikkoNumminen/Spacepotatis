# TODO.md — Spacepotatis implementation plan

Phased, checkbox-driven plan. Each task lists a **recommended model** and a rough **token budget**. Dependencies are marked explicitly.

**Model legend** — pick the cheapest model that can finish the task cleanly:

- **Haiku** — mechanical edits, file moves, adding boilerplate from a spec, simple tests.
- **Sonnet** — feature work with moderate design decisions, Phaser/Three integration, API routes.
- **Opus** — architecture changes, cross-cutting refactors, tricky gameplay feel tuning, perf.

## Phase 0 — Scaffolding (DONE)

- [x] Next.js 15 + TypeScript strict config
- [x] Tailwind CSS setup
- [x] ESLint + Prettier
- [x] `.env.example`, `.gitignore`
- [x] CLAUDE.md, ARCHITECTURE.md, TODO.md
- [x] Folder structure with placeholder files
- [x] JSON game-data files (weapons, enemies, waves, missions)
- [x] Kysely DB client
- [x] dbmate initial migration
- [x] Install dependencies

---

## Phase 1 — Runnable shell (DONE)

Landing, `/play`, `/shop`, `/leaderboard` all render. Build and typecheck are green.

---

## Phase 2 — Three.js galaxy overworld (DONE)

Starfield, orbiting planets, hover outline, raycaster-driven selection, mouse orbit + wheel zoom, lighting.

---

## Phase 3 — Phaser combat core (DONE)

Player with WASD/arrows + shield/armor, bullet pools, three enemy behaviors, wave spawning from JSON, collisions, weapon system, GSAP fade transitions galaxy ↔ combat. Placeholder textures generated at runtime via Phaser Graphics — ready to swap for real sprites.

---

## Phase 4 — HUD, power-ups, boss (DONE)

- Power-ups (shield, credit, weapon cycle), score + combo system, Phaser HUD (score, credits, shield/armor bars).
- [PauseScene](src/game/phaser/scenes/PauseScene.ts) — P or ESC pauses combat; P resumes, ESC abandons.
- Multi-phase boss (HP-gated): phase 1 single shot + slow drift, phase 2 triple spread, phase 3 aimed shot + 4-way fan. Stays in the top third of the arena.
- [ResultScene](src/game/phaser/scenes/ResultScene.ts) with tween-driven score/credits/time count-up.

---

## Phase 5 — Progression & shop (DONE)

- GameState singleton with `useSyncExternalStore` hook, commit/subscribe pattern.
- ShipConfig with shield/armor levels (0–5), weapon unlocks, upgrade cost curves.
- CombatScene reads ship config at boot, writes credits + completedMissions + unlock chain on finish.
- Shop UI: buy shield/armor upgrades, buy/equip weapons. Credits shown live.
- MissionSelect respects `requires` graph — locked planets can't launch until prerequisites clear.

---

## Phase 6 — Persistence, auth, leaderboard (DONE)

- NextAuth v5 (Google OAuth, JWT sessions) wired through `SessionProvider` in the layout.
- `/api/save` GET+POST: upserts player on first sight, upserts save slot 1 on every POST.
- `/api/leaderboard` GET (ISR 60s) + POST.
- `Leaderboard` component + `/leaderboard` page listing all combat missions.
- On sign-in, `loadSave()` hydrates GameState. On mission win, `saveNow()` + `submitScore()` fire best-effort.
- Unauthenticated play still works — all network calls degrade silently.

**Operational note:** API routes run on Node runtime (pg Pool isn't Edge-compatible). Build is still static everywhere else.

---

## Phase 7 — Polish (DONE)

- Procedural SFX via Web Audio ([sfx.ts](src/game/audio/sfx.ts)): laser, hit, explosion, pickup. Mute toggle in galaxy HUD, persisted to `localStorage`.
- Screen shake on player damage, tween-animated result screen, GSAP slide-in on MissionSelect panel.
- Particle burst on enemy kill (boss explosion is beefier), circle flash removed in favour of proper Phaser ParticleEmitter.
- [Controls](src/game/phaser/systems/Controls.ts) abstraction — Player reads through an interface so gamepad/touch can be added without touching Player.

---

## Next up (post-MVP, not required for first playable)

- Real art: drop PNGs into [public/sprites/](public/sprites/) with the keys already referenced in code (e.g. `/sprites/player/ship.png`). [BootScene](src/game/phaser/scenes/BootScene.ts) currently synthesizes placeholders — switch its `preload` to load files when assets exist.
- Real audio: drop files into [public/audio/](public/audio/) and rewrite [sfx.ts](src/game/audio/sfx.ts) to trigger HTMLAudioElement playback. Public folder structure is already documented in [public/README.md](public/README.md).
- Real planet textures: file names in [missions.json](src/game/phaser/data/missions.json) under `texture` — loader already tries and falls back to flat color.
- Background music per mission + galaxy theme.
- Gamepad support — write a second factory in [Controls.ts](src/game/phaser/systems/Controls.ts).
- Touch controls for mobile — virtual sticks, same Controls contract.

## Out of scope for MVP — do NOT build

- Multiplayer or ghost replays.
- Story, dialogue, or cutscenes.
- Procedural mission / level generation.
- Achievements system.
- More than 4 planets (3 missions + 1 shop).
- Mobile / touch controls.
- Mod support, user-generated content.
- In-app purchases.

If a task tempts you to cross one of these lines, **stop and ask the user**.
