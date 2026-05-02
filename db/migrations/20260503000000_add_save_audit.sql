-- migrate:up

-- Forensic audit trail for every POST /api/save attempt. The 2026-05-02 wipe
-- was diagnosed by reading logs and reverse-engineering — there was no record
-- of what the client actually sent or what the previous server-side state was.
-- This table fixes that: every save attempt (success, validator rejection, or
-- server error) writes a row with the request payload, the prev snapshot, the
-- response status + error code, and a couple of request-context fields useful
-- for cross-tab / cross-device diagnosis.
--
-- Retention: TBD. At ~1 KB/row x 100 saves/day x 100 players ≈ 10 MB/day so a
-- cron-driven cleanup of rows older than 90 days will eventually be needed.
-- For now, keep all rows — Neon Free tier headroom is plenty for the current
-- player base, and the diagnostic value of older history outweighs the cost.
--
-- Operator quick query:
--   SELECT * FROM spacepotatis.save_audit
--   WHERE player_id = '<uuid>'
--   ORDER BY created_at DESC
--   LIMIT 50;

CREATE TABLE IF NOT EXISTS spacepotatis.save_audit (
  id                BIGSERIAL PRIMARY KEY,
  player_id         UUID NOT NULL REFERENCES spacepotatis.players(id) ON DELETE CASCADE,
  slot              SMALLINT NOT NULL DEFAULT 1,
  request_payload   JSONB NOT NULL,
  response_status   SMALLINT NOT NULL,
  response_error    TEXT,
  prev_snapshot     JSONB,
  request_ip        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS save_audit_player_created_idx
  ON spacepotatis.save_audit (player_id, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS spacepotatis.save_audit_player_created_idx;
DROP TABLE IF EXISTS spacepotatis.save_audit;
