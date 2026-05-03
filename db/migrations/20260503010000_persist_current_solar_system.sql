-- migrate:up

-- Persist the player's last-viewed solar system so Continue lands them
-- back where they left off instead of resetting to Sol Spudensis on every
-- session. NULL on existing rows is fine — the client's hydrate() falls
-- back to the first unlocked system (which is sufficient for any save
-- that pre-dates this column).
ALTER TABLE spacepotatis.save_games
  ADD COLUMN current_solar_system_id TEXT;

-- migrate:down

ALTER TABLE spacepotatis.save_games DROP COLUMN IF EXISTS current_solar_system_id;
