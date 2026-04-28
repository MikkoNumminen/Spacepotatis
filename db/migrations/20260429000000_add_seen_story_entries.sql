-- migrate:up

-- Persist which narrative beats the player has watched. Default to an empty
-- array so existing save rows return [] from the GET endpoint and the
-- intro popup correctly fires on first sign-in.
ALTER TABLE spacepotatis.save_games
  ADD COLUMN seen_story_entries TEXT[] NOT NULL DEFAULT '{}';

-- migrate:down

ALTER TABLE spacepotatis.save_games DROP COLUMN IF EXISTS seen_story_entries;
