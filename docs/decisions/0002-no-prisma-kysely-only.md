# ADR 0002: Kysely + raw SQL migrations, no Prisma

Date: 2026-05-04
Status: accepted

## Context

The persistence layer is Postgres on Neon (serverless, WebSocket pool
driver). Two questions surfaced when we set it up: which query layer to use,
and how to manage schema changes. The default Next.js stack would be Prisma,
which provides a typed ORM, generated client, and a migrations tool in one
package. We considered it and rejected it.

Three constraints drove the rejection:

1. **Edge-runtime compatibility.** `/api/save`, `/api/leaderboard`, and
   `/api/handle` run on the Edge runtime to keep latency and cost down.
   Prisma's client is heavy and historically a poor fit for Edge; it pulls
   in a generated engine binary the Edge runtime can't run.
2. **Bundle and cold-start cost.** Prisma adds tens of megabytes to a
   deploy and noticeable cold-start latency. On Hobby tier, that hits the
   build budget (< 2 minutes) and the per-invocation budget directly.
3. **Schema drift risk.** Prisma's schema-as-source-of-truth model means
   any hand-written migration outside the Prisma flow desyncs the client.
   We expect to write hand-tuned SQL (indexes, schema-namespaced tables,
   `save_audit` columns) and want a layer that doesn't object.

## Decision

All queries go through Kysely as a typed SQL builder; `src/lib/db.ts` owns
the single `Database` interface; migrations are forward-only `*.sql` files
in `db/migrations/` applied via the node-based runner
(`scripts/migrate.mjs`); Prisma is forbidden.

## Consequences

- Pro: Edge runtime works without binary shims. Bundle size stays small.
- Pro: Migrations are plain SQL — reviewable, copy-pasteable, idempotent.
  Tables are namespaced under `spacepotatis.*` because the Neon DB is
  shared with other services.
- Pro: The `Database` interface in `src/lib/db.ts` is the single source of
  truth for shape; agents update it alongside any new migration.
- Con: There's no auto-generated client; the Kysely interface needs hand-
  maintenance. Mitigated by it being a small surface (3 tables today).
- Con: No "introspect prod and regenerate types" loop. The trade-off is
  that the human reviewing a migration is forced to also update the
  TypeScript shape, which is the right ergonomic — the same PR ships both.
- Hard rule: §9 of CLAUDE.md says "No Prisma. Ever." If an agent suggests
  it, refuse. Migrations are always new SQL files; never alter an existing
  one.
