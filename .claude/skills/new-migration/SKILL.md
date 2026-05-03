---
name: new-migration
description: Add a Postgres schema migration end-to-end — dated SQL file in db/migrations/, Database interface update in src/lib/db.ts, prod application via scripts/migrate.mjs, schema verification via scripts/check-schema.mjs, and the PR-body checkbox that gates merge. Enforces CLAUDE.md §7a HARD RULE so the next save POST doesn't 500.
---

# When to use

Invoke on `/new-migration`, "add a column", "add a table", "schema change", "alter the save shape", or any request that requires touching `db/migrations/` or `src/lib/db.ts`.

This skill exists because PR #89 shipped a `seen_story_entries` column referenced from code without applying the migration to prod — every save POST 500'd for 3 days. CLAUDE.md §7a is the HARD RULE; this skill is the executable version.

## Boundary — STOP and flag

- **Editing an already-shipped migration file.** Migrations are FORWARD-ONLY. Append a new file; never edit one that's been applied to any environment (prod, your local, or anyone else's local).
- **Multi-tenant / cross-schema work.** Tables must live under the `spacepotatis` Postgres schema. Writing to `public.*` is a HARD NO (CLAUDE.md §5 — the database is shared with other services). The only `public.*` table we own is `public.spacepotatis_schema_migrations`, owned by dbmate, not by app code.
- **Destructive changes on populated tables** (`DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN ... TYPE` with implicit cast, `RENAME COLUMN` / `RENAME TABLE`). Pause and confirm with the user — these can't be rolled back from the live data once applied. Renames are especially nasty because every reader breaks until both halves deploy in lockstep, so they typically require the two-step pattern below.
- **Migrations that require a code-then-DB or DB-then-code ordering**. The merge contract assumes both halves land within minutes. If your change requires a two-step deploy (e.g. add nullable column → backfill → make NOT NULL, or rename column → keep both → drop old), say so up front and split into two PRs with explicit ordering in the PR body.

## Adjacent skills

- New API route or save-shape field that needs a column → this skill, then update `src/lib/schemas/save.ts` + the Kysely query in `src/app/api/save/route.ts`.
- New content surface that fits in JSON (mission, weapon, perk) → use the matching content skill; no migration needed.
- Story content (`seen_story_entries TEXT[]` already covers any size) → `/new-story`; no migration needed.

# Inputs (ask once)

1. **What changes** — added column / new table / new index / data backfill. Be specific (column name, type, nullability, default, FK target).
2. **Why** — one sentence. Drives the file's header comment AND the PR body. Mandatory; "the code needs it" is not an answer.
3. **Default policy** — for `ADD COLUMN`: nullable (existing rows stay NULL until a write touches them) OR `NOT NULL DEFAULT <value>` (Postgres rewrites the table — fast on small tables, multi-minute lock on large ones; the `save_games` table is small today, but flag if the user wants `NOT NULL` on a table > 100k rows).
4. **Backfill needed?** If yes, write the backfill as a separate `UPDATE` in the SAME migration file (idempotent — guard with `WHERE col IS NULL` or similar).
5. **Confirmation: ready to apply to prod immediately on merge?** If no, the migration MUST NOT merge. Hold the PR.

# Steps

## 1. Pick the filename

Format: `YYYYMMDDhhmmss_short_snake_case_description.sql`. Use a fresh UTC timestamp (`date -u +%Y%m%d%H%M%S`) — the runner sorts by this string and applies in order. See `db/migrations/` for the latest examples; copy the structurally closest one as a template.

## 2. Write the SQL file

Required dbmate format — the `-- migrate:up` and `-- migrate:down` markers are not optional (the runner extracts the up block by string-search at `scripts/migrate.mjs:89-97`). Header comment explains the WHY.

```sql
-- migrate:up

-- <one-paragraph WHY: what failure mode this prevents, what feature it
-- enables, and any constraint that drove the shape (e.g. nullable because
-- existing rows can't be backfilled meaningfully).>

ALTER TABLE spacepotatis.<table>
  ADD COLUMN IF NOT EXISTS <column> <type> <NULL|NOT NULL DEFAULT ...>;

-- migrate:down

ALTER TABLE spacepotatis.<table> DROP COLUMN IF EXISTS <column>;
```

For a new table, include `IF NOT EXISTS`, primary key, FKs (with `ON DELETE CASCADE` if the parent owns the lifetime), and any indexes the production query path needs:

```sql
CREATE TABLE IF NOT EXISTS spacepotatis.<table> (
  id           BIGSERIAL PRIMARY KEY,
  player_id    UUID NOT NULL REFERENCES spacepotatis.players(id) ON DELETE CASCADE,
  ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS <table>_player_created_idx
  ON spacepotatis.<table> (player_id, created_at DESC);
```

**Always** namespace under `spacepotatis.` — bare `<table>` defaults to `public` and breaks the multi-tenant assumption (CLAUDE.md §5).

## 3. Update the Kysely Database interface

Open [src/lib/db.ts](src/lib/db.ts). Add the new table to the `Database` interface, OR add the new column to the existing table interface. `Generated<T>` marks columns that are `NOT NULL DEFAULT ...` in SQL (required on SELECT, optional on INSERT). Nullable columns use `T | null`.

```ts
export interface SaveGamesTable {
  ...
  // <comment matching the column's WHY>
  <column>: <T> | null;  // nullable
  // OR
  <column>: Generated<<T>>;  // NOT NULL DEFAULT ...
}
```

For a new table, add an interface AND register it on `Database`:

```ts
export interface Database {
  ...
  "spacepotatis.<table>": <Table>Table;
}

export interface <Table>Table {
  id: Generated<string>;
  ...
}
```

Both halves (SQL + interface) MUST land in the same commit. Drift between them is exactly the failure mode this skill prevents.

## 4. Run the migration locally

```bash
node --env-file=.env.local scripts/migrate.mjs
```

The runner is idempotent (tracks applied versions in `public.spacepotatis_schema_migrations`); re-running after a partial apply or a failure is safe. Output should end `applied 1 migration(s).`.

## 5. Verify the schema landed

```bash
node --env-file=.env.local scripts/check-schema.mjs
```

Read-only — lists applied migrations and `spacepotatis.save_games` columns. The new version should appear in the migration list and (if it was a column addition) the column should appear in the column list. If the script doesn't cover your table, add a one-off `psql -c '\d spacepotatis.<table>'` invocation or extend `check-schema.mjs` (small enough that adding a third query block is fine).

## 6. typecheck + test + lint

```bash
npm run typecheck && npm test && npm run lint
```

Typecheck catches Database-interface drift in any code that reads/writes the new column. Tests catch any fixture or sync test that asserts the row shape (e.g. `src/app/api/save/route.test.ts`).

## 7. Open the PR with the gating checkbox

PR body MUST include the standard checklist + a "Migration applied to prod" checkbox (the §7a hard rule). The "Schema verified" checkbox below is a skill-level addition — recommended but not §7a; don't reject a PR that lacks the second one.

```markdown
## Summary
- <what changed and why>

## Migration
- [ ] Migration applied to prod (`node scripts/migrate.mjs` against `DATABASE_URL_UNPOOLED`)  ← §7a hard rule
- [ ] Schema verified (`node --env-file=.env.local scripts/check-schema.mjs`)                 ← skill convention

## Test plan
- [ ] ...
```

## 8. Apply to prod — BEFORE or IMMEDIATELY AFTER merge

```bash
DATABASE_URL_UNPOOLED="<neon-direct-url>" node scripts/migrate.mjs
```

Drop `--env-file=.env.local` here — `.env.local` defines `DATABASE_URL_UNPOOLED` for local, and Node loads `--env-file` BEFORE inline vars take effect. Inline-only is unambiguous: the prod URL is the only candidate the runner can see. Then re-verify with `check-schema.mjs` against the same URL (same trick — pass `DATABASE_URL_UNPOOLED=...` inline, no `--env-file`).

**If you can't apply now, don't merge yet.** The Vercel deploy fires within seconds of merge — once the new code is live, every API call referencing the missing column will 500 until the migration runs. The symptom is `error: "server_error"` in the save modal; logs show `column "X" does not exist`.

## 9. Tick the checkbox + close the loop

Tick the "Migration applied to prod" checkbox in the PR body, comment with the verification output, then merge (or land if already merged). Done.

# Invariants

- Filename matches `YYYYMMDDhhmmss_<snake_case>.sql`, sorted lexicographically AFTER every existing migration in `db/migrations/`.
- File contains BOTH `-- migrate:up` and `-- migrate:down` markers (runner uses them at `scripts/migrate.mjs:89-97`).
- Every new table / new column lives under the `spacepotatis.` Postgres schema. Never `public.*`.
- `ON DELETE CASCADE` on any FK whose lifetime is owned by the parent (typical: `player_id` → `spacepotatis.players(id)`).
- `src/lib/db.ts` `Database` interface updated in the SAME commit as the SQL file.
- `Generated<T>` for `NOT NULL DEFAULT ...` columns; `T | null` for nullable columns; bare `T` for `NOT NULL` without default (rare — typically only on INSERT-required client-supplied fields).
- Migration is FORWARD-ONLY. Never edit a shipped migration; append a new file.
- `npm run typecheck && npm test && npm run lint` passes BEFORE the PR opens.
- PR body has the "Migration applied to prod" checkbox.
- Migration applied to prod within the same merge window. Code and schema land together — never code-then-schema-later.

# Files this skill modifies

**Always:**
- `db/migrations/<timestamp>_<description>.sql` — the new migration.
- `src/lib/db.ts` — `Database` interface update.

**Conditionally:**
- `src/lib/schemas/save.ts` — only if the column is part of the wire-format payload (e.g. a new field on `SavePayload`).
- `src/app/api/save/route.ts` — only if the route reads/writes the new column.
- `src/app/api/save/route.test.ts` — only if existing fixtures assert row shape and need a new field.
- `scripts/check-schema.mjs` — only if extending coverage to a new table.

**Never:**
- Existing files in `db/migrations/` (FORWARD-ONLY).
- `db/schema.sql` — dbmate auto-generates this on `dbmate up`; checking in a hand-edited version causes drift. Don't commit it (CLAUDE.md §8 lists it under do-not-commit).
- `dbmate.toml` — config is stable; only touch if the migration runner itself needs reconfiguration.
