# Spacepotatis

[![CI](https://github.com/MikkoNumminen/Spacepotatis/actions/workflows/ci.yml/badge.svg)](https://github.com/MikkoNumminen/Spacepotatis/actions/workflows/ci.yml)

A Tyrian 2000–inspired **vertical scrolling space shooter** with a **3D galaxy overworld**.

- **Galaxy view** (Three.js): a 3D solar system where each planet is a mission, shop, or hub.
- **Combat** (Phaser 3): classic top-down vertical shooter — the player's ship flies up, enemies and bosses pour down.
- Loop: pick a planet → zoom → fight a mission → return with credits and loot → upgrade at a shop planet → pick the next.

## Tech stack

| Layer         | Choice                                         | Why                                               |
| ------------- | ---------------------------------------------- | ------------------------------------------------- |
| Shell / UI    | Next.js 15 (App Router) + React 19 + Tailwind  | Static-first pages, minimal serverless footprint. |
| Combat        | Phaser 3                                       | Mature 2D engine, perfect for a vertical shooter. |
| Overworld     | Three.js + GSAP                                | 3D planets, smooth camera transitions.            |
| Database      | PostgreSQL (Neon) via **Kysely** + **dbmate**  | No ORM, no Prisma, type-safe SQL, fast cold start.|
| Auth          | NextAuth v5 / Auth.js (Google OAuth)           | Only needed for cloud saves + leaderboard.        |
| Deploy        | Vercel Hobby                                   | Static pages + a handful of Edge API routes.      |

## Getting started

```bash
# 1. Install deps
npm install

# 2. Configure env (optional for local gameplay — only needed for sign-in / cloud saves / leaderboard)
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET

# 3. Apply schema migrations (requires dbmate: `brew install dbmate`)
npm run db:migrate

# 4. Run dev server
npm run dev
# Open http://localhost:3000
```

Local gameplay does not require a database — save/load and the leaderboard degrade gracefully when auth + DB are absent.

## Quality gates

The same checks that CI enforces on every push and PR:

```bash
npm run typecheck   # tsc --noEmit (strict mode)
npm run lint        # next lint
npm test            # vitest run — unit tests for game data, state, score, weapon math
```

`npm run test:watch` for TDD; `npm run coverage` for a v8 coverage report.

## Where to look

Start with these three files — they are the source of truth for agent work:

- [CLAUDE.md](CLAUDE.md) — architecture, coding standards, guardrails.
- [ARCHITECTURE.md](ARCHITECTURE.md) — data flow, scene lifecycle, API inventory.
- [TODO.md](TODO.md) — phased implementation plan with model recommendations.

Game design data lives in [src/game/phaser/data/](src/game/phaser/data/) as JSON — tweak weapons, enemies, waves, and missions without touching code.

## License

MIT — see [LICENSE](LICENSE).
