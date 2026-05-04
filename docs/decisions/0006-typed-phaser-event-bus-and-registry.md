# ADR 0006: Typed event bus + typed registry for Phaser, no string keys

Date: 2026-05-04
Status: accepted

## Context

Phaser's native `scene.events.emit("string-name", payload)` and
`game.registry.set("string-key", value)` work fine but are compile-blind.
A typo in the event name silently drops the listener. A registry key
read with the wrong type does the wrong thing at runtime. In a typed
codebase, that's a regression in safety — every other surface has
`tsc` watching it.

Spacepotatis has many cross-scene signals: combat → game-over,
loadout-changed → HUD refresh, drop-collected → audio cue,
perk-active → VFX. As the surface grew, the string-keyed approach
became a real source of subtle bugs (a renamed event with one
listener un-renamed).

## Decision

Cross-scene events go through `emit(scene, { type: ... })` from
`src/game/phaser/events.ts`, which holds a discriminated union of every
allowed event shape. Cross-scene shared state goes through the typed
accessors in `src/game/phaser/registry.ts`. Direct calls to
`scene.events.emit("...")` and `game.registry.set("...")` are forbidden;
ESLint and review catch them. The 2026-05-04 modular audit's Phase 1
walk confirmed zero string-keyed violations across the entire `phaser`
module (zone B inventory).

## Consequences

- Pro: a typo in an event name is a TS error, not a silent drop.
- Pro: a refactor that renames an event finds every listener via
  `tsc` rename — the union type forces the listener side to match.
- Pro: registry reads return the correct type; no `as`-cast at the
  read site.
- Pro: the `events.ts` file IS the documentation — every cross-scene
  signal in the game is enumerated in one discriminated union.
- Con: adding a new event is two edits (the union + the listener).
  Acceptable; it's the same friction as adding a Redux action.
- Con: events.ts grows unbounded as the game grows. Mitigated by
  domain-grouping in the union (combat events, loadout events, etc.);
  if it becomes a god-file, split into `events/{combat,loadout,...}.ts`
  with a barrel re-export.
- Hard rule: per CLAUDE.md §9, no string-keyed Phaser events or
  registry access. New code uses the typed wrappers. The audit
  found zero violations today; the lint rule keeps it that way.
