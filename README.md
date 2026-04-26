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

## AI-assisted development (Claude Code skills)

This project ships **7 custom Claude Code skills** under [.claude/skills/](.claude/skills/) that scaffold cross-file content edits in a single slash-command. They exist to make AI-assisted dev cheaper — each skill replaces ~5–15 file reads + invariant-derivation per task with a single pre-loaded playbook.

| Skill                | What it does                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `/new-mission`       | New combat mission across `missions.json`, `waves.json`, types, and the galaxy planet binding.     |
| `/new-enemy`         | New enemy entry, placeholder sprite generator, optional test wave, integrity-test verification.    |
| `/new-weapon`        | New weapon entry, `WeaponId` extension, optional shop-cost or starter-equip wiring.                |
| `/new-perk`          | New mission-only perk, BootScene icon, HUD chip, `applyPerk` / `useActivePerk` cases.              |
| `/new-solar-system`  | New solar system + first-run migration of the single galaxy into a multi-system data model.        |
| `/balance-review`    | Diff uncommitted JSON changes; report DPS, TTK, wave intensity, credit/sec, drop-rate deltas.      |
| `/content-audit`     | Pre-commit invariants check: orphan refs, sprite-key coverage, perk handlers, prereq DAG cycles.   |

### Estimated token savings

Each skill sidesteps the cold-start exploration cost (greps, file reads, deriving the schema from `src/types/game.ts` each time). Rough numbers, with usage estimates over a year of active dev:

| Skill                | Net saved / use | Est. uses / yr | Total saved |
| -------------------- | --------------: | -------------: | ----------: |
| `/balance-review`    |          ~11.3K |             50 |     ~565K   |
| `/content-audit`     |          ~12.8K |             50 |     ~640K   |
| `/new-mission`       |           ~7.4K |             30 |     ~222K   |
| `/new-enemy`         |           ~4.9K |             25 |     ~123K   |
| `/new-perk`          |           ~8.5K |             10 |      ~85K   |
| `/new-weapon`        |           ~5.6K |             15 |      ~84K   |
| `/new-solar-system`  |           ~9.7K |              5 |      ~49K   |
| **Total**            |                 |    **185 uses** | **~1.77M tokens** |

Those numbers are estimates — frequency could swing 3× either way. Floor is ~500K tokens/yr; ceiling is ~5M. Either way the one-time skill-authoring cost (~12K tokens) pays itself back inside the first week of normal content work. The two highest-leverage skills are `/balance-review` and `/content-audit` because they fire on every JSON change.

To use a skill, just type `/<skill-name>` in Claude Code, or describe the task and Claude will invoke it automatically (see [CLAUDE.md §10](CLAUDE.md)).

## Where to look

Start with these files — they are the source of truth for agent work:

- [CLAUDE.md](CLAUDE.md) — architecture, coding standards, guardrails, skill index.
- [ARCHITECTURE.md](ARCHITECTURE.md) — data flow, scene lifecycle, API inventory.
- [TODO.md](TODO.md) — phased implementation plan with model recommendations.
- [.claude/skills/](.claude/skills/) — the 7 custom skills above.

Game design data lives in [src/game/phaser/data/](src/game/phaser/data/) as JSON — tweak weapons, enemies, waves, and missions without touching code.

## License

MIT — see [LICENSE](LICENSE).
