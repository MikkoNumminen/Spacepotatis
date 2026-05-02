# CLAUDE.md — Spacepotatis agent guide

This file is loaded into every Claude Code session in this repo. It is the single source of truth for **how agents should work here**. Read it before making changes.

## 1. What we are building

A **Tyrian 2000–inspired vertical scrolling space shooter** with a **3D galaxy overworld**, wrapped in a **fully-voiced audiobook-style storyline**.

Three pillars:

1. **Galaxy View** (Three.js): a 3D solar system. Each planet is a mission, shop, or hub. Non-linear — the player picks their path.
2. **Combat Mission** (Phaser 3): top-down vertical shooter. Ship scrolls upward, enemies fall from above, collect power-ups, fight bosses.
3. **Audio storyline & audio-assisted gameplay** (NOT a small thing — see README "Audio storyline" section): every voice in the game is read by a single character — **Grandma** — generated on Mikko's machine via the **AudiobookMaker** repo (Chatterbox TTS) and dropped in as plain mp3s. Voice surfaces include: a menu-briefing nudge queue + system-briefing lecture on every menu visit, a "Great Potato Awakening" cinematic opener, per-mission briefings, a "Market arrival" line on every shop dock, an idle "system cleared" voice that loops while the player lingers in a fully-cleared system, four per-category item-acquisition cues at drops + shop purchases, and a Story log that replays everything. Each `StoryEntry` carries TWO parallel text fields: `body` (what Grandma reads aloud — short, sentence-clean) and `logSummary` (the deeper written synopsis surfaced in the Story log list — 2-4 paragraphs, can go further than the spoken track). The audio is doing both narrative work AND UI-feedback work — when the player gets a gun, Grandma says so; the player doesn't need to read a tooltip.

**Loop:** galaxy view → select planet → camera zoom → Phaser combat → result screen → back to galaxy → shop or next mission. Grandma narrates the connective tissue throughout.

## 2. Tech stack (and why each)

- **Next.js 15 (App Router)** — shell, routing, menus, shop UI. Static-first build.
- **Phaser 3** — 2D combat scenes. Loaded client-side only.
- **Three.js** — 3D galaxy overworld. Loaded client-side only.
- **GSAP** — transitions between galaxy and combat (camera zooms, fade-outs).
- **Kysely + `@neondatabase/serverless`** — type-safe SQL query builder over Neon's WebSocket Pool driver. Edge-compatible. **No ORM. No Prisma.**
- **dbmate** — plain SQL migration files. Config: [dbmate.toml](dbmate.toml). Migrations: [db/migrations/](db/migrations/).
- **PostgreSQL (Neon serverless)** — player saves, leaderboards.
- **NextAuth v5 / Auth.js** — Google OAuth only (save games are per-account).
- **Tailwind CSS** — UI styling. No component library.
- **TypeScript strict** everywhere. `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` are on.

## 3. Vercel CPU budget — THE load-bearing constraint

This game runs on **Vercel Hobby tier**. Serverless CPU hours are scarce. Every architectural decision must minimize function invocations.

**Rules:**

- **All game logic runs client-side.** Phaser + Three.js execute in the browser.
- **Pages are static by default.** Each page exports `export const dynamic = "force-static"`.
- **API routes are the only server functions.** They exist for: auth, save, load, leaderboard. Nothing else.
- **Prefer Edge Runtime** on API routes when possible (`export const runtime = "edge"`).
- **No middleware on game routes.** Middleware only wraps API routes that need auth.
- **Cache aggressively.** Leaderboard reads: ISR with `revalidate: 60`.
- **Phaser + Three.js are dynamically imported with `ssr: false`.** They must never run during SSR / SSG.
- **Assets are plain files under [public/](public/)** — sprites, audio, textures. No server-side image pipeline.
- **Build budget: < 2 minutes.** No heavy generation steps.

If a feature seems to need a new server-side code path, **stop and confirm with the user first.**

## 4. File ownership — parallel agent boundaries

Agents may work in parallel on disjoint directories. Treat these as ownership zones:

| Zone                                                      | Owner / responsibility                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| [src/app/](src/app/)                                      | Next.js pages, layouts, API routes              |
| [src/components/](src/components/)                        | React UI orchestrators (LoadoutMenu, GameCanvas, ShopUI, etc.) |
| [src/components/galaxy/](src/components/galaxy/)          | Galaxy-view chrome (HudFrame, WarpPicker, LoadoutModal) |
| [src/components/loadout/](src/components/loadout/)        | LoadoutMenu sub-components (SlotGrid, WeaponCard, pickers) |
| [src/components/hooks/](src/components/hooks/)            | Client-side React hooks (useGalaxyScene, usePhaserGame, useCloudSaveSync, useNextMissionAutoSelect) |
| [src/game/phaser/](src/game/phaser/)                      | Phaser scenes, entities, systems, typed bus     |
| [src/game/phaser/scenes/combat/](src/game/phaser/scenes/combat/) | CombatScene helpers (CombatHud, CombatVfx, DropController, PerkController) |
| [src/game/phaser/entities/player/](src/game/phaser/entities/player/) | Player helpers (SlotModResolver, PlayerCombatant, PlayerFireController, PodController, slotLayout) |
| [src/game/data/](src/game/data/)                          | Game balance JSON + accessors (weapons, enemies, waves, missions, perks, augments, solarSystems) — **shared content registry** |
| [src/game/three/](src/game/three/)                        | Three.js galaxy overworld + shared `SceneRig`   |
| [src/game/state/](src/game/state/)                        | GameState barrel + slices (stateCore, shipMutators, persistence, pricing), ShipConfig, sync, useGameState |
| [src/game/audio/](src/game/audio/)                        | Audio engines: `AudioBus.ts` (single source of truth for mute — engines call `audioBus.register(category, this)` in their constructor under one of `music` / `voice` / `sfx`, and the bus drives every engine's `setMuted(boolean)` when the effective mute flips. UI flips state via `audioBus.setMasterMuted` / `setCategoryMuted`. **Mute is session-only — never read or write `localStorage["spacepotatis:muted"]` from new code, and never re-introduce a manual fan-out hub like the old `setAllMuted`**), `music.ts` (menu + combat beds, both `music` category, hot-swap via `loadTrack`), `story.ts` (StoryModal cinematics, `music`; first-time-mode modals duck `menuMusic` while playing so the cinematic isn't competing with the galaxy bed), `storyLogAudio.ts` (Story-log bed, `music`), `menuBriefingAudio.ts` (landing-page voice queue, `voice`), `itemSfx.ts` (per-category drop/shop cues, `voice` — spawn-and-release per fire, no persistent template elements that count against iOS's ~6-element budget), `leaderboardAudio.ts` (Hall of Mediocrity intro voice, `voice`), `sfx.ts` (procedural Web-Audio combat SFX, `sfx` — every `play*` call must wire `autoDispose(stopper, ...rest)` so nodes disconnect on `ended`, AND every chain must terminate at `this.sink` (the shared master `GainNode`), not `ctx.destination`, so the bus can flip in-flight sounds silent in one assignment) |
| [src/lib/](src/lib/)                                      | DB client, auth, leaderboard, players, handle, routes, useHandle |
| [src/lib/schemas/](src/lib/schemas/)                      | Zod schemas validating every API boundary        |
| [src/types/](src/types/)                                  | Shared TypeScript types                         |
| [db/migrations/](db/migrations/)                          | SQL schema migrations (node-based runner; dbmate not required) |
| [public/](public/)                                        | Static assets (sprites, audio, textures)        |

**Shared files** (require coordination): `src/types/*.ts`, `src/lib/db.ts`, `src/lib/schemas/*.ts`, `src/lib/routes.ts`, the `src/game/state/` cluster, JSON under `src/game/data/`.

## 5. Coding standards

### TypeScript

- `strict: true` — never disable it.
- **No `any`.** ESLint enforces it. Use `unknown` + narrowing, or define the type properly.
- No non-null assertions (`!`) unless you leave a comment explaining why null is impossible.
- Prefer `readonly` on data structures that don't mutate.
- Re-export types from `src/types/` — avoid deep import paths.

### React

- Server Components by default; add `"use client"` only when you need state, effects, or the browser APIs.
- **Phaser and Three.js imports are client-only.** They must live inside `"use client"` files, and the enclosing page should dynamically import them via `next/dynamic` with `ssr: false`.
- No `useEffect` for deriving state from props — compute during render.
- Components under [src/components/](src/components/) are presentational; game state flows in via props, not context gymnastics.

### Game code (Phaser + Three.js)

- One scene per file. Scenes live under [src/game/phaser/scenes/](src/game/phaser/scenes/). Scene helpers (HUD, drop logic, perk handling, vfx) live in [src/game/phaser/scenes/combat/](src/game/phaser/scenes/combat/).
- Entities (Player, Enemy, Bullet, PowerUp) extend Phaser `GameObjects`. One class per file. Player composes helpers from [src/game/phaser/entities/player/](src/game/phaser/entities/player/) (SlotModResolver, PlayerCombatant, PlayerFireController).
- Systems (wave spawning, collision, weapons, scoring) are stateless helpers or per-scene manager instances. No global singletons.
- **Game balance data lives in JSON** under [src/game/data/](src/game/data/). Never hard-code damage numbers, HP, spawn counts, etc. Read it through the typed accessors (`getEnemy`, `getWeapon`, `getMission`, etc.), not raw `as readonly XDefinition[]` casts.
- Use `readonly` for loaded JSON config — once parsed, it doesn't mutate.
- **Cross-scene communication uses the typed bus.** Emit via `emit(scene, { type: "..." })` from [src/game/phaser/events.ts](src/game/phaser/events.ts); read shared scene-graph state via the typed accessors in [src/game/phaser/registry.ts](src/game/phaser/registry.ts). Never use `scene.events.emit("string-name")` or `game.registry.set("string-key", ...)` directly — those are compile-blind.

### Modularity discipline

These rules came out of the 2026-04-27 modularity audit. Folding them in to keep the cleanup from rotting.

- **Module size limit.** Files over ~300 lines need a justification or get split. Split by concern (data/render/business/effects), not by line count alone.
- **No cross-domain imports.** `game/phaser/` does not reach into `game/three/`. State changes flow through events or the GameState barrel. Shared data lives under `src/game/data/`.
- **API boundaries get Zod schemas.** New API routes validate input via [src/lib/schemas/](src/lib/schemas/) and type their output through a derived `z.infer`. **No `as` casts at the network edge** — neither in `app/api/*/route.ts` (server input) nor in client `fetch` consumers like `src/game/state/sync.ts`.
- **One concern per file.** Data fetching, rendering, business logic, and side effects don't share a file. Hooks under `src/components/hooks/` exist for exactly this reason.
- **New public API gets a boundary test.** Adding an exported function to a module means adding a test in the matching `*.test.ts` that exercises its contract.
- **Centralized constants.** Strings used in 2+ places (route paths, Phaser event names, registry keys, scene keys) live in a constants file. See [src/lib/routes.ts](src/lib/routes.ts), [src/game/phaser/events.ts](src/game/phaser/events.ts), [src/game/phaser/registry.ts](src/game/phaser/registry.ts), and `SCENE_KEYS` in [src/game/phaser/config.ts](src/game/phaser/config.ts).
- **CI gates are blocking.** `typecheck`, `lint`, `test`, `build` all run on every push and PR (see [.github/workflows/ci.yml](.github/workflows/ci.yml)). Suppressing errors (`@ts-expect-error`, `eslint-disable`) requires an inline justification comment AND a strong reason — the audit deleted two such suppressions because they were hiding a real bug.

### Database / SQL

- All queries go through Kysely. No raw SQL outside [src/lib/db.ts](src/lib/db.ts).
- The single `Database` interface in [src/lib/db.ts](src/lib/db.ts) is the canonical schema. Update it when you add a migration.
- Migrations are **forward-only**. Every change is a new SQL file under [db/migrations/](db/migrations/).
- **Tables are namespaced under the `spacepotatis` Postgres schema** because the Vercel/Neon database is shared with other services. Always create tables as `spacepotatis.<name>`, reference them in Kysely as `"spacepotatis.<name>"`, and never write to `public.*`. dbmate's tracker table lives in `public.spacepotatis_schema_migrations` (configured in [dbmate.toml](dbmate.toml)).
- Never use Prisma. Never install `@prisma/*`. If an agent suggests it, refuse.

### Comments

- Default to **no comments**. Names should carry meaning.
- Write a comment only for a non-obvious *why* — a constraint, a workaround, a surprising invariant. Never a `what`.

## 6. How to run locally

```bash
# 1. Install deps
npm install

# 2. Env vars
cp .env.example .env.local
# Edit .env.local — at minimum set DATABASE_URL

# 3. Database — node-based migration runner (no dbmate install required)
npm run db:migrate

# 4. Dev server
npm run dev
# http://localhost:3000

# 5. The same checks CI runs
npm run typecheck    # tsc --noEmit
npm run lint         # eslint . (flat config; not next lint)
npm test             # vitest run — 808 tests
npm run build        # next build (catches RSC/client-boundary errors)
```

### Pre-commit hook

`npm install` wires a husky-managed pre-commit hook (`.husky/pre-commit`) that runs `npx lint-staged` (ESLint with `--fix` on staged `*.{ts,tsx}` only) followed by `npm run typecheck`. Total overhead ~5s on a typical change. Tests are intentionally NOT in the hook — they still gate on push via CI. Lint-staged config lives in [package.json](package.json) under `"lint-staged"`. Do not add `--no-verify` to commits to bypass it; if the hook is firing on something it shouldn't, fix the rule, not the hook.

### Working without a database

Local gameplay does NOT require a database. Save/load and leaderboard features degrade gracefully — the game uses in-memory state when auth + DB are absent. Only sign in / persistence flows need `DATABASE_URL` configured.

### Controls (current)

- WASD / arrow keys — move the ship.
- Space — fire **all** equipped weapon slots (held to fire; each slot is throttled independently by its weapon's fireRateMs).
- P or ESC — pause. During pause: P to resume, ESC to abandon the mission (counts as a loss).
- Galaxy view — drag to orbit the camera, scroll wheel to zoom, click a planet to open its mission panel.

## 7. How to deploy (Vercel)

1. Push to GitHub.
2. Import the repo in Vercel. Framework preset: Next.js (auto-detected).
3. Set env vars in the Vercel project:
   - `DATABASE_URL` — Neon pooled connection string.
   - `AUTH_SECRET` — `openssl rand -base64 32`.
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — from Google Cloud Console.
4. Deploy. Static pages precompute at build; API routes go to Edge or Node Functions.

Migrations are run **out-of-band** against the Neon direct (non-pooled) URL:

```bash
DATABASE_URL="<neon-direct-url>" npm run db:migrate
# or, if dbmate isn't installed:
node --env-file=.env.local scripts/migrate.mjs
```

### 7a. Migration shipping rule (HARD RULE)

**Any PR that adds a new file under [db/migrations/](db/migrations/) is NOT done until the migration has been applied to production.** Period. Merging schema-referencing code without applying the migration produces 500s on every API call that hits the new column/table — and unlike a code bug, it can't be diagnosed from the modal alone (the catch block returns `{error: "server_error"}` and the only signal in Vercel logs is `console.error` output that's easy to miss).

This bit us once already: PR #89 (the story-log feature) added `seen_story_entries TEXT[]` and the migration sat unapplied for 3 days. Every save POST 500'd; players' progression silently failed to persist. The recovery cost was hours of log-spelunking and a separate save-durability layer to mask future occurrences.

The contract:

1. **Adding a migration in a PR.** PR description MUST include a checkbox "Migration applied to prod" alongside the usual ones. The reviewer's merge button is gated on that checkbox.
2. **Applying the migration.** Run before — or at the latest **immediately after** — merging the PR:
   ```bash
   node --env-file=.env.local scripts/migrate.mjs
   ```
   The runner is idempotent (tracks applied versions in `public.spacepotatis_schema_migrations`), so re-running after a failure or partial apply is safe.
3. **Verifying.** Run [scripts/check-schema.mjs](scripts/check-schema.mjs) to confirm the new column / table is present. Output is read-only.
4. **If you can't apply it now, don't merge yet.** Migrations and the code referencing them must land on prod together. A merge that ships the code first is broken-by-design until the migration runs — and Vercel's deploy-on-push will publish the broken code seconds after the merge.

## 8. Commit and PR hygiene

- Conventional-ish commits: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- Before committing: `npm run typecheck && npm run lint`.
- Do not commit `.env.local`, `.vercel/`, `out/`, `.next/`, or `db/schema.sql` (dbmate auto-generates it).
- Keep PRs scoped — one feature per PR. Prefer bundled-but-focused over split-into-five.
- **Do not add `Co-Authored-By: Claude ...` (or any other AI-attribution) trailers to commits.** They clutter the GitHub commits view with a Claude icon next to the author. Just commit as the user.

## 9. Hard rules

- **No Prisma.** Ever.
- **No `output: "export"`** in `next.config.mjs` — it disables API routes. Use per-route `force-static` instead.
- **No SSR for game pages.** Phaser/Three must be behind `next/dynamic({ ssr: false })`.
- **No heavy server compute.** If a task requires server-side game logic, pause and ask.
- **No game balance constants in code.** They belong in [src/game/data/](src/game/data/).
- **No `any` types.** Full stop. **No `as` casts at the network edge** — use Zod schemas in [src/lib/schemas/](src/lib/schemas/).
- **No merging schema-touching code without applying the migration to prod.** See §7a — adding a SQL file under `db/migrations/` is half the work; running it on prod is the other half. PRs that add a migration are not done until both halves land. Every save POST will 500 if the column doesn't exist, and the symptom (modal saying `server_error`) is easy to mistake for a code bug.
- **Don't bypass the cheat guards.** `/api/save` and `/api/leaderboard` enforce mission-graph + credits-delta + playtime-delta + leaderboard-completion checks via [src/lib/saveValidation.ts](src/lib/saveValidation.ts). The credit caps auto-derive from `enemies.json` + `lootPools.ts` + the player's stored `completedMissions` — a 10× balance change scales the caps 10× automatically. **Don't replace the derivation with hard-coded constants** "for simplicity" — that's exactly the rake we already stepped on once.
- **No string-keyed Phaser events or registry access.** Use the typed wrappers in [src/game/phaser/events.ts](src/game/phaser/events.ts) and [src/game/phaser/registry.ts](src/game/phaser/registry.ts).
- **MVP scope is capped.** See [TODO.md](TODO.md) "Out of scope for MVP".

## 10. Prefer skills for content tasks

Project skills live under [.claude/skills/](.claude/skills/) and are auto-loaded into every session. **Use them instead of re-exploring the codebase** — that's the entire reason they exist (token cost reduction).

| If the user asks for…                          | Invoke              |
| ---------------------------------------------- | ------------------- |
| A new combat mission or shop planet            | `/new-mission`      |
| A new enemy type                               | `/new-enemy`        |
| **Anything** weapon/equipment-related — add, modify, remove, recolor, re-skin, rebalance a weapon, augment, reactor, shield, or armor (including bullet sprites, UI tints, HUD bars) | `/equipment` |
| A new mission perk (passive or active)         | `/new-perk`         |
| A new solar system in the overworld            | `/new-solar-system` |
| **Anything** story-related — new entry, cinematic, voiceover, narration, lore, chapter | `/new-story` |
| "What did this JSON tweak do to balance?"      | `/balance-review`   |
| "Is the content safe to commit?" / pre-PR      | `/content-audit`    |

If the request maps to a skill, **invoke it before grepping or reading files** — the skill body already contains the file paths, field names, and invariants you'd otherwise have to derive. If the request *almost* maps to a skill but has an extra constraint, still invoke the skill and adapt; do not fall back to the long path.

## 11. Where things live (post-audit map)

The 2026-04-27 modularity audit broke up several god modules. Quick lookup of where each concern now lives:

| Concern | Location |
|---|---|
| State singleton + listeners + `commit` | [src/game/state/stateCore.ts](src/game/state/stateCore.ts) |
| Ship mutators (equip, buy, upgrade, augment) | [src/game/state/shipMutators.ts](src/game/state/shipMutators.ts) |
| Snapshot / hydrate / migrateShip | [src/game/state/persistence.ts](src/game/state/persistence.ts) (orchestrator) + [src/game/state/persistence/](src/game/state/persistence/) (per-shape migrators: `migrateNewShape`, `migrateLegacyIdArray`, `migrateNamedSlots`, `migratePrimaryWeapon`, `safetyNet`, `helpers`, `legacyShared`) |
| Sell pricing | [src/game/state/pricing.ts](src/game/state/pricing.ts) |
| GameState public surface | [src/game/state/GameState.ts](src/game/state/GameState.ts) (barrel re-export) |
| Wire-format Zod schemas (save / leaderboard payloads) | [src/lib/schemas/save.ts](src/lib/schemas/save.ts) |
| Boot-time Zod parse of `missions.json` | [src/lib/schemas/missions.ts](src/lib/schemas/missions.ts) |
| Server-side cheat guards (mission graph, credits delta, playtime delta, per-player progression-aware caps) | [src/lib/saveValidation.ts](src/lib/saveValidation.ts) |
| Leaderboard score queue (localStorage durability + auto-retry on mount/visibility/online) | [src/game/state/scoreQueue.ts](src/game/state/scoreQueue.ts) — see ARCHITECTURE.md §4a. **Never bypass the queue when posting a score** — `enqueueScore` first, then `drainScoreQueue` (or let the existing GameCanvas triggers handle it). The leaderboard is required to be eventually-consistent; fire-and-forget POSTs lose scores. |
| Route constants | [src/lib/routes.ts](src/lib/routes.ts) |
| Player handle hook | [src/lib/useHandle.ts](src/lib/useHandle.ts) |
| Phaser event union + emit/on wrappers | [src/game/phaser/events.ts](src/game/phaser/events.ts) |
| Phaser registry typed accessors | [src/game/phaser/registry.ts](src/game/phaser/registry.ts) |
| Three.js scene scaffold (renderer, fog, lighting, starfield) | [src/game/three/SceneRig.ts](src/game/three/SceneRig.ts) |
| Player helpers | [src/game/phaser/entities/player/{SlotModResolver,PlayerCombatant,PlayerFireController,PodController,slotLayout}.ts](src/game/phaser/entities/player/) |
| Combat scene helpers | [src/game/phaser/scenes/combat/{CombatHud,CombatVfx,DropController,PerkController}.ts](src/game/phaser/scenes/combat/) |
| Galaxy chrome | [src/components/galaxy/](src/components/galaxy/) + [src/components/hooks/](src/components/hooks/) |
| Loadout chrome | [src/components/loadout/](src/components/loadout/) |
| Phaser test harness (fake scene + time queue) | [src/game/phaser/__tests__/fakeScene.ts](src/game/phaser/__tests__/fakeScene.ts) |

## 12. README.md is barney-style educational

[README.md](README.md) is the public front door on GitHub. It must be written so a complete beginner — non-developer, non-gamer, never heard of Tyrian — can read it top-to-bottom and follow along without looking anything up.

- Greet the reader. Friendly tone, "you" pronouns.
- Define every acronym and jargon term inline the first time it appears (CI, OG image, PWA, ORM, Edge Runtime, ISR, OAuth, etc.).
- Explain what a tool *does* before naming it ("we use Phaser, a 2D-game engine that runs in the browser, to handle the actual shooting and dodging").
- Walk-throughs over tables when explaining a flow. Tables are fine for reference data.
- Each terminal command should be preceded by one sentence saying what it does and why you'd run it.
- README.md may be long. Terseness rules from §5 ("default to no comments") and §10 do NOT apply here.

This rule applies ONLY to README.md. ARCHITECTURE.md, CLAUDE.md, and code comments stay developer-facing and concise.

## 13. Vercel resource discipline (mandatory checklist)

Section 3 covers the *principles*. This section is the **per-PR checklist**. Consult it BEFORE adding any new server-rendered route, middleware, image route, cron, or `public/` asset. Vercel Hobby tier limits are tight (100k function invocations / 100 GB-hours CPU / 100 GB transfer per month) and one careless route or asset can blow the budget overnight.

**Before you add a new page or route, answer:**

- [ ] **Default to static.** Can this page be `export const dynamic = "force-static"`? If not, can it be ISR (`export const revalidate = N`) instead of fully dynamic? Justify any fully dynamic page in the PR body.
- [ ] **API route necessary?** Could this be a build-time JSON file the client fetches, or a direct client→external-service call? New `src/app/api/**` routes need a one-line cost note in the PR body.
- [ ] **DB queries cached?** Wrap every Neon query in `unstable_cache(...,{revalidate, tags: [...]})` from `next/cache` unless the route explicitly needs per-request fresh data. Document the TTL inline.
- [ ] **Mutating routes call `revalidateTag`** so the matching cached read self-flushes.

**Forbidden without explicit user sign-off:**

- [ ] **Middleware** (`src/middleware.ts`). Edge middleware fires on every matched request including static asset paths. If you must add it, the matcher MUST exclude `_next/static`, `_next/image`, `favicon.ico`, and any `public/**`. Prefer route-level checks instead.
- [ ] **Cron jobs** (`vercel.json` `crons` array). Each cron runs even with zero users and burns invocations forever. Include a cost calculation in the PR body if proposing one.
- [ ] **`next/image`** for game assets. Use plain `<img>` for anything in `public/` or generated by the game. `next/image` re-encodes per request and counts against the 5,000-image-optimization quota.

**Generated images (`next/og` ImageResponse, `app/icon.tsx`, `app/opengraph-image.tsx`, `app/apple-icon.tsx`):**

- [ ] If the image has no per-request input, mark it `export const dynamic = "force-static"` so it's baked at build time. Otherwise scrapers (Slack, Discord, Twitter, Google preview, etc.) will re-invoke the route forever.

**Assets in `public/`:**

- [ ] **No file > 500 KB in `public/`.** Heavy assets (sprite sheets, audio, 3D models, large textures) go to Cloudflare R2 (free egress) or another object store and are loaded client-side via URL.
- [ ] **Hashed filenames** for cacheability — Next.js does this automatically for assets it bundles, but anything you drop in `public/` should be content-hashed if you expect it to be cached aggressively.

**Build pipeline:**

- [ ] **Preview builds** are skipped for doc/CI/`.claude/` only changes via `scripts/vercel-ignore.sh` (referenced from `vercel.json`'s `ignoreCommand`). If you add a new "build can be skipped" path, add it there.
- [ ] **GitHub Actions CI** (`.github/workflows/ci.yml`) has `paths-ignore` for the same patterns. Keep both lists in sync.

**Sanity check before merge:**

- [ ] Run `du -sh public/` and confirm no surprises.
- [ ] Confirm the new route, if any, is on the cheapest viable runtime tier (Edge > Node > Image-Optimization-priced).
- [ ] If you touched anything in `src/app/api/**`, re-skim section 3.

If any answer above feels wrong but you can't articulate why, **stop and ask** — the cost surface is unforgiving. A single uncached endpoint that gets linked on social media can drain the month's budget in hours.

## 14. When in doubt

1. Skim [ARCHITECTURE.md](ARCHITECTURE.md) for data flow and scene lifecycle.
2. Check [TODO.md](TODO.md) to see if the task is already planned and which model is recommended.
3. If the answer is not in these files or the code, ask the user before inventing one.
