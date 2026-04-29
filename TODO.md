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
- ResultScene with tween-driven score/credits/time count-up. (Later retired in the React-victory-modal pass; the post-mission summary is now [VictoryModal.tsx](src/components/galaxy/VictoryModal.tsx) mounted over the galaxy view, with first-clear loot rewards added on top.)

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

**Operational note:** `/api/save` and `/api/leaderboard` now run on the Edge runtime via `@neondatabase/serverless` (WebSocket Pool). `/api/auth/[...nextauth]` stays on Node for the Google OAuth handshake. Build is still static everywhere else.

---

## Phase 7 — Polish (DONE)

- Procedural SFX via Web Audio ([sfx.ts](src/game/audio/sfx.ts)): laser, hit, explosion, pickup. Mute toggle in galaxy HUD, persisted to `localStorage`.
- Screen shake on player damage, tween-animated result screen, GSAP slide-in on MissionSelect panel.
- Particle burst on enemy kill (boss explosion is beefier), circle flash removed in favour of proper Phaser ParticleEmitter.
- [Controls](src/game/phaser/systems/Controls.ts) abstraction — Player reads through an interface so gamepad/touch can be added without touching Player.

---

## Phase 8 — Modular ship loadout + reactor energy (DONE)

- 4 weapon slots: front, rear, sidekickLeft, sidekickRight ([ShipConfig.ts](src/game/state/ShipConfig.ts)). Per-slot bullet direction in [weaponMath.ts](src/game/phaser/systems/weaponMath.ts) (front up, rear down, sidekicks ±45° outward); per-slot spawn offset in [Player.ts](src/game/phaser/entities/Player.ts).
- All four slots fire on dedicated keys: Space → front, Alt → both sidekick pods, Ctrl → rear. Each slot has its own `WeaponSystem` cooldown.
- Reactor with capacity + recharge upgrade tracks. Each weapon has an `energyCost`; firing drains, recharge fills back over time, refused fires are silent. Reactor bar in the combat HUD pulses below 25% energy.
- Save migration: legacy snapshots with `ship.primaryWeapon` migrate transparently into `slots.front` on load.
- LoadoutMenu component (galaxy HUD modal + Market shop section) with slot grid + inventory + sell-back.
- 6 new weapons spanning all slot kinds: Spud Missile (homing), Tater Net, Tail Gunner, Side Spitter, Plasma Whip, Hailstorm.
- Bullet homing wired up: optional `homing: true` + `turnRateRadPerSec` on weapon defs; `Bullet` steers via `steerVelocity()` in weaponMath; CombatScene exposes a `findClosestEnemy` callback to the friendly `BulletPool`.

---

## Phase 9 — Multi-solar-system overworld (DONE)

- `solarSystems.json` data file + `SolarSystemId` union type. Two systems shipped: `tutorial` (Sol Spudensis) and `tubernovae` (Tubernovae Cluster, 4 missions).
- `currentSolarSystemId` + `unlockedSolarSystems` on `GameState`. `setSolarSystem()` mutator + `SYSTEM_UNLOCK_GATES` map (boss-1 → tubernovae).
- `GalaxyScene` filters planets by active system; `Sun.ts` tints from per-system metadata (color + size scale).
- Warp picker UI in `GameCanvas` HUD lists unlocked systems and re-mounts the scene on switch.
- Per-mission base-color overrides in `Planet.ts` + per-mission procedural surface presets in `planetTexture.ts` so the 4 Tubernovae planets read as visually distinct from tutorial.

---

## Phase 10 — Vercel resource discipline (DONE)

- Leaderboard reads cached via `unstable_cache` (60s TTL, `revalidateTag` on POST). `Leaderboard` component converted to async server component — no more client-side fetch on every page mount.
- OG card + Apple touch-icon `force-static` so they bake at build time instead of running per scraper hit.
- `vercel.json` `ignoreCommand` skips preview builds for doc / `.github/` / `.claude/` only changes; matching `paths-ignore` on the GitHub Actions workflow.
- `/api/save` + `/api/leaderboard` migrated to Edge runtime via `@neondatabase/serverless`.
- New `CLAUDE.md` §12 — mandatory pre-PR checklist for Vercel resource impact (default-static, cache every DB query, no middleware/cron without sign-off, 500 KB cap on `public/` assets, etc.).

---

## Phase 11 — Per-weapon Mk levels (DONE)

- Sparse `weaponLevels: Partial<Record<WeaponId, number>>` on `ShipConfig`. Missing entries default to level 1, so existing saves migrate cleanly with no schema break.
- Cap at `MAX_LEVEL = 5`. Each level adds `WEAPON_DAMAGE_PER_LEVEL = 0.15` to the damage multiplier; nothing else (fire rate, projectile count, spread) ever scales with level.
- Cost curve: `weaponUpgradeCost(currentLevel) = 200 * 2^(currentLevel - 1)` — level 1→2 is ¢200, level 4→5 is ¢1600.
- `buyWeaponUpgrade(id)` mutator on `GameState`; refuses if weapon not owned, level already at cap, or insufficient credits.
- LoadoutMenu shows a Mk badge per weapon and an UPGRADE button in market mode and on equipped slots. WeaponStats panel scales the displayed damage/dps via `weaponDamageMultiplier(level)`.
- Player caches `slotDamageMul` per slot at boot; `WeaponSystem.fire` accepts a damage multiplier so per-weapon levels apply at runtime.
- Save migration in `hydrate` clamps levels into `[1, MAX_LEVEL]` and drops levels for unowned weapons.
- Shipped in PR #17.

---

## Phase 12 — Augment system (DONE)

- New `AugmentId` union (5 augments): `damage-up` (1.25× dmg, ¢1000), `fire-rate-up` (0.7× cooldown, ¢900), `extra-projectile` (+1 projectile, ¢1500), `energy-down` (0.6× energy cost, ¢600), `homing-up` (1.5× turn rate, ¢500). Catalog lives in [src/game/phaser/data/augments.ts](src/game/phaser/data/augments.ts).
- `MAX_AUGMENTS_PER_WEAPON = 2`. Augments are **permanently bound** when installed: cannot be removed, cannot be transferred. Selling a weapon destroys both the weapon and its augment list together (intentional — player must find a new augment piece to use on a different weapon).
- `weaponAugments: Partial<Record<WeaponId, readonly AugmentId[]>>` and `augmentInventory: readonly AugmentId[]` on `ShipConfig`. Inventory holds bought-but-not-yet-bound augments.
- `buyAugment(id)`, `grantAugment(id)`, `installAugment(weaponId, augmentId)` mutators. Install refuses if weapon not owned, weapon already at max augments, or augment not in inventory.
- `foldAugmentEffects(ids)` returns multiplicative `{damageMul, fireRateMul, projectileBonus, energyMul, turnRateMul}`. Pure function — used by both Player runtime and WeaponStats display.
- Player resolves per-slot mods at boot/swap (energy cost rounded once with a floor of 1 to prevent `0.6 × 1 = 0` collapse). `WeaponSystem.fire` now takes a `FireModifiers` object instead of a single damage multiplier.
- Shop UI: AUGMENTS section in market, AUGMENT INVENTORY section listing owned augments, INSTALL button + AugmentPicker modal in LoadoutMenu. WeaponStats accepts an `augmentIds` prop and recomputes damage/dps/fire-rate/energy from the folded effects.
- Save migration filters unknown augment ids, dedupes per weapon, caps at `MAX_AUGMENTS_PER_WEAPON`, drops entries for unowned weapons.
- Shipped in PR #18 (combat / UI / tests landed via parallel worktree agents on disjoint files).

---

## Phase: Modularity audit (2026-04-27, DONE)

A 4-wave audit (foundation → safety net → god-module splits → polish) landed 17 items across 54 commits (master `be0166e`). Foundation work removed duplicate types, renamed `src/game/phaser/data/` → `src/game/data/`, added a `loadMissions()` helper, fixed a latent GameCanvas auth-flip bug (and cleared the two associated eslint-disables), introduced a typed Phaser event bus, centralized routes in `src/lib/routes.ts` with a `useHandle` hook, and migrated to ESLint flat-config plus `next build` + coverage artifact in CI. Safety net added Zod validation at every API boundary, split GameState from a 582-LOC monolith into a 9-LOC barrel + 4 focused files, and brought persistence (lib/* + 4 API routes + sync.ts) from ~0% to 80–100% coverage. God-module splits broke up Player, GameCanvas, LoadoutMenu, and CombatScene into single-responsibility modules. Polish added a shared `SceneRig` factory and a `fakeScene` test harness for combat-track tests. Test count went 197 → 397.

**Going-forward principle — modularity discipline:** see CLAUDE.md §5 for the file-size ceilings, single-responsibility expectations, and "split before it grows" guidance that the audit codified.

### Audit follow-ups (not yet shipped)

- **`.claude/skills/*/SKILL.md`** still reference the pre-rename `src/game/phaser/data/` paths. Update them to point at `src/game/data/`.
- **Optional Zod boot-time parse of `src/game/data/missions.json`** — currently the `as readonly MissionDefinition[]` cast at module load is unguarded. Low risk (tests would catch most drift), but a one-shot `MissionDefinitionSchema.array().parse(...)` would close the gap.
- **CombatScene at 216 LOC** is at the suggested 300-LOC ceiling — justified by its orchestrator role, but worth flagging. If it grows further, split out the next responsibility (likely spawn or HUD wiring) rather than letting it drift.

---

## Next up (post-MVP, not required for first playable)

- **Phase B2** — `pierce` augment (bullets pass through one extra enemy) and mid-mission augment drops (rare power-up that grants a random augment to `augmentInventory`). Deferred from Phase 12 because both need new content beyond a numeric multiplier — the pierce effect needs Bullet collision changes, and drops need a new PowerUp kind plus pickup notification.

- **User menu features** — fill out the empty `UserMenu` dropdown in the galaxy view ([src/components/UserMenu.tsx](src/components/UserMenu.tsx)). Sign-out intentionally lives only on the landing page (`SignInButton`) so players can't accidentally log out mid-mission. Items to add, in rough priority order:
  - **Avatar** — pick from a small library of preset images (`public/avatars/*`) or upload one. Stored on `players.avatar` (new column). Rendered next to the handle in the dropdown trigger and on the leaderboard rows.
  - **Change handle** — opens the existing `HandlePrompt` modal in "edit" mode against POST `/api/handle`; same uniqueness rules apply. Cooldown/rate-limit TBD.
  - **GDPR — export my data** — generates a JSON download with the player's row from `players`, all their `save_games`, and all their `leaderboard` entries. Edge route, no PII other than the player's own.
  - **GDPR — delete my account** — confirmation modal, then deletes the player row (CASCADE wipes saves + leaderboard entries). Signs the user out afterwards.
  - **Link to /settings** — when the menu grows beyond ~4-5 items, the heavier flows (avatar uploader, GDPR forms) should move to a dedicated `/settings` page; the dropdown becomes a thin shortcut.

- Real art: drop PNGs into [public/sprites/](public/sprites/) with the keys already referenced in code (e.g. `/sprites/player/ship.png`). [BootScene](src/game/phaser/scenes/BootScene.ts) currently synthesizes placeholders — switch its `preload` to load files when assets exist.
- ~~Real audio: drop files into public/audio/ and rewrite sfx.ts to trigger HTMLAudioElement playback.~~ **— DONE for music + voice.** The audio storyline pipeline is shipped: `menuMusic` / `combatMusic` (HTMLAudioElement-based engines in [music.ts](src/game/audio/music.ts)), four story-system engines (`storyAudio`, `storyLogAudio`, `menuBriefingAudio`, `itemSfx`), and a real `public/audio/{menu,story,sfx,music}/` tree. Combat SFX (laser/hit/explosion/pickup chime) intentionally remain procedural Web Audio in [sfx.ts](src/game/audio/sfx.ts) — short impact sounds, no benefit to file-based playback.
- Real planet textures: file names in [missions.json](src/game/phaser/data/missions.json) under `texture` — loader already tries and falls back to flat color.
- Background music per mission + galaxy theme.
- Gamepad support — write a second factory in [Controls.ts](src/game/phaser/systems/Controls.ts).
- Touch controls for mobile — virtual sticks, same Controls contract.

## Out of scope for MVP — do NOT build

- Multiplayer or ghost replays.
- ~~Story, dialogue, or cutscenes.~~ **— SUPERSEDED.** The audio storyline is now a flagship feature: a fully-voiced narrative layer with one consistent narrator persona (Grandma), spanning the menu briefing queue, opening cinematic, per-mission briefings, shop arrival line, system-cleared idle voice, item-acquisition cues, and the replay-able Story log. See [README.md](README.md) "Audio storyline" section, [src/game/data/story.ts](src/game/data/story.ts), and the `/new-story` skill. New story content is added through `/new-story`.
- Procedural mission / level generation.
- Achievements system.
- ~~More than 4 planets (3 missions + 1 shop)~~ — **superseded by Phase 9**: 2 solar systems and 8 planets total now. Hand-authored content cap is now per-system, not project-wide.
- Mobile / touch controls.
- Mod support, user-generated content.
- In-app purchases.

If a task tempts you to cross one of these lines, **stop and ask the user**.
