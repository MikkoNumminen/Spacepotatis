# ADR 0005: Game balance lives in JSON, accessors do one cast at module load

Date: 2026-05-04
Status: accepted

## Context

Spacepotatis has hundreds of tunable values: weapon damage, fire rates,
enemy HP, mission credit rewards, perk drop weights, augment effects,
loot pool composition, solar system layouts, story trigger timings.
A balance pass typically touches dozens of numbers in one sitting.

If those numbers live in TypeScript, every balance change is a code
change — git diff is hostile to JSON-style data, designers can't grep
without IDE help, and the balance-review skill (`/balance-review`) can't
diff them mechanically. If they live in JSON loaded via `JSON.parse`
plus `Schema.parse(jsonData)` at module load, we get runtime safety —
but Zod gets pulled into every static page's first-load JS, which
measured out at ~98 KB on the landing and shop pages. That cost is
unacceptable on Hobby tier and on mobile.

We needed a third path: keep balance in JSON, keep static-page bundles
small, and still catch a JSON-shape regression before it ships.

## Decision

Every balance value lives in `src/game/data/*.json`. Each accessor
(`getWeapon`, `getEnemy`, `getMission`, etc.) does exactly ONE `as`
cast at module load, with no runtime Zod parse. Soundness is enforced
by `src/game/data/__tests__/jsonSchemaValidation.test.ts`, which runs
the matching Zod schema from `src/lib/schemas/*` against each JSON file
on every push. CI is the drift gate; the production bundle stays Zod-
free for catalog reads.

## Consequences

- Pro: ~98 KB savings on every static page's first-load JS. The
  landing page and shop benefit most.
- Pro: Designers can edit JSON directly. `/balance-review` diffs balance
  numbers mechanically. Git diff is reasonably readable on JSON.
- Pro: A new JSON-backed accessor adds one matching `it(...)` row in
  `jsonSchemaValidation.test.ts`. CI fails if drift sneaks in.
- Con: TypeScript types lie if JSON is ever wrong. Mitigated by CI:
  every push runs the schema parser. A drift bug can land on a feature
  branch but cannot reach `master`.
- Con: Some accessors (`integrityCheck.ts`) cross-reference catalogs
  for orphan refs. That work happens at module load via `missions.ts`
  importing the integrity check — a side effect that the audit
  flagged as latent (see `docs/audit/04-found-bugs.md`) but acceptable.
- Hard rule: per CLAUDE.md §5, do NOT re-add `Schema.parse(jsonData)`
  at module load. The CI test is the contract. If you need runtime
  validation of a NEW shape, add it to the matching schema file in
  `src/lib/schemas/` and the test will pick it up.
- The 2026-04-27 modularity audit folded this in as a §11 row;
  Phase 2 of the 2026-05-04 audit (this ADR) reaffirms it as the
  baseline for the `content` module's contract.
