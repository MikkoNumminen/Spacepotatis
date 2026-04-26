# Spacepotatis

[![CI](https://github.com/MikkoNumminen/Spacepotatis/actions/workflows/ci.yml/badge.svg)](https://github.com/MikkoNumminen/Spacepotatis/actions/workflows/ci.yml)

Welcome! Spacepotatis is a small browser game where you fly a tiny spaceship around the galaxy, pick a planet, and then shoot enemies in space. Yes, you are also a potato. The little badge above tells you whether the latest version of the code is healthy — when it's green, everything builds and the tests pass.

## What kind of game is this?

It's a **vertical scrolling space shooter**. That's a genre where your ship sits near the bottom of the screen, the world scrolls past you from top to bottom, and waves of enemies come down toward you. You move left and right (and a bit up and down), you shoot upward, and you try not to get hit. Think of the old arcade game *Galaga* — same idea.

The specific inspiration is **Tyrian 2000**, a 1995 PC space shooter that was famous for its giant catalog of weapons, ship modules, and a between-mission "shop" where you'd kit out your ship before the next fight. Spacepotatis is going for the same feel, just modernized and running in your web browser.

There are two big screens you'll see while playing:

1. **The galaxy view.** A real, rotatable 3D solar system. Each planet you can see is a thing you can do — most of them are missions (a fight), some are shops (where you spend money on upgrades), and a few are hubs. You drag the camera around with your mouse to look at planets, scroll to zoom in and out, and click a planet to open its info panel.
2. **Combat.** Once you launch into a mission, the camera switches to the classic top-down shooter view. Your ship flies up the screen, enemies pour down, you shoot them, you dodge. Survive long enough and you complete the mission, get rewards, and end up back in the galaxy view to pick what's next.

The basic loop is: **galaxy → pick a planet → fight → return with money and loot → upgrade your ship at a shop → pick the next planet**. Repeat.

## What's under the hood?

Spacepotatis is a website that runs a game in your browser, so the technology is mostly web stuff. Here's what each piece does, in plain English:

- **Next.js 15** — the framework that serves the website itself. It handles things like "what URL shows what page" and is also responsible for serving the icons and the social-media preview image (the OG image — short for "Open Graph", the standard chat apps like Discord and WhatsApp use to fetch a thumbnail when someone pastes a link). React 19 is the UI library Next.js uses to build the menus and HUD on top of the game canvas.
- **Phaser 3** — a 2D game engine that runs in the browser. It handles the combat scenes: drawing the ship, drawing the bullets, moving everything every frame, and detecting when one thing collides with another.
- **Three.js** — a 3D library that renders the galaxy view (the planets, the sun, the starfield). GSAP, a separate animation library, smooths out the camera transitions between the galaxy view and combat.
- **Tailwind CSS** — a styling library. It's how we color buttons, lay out the HUD, that kind of thing.
- **PostgreSQL** (hosted by Neon, a serverless Postgres provider) — the database where, when you sign in, your saved games and the high-score leaderboard live. We talk to it through **Kysely**, a tiny TypeScript library that lets us write SQL safely. Database schema changes are managed by **dbmate**, which keeps a folder of plain `.sql` files describing each change. We deliberately do not use an "ORM" (Object-Relational Mapper, a tool that hides SQL behind an object-oriented API) — Kysely is closer to the metal and starts up faster.
- **NextAuth (also called Auth.js)** — handles "Sign in with Google", which is the only sign-in method. You only need it if you want your save games to follow you between devices and to appear on the leaderboard. You can play the whole game without signing in.
- **TypeScript in strict mode** — TypeScript is JavaScript with type-checking. Strict mode catches a whole class of "I forgot a value could be missing" bugs at edit time instead of runtime.
- **Vercel** — the hosting service the live website runs on. We're on the free "Hobby" tier, which is generous but limits how much server-side computation we can do, so almost everything happens in your browser instead of on a server.

## Try it on your own computer

You'll need [Node.js](https://nodejs.org/) version 20 or newer installed. (Node.js is the runtime that lets JavaScript code run outside a browser; we use it to manage the project's dependencies and to run the dev server.) Open a terminal in the project folder and follow these steps.

**Step 1 — install the dependencies.** This downloads all the libraries the project needs (React, Phaser, Three.js, etc.) into a `node_modules/` folder. You only need to do this once, and again whenever someone updates the dependencies list.

```bash
npm install
```

**Step 2 — set up environment variables (optional).** Environment variables are little settings that live outside the code, like database connection strings and secret keys. The default game runs fine without any of them — you only need this step if you want sign-in, cloud saves, or the leaderboard to work locally.

```bash
cp .env.example .env.local
# Then open .env.local in a text editor and fill in:
#   DATABASE_URL        — connection string to your Postgres database
#   AUTH_SECRET         — a random string used to sign auth cookies
#   AUTH_GOOGLE_ID      — from Google Cloud Console (OAuth credentials)
#   AUTH_GOOGLE_SECRET  — same source
```

**Step 3 — apply database migrations (only if you set DATABASE_URL above).** A "migration" is one of those `.sql` files that describes a schema change. Running migrations means applying every change in order so your database matches what the code expects. You'll need to install `dbmate` first (`brew install dbmate` on macOS, or grab a binary from the dbmate GitHub releases page on Windows/Linux).

```bash
npm run db:migrate
```

**Step 4 — start the development server.** This starts a local web server that watches the source files and rebuilds the page whenever you save a change. It also serves the game itself.

```bash
npm run dev
```

Open `http://localhost:3000` in your browser and you should see the game. If the port `3000` is busy, the dev server will pick the next free one (`3001`, `3002`, …) and tell you in the terminal.

**Without a database, what works?** Almost everything. You can play the entire game in single-player. The save / load and leaderboard features quietly fall back to in-memory storage. They only need a real database (and sign-in) if you want progress to survive a page refresh on a logged-in account.

## Quality checks before you commit

These three commands are run automatically by **CI** (Continuous Integration — a robot on GitHub that runs the same checks on every push and pull request, so broken code doesn't sneak into the main branch). You can — and should — run them locally before pushing.

```bash
# Make sure all the TypeScript types line up. Won't run the code, just checks it.
npm run typecheck

# Look for code style problems and unused variables. The "linter" is a tool that
# scans your code for likely mistakes without actually running it.
npm run lint

# Run the unit tests. Vitest is a small, fast test runner. Our tests cover
# the parts of the game that are pure logic (game data, ship state,
# weapon math, scoring) — anything you can test without drawing pixels.
npm test
```

Two more commands you might want while you work:

- `npm run test:watch` — runs the tests and re-runs them automatically every time you save a file. Useful when you're writing or fixing a test.
- `npm run coverage` — runs the tests once and produces a report showing which lines of code were exercised. Helps you see what's untested.

## How AI helps build this game (Claude Code skills)

This project is mostly built by Mikko with help from **Claude Code**, a command-line tool that lets you have a conversation with an AI (Claude) that can read and edit files in the project. Inside the repo there's a folder called `.claude/skills/` that contains seven custom *skills* — short instruction files that teach Claude how to do specific Spacepotatis tasks correctly without re-figuring-out the project layout every single time.

Why does that matter? Every time Claude reads a file, it costs a small amount of money (paid in "tokens" — chunks of text Claude charges for). If a beginner asks "add a new enemy" and Claude has to grep around the codebase to find every file it needs to touch, that's a lot of tokens. A skill is basically a recipe: it lists the exact files to edit, the field names to use, and the invariants to keep, so Claude can go straight to the work.

Here's the catalog of skills currently shipped with the project. Type `/<skill-name>` inside Claude Code to invoke one, or just describe the task in plain English and Claude will pick the right skill itself.

| Skill                | What it does                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `/new-mission`       | Adds a new combat mission, picks the solar system it belongs to, and wires up waves + planet binding.|
| `/new-enemy`         | Adds a new enemy entry, generates a placeholder sprite, and (optionally) drops it into a test wave.|
| `/new-weapon`        | Adds a new ship weapon (front / rear / sidekick slot, energy cost, optional homing) with the right unlock wiring. |
| `/new-perk`          | Adds a new mid-mission buff (a "perk") with its icon, HUD chip, and pickup logic.                  |
| `/new-solar-system`  | Adds a new selectable star system to the galaxy overworld (sun color/size, unlock condition, etc).  |
| `/balance-review`    | Compares your uncommitted JSON tweaks against the previous version and prints a balance report.    |
| `/content-audit`     | Walks every cross-file invariant the unit tests don't cover. Run it before opening a pull request. |

### How much does this save?

Rough estimates assuming a year of normal content authoring. "Tokens" here means the units Claude charges by — fewer tokens means cheaper and faster sessions.

| Skill                | Saved per use | Estimated uses per year | Total tokens saved |
| -------------------- | ------------: | ----------------------: | -----------------: |
| `/balance-review`    |        ~11.3K |                      50 |              ~565K |
| `/content-audit`     |        ~12.8K |                      50 |              ~640K |
| `/new-mission`       |         ~7.4K |                      30 |              ~222K |
| `/new-enemy`         |         ~4.9K |                      25 |              ~123K |
| `/new-perk`          |         ~8.5K |                      10 |               ~85K |
| `/new-weapon`        |         ~5.6K |                      15 |               ~84K |
| `/new-solar-system`  |         ~9.7K |                       5 |               ~49K |
| **Total**            |               |             **185 uses** | **~1.77M tokens** |

The numbers are educated guesses — actual frequency could swing 3× either way. Even on the low end, the one-time cost of writing the skills (~12K tokens) pays itself back the first week. The two heaviest hitters are `/balance-review` and `/content-audit` because they fire on every JSON change.

The savings get bigger over time: every time the project's data shape evolves (a new field on weapons, a new mission attribute, etc.), the skill instructions are updated once, and every future agent gets the new pattern for free instead of having to discover it by grepping. Without skills, an agent asked to "add a new weapon" today would need to read at least seven files (`weapons.json`, `types/game.ts`, `ShipConfig.ts`, two test files, plus the shop and loadout UI components) to figure out the required fields. With the skill, it reads one ~80-line recipe.

## Where to look next

If you want to understand the project deeper, here's the order to read things in:

1. **[CLAUDE.md](CLAUDE.md)** — the developer-facing rulebook for the project. Coding standards, hard rules ("no Prisma", "no `any`", "all game logic runs in the browser"), and the mapping from "what the user wants" → "which skill to invoke".
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — a tour of how data flows through the app: how a click on a planet leads to a Phaser combat scene starting, how saves are written, how the database schema is laid out.
3. **[TODO.md](TODO.md)** — the planned implementation phases and what's deliberately out of scope.
4. **[.claude/skills/](.claude/skills/)** — the seven skills mentioned above. Each one is a short markdown file you can read on its own.
5. **[src/game/phaser/data/](src/game/phaser/data/)** — the game's balance data (weapons, enemies, waves, missions, perks). All numbers live here as JSON, so you can re-tune the game without touching any code.

## License

MIT — see [LICENSE](LICENSE). MIT is a permissive open-source license: you can use, modify, and redistribute the code, including in commercial projects, as long as you include the original copyright notice.
