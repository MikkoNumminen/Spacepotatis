# Spacepotatis

[![CI](https://github.com/MikkoNumminen/Spacepotatis/actions/workflows/ci.yml/badge.svg)](https://github.com/MikkoNumminen/Spacepotatis/actions/workflows/ci.yml)

> ## ▶ Play it now: **<https://spacepotatis.vercel.app/>**
>
> Runs in your browser. No install, no sign-up. (Sign in with Google only if you want your progress saved across devices and your score on the leaderboard.)

Welcome! Spacepotatis is a small browser game where you fly a tiny spaceship around the galaxy, pick a planet, and then shoot enemies in space. Yes, you are also a potato. The little badge above tells you whether the latest version of the code is healthy — when it's green, everything builds and the tests pass.

## What it looks like

The **main menu** is the front door. The dark backdrop is a real, slowly spinning 3D galaxy scene running behind the title — the game's actual rendering engine, used here just for atmosphere. From here you sign in, pick PLAY (or CONTINUE if you have a save), or browse the leaderboard.

![Main menu showing the SPACEPOTATIS title over a slowly spinning galaxy backdrop](docs/screenshots/landing.png)

The **galaxy view** is where you choose what to do next. You're looking at a real solar system — drag with the mouse to rotate, scroll to zoom, click a planet to open its mission panel and launch. The HUD around the edges is your menu (top-left), credits + missions cleared (left), audio + your handle (top-right).

![Galaxy view of Sol Spudensis with the star, three planets, and the mission info panel for Spud Prime](docs/screenshots/galaxy.png)

## Music

The calm, ambient music you hear while you're in the menus is original — written specifically for this game. We owe a big thank-you to a sister project that lives in its own repository on GitHub: **<https://github.com/MikkoNumminen/strudel-patterns>**. If you like the music and want to hear more of it (or take the underlying recipe and turn it into something of your own), that's the place to look.

A quick word about how it was made, because it's a fun corner of music tech that not everyone has bumped into yet. Most people picture music being made with a microphone in front of a guitar, or a person dragging notes around in a program like GarageBand. The strudel-patterns repo uses a different approach called **Strudel** — a tool where you describe music by typing very short text snippets (think a sentence like "play these four drum sounds in this order, twice as fast"), then press a button and hear what you wrote. It's a bit like writing a tiny program whose output is a song. The advantages are that you can iterate very quickly, share the "song" as a few lines of text rather than a giant audio file, and tweak any tiny detail by just editing the text. The output of those Strudel patterns is exported as a regular audio file, and that file is what you hear in Spacepotatis.

Once it's loaded into the game, the music behaves the way you'd want a thoughtful background score to behave. The first time you click or press a key, the track quietly starts. (Web browsers don't allow websites to play sound on their own — they wait for you to interact with the page first, so that opening a tab doesn't suddenly blast noise at you. We respect that rule and arm the music on your first input.) From that point on, the same track keeps playing as you move between the main menu, the galaxy view (where you pick a planet), and the shop. If you stay in the menus long enough for the song to reach its end, it doesn't snap back to the start — instead it gently fades out, holds a brief silence, and fades back in, so it feels like the music drew a breath rather than rebooted.

When you launch into a combat mission, the music does a slow fade-out (a "duck", in audio terms — like ducking under a wave) so that the in-game sound effects of lasers and explosions have room to land. The moment you finish the mission and you're back in the galaxy view, the music fades back in.

And if you'd rather play in silence — maybe you're at work, maybe you're listening to a podcast — the **♪ on / ♪ off** button in the top-right corner of every menu mutes both the music and the sound effects at once. It remembers your choice between visits, so you only have to set it once.

## Audio storyline & audio-assisted gameplay (this is a big one)

This section gets its own headline because it's not a small touch — Spacepotatis ships a **fully-voiced narrative layer** that runs the entire length of the game, end to end, and every spoken line you hear is original, machine-generated on Mikko's own machine, and 100% copyright-free. There is no commercial voice actor and no licensed voice model anywhere in this audio chain. The voice work isn't sprinkled across a couple of cutscenes — it's the connective tissue of the game, present from the first second of the front page through to the end of the campaign and back.

And it's doing **two jobs at once**. On one hand it's a proper audiobook-style storyline that frames the whole game in narrative — there's a plot, a setting, a tone. On the other hand it's **audio-assisted gameplay**: the same voice that tells you the story also tells you what just happened, what to do next, and where the game is nudging you. *"You bought a new gun." "You cleared the system — there's more out there." "Welcome back to the Market."* The line between narration and UI feedback is blurred on purpose; the player doesn't have to read a tooltip to know what they just got, because the voice already said so.

### Meet the narrator — Grandma

Every spoken line in the game — the menu nudges, the system briefing, the per-mission setups, the item-acquisition cues, every story popup — is read by the same character: **Grandma**. She's the in-character voice of the entire storyline, the warm-but-no-nonsense narrator who tells the player how the universe works, what the bugs are up to, and what just landed in the cargo hold. Casting one consistent voice across every audio surface is a deliberate choice — it keeps the game feeling like a single read-aloud story rather than a stack of unrelated voiceovers, and it makes the audio cues immediately recognizable as part of the narrative rather than as game system noise.

Here's a tour of every surface where Grandma's voice plays, in the order you'd encounter them.

### The main-menu briefing queue

The very first thing that happens when you arrive at the front page — signed in or not — is a **voice queue** starts playing softly under the music. It's a sequence of short clips with measured silence between them, scripted to feel like a calm voice nudging you to hit PLAY (or CONTINUE, if you already have a save). The first clip is keyed to the visible button label, so a returning player hears a slightly different opening line than a first-time visitor. After the nudge sequence the queue rolls into a longer **system briefing** — essentially the audiobook prologue — that frames the whole game's premise. The moment you click PLAY (or CONTINUE), the entire queue is cancelled instantly so you don't sit through the rest. The queue replays on every menu visit (a fresh tab, a refresh, or coming back from the galaxy view) because the goal is for an idle player to always hear something happening.

A note on the browser autoplay rules that govern all of this. By default a website cannot play audio until you've interacted with the page, which is a sensible rule designed to stop ads from blasting noise the moment a tab opens. Spacepotatis respects that — the queue arms itself optimistically, and if the browser blocks the first clip then the very first click or keypress anywhere on the page restarts it from the top.

### The opening cinematic — "The Great Potato Awakening"

Once you press PLAY for the first time and reach the galaxy view, a popup fades up over the scene: a quiet music bed comes in, the title card reads "The Great Potato Awakening", and a narrator reads you the origin story of the potato-pilot and why the bugs need shooting. The popup also shows the same words on screen so anyone playing muted, or who simply prefers to read along, gets the same content. After this first play, the entry slides into the **Story log** (described below) so you can replay it whenever you like.

### Per-mission briefings

Every mission planet in the galaxy view has its own short voice briefing tied to it. The briefing fires when you click the mission card — with a deliberate two-second debounce so casually shuffling between cards doesn't stack briefings on top of each other. Click one card, then immediately click another, and the first one cancels so only the latest plays. Locked planets ("?") never reveal their briefing. Each briefing is keyed to the specific mission (Spud Prime, the Yamsteroid Belt, Dreadfruit, and so on) and only auto-plays the first time you encounter it.

### Shop arrival — "Market arrival"

Every time you dock at a Market planet, a short voice line greets you: *"You've docked at the Market — Mission Control runs through what's on the shelves."* This one plays on **every** visit, not just the first, because a returning player still appreciates the welcome.

### System-cleared idle voice

Once you've completed every combat mission in a solar system, the game starts noticing if you're just sitting in the galaxy view with nothing to do. Five seconds after the last mission is cleared, a "Sol Spudensis cleared" voice plays — and it loops every 20 seconds for as long as you idle there. The moment you open the shop, the Story log, or warp to another system, the voice cancels. It's a gentle nudge that says *"there's more to find — go look".*

### Item-acquisition voice cues

Four short voice clips, one per item category, fire whenever you receive a permanent item — either as the **first-clear reward** of a mission (shown in the Victory popup) or when you **buy** something at the shop:

- A **weapon** (a new gun for your loadout) → weapon cue
- An **augment** (a permanent modifier you bind to a specific weapon) → augment cue
- A **ship upgrade** (shield capacity, armor plating, reactor capacity, or reactor recharge) → upgrade cue
- A **credits bonus** → money cue

The same four cues are reused everywhere a permanent item changes hands, so the audio you hear in the Victory popup is identical to the audio you hear at the shop — once the player learns *"that line means I just got a gun",* the language is consistent across the whole game. This is the audio-assisted-gameplay angle in its clearest form: the player doesn't need to glance at the popup or read a tooltip to know what they were awarded, because Grandma already said so.

### The Story log

If you miss a beat — or you just want to hear it again — open the **user menu** in the top-right corner of the galaxy view and pick **Story log**. Every storyline entry you've already unlocked sits in there, ready to replay from the beginning, music and voice and all. Entries you haven't reached yet stay hidden so the path ahead doesn't spoil itself. The log has its own dedicated music bed that ducks the menu music while you're browsing it — opening a replay does not restart the bed, so the music plays continuously across the list view and any replay you open from inside it.

### How the audio is put together

A short word on the pipeline, because two of the pieces are interesting open-source corners of recent tech.

The **music** for the menus and for each story beat is written in **Strudel** — the same text-based music tool described in the Music section above. Same recipe: tap out a few lines of code, press a button, hear what you wrote, iterate, export the result as a regular audio file. The story beds are deliberately sparser than the menu track so the narration has room to breathe. All the patterns for this project live in their own repository: **<https://github.com/MikkoNumminen/strudel-patterns>**.

The **voiceover** is generated by Mikko's own **AudiobookMaker** app, which lives in its own repository on GitHub: **<https://github.com/MikkoNumminen/AudiobookMaker>**. It's a small tool he built that feeds a written script through **Chatterbox**, an open-source text-to-speech model (a piece of software that turns written sentences into natural-sounding spoken audio). The whole pipeline runs locally on Mikko's machine — no commercial voice actor and no licensed voice model is involved, so every spoken line in the game is fully copyright-free. A practical side-effect is that dialogue becomes cheap to iterate: edit the script, regenerate the audio in seconds, drop the new file into the project. If a line doesn't land, it gets rewritten and re-spoken without anyone needing to book a recording session.

The result is a game where the audio is doing real narrative *and* gameplay work — not just background atmosphere — and every minute of voice you hear was scripted, spoken by Grandma, and shipped within the same week, by one person, with no licensing strings attached.

## What kind of game is this?

It's a **vertical scrolling space shooter**. That's a genre where your ship sits near the bottom of the screen, the world scrolls past you from top to bottom, and waves of enemies come down toward you. You move left and right (and a bit up and down), you shoot upward, and you try not to get hit. Think of the old arcade game *Galaga* — same idea.

The specific inspiration is **Tyrian 2000**, a 1995 PC space shooter that was famous for its giant catalog of weapons, ship modules, and a between-mission "shop" where you'd kit out your ship before the next fight. Spacepotatis is going for the same feel, just modernized and running in your web browser.

There are two big screens you'll see while playing:

1. **The galaxy view.** A real, rotatable 3D solar system. Each planet you can see is a thing you can do — most of them are missions (a fight), some are shops (where you spend money on upgrades), and a few are hubs. You drag the camera around with your mouse to look at planets, scroll to zoom in and out, and click a planet to open its info panel.
2. **Combat.** Once you launch into a mission, the camera switches to the classic top-down shooter view. Your ship flies up the screen, enemies pour down, you shoot them, you dodge. Survive long enough and you complete the mission, get rewards, and end up back in the galaxy view to pick what's next.

The basic loop is: **galaxy → pick a planet → fight → return with money and loot → upgrade your ship at a shop → pick the next planet**. Repeat.

## How do I play?

The controls are deliberately tiny — there's only one fire key, so you can keep your other hand on a snack.

- **Move:** the **WASD** keys (or the arrow keys, whichever you prefer). W / Up moves the ship forward, S / Down pulls it back, A and D slide it left and right.
- **Fire:** the **Space** key. Tap it for a single volley, or hold it down for continuous fire. Every weapon you have equipped fires at the same time — each weapon slot has its own internal "cooldown" (the short pause between shots), so faster weapons fire more often than slower ones, all from the same key. You start with one weapon slot, and you can buy more slots at the shop.
- **Pause:** the **P** or **Esc** key. Once paused, P resumes; Esc abandons the mission (which counts as a loss, so be sure).
- **Galaxy view:** **drag** with the mouse to rotate the camera, **scroll** the mouse wheel to zoom in and out, and **click** a planet to open its mission panel.

That's the whole input scheme. There used to be separate keys for rear-firing and side-firing weapons, but the ship is now a single forward-firing platform with however many slots you've bought, so one Space key handles everything.

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

## Recent quality push (April 2026)

Hello! If you're reading the codebase right now, you're catching it just after a big tidy-up. Over a few days the project went through a four-wave "modularity audit" — basically, a sweep that looks for files that have grown too big or rules that are easy to break by accident, and shrinks or tightens them. Here's what changed and, more importantly, why it makes the project nicer to poke at.

**Test coverage roughly doubled.** "Test coverage" is the percentage of the project's code that gets exercised by automated tests — the higher it is, the more likely a bug will be caught by `npm test` before it reaches a real player. The number of tests grew from 197 to 397, and they all pass. The combat systems (the code that decides when a bullet hits a ship, when an enemy dies, what loot drops) went from essentially zero coverage to between 80 and 100 percent. The persistence layer — the code that writes your save game to the database, fetches the leaderboard, and handles signing in — went from zero to over 95 percent. In practice that means a lot of small bugs that used to slip past will now trip a red light on CI (the GitHub robot, defined earlier, that runs the checks on every push) before they ever ship.

**A real bug got caught and fixed.** Here is the most player-visible win. Previously, if you started a combat mission while signed out, then signed in with Google partway through, then beat the mission, your final score quietly failed to save. The galaxy view would refresh and your leaderboard entry just wouldn't be there. The cause was deep in the React glue that mounts the Phaser game into the page: a piece of code captured the "you are not signed in" state at the moment the mission started, and never noticed when that changed. The fix uses something called a `useRef` (a small React tool that holds a value which can be updated freely without re-rendering the component, so the latest sign-in state is always visible to the running game). End result: sign in mid-mission and your score now lands where it should.

**Five oversized files were broken into about thirty small focused ones.** Big files are harder to read, harder to test, and they invite merge conflicts when two people edit them at once. Each of the files below was split into a small "entry point" plus a handful of single-purpose helpers. Where you see the word "barrel", that means a file whose only job is to re-export things from a few other files — useful because the rest of the project keeps importing from the same path it always did, while the actual code now lives in smaller, focused modules behind it.

The numbers below are line counts before and after the split — they show how much each main file shrank once its pieces moved out into helpers.

| File | Before | After | What came out |
| ---- | -----: | ----: | ------------- |
| `GameState.ts` | 582 | 9 | Barrel over 4 files: state core, ship mutators, persistence, sell pricing |
| `LoadoutMenu.tsx` | 590 | 98 | 9 sub-components |
| `CombatScene.ts` | 525 | 216 | 4 helpers: HUD, visual effects, drops, perks |
| `GameCanvas.tsx` | 405 | 159 | 7 hooks and sub-components |
| `Player.ts` | 257 | 123 | 3 helpers |

**JSON traffic is now type-checked at runtime by Zod.** Zod is a small library that lets you describe the shape of a piece of data once and then automatically check, at runtime, that incoming data matches that shape — and reject it with a clear error if it doesn't. Every save-game request, leaderboard request, and the responses to both, are now validated by Zod schemas at the network edge. That replaces about 80 lines of hand-written "is this field a string? is this one a number?" code that was easy to forget to update when fields changed. Now there's one schema per payload and the project relies on it.

**Phaser scenes talk to each other through a typed event union instead of raw strings.** Phaser (covered earlier in the "Under the hood" section) lets scenes broadcast events by name. Previously those names were plain strings sprinkled through the code, which means a typo or a rename could silently break communication between, say, the combat scene and the heads-up display. Now every event has a TypeScript-defined shape, and if someone renames an event the compiler points at every place that needed updating. Less magic, fewer surprises.

**The build pipeline got tougher.** Two changes here. First, CI now runs the full Next.js production build (the same kind of build that goes to the live website) on every push, not just the cheaper dev-mode checks. That catches a class of bugs that only appear when Next.js (the framework, also defined earlier) does its production-only optimizations. Second, the project's lint configuration was migrated to the new "flat config" format that ESLint (the linter — the tool that scans your code for likely mistakes — also mentioned earlier) recommends. The old format is being removed in Next.js 16, so this gets the project ahead of that deadline instead of scrambling later.

None of this changes how the game looks or feels. It just means the next person to add a new enemy, weapon, or mission has firmer ground to stand on.

## How AI helps build this game (Claude Code skills)

This project is mostly built by Mikko with help from **Claude Code**, a command-line tool that lets you have a conversation with an AI (Claude) that can read and edit files in the project. Inside the repo there's a folder called `.claude/skills/` that contains eight custom *skills* — short instruction files that teach Claude how to do specific Spacepotatis tasks correctly without re-figuring-out the project layout every single time. (There's a ninth file in there too — `new-weapon` — but it's a single-line redirect that points to `/equipment`, since equipment now covers the whole "add / change / remove a weapon" lifecycle in one place.)

Why does that matter? Every time Claude reads a file, it costs a small amount of money (paid in "tokens" — chunks of text Claude charges for). If a beginner asks "add a new enemy" and Claude has to grep around the codebase to find every file it needs to touch, that's a lot of tokens. A skill is basically a recipe: it lists the exact files to edit, the field names to use, and the invariants to keep, so Claude can go straight to the work.

Here's the catalog of skills currently shipped with the project. Type `/<skill-name>` inside Claude Code to invoke one, or just describe the task in plain English and Claude will pick the right skill itself.

| Skill                | What it does                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `/new-mission`       | Adds a new combat mission, picks the solar system it belongs to, and wires up waves + planet binding.|
| `/new-enemy`         | Adds a new enemy entry, generates a placeholder sprite, and (optionally) drops it into a test wave.|
| `/equipment`         | Add, change, or remove a weapon, augment, reactor, shield, or armor entry — including visual changes (bullet sprite, UI tint dot, combat HUD bars, explosion particles). One skill covers the entire CRUD lifecycle for everything in the player's loadout, and includes a cleanup table so removing a weapon doesn't quietly break the default loadout, the in-mission upgrade ladder, or the loot pools. |
| `/new-perk`          | Adds a new mid-mission buff (a "perk") with its icon, HUD chip, and pickup logic.                  |
| `/new-solar-system`  | Adds a new selectable star system to the galaxy overworld (sun color/size, unlock condition, etc).  |
| `/new-story`         | Adds a new in-game story popup — a chunk of narrative text plus background music plus a voiceover — that either auto-plays once for new players (think opening cinematic) or sits in the Story log to be replayed later. |
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
| `/equipment`         |  ~4.3K (avg)¹ |                      56 |              ~240K |
| `/new-solar-system`  |         ~9.7K |                       5 |               ~49K |
| `/new-story`         |         ~6.0K |                      10 |               ~60K |
| **Total**            |               |             **236 uses** | **~1.99M tokens** |

¹ `/equipment` covers six different operations (add/change/remove × weapon/augment/equipment) with very different per-use savings — from ~0 tokens for a simple stat tweak (the skill barely beats a quick read of `weapons.json`) to ~13K tokens for removing a weapon (where the cleanup table prevents the agent from missing a hard-coded reference and shipping broken state). The 4.3K is the weighted average across an estimated mix of ~10 add-weapons, ~5 add-augments, ~30 stat tweaks, ~8 visual tweaks, and ~3 removals per year. The 240K total is more honest than the average per-use number suggests, because the high-stakes removal path also avoids a separate "fix-up commit" round-trip.

The numbers are educated guesses — actual frequency could swing 3× either way. Even on the low end, the one-time cost of writing the skills (~12K tokens) pays itself back the first week. The two heaviest hitters are `/balance-review` and `/content-audit` because they fire on every JSON change.

The savings get bigger over time: every time the project's data shape evolves (a new field on weapons, a new mission attribute, etc.), the skill instructions are updated once, and every future agent gets the new pattern for free instead of having to discover it by grepping. Without skills, an agent asked to "remove this weapon from the game" today would need to read at least eight files (`weapons.json`, `types/game.ts`, `save.ts`, `ShipConfig.ts`, `persistence.ts`, `DropController.ts`, `lootPools.ts`, `ShipConfig.test.ts`) and probably still miss one of the hard-coded references — leaving the player stuck with a broken default loadout, or breaking the in-mission upgrade ladder so a critical pickup never appears. With the skill, the agent loads one recipe that names the exact files to clean and the exact line in each, and the test suite catches anything missed.

## Where to look next

If you want to understand the project deeper, here's the order to read things in:

1. **[CLAUDE.md](CLAUDE.md)** — the developer-facing rulebook for the project. Coding standards, hard rules ("no Prisma", "no `any`", "all game logic runs in the browser"), and the mapping from "what the user wants" → "which skill to invoke".
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — a tour of how data flows through the app: how a click on a planet leads to a Phaser combat scene starting, how saves are written, how the database schema is laid out.
3. **[TODO.md](TODO.md)** — the planned implementation phases and what's deliberately out of scope.
4. **[.claude/skills/](.claude/skills/)** — the eight skills mentioned above (plus the `new-weapon` redirect stub). Each one is a short markdown file you can read on its own.
5. **[src/game/phaser/data/](src/game/phaser/data/)** — the game's balance data (weapons, enemies, waves, missions, perks). All numbers live here as JSON, so you can re-tune the game without touching any code.

## License

MIT — see [LICENSE](LICENSE). MIT is a permissive open-source license: you can use, modify, and redistribute the code, including in commercial projects, as long as you include the original copyright notice.
