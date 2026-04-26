# CLAUDE.md — Spacepotatis agent guide

This file is loaded into every Claude Code session in this repo. It is the single source of truth for **how agents should work here**. Read it before making changes.

## 1. What we are building

A **Tyrian 2000–inspired vertical scrolling space shooter** with a **3D galaxy overworld**.

Two gameplay modes linked together:

1. **Galaxy View** (Three.js): a 3D solar system. Each planet is a mission, shop, or hub. Non-linear — the player picks their path.
2. **Combat Mission** (Phaser 3): top-down vertical shooter. Ship scrolls upward, enemies fall from above, collect power-ups, fight bosses.

**Loop:** galaxy view → select planet → camera zoom → Phaser combat → result screen → back to galaxy → shop or next mission.

## 2. Tech stack (and why each)

- **Next.js 15 (App Router)** — shell, routing, menus, shop UI. Static-first build.
- **Phaser 3** — 2D combat scenes. Loaded client-side only.
- **Three.js** — 3D galaxy overworld. Loaded client-side only.
- **GSAP** — transitions between galaxy and combat (camera zooms, fade-outs).
- **Kysely + `pg`** — type-safe SQL query builder. **No ORM. No Prisma.**
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
| [src/components/](src/components/)                        | React UI (HUD, shop, mission select, menus)     |
| [src/game/phaser/](src/game/phaser/)                      | Phaser scenes, entities, systems                |
| [src/game/phaser/data/](src/game/phaser/data/)            | Game balance JSON (weapons, enemies, waves)     |
| [src/game/three/](src/game/three/)                        | Three.js galaxy overworld                       |
| [src/game/state/](src/game/state/)                        | Shared in-memory game state (GameState, ShipConfig) |
| [src/lib/](src/lib/)                                      | DB client, auth config, shared helpers          |
| [src/types/](src/types/)                                  | Shared TypeScript types                         |
| [db/migrations/](db/migrations/)                          | SQL schema migrations (dbmate)                  |
| [public/](public/)                                        | Static assets (sprites, audio, textures)        |

**Shared files** (require coordination): `src/types/*.ts`, `src/lib/db.ts`, `src/game/state/GameState.ts`, JSON in `src/game/phaser/data/`.

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

- One scene per file. Scenes live under [src/game/phaser/scenes/](src/game/phaser/scenes/).
- Entities (Player, Enemy, Bullet, PowerUp) extend Phaser `GameObjects`. One class per file.
- Systems (wave spawning, collision, weapons, scoring) are stateless helpers or per-scene manager instances. No global singletons.
- **Game balance data lives in JSON** under [src/game/phaser/data/](src/game/phaser/data/). Never hard-code damage numbers, HP, spawn counts, etc.
- Use `readonly` for loaded JSON config — once parsed, it doesn't mutate.

### Database / SQL

- All queries go through Kysely. No raw `pg.query(...)` calls except inside [src/lib/db.ts](src/lib/db.ts).
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

# 3. Database (requires dbmate: `brew install dbmate`)
npm run db:migrate

# 4. Dev server
npm run dev
# http://localhost:3000

# 5. Type check (do this before any PR)
npm run typecheck
```

### Working without a database

Local gameplay does NOT require a database. Save/load and leaderboard features degrade gracefully — the game uses in-memory state when auth + DB are absent. Only sign in / persistence flows need `DATABASE_URL` configured.

### Controls (current)

- WASD / arrow keys — move the ship.
- Space — fire the **front** slot (held to fire; throttled by the equipped weapon's fireRateMs).
- Alt — fire both **sidekick** pods (left + right together; each cools down independently).
- Ctrl — fire the **rear** slot.
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
```

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
- **No game balance constants in code.** They belong in [src/game/phaser/data/](src/game/phaser/data/).
- **No `any` types.** Full stop.
- **MVP scope is capped.** See [TODO.md](TODO.md) "Out of scope for MVP".

## 10. Prefer skills for content tasks

Project skills live under [.claude/skills/](.claude/skills/) and are auto-loaded into every session. **Use them instead of re-exploring the codebase** — that's the entire reason they exist (token cost reduction).

| If the user asks for…                          | Invoke              |
| ---------------------------------------------- | ------------------- |
| A new combat mission or shop planet            | `/new-mission`      |
| A new enemy type                               | `/new-enemy`        |
| A new primary weapon                           | `/new-weapon`       |
| A new mission perk (passive or active)         | `/new-perk`         |
| A new solar system in the overworld            | `/new-solar-system` |
| "What did this JSON tweak do to balance?"      | `/balance-review`   |
| "Is the content safe to commit?" / pre-PR      | `/content-audit`    |

If the request maps to a skill, **invoke it before grepping or reading files** — the skill body already contains the file paths, field names, and invariants you'd otherwise have to derive. If the request *almost* maps to a skill but has an extra constraint, still invoke the skill and adapt; do not fall back to the long path.

## 11. README.md is barney-style educational

[README.md](README.md) is the public front door on GitHub. It must be written so a complete beginner — non-developer, non-gamer, never heard of Tyrian — can read it top-to-bottom and follow along without looking anything up.

- Greet the reader. Friendly tone, "you" pronouns.
- Define every acronym and jargon term inline the first time it appears (CI, OG image, PWA, ORM, Edge Runtime, ISR, OAuth, etc.).
- Explain what a tool *does* before naming it ("we use Phaser, a 2D-game engine that runs in the browser, to handle the actual shooting and dodging").
- Walk-throughs over tables when explaining a flow. Tables are fine for reference data.
- Each terminal command should be preceded by one sentence saying what it does and why you'd run it.
- README.md may be long. Terseness rules from §5 ("default to no comments") and §10 do NOT apply here.

This rule applies ONLY to README.md. ARCHITECTURE.md, CLAUDE.md, and code comments stay developer-facing and concise.

## 12. Vercel resource discipline (mandatory checklist)

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

## 13. When in doubt

1. Skim [ARCHITECTURE.md](ARCHITECTURE.md) for data flow and scene lifecycle.
2. Check [TODO.md](TODO.md) to see if the task is already planned and which model is recommended.
3. If the answer is not in these files or the code, ask the user before inventing one.
