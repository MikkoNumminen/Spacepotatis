# Claude Code skills — savings methodology

This is the long-form companion to the **Built with AI** section of the README. The headline number there is *~2.76M tokens/year*. This document shows the math.

## What's a skill

A short markdown file in `.claude/skills/` that teaches Claude how to do one specific Spacepotatis task — add an enemy, tune a weapon, ship a database migration, audit the save round-trip. It lists the exact files to edit, the field names to use, and the invariants to keep. Claude invokes it with `/<skill-name>` (or auto-picks based on the task description).

The point is reproducibility. Without skills, every "add a new enemy" run starts with grepping the codebase to derive the same five files an agent re-derived last week. With skills, the recipe is version-controlled, audited quarterly, and shared across runs.

## Per-skill estimate

Rough estimates assuming a year of normal content authoring. "Tokens" here means the units Claude charges by — fewer tokens means cheaper and faster sessions.

| Skill                     | Saved per use | Estimated uses per year | Total tokens saved |
| ------------------------- | ------------: | ----------------------: | -----------------: |
| `/balance-review`         |       ~13.5K³ |                      50 |              ~675K |
| `/content-audit`          |       ~15.0K³ |                      50 |              ~750K |
| `/save-roundtrip-audit`   |       ~12.0K⁵ |                      20 |              ~240K |
| `/new-mission`            |         ~8.0K |                      30 |              ~240K |
| `/new-enemy`              |         ~5.5K |                      25 |              ~138K |
| `/new-perk`               |         ~9.0K |                      10 |               ~90K |
| `/equipment`              |  ~4.3K (avg)¹ |                      56 |              ~240K |
| `/new-solar-system`       |       ~13.0K⁴ |                       5 |               ~65K |
| `/new-story`              |  ~5.4K (avg)² |                      40 |              ~216K |
| `/new-migration`          |         ~7.0K⁶ |                      15 |              ~105K |
| **Total**                 |               |             **301 uses** | **~2.76M tokens** |

¹ `/equipment` covers six different operations (add/change/remove × weapon/augment/equipment) with very different per-use savings — from ~0 tokens for a simple stat tweak (the skill barely beats a quick read of `weapons.json`) to ~13K tokens for removing a weapon (where the cleanup table prevents the agent from missing a hard-coded reference and shipping broken state). The 4.3K is the weighted average across an estimated mix of ~10 add-weapons, ~5 add-augments, ~30 stat tweaks, ~8 visual tweaks, and ~3 removals per year.

² `/new-story` covers full CRUD: CREATE (cinematic intros and voice-only briefings), MODIFY (text edits, audio re-records, trigger changes), and REMOVE (with a hard-coded-reference cleanup table). Estimated mix per year: ~4 cinematic intros (~11K each), ~12 mission/shop briefings (~6K each), ~15 text rewrites (~4K each), ~6 audio re-records (~4K each), ~2 trigger reroutes (~4K each), ~1 removal (~8K — the cleanup table catches the `storyLogAudio.ts` hard-coded music path that an unaided grep misses).

³ `/balance-review` and `/content-audit` are the two utility skills that grew the most after the April 2026 quarterly audit. `/balance-review` was extended from "weapons + enemies + waves + missions + perks" coverage to also include augments, loot pools, weapon families, gravity ballistics, and solar systems. `/content-audit` gained four new audit steps (story integrity, storyTriggers helper coverage, loot-pool integrity, mission `solarSystemId` orphan check). Per-use savings up by ~2K each. Annual frequency stays at 50 — both fire once per JSON-touching commit.

⁴ `/new-solar-system` was extended in late April 2026 to make the on-system-enter cinematic (voiceover + music change on first warp into the system) a required scaffold step, not an optional follow-up. Per-use savings up from ~10K to ~13K — the skill now covers the asset re-encoding (`ffmpeg -ac 1 -b:a 64k`), the matching `STORY_ENTRIES` entry + `StoryId` union extension, and the `selectOnSystemEnterEntry` test assertion that locks in the "fresh player always gets the cinematic" guarantee.

⁵ `/save-roundtrip-audit` was added in May 2026 after two production incidents in 48 hours hit the same bug class — a field that lives in some layers of the save pipeline but is silently dropped by another. The 2026-05-02 wipe (`validateNoRegression` missing on POST) and the 2026-05-03 "Continue always lands at Sol Spudensis" bug (`currentSolarSystemId` declared everywhere except where it mattered) both share that shape. Without the skill, an agent verifying the round-trip has to read `persistence.ts` (~3K), `schemas/save.ts` (~3K), `api/save/route.ts` (~5K), `db.ts` (~1.5K), `sync.ts` excerpts (~2K), then synthesize the field × layer matrix from scratch — about 14K of input plus 2K of synthesis. With the skill, ~3K. Frequency estimate (20/year) reflects the active `save_audit` data-collection window plus the upcoming Phase Save-Architecture migration.

⁶ `/new-migration` enforces the §7a HARD RULE end-to-end: dated SQL file with both `migrate:up` and `migrate:down` blocks, `Database` interface in `src/lib/db.ts`, prod application via `scripts/migrate.mjs`, verification via `scripts/check-schema.mjs`, and the PR-body checkbox the reviewer's merge button is gated on. Skipping any step ships a save POST that 500s on every authenticated player.

## How to read these numbers

The numbers are **educated guesses** — actual frequency could swing 3× either way. Even on the low end, the one-time cost of writing the skills (~12K tokens each, ~120K total) pays itself back in the first week of authoring. The three heaviest hitters are `/balance-review`, `/content-audit`, and `/save-roundtrip-audit` because they fire on every change to their respective surfaces.

The savings figures grow with the codebase, not just with usage. Each new field, file, or invariant that lands without a corresponding skill update is a future failure mode the skill prevents — *but only if the skill is kept current*. The April 2026 audit found two utility skills had drifted to ~5/10 accuracy because the codebase had grown shapes (augments, loot pools, story integrity) the skills never knew about; once patched, the savings table jumped from ~2.15M to ~2.40M tokens/year. Plan on a quarterly re-audit per skill, plus an immediate update when any catalog file gains a new field.

## What this is supposed to demonstrate

Three things, for the portfolio context:

1. **AI-assisted development is an engineering discipline, not a vibe.** Skills are version-controlled, reviewed, and tested. Drift is a real bug class with a documented mitigation.
2. **The savings come from architecture, not prompting.** A skill is an explicit specification of the work — agnostic to which model is running. Better models make the same skill cheaper; they don't replace it.
3. **The number is a range, not a point estimate.** Anyone claiming exact token savings from AI tooling is selling something. The honest version is "the architecture is the value; the number is plausible."
