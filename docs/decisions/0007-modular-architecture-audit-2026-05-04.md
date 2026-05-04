# ADR 0007: Ten-module architecture from the 2026-05-04 audit

Date: 2026-05-04
Status: accepted

## Context

Through 2026-04, Spacepotatis grew from a Phaser prototype to a Tyrian-
inspired vertical shooter with a Three.js galaxy overworld and a
fully-voiced audiobook storyline. Code organisation kept up adequately
but not deliberately — directories accreted, several god-files appeared
(`BootScene.ts` at 1819 LOC, `GameCanvas.tsx` at 452, `ShopUI.tsx` at
408, `saveValidation.ts` at 440), and one cross-domain backedge slipped
in (`src/lib/useOptimisticAuth.ts` reaching into `@/game/state/*`).

The 2026-04-27 modularity audit had already done one cleanup pass —
broke up GameState into slices, extracted persistence migrators, made
JSON the source of truth for balance, added typed Phaser events. That
pass was reactive (fix specific god-modules) rather than structural
(define the boundaries).

The 2026-05-04 audit was the structural pass. Its goal: establish a
named, acyclic, shallow dependency graph that every future agent can
read in one screenful, AND make the save round-trip a fortified
perimeter so the next agent who adds a `StateSnapshot` field can't
silently drop it through the pipeline.

The audit ran in five phases:

- **Phase 0** — agent setup (parallel-agent harnesses, zones).
- **Phase 1** — read-only inventory of all ~254 source files across
  four parallel zones (`docs/audit/01-inventory.md`,
  `docs/audit/04-found-bugs.md`).
- **Phase 2** — proposed module boundaries, dependency graph, and
  migration order (`docs/audit/02-target-architecture.md`).
- **Phase 3** — mechanical extraction, gated behind explicit user
  approval. NOT executed yet.
- **Phase 4** — documentation (this ADR + module READMEs + ARCHITECTURE
  updates), authored against the proposed boundaries even before the
  extraction.
- **Phase 5** — verification, pending.

Phase 1 confirmed zero import cycles. Phase 2 proposed a 10-module
shape — fewer would cluster save-data risk against everything else,
more would shred the catalog accessors into per-id files.

## Decision

The codebase is partitioned into ten top-level modules with a strict
acyclic dependency graph: `types` → `schemas` → `infra` → `content` →
`state` → (`audio`, `phaser`, `three`, `app`) → `ui`. Imports across
module boundaries go through the module's `index.ts`; siblings'
internals are off-limits. Phase 3 (mechanical extraction) is gated
behind explicit user approval and runs one module per
`module-extractor` invocation in dependency order.

## Consequences

- Pro: an agent changing one module reads its README + the module's
  public API, not the rest of the codebase. Token cost per task drops.
- Pro: the save round-trip is contained inside `state` with the
  `/save-roundtrip-audit` skill as the gate. Phase 3 extraction of
  `state` is explicitly the highest-risk and runs the audit before
  commit.
- Pro: the longest dependency chain is 5 hops
  (`ui → app → state → content → schemas → types`). Acyclic, shallow,
  and verifiable from a static dependency graph.
- Con: Phase 3 itself is a significant refactor — tier 1 (types,
  schemas, audio) is ~3 hours, tier 5 (ui) is ~6. Total estimated
  agent time with parallelism is ~12 hours.
- Con: some files move between modules (`useOptimisticAuth.ts` from
  `infra` to `state`; possibly `WeaponStats.tsx` into `loadout/`).
  Each move is reviewable but not free.
- Pro: the documentation work in Phase 4 lands BEFORE Phase 3, so
  agents reading the docs during the extraction get the new mental
  model immediately. Per-module READMEs cross-link to current paths
  so they stay valid through the extraction.
- The full module table and dependency graph live in CLAUDE.md §17 and
  in `ARCHITECTURE.md` (post-audit module section). Source artifacts
  are in `docs/audit/`.
