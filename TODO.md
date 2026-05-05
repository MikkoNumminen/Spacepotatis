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

### Audit follow-ups

- ~~**`.claude/skills/*/SKILL.md`** still reference the pre-rename `src/game/phaser/data/` paths.~~ **DONE** — all current `.claude/skills/*/SKILL.md` files point at `src/game/data/`. (Stale references survive only inside `.claude/worktrees/` agent snapshots, which never load.)
- ~~**Optional Zod boot-time parse of `src/game/data/missions.json`**~~ **DONE** — `MissionsFileSchema` in [src/lib/schemas/missions.ts](src/lib/schemas/missions.ts) parses `missions.json` at module load via [src/game/data/missions.ts](src/game/data/missions.ts); negative-case contract tests in [src/lib/schemas/missions.test.ts](src/lib/schemas/missions.test.ts). The other accessors (weapons / enemies / waves / solarSystems) still rely on plain `as` casts; if/when one drifts in the wild, adopt the same pattern.
- **CombatScene at ~241 LOC** is below the suggested 300-LOC ceiling but climbing — justified by its orchestrator role, but worth flagging. If it grows further, split out the next responsibility (likely spawn or HUD wiring) rather than letting it drift. (216 was the immediate post-audit baseline.)

---

## Next up (post-MVP, not required for first playable)

- **Active experiment: `save_audit` data collection** (operator + AI agents, no model action) — running between PR #98 (audit table live, 2026-05-03) and the day the `feat/audit-readiness-check` GH Actions cron opens the `save-architecture-ready` issue. Daily shipping is fine and expected, but during this window: **don't remove content** (deleting a mission/planet/weapon ID that exists in player saves trips `validateNoRegression` and pollutes the dataset with bogus 422s — if a removal is genuinely required, design a one-time DB-cleanup migration that strips orphaned IDs from existing saves first); **don't TRUNCATE save_audit** (resets the `days_of_data` clock — filter analysis queries by `created_at` instead); **don't sign in locally with the prod DATABASE_URL** (local-dev POSTs dilute the real-player signal). Schema migrations to `save_games` are safe as long as they're additive and follow §7a. After any merge in `src/game/state/persistence/`, `src/lib/saveValidation.ts`, `src/app/api/save/route.ts`, `src/lib/schemas/save.ts`, or `db/migrations/`, run `node --env-file=.env.local scripts/check-audit-readiness.mjs` the same day to confirm the change didn't introduce a new failure pattern. Full agent guidance lives in the auto-memory `feedback_save_audit_experiment_window.md`.

- **Phase Save-Architecture** (Opus) — append-only `save_snapshots` table to make wipes physically impossible. **Background:** the 2026-05-02 incident wiped a real player's save because `save_games` is a single row, OVERWRITTEN on every POST. PR #94 added `validateNoRegression`; PRs #96/#97/#100/#101 layered more guards. They reduce the hit rate but the data model still permits destruction — every guard is a band-aid. **The structural fix:** new `spacepotatis.save_snapshots(id BIGSERIAL, player_id, slot, payload jsonb, created_at, source TEXT)`. POST = INSERT only. "Current save" = `SELECT … ORDER BY created_at DESC LIMIT 1` per (player_id, slot). Wipe becomes an observable INSERT, not a destructive UPDATE; restore = `OFFSET 1 LIMIT 1`. **Precondition:** PR #98's `save_audit` table has been live for at least a few days so the migration design is informed by real save sizes / write frequency / common error codes. **Companion changes worth bundling:** (1) cheat-detection observes/flags rather than blocks (saves still write, with a `flagged_at` column for operator review) so a false-positive 422 stops costing players progress, (2) GitHub Actions cron `pg_dump → R2` for an out-of-band 24h backup independent of Neon's tier. **Out of scope for this phase:** server-authoritative deltas (would re-architect the client save loop — defer until the snapshot history is in place).

- **Phase B2** — `pierce` augment (bullets pass through one extra enemy) and mid-mission augment drops (rare power-up that grants a random augment to `augmentInventory`). Deferred from Phase 12 because both need new content beyond a numeric multiplier — the pierce effect needs Bullet collision changes, and drops need a new PowerUp kind plus pickup notification.

- **Phase Balance Audit** (Opus) — once the content backlog clears, revisit balance with full economy / cheat-vector tuning. **Known holes documented in [docs/decisions/0008-known-cheat-vectors-deferred.md](docs/decisions/0008-known-cheat-vectors-deferred.md):** the 100% sell refund (PR #159) means free-granted items (`grantWeapon`, `grantAugment` from mission rewards / mid-combat drops) can be sold for full catalog cost — pure credit conversion. Buy/sell on purchased items remains net-zero. **Acceptable for now** — content is the bottleneck; leaderboard is local cohort, not competitive; `validateCreditsDelta` per-mission cap throttles the worst case; rejections are observation-first 422-and-retry per [ADR 0003](docs/decisions/0003-anti-cheat-observation-not-enforcement.md). **When this phase fires:** decide whether to track `originallyGranted` on `WeaponInstance` / `augmentInventory` (lower refund for grants), lower `SELL_RATE` overall, or accept the trade indefinitely if the leaderboard never becomes competitive. Drive the call from `save_audit` data — if 422 rejections cluster around granted-item-sell patterns and frustrate legitimate players, fix; if not, leave it as the player-flexibility win it is.

- **Phase Vegetable-Catalog (backlog)** — six weapons pulled from the live catalog on 2026-05-04 to make room for the tier-2 pirate haul (corsair-missile, grapeshot-cannon, boarding-snare). Each entry below is the verbatim `weapons.json` spec at the time of removal — paste it back in (with a fresh `tier` and `family` decision) when reintroducing. Players who owned any of these on the day of removal had `cost + upgrades + augments` refunded automatically by `salvageRemovedWeapons` ([src/game/state/persistence/salvageRemovedWeapons.ts](src/game/state/persistence/salvageRemovedWeapons.ts)) — when bringing a weapon back, decide whether to remove its entry from `REMOVED_WEAPON_BASE_COSTS` or leave it (a stale entry there is harmless because the live id is checked against the catalog first).
  - **`spud-missile`** — Red Bliss Rocket. damage 35 / fireRateMs 900 / bulletSpeed 420 / proj 1 / spread 0 / cost 1100 / tint #c84050 / family potato / energyCost 22 / homing true / turnRateRadPerSec 3.5 / bulletSprite "bullet-potato-redbliss" / podSprite "pod-potato". (Sprite generator `drawRedBlissBullet` still lives in `BootScene.ts` as dead code.)
  - **`tater-net`** — Chantenay Cluster. damage 3 / fireRateMs 180 / bulletSpeed 540 / proj 5 / spread 28 / cost 600 / tint #e8a040 / family carrot / energyCost 6 / gravity 300 / bulletSprite "bullet-carrot-chantenay" / podSprite "pod-carrot".
  - **`tail-gunner`** — Imperator Lance. damage 9 / fireRateMs 220 / bulletSpeed 600 / proj 1 / spread 0 / cost 700 / tint #d77820 / family carrot / energyCost 5 / gravity 60 / bulletSprite "bullet-carrot-imperator" / podSprite "pod-carrot".
  - **`side-spitter`** — Nantes Burst. damage 5 / fireRateMs 140 / bulletSpeed 660 / proj 1 / spread 0 / cost 500 / tint #ed8b30 / family carrot / energyCost 3 / gravity 120 / bulletSprite "bullet-carrot-nantes" / podSprite "pod-carrot".
  - **`plasma-whip`** — Tokyo Cross Spray. damage 2 / fireRateMs 60 / bulletSpeed 480 / proj 1 / spread 0 / cost 1300 / tint #f0e8d0 / family turnip / energyCost 9 / bulletSprite "bullet-turnip-tokyo" / podSprite "pod-turnip".
  - **`hailstorm`** — Milan Purple Top Discs. damage 8 / fireRateMs 320 / bulletSpeed 580 / proj 5 / spread 36 / cost 1500 / tint #9050b0 / family turnip / energyCost 14 / bulletSprite "bullet-turnip-milan" / podSprite "pod-turnip".

  When reviving any of these: (1) decide tier (probably 2 if it's reasserting itself as more powerful than tier-1, else 1 alongside the spuds), (2) re-evaluate the `family` enum — the pull also collapsed `WeaponFamily` to `"potato" | "pirate"`; adding `"carrot"` or `"turnip"` back is a single-line schema change; (3) re-add the bullet+pod sprite calls to `BootScene.generateTextures()` (the drawer methods themselves are untouched, sprite keys still resolve), (4) wire into `lootPools.ts` for the system that should drop it.

- **Salvage-pipeline follow-ups** (Sonnet, surfaced in PR #122 and PR #125 reviews):
  - **Tighten `salvageInvariants.test.ts` section terminator.** Currently the third invariant bounds the `Phase Vegetable-Catalog` block at the next `\n## ` heading. If a future TODO entry inserts a `- **Phase X**` bullet between Vegetable-Catalog and "Out of scope" and that bullet contains a backtick-wrapped id, the regex slurps it. Tighten by either anchoring on the next `- **Phase ` boundary too, or requiring 4-space indent on weapon-id sub-bullets so phase headers can't match.
  - **Bidirectional cross-check.** The current invariant walks `documented in TODO → present in REMOVED_WEAPON_BASE_COSTS`. Add the reverse: every entry in the map should also have a verbatim `**\`<id>\`**` mention under Phase Vegetable-Catalog. Catches the rare case where a backlog block gets deleted by accident while the runtime entry persists. Cheap to add — just iterate the other direction in the same test file.
  - **Test `calculateLegacyRefund` directly.** Existing `salvageRemovedWeapons.test.ts` covers the post-migration `salvageRemovedWeapons` helper but not `calculateLegacyRefund`, which is the function actually called from `hydrate()` in production. Add cases for: legacy id-array (`unlockedWeapons + weaponLevels + weaponAugments`), named-slots (`slots.front` / `rear` / etc.), pre-loadout `primaryWeapon` (including the defensive branch where `primaryWeapon` isn't in `unlockedWeapons`), and an end-to-end `hydrate({ship: legacyShape})` integration test asserting `getState().credits` increases by the refund total.
  - **Document slow-debuff stacking semantics.** `Enemy.applySlow` stacks tighter-factor + longer-expiry independently — so a weak-but-long slow can extend a strong-but-short slow's effective duration past its own expiry. Either accept and add a comment, or change to "tighter factor only wins until its own expiry". Decide and document.
  - **Drop the side-effect inside `Enemy.effectiveSpeed`.** It resets `this.slowFactor = 1` when the timer expires — a query that mutates. Rename to `tickSlowAndGetSpeed()` or split the mutation out so the read path is pure.

- **Phase Modular-Architecture-Audit follow-ups** (2026-05-04 audit, see [docs/audit/](docs/audit/)) — the audit shipped 5 PRs (#139 inventory, #140 boundaries, #141 docs for 4 modules + ADRs + CLAUDE/ARCHITECTURE updates, #142 latent fixes, #143 docs for the remaining 6 modules). The following items were deferred from the audit and live here for future work. Read [docs/audit/02-target-architecture.md](docs/audit/02-target-architecture.md) for the proposed boundaries and migration order before starting any of these.
  - **Phase 3 — mechanical extraction** (Sonnet, parallelizable) — enforce the proposed module boundaries in code. Current decision: **keep current paths, add `index.ts` barrels only** (no file moves) to avoid rebase pain on every active branch. The 10 modules are ordered into 5 tiers (leaves first, save-data core middle, UI last). Tier 3 (`state`) is HIGH RISK — must run `/save-roundtrip-audit` before commit per CLAUDE.md §7a. Phase 3 is gated on explicit user approval of [docs/audit/02-target-architecture.md](docs/audit/02-target-architecture.md).
  - **Phase 4c — TSDoc + code-level markers across the 6 modules in PR #143** (`infra`, `state`, `three`, `phaser`, `app`, `ui`). PR #141 shipped TSDoc + `// PUBLIC API` / `// INVARIANT:` / `// AI-NOTE:` markers across the first 4 modules (`types`, `schemas`, `audio`, `content`); PR #143 was rate-limit-constrained and shipped READMEs only. Apply the same pattern to the remaining 6 to close the convention drift between #141 and #143. Six parallel doc-writer agents, one per module, with the contracts inlined per-prompt.
  - **Phase 5 — verification** (Opus). Re-derive the dependency graph after Phase 3 lands; confirm zero cycles + zero cross-module-internal imports. Spot-check 3 modules for "could a fresh agent change this safely with only the docs?" If no, the docs aren't done. Output: `docs/audit/05-final-report.md`.
  - **`saveValidation.ts` lazy-init** — the only `infra → content` ambiguity in the proposed graph. Today `saveValidation.ts:170` walks `getAllLootPools()` at module load (Edge cold-start tax). Lazy-init the derived caps inside `validateNoRegression` so `infra` becomes a true leaf-of-leaves. Bundle with the `infra` module's Phase 3 extraction. (Audit-flagged in [docs/audit/04-found-bugs.md](docs/audit/04-found-bugs.md).)
  - **UI god-file splits** — four `src/components/` files are over the soft 300-LOC limit and mix multiple concerns:
    - `GameCanvas.tsx` (452 LOC, 11 responsibilities) — split via more `useX` hooks (mode machine, victory state, story-trigger wiring, save/score-queue triggers, fade overlay).
    - `ShopUI.tsx` (408 LOC) — split per section: `shop/HullSection.tsx`, `shop/WeaponsSection.tsx`, `shop/AugmentsSection.tsx`.
    - `galaxy/QuestPanel.tsx` (387 LOC, 5 sub-components in one file) — split each `Section`/`Row`/`SuggestedRow` into a per-component file.
    - `loadout/WeaponCard.tsx` (210 LOC) — split mutator wiring out into a parent.
    Each split is a focused refactor in itself; **don't bundle them into Phase 3** — separate PRs per file.
  - **`state/sync.ts` 516 LOC + `state/shipMutators.ts` 366 LOC** — also over the limit, deferred to follow-up after the Phase 3 boundary lands. `sync.ts` splits cleanly along load/save/queue boundaries; `shipMutators.ts` splits per surface (`shipMutators/{weapons,augments,reactor,armor,shield}.ts`).
  - **`saveValidation.ts` 440 LOC** — split per guard kind: `saveValidation/{missionGraph,credits,playtime,regression,leaderboardCompletion}.ts` with `index.ts` re-exporting. Recommended during the `infra` extraction.
  - **`audio/music.ts` 441 LOC** — split per bed (`menuMusic.ts`, `combatMusic.ts`, `shopMusic.ts`) sharing a base. Defer to post-Phase-3.
  - **`three/Planet.ts` 341 LOC + `three/planetTexture.ts` 405 LOC** — split atmosphere/ring helpers out of `Planet.ts`. For `planetTexture.ts`, the audit-flagged fix is to **move per-mission style data into `missions.json`** (closes the latent crash where a Zod-valid mission id triggers a runtime crash in `paintDiffuse` because `styleFor` is non-exhaustive over `MissionId` — see [docs/audit/04-found-bugs.md](docs/audit/04-found-bugs.md)). The data-driven shape is preferred over making the switch exhaustive because it propagates the safety to anyone adding a mission.
  - **`stateCore.ts` module-load side effects** — runs `getAllMissions()` (triggers `runDataIntegrityCheck`) + `readSeenStoriesLocal()` at top level. Lazy-load `INITIAL_STATE` so the integrity check + localStorage read happen on first `getState()` instead of import time. Audit-flagged in [docs/audit/04-found-bugs.md](docs/audit/04-found-bugs.md). Low priority — works today, lazy-init is polish.
  - **`loadout/WeaponDetailsModal.tsx` cross-folder reach to `components/WeaponStats.tsx`** — child folder reaches up to its parent for a sibling. Either move `WeaponStats.tsx` into `loadout/` (if used only there) or pass it as a prop. Resolve during the `ui` Phase 3 extraction. Audit-flagged in [docs/audit/04-found-bugs.md](docs/audit/04-found-bugs.md).
  - **`BootScene.ts` 1819-LOC split** — currently a documented placeholder for procedural texture generators pending real PNG assets. **Defer until real art lands**; if it doesn't land within ~6 months, split the generators into a `boot/` subfolder by family (`boot/bullets.ts`, `boot/enemies.ts`, etc.) for sanity. Audit-flagged in [docs/audit/04-found-bugs.md](docs/audit/04-found-bugs.md).
  - **5 open questions from Phase 2** ([docs/audit/02-target-architecture.md](docs/audit/02-target-architecture.md)) — see "Open questions for the orchestrator" at the end of that file. Most are resolved by the calls noted in PR #143's body; the remaining open one is whether `saveValidation.ts` lazy-init lands inline with the `infra` extraction or as a separate follow-up (recommended: inline).

- **Phase Shop-Tabs** (Sonnet) — MARKET / GARAGE split inside `/shop`. Today the page stacks LoadoutMenu + HULL/REACTOR + BUY WEAPONS + AUGMENTS in one long scroll (~1700-2200px desktop). Decision: **Option A from the 2026-05-05 layout-restructure analysis** — single `/shop` route with a sticky tab bar under StickyHeader toggling two panels:
  - **MARKET** = HULL & SHIELD + REACTOR + BUY WEAPONS + BUY AUGMENTS (purchase views; "owned ×N" chips stay).
  - **GARAGE** = SHIP LOADOUT (SlotGrid + EQUIPPED + INVENTORY + AUGMENT INVENTORY).
  Tab state in `useState` for v1 (cheapest); add `?tab=garage` searchParam later if deep-linking is wanted. Page stays `force-static`. New file `src/components/loadout/ShopTabs.tsx` (~60 LOC); affects `src/app/shop/page.tsx`, `src/components/ShopUI.tsx`, `src/components/LoadoutMenu.tsx`. Mitigate post-buy friction with a "→ GARAGE" toast/CTA on purchase. **Foundation for Phase Loadout-DPS-Graph below** — graph lives in GARAGE next to EQUIPPED.

- **Phase Loadout-DPS-Graph** (Sonnet, depends on Phase Shop-Tabs) — vertical-bar strip showing each equipped weapon's DPS contribution + total DPS, lives in GARAGE above EQUIPPED. Decision: **Option B from the 2026-05-05 damage-graph analysis** — reuses the `Bar` primitive shipped in PR #168's `AugmentDetailsModal`. **Companion task:** extract `dpsOf` from [src/components/loadout/augmentImpact.ts:30](src/components/loadout/augmentImpact.ts#L30) to a shared helper so the graph and the inline DPS calc at [src/components/loadout/WeaponCard.tsx:79](src/components/loadout/WeaponCard.tsx#L79) stop duplicating the formula (closes a follow-up flagged in PR #168 review). Also extract `Bar` from `AugmentDetailsModal` into `src/components/loadout/Bar.tsx`. **Decisions for v1:** empty slots are hidden (slot count visible elsewhere in SlotGrid); no before/after projection on augment-picker hover (defer — doubles complexity); no energy-cost overlay; weapons-only (defensive stats are a separate ship-summary card if/when wanted).

- **Phase Mission-Damage-Report** (Sonnet) — end-of-mission VictoryModal gains a TOTAL damage row + per-weapon damage breakdown, sorted descending. Decisions: **cap-at-remaining-HP** (overkill not counted, more honest, prevents stat-padding from big-hit weapons); **list display** (sorted rows, not a chart — start simple, can add a stacked bar later); **ephemeral** (data lives only in the result modal, NOT persisted to `save_games` — defers a migration). **Load-bearing change:** stamp `weaponId: WeaponId | null` onto every friendly bullet at fire time (today the bullet is anonymous after `WeaponSystem.tryFire` at [src/game/phaser/systems/WeaponSystem.ts:39](src/game/phaser/systems/WeaponSystem.ts#L39)). Implementation skeleton:
  1. Thread `weaponId` through `BulletPool.spawn` → `Bullet.fire` (hostile bullets pass `null`).
  2. New `src/game/phaser/scenes/combat/DamageTracker.ts` peer with `CombatHud`/`CombatVfx`/`DropController` — owns `Map<WeaponId, number>`, `record / total / snapshot`. Reset on `init`.
  3. Wire attribution: `onEnemyHit` and `applyBulletAoE` in `CombatScene` → `damageTracker.record(bullet.weaponId, applied)`. AoE attributes to firing weapon, not chained victims. `Enemy.takeDamage` returns `{killed, applied}` so overkill can be capped.
  4. Extend `CombatSummary` ([src/game/phaser/config.ts:26](src/game/phaser/config.ts#L26)) with `damageByWeapon: Readonly<Record<WeaponId, number>>` + `totalDamage: number`. `CombatScene.finish` writes them via `damageTracker.snapshot()`. No event-bus change — registry path already carries it.
  5. Surface in `VictoryModal` ([src/components/galaxy/VictoryModal.tsx](src/components/galaxy/VictoryModal.tsx)) — new `─── DAMAGE ───` block: `TOTAL` row + per-weapon rows. Hide on zero-damage losses. Resolve display name via `getWeapon(id).name`. Future expansion (next-up, not in this phase): damage taken, shots fired/hit per weapon → accuracy %, kills per weapon, time alive, perks triggered.

- **User menu features** — fill out the empty `UserMenu` dropdown in the galaxy view ([src/components/UserMenu.tsx](src/components/UserMenu.tsx)). Sign-out intentionally lives only on the landing page (`SignInButton`) so players can't accidentally log out mid-mission. Items to add, in rough priority order:
  - **Avatar** — pick from a small library of preset images (`public/avatars/*`) or upload one. Stored on `players.avatar` (new column). Rendered next to the handle in the dropdown trigger and on the leaderboard rows.
  - **Change handle** — opens the existing `HandlePrompt` modal in "edit" mode against POST `/api/handle`; same uniqueness rules apply. Cooldown/rate-limit TBD.
  - **GDPR — export my data** — generates a JSON download with the player's row from `players`, all their `save_games`, and all their `leaderboard` entries. Edge route, no PII other than the player's own.
  - **GDPR — delete my account** — confirmation modal, then deletes the player row (CASCADE wipes saves + leaderboard entries). Signs the user out afterwards.
  - **Link to /settings** — when the menu grows beyond ~4-5 items, the heavier flows (avatar uploader, GDPR forms) should move to a dedicated `/settings` page; the dropdown becomes a thin shortcut.

- **Shop DETAILS voice — remaining items** (operator, AudiobookMaker pipeline). PR #131 wired the convention `/audio/weapons/<id>-voice.mp3` and `/audio/augments/<id>-voice.mp3`; `storyAudio` swallows 404s so missing files just open the modal silently. PR #133 shipped the three potato weapons. Outstanding files (Grandmom, same encoding as the existing `ui_shop_*` cues — mono 24kHz 128kbps MP3):
  - **Pirate weapons** — `corsair-missile-voice.mp3`, `grapeshot-cannon-voice.mp3`, `boarding-snare-voice.mp3`. Lean into Grandmom not understanding pirate hardware (homing missile / black-powder cannonballs / weighted nets).
  - **Augments (5)** — `damage-up-voice.mp3`, `fire-rate-up-voice.mp3`, `extra-projectile-voice.mp3`, `energy-down-voice.mp3`, `homing-up-voice.mp3` under `public/audio/augments/`. Same Grandmom voice; one short line per augment (~5s each).
  - Hull / shield / reactor rows in the HULL & SHIELD section don't open a DETAILS modal today — they're already compact. If voice is wanted there, that's a UI change, not just an asset drop. Defer until requested.

- Real art: drop PNGs into [public/sprites/](public/sprites/) with the keys already referenced in code (e.g. `/sprites/player/ship.png`). [BootScene](src/game/phaser/scenes/BootScene.ts) currently synthesizes placeholders — switch its `preload` to load files when assets exist.
- ~~Real audio: drop files into public/audio/ and rewrite sfx.ts to trigger HTMLAudioElement playback.~~ **— DONE for music + voice.** The audio storyline pipeline is shipped: `menuMusic` / `combatMusic` (HTMLAudioElement-based engines in [music.ts](src/game/audio/music.ts)), four story-system engines (`storyAudio`, `storyLogAudio`, `menuBriefingAudio`, `itemSfx`), and a real `public/audio/{menu,story,sfx,music}/` tree. Combat SFX (laser/hit/explosion/pickup chime) intentionally remain procedural Web Audio in [sfx.ts](src/game/audio/sfx.ts) — short impact sounds, no benefit to file-based playback.
- Real planet textures: file names in [missions.json](src/game/data/missions.json) under `texture` — loader already tries and falls back to flat color.
- Background music per mission + galaxy theme.
- Gamepad support — write a second factory in [Controls.ts](src/game/phaser/systems/Controls.ts).
- **Mobile combat (touch controls)** — deferred from the menu+galaxy mobile pass (which shipped). Scope:
  - Touch input model: drag-anywhere-to-move + auto-fire while finger is down (fits the existing hold-to-fire pattern). Implement as a second `Controls.ts` factory so the desktop keyboard model stays untouched.
  - Phaser `Scale Manager` set to `FIT` so the combat canvas resizes to the viewport.
  - On-screen pause button (P/Esc isn't reachable on touch).
  - Real-iPhone audio test for the combat scene — combat adds `combatMusic` on top of the menu/story audio elements; if the menu+galaxy mobile pass had to reduce simultaneous HTMLAudioElement count, combat may need similar discipline.
  - Tuning pass: dodge feel, fire reachability, pause-button hit area.

## Out of scope for MVP — do NOT build

- Multiplayer or ghost replays.
- ~~Story, dialogue, or cutscenes.~~ **— SUPERSEDED.** The audio storyline is now a flagship feature: a fully-voiced narrative layer with one consistent narrator persona (Grandma), spanning the menu briefing queue, opening cinematic, per-mission briefings, shop arrival line, system-cleared idle voice, item-acquisition cues, and the replay-able Story log. See [README.md](README.md) "Audio storyline" section, [src/game/data/story.ts](src/game/data/story.ts), and the `/new-story` skill. New story content is added through `/new-story`.
- Procedural mission / level generation.
- Achievements system.
- ~~More than 4 planets (3 missions + 1 shop)~~ — **superseded by Phase 9**: 2 solar systems and 8 planets total now. Hand-authored content cap is now per-system, not project-wide.
- Mobile / touch controls.
- Mod support, user-generated content.
- In-app purchases.
- **Mobile combat / touch combat controls** — deferred. Menu + galaxy view are being made mobile-friendly in a separate pass; combat-on-mobile is the next-up item above. Until that lands, the game on mobile is "browse and choose missions, but launch into combat on a desktop".

If a task tempts you to cross one of these lines, **stop and ask the user**.
