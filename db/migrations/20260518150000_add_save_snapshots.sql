-- migrate:up

-- Append-only save history. Every successful POST /api/save writes one row
-- here ALONGSIDE the destructive UPSERT into spacepotatis.save_games. The
-- 2026-05-02 wipe was possible because save_games stores a single row per
-- (player_id, slot) that's OVERWRITTEN on every save — a buggy client POST
-- could blow away weeks of progress with no on-disk record of the prior
-- state. Guards (validateNoRegression, account stamping, the durability
-- queue) reduce the hit rate but the data model still permits destruction.
--
-- This table is the structural fix: a wipe becomes one more INSERT here, the
-- prior snapshot stays queryable forever (or until a retention cron prunes
-- it), and restore is `ORDER BY created_at DESC OFFSET 1 LIMIT 1`.
--
-- v1 scope (this migration): table + dual-write only. Reads still flow
-- through save_games for now. Cutover of the read path lands in a follow-up
-- once we've verified dual-writes match the source of truth in production.
--
-- Retention: TBD. Same calculus as save_audit — keep everything for now
-- (Neon Free tier headroom is plenty for current player traffic), add a
-- retention cron once save_audit data informs the right window. Document
-- this in TODO.md Phase Save-Architecture as a v2 follow-up.
--
-- `source` column: free-form marker for which code path wrote the row.
-- Values today: 'post_api_save'. Future entries might include
-- 'pg_dump_restore', 'manual_recovery', etc. Useful for filtering when
-- diagnosing.
--
-- Operator quick query (most recent snapshot per player):
--   SELECT DISTINCT ON (player_id, slot) player_id, slot, created_at, source
--   FROM spacepotatis.save_snapshots
--   ORDER BY player_id, slot, created_at DESC;

CREATE TABLE IF NOT EXISTS spacepotatis.save_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  player_id   UUID NOT NULL REFERENCES spacepotatis.players(id) ON DELETE CASCADE,
  slot        SMALLINT NOT NULL DEFAULT 1,
  payload     JSONB NOT NULL,
  source      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for the tail-read query that will replace the GET /api/save
-- SELECT in v2: `WHERE player_id = $1 AND slot = $2 ORDER BY created_at DESC
-- LIMIT 1`. DESC on created_at makes the LIMIT 1 a constant-time index scan.
CREATE INDEX IF NOT EXISTS save_snapshots_player_slot_created_idx
  ON spacepotatis.save_snapshots (player_id, slot, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS spacepotatis.save_snapshots_player_slot_created_idx;
DROP TABLE IF EXISTS spacepotatis.save_snapshots;
