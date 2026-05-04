# app

## Purpose

The Next.js shell — every URL the player can hit. Pages, layouts, API routes, generated images, and per-route runtime declarations. This is a **SINK module**: there's no `index.ts` and nothing imports FROM `src/app/`. The contract is the URL → handler mapping.

## Routes (this is the public surface)

| URL | Method | Runtime | Auth | Purpose |
|---|---|---|---|---|
| `/` | GET (page) | static | — | Landing page. Sign-in chip + PLAY/CONTINUE. |
| `/play` | GET (page) | static | — | The galaxy view + combat mounting point. Phaser + Three.js dynamically imported with `ssr: false`. |
| `/shop` | GET (page) | static | — | Market UI. The shop weapons/augments/upgrades panel. |
| `/leaderboard` | GET (page) | ISR (`revalidate: 60`) | — | Leaderboard. ISR via `unstable_cache`. |
| `/api/auth/[...nextauth]` | GET, POST | **Node** | — | NextAuth handler. **MUST stay on Node** — Google OAuth needs Node `fs` APIs. |
| `/api/save` | GET, POST | Edge | required | Player save load + save. POST runs the full cheat-guard suite + writes `save_audit`. |
| `/api/leaderboard` | GET, POST | Edge | POST: required | Leaderboard read (cached) + score-write. POST calls `revalidateTag("leaderboard")`. |
| `/api/handle` | GET, POST | Edge | required | Player handle resolve + update. |
| `/icon.tsx`, `/apple-icon.tsx`, `/opengraph-image.tsx`, `/twitter-image.tsx` | GET | **`force-static`** | — | Generated images. MUST be `force-static` or scrapers re-invoke forever. |

Internal helpers: per-route handlers, server-side rendering helpers, the `writeSaveAudit` helper inside `api/save/route.ts`.

## Internal

- Per-route `route.ts` handlers — HTTP method exports (`GET`, `POST`, etc.). Internal to the route; nothing else imports them.
- The `writeSaveAudit` helper in `api/save/route.ts` — forensic audit-row writer. Called once per authenticated POST. Audit failure NEVER blocks a save.
- Test files (`*.test.ts`) — the per-route tests, especially `api/save/route.test.ts`.

## Dependencies

| Dependency | Used by | Why |
|---|---|---|
| `@/lib/db`, `@/lib/auth`, `@/lib/saveValidation`, `@/lib/leaderboard`, `@/lib/routes`, `@/lib/handle` | every API route | DB client + auth + cheat guards + route constants. |
| `@/lib/schemas/save`, `@/lib/schemas/handle` | API routes | Zod validators at the network edge. |
| `@/game/state/persistence` (`hydrate`, `toSnapshot`) | `api/save/route.ts` | Save shape conversion. Server-side hydrate is unusual but used to derive a normalized snapshot for audit. |
| `@/game/data/missions`, `@/game/data/lootPools` | `api/leaderboard/route.ts`, indirectly via saveValidation | Leaderboard mission lookups + cheat-cap derivation. |
| `@/types/game` | many | Shared types. |
| `@/components/*` | pages | The pages mount React components. |

NEVER `phaser` / `three` / `audio` directly (those are client-only and blow up on the Node/Edge runtime).

## Invariants

These follow CLAUDE.md §3 + §13 + ADR 0001:

- **Pages are static-by-default.** Most pages declare `export const dynamic = "force-static"`. Any page that can't is justified in the PR body that introduces it.
- **API routes prefer Edge.** `export const runtime = "edge"` everywhere except `[...nextauth]`. Edge runtime fails on Google OAuth because the provider needs Node `fs`.
- **Every save POST runs the FULL cheat-guard suite.** `validateMissionGraph` → `validateCreditsDelta` → `validatePlaytimeDelta` → `validateNoRegression`. **Skipping `validateNoRegression` was the 2026-05-02 wipe trigger** — the order and the inclusion of all four are non-negotiable. See ADR 0003 + ADR 0004.
- **Every save POST also writes a `save_audit` row** (success, validator rejection, or server error). Audit failure NEVER blocks a save (the audit table is forensics, not enforcement).
- **Leaderboard reads use `unstable_cache(...,{revalidate: 60, tags: ["leaderboard"]})`.** Score-writes call `revalidateTag("leaderboard")` to flush.
- **Generated images MUST be `force-static`.** Otherwise Slack/Discord/Twitter/Google scrapers re-invoke them forever, blowing the Vercel CPU budget. CLAUDE.md §13.
- **Middleware on game routes is FORBIDDEN.** Edge middleware fires on every matched request including static asset paths. CLAUDE.md §13. There is intentionally no `src/middleware.ts` in this repo.
- **Cheat-guard 422 rejections are TRANSIENT, not account-blocking.** The error code is `save_regression`; the saveQueue holds the snapshot for retry after a successful load reconciles. ADR 0003.
- **Migration shipping rule (CLAUDE.md §7a).** Adding a new column referenced in a route handler without applying the migration to prod produces a silent 500 on every save POST. Migrations land BEFORE or with the route change.

## Common pitfalls

- **Adding `"use client"` to a server component thinking it'll let you import a client hook.** Wrong — that turns the page client-only and breaks SSG. Move the client interactivity into a separate `"use client"` child component.
- **Forgetting `force-static` on a generated-image route.** Scrapers cost real Vercel CPU; an OG card linked on social media can drain the month's budget in hours.
- **Skipping `validateNoRegression`** on the save POST path — exactly the 2026-05-02 wipe trigger. The validator is required.
- **Adding middleware to wrap game routes.** Forbidden by CLAUDE.md §13.
- **Putting business logic into a route handler instead of `lib/saveValidation.ts` or `state/sync.ts`.** Routes should be thin dispatchers; the work lives in `infra` / `state`. A 407-LOC `route.ts` (current `api/save/route.ts`) is dense by nature but the validation logic itself stays in `lib/`.
- **Running a query without `unstable_cache`** when the data is shared across requests. Each uncached query is a Vercel CPU hour you can avoid.
- **Letting a `force-static` page reference per-request server data.** The build will fail loudly, but it's worth pre-checking via `npm run build`.

## How to test changes

```bash
# Per-route tests
npm test src/app/api

# Specific files
npm test src/app/api/save/route.test.ts
npm test src/app/api/leaderboard/route.test.ts
npm test src/app/api/handle/route.test.ts

# Build is the strongest signal — Next.js fails on RSC/client-boundary errors
npm run build

# Type-only
npm run typecheck

# Manual smoke
npm run dev
# Then walk every route + curl each API endpoint:
curl http://localhost:3000/api/leaderboard
# (auth-required routes need a real session; prefer testing those via the UI)
```

## See also

- ADR 0001 — static-by-default on Vercel Hobby (the runtime + dynamic + ISR rules).
- ADR 0003 — anti-cheat is observation (the 422 transient pattern + `save_audit` is forensics).
- ADR 0004 — save round-trip's 8 layers (this module owns layers 3, 4, 6 — POST handler + GET handler + migration).
- ADR 0007 — the modular-architecture audit.
- CLAUDE.md §3, §7a, §9, §13 — every load-bearing rule behind these invariants.
- `src/lib/README.md` — the cheat guards + DB client + auth this module composes.
- `src/game/state/README.md` — the save round-trip's client side.
- `db/migrations/` — the migration timeline this module's `Database` schema must track.
