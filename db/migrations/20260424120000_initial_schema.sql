-- migrate:up

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Players
CREATE TABLE players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Save games — one row per (player, slot). Slot 1 is the default cloud save.
CREATE TABLE save_games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  slot                  INTEGER NOT NULL DEFAULT 1,
  credits               INTEGER NOT NULL DEFAULT 0,
  current_planet        TEXT,
  ship_config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_missions    TEXT[] NOT NULL DEFAULT '{}',
  unlocked_planets      TEXT[] NOT NULL DEFAULT '{}',
  played_time_seconds   INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, slot)
);

-- Leaderboard entries, one row per submission.
CREATE TABLE leaderboard (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mission_id    TEXT NOT NULL,
  score         INTEGER NOT NULL,
  time_seconds  INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast top-N per mission.
CREATE INDEX leaderboard_mission_score_idx
  ON leaderboard (mission_id, score DESC, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS leaderboard_mission_score_idx;
DROP TABLE IF EXISTS leaderboard;
DROP TABLE IF EXISTS save_games;
DROP TABLE IF EXISTS players;
