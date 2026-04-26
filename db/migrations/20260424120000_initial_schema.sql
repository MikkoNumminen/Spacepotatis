-- migrate:up

-- Spacepotatis lives inside its own schema so it can share a Vercel/Neon
-- database with other services without table-name collisions.
CREATE SCHEMA IF NOT EXISTS spacepotatis;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE spacepotatis.players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE spacepotatis.save_games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES spacepotatis.players(id) ON DELETE CASCADE,
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

CREATE TABLE spacepotatis.leaderboard (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES spacepotatis.players(id) ON DELETE CASCADE,
  mission_id    TEXT NOT NULL,
  score         INTEGER NOT NULL,
  time_seconds  INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leaderboard_mission_score_idx
  ON spacepotatis.leaderboard (mission_id, score DESC, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS spacepotatis.leaderboard_mission_score_idx;
DROP TABLE IF EXISTS spacepotatis.leaderboard;
DROP TABLE IF EXISTS spacepotatis.save_games;
DROP TABLE IF EXISTS spacepotatis.players;
DROP SCHEMA IF EXISTS spacepotatis;
