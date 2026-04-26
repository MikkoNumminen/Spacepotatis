-- migrate:up

-- Public alias used everywhere player identity is shown to other users.
-- Nullable so existing rows back-fill on next sign-in instead of forcing a
-- migration script. The leaderboard query falls back to a generic label
-- when this is NULL — we never expose email or Google profile name to
-- other users.
ALTER TABLE spacepotatis.players
  ADD COLUMN handle TEXT;

-- Case-insensitive uniqueness. Partial index so multiple NULLs are allowed
-- (existing players that haven't picked a handle yet).
CREATE UNIQUE INDEX players_handle_lower_idx
  ON spacepotatis.players (LOWER(handle))
  WHERE handle IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS spacepotatis.players_handle_lower_idx;
ALTER TABLE spacepotatis.players DROP COLUMN IF EXISTS handle;
