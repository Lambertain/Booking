-- Migration 009: subscribers table for broadcast
CREATE TABLE IF NOT EXISTS subscribers (
  id              SERIAL PRIMARY KEY,
  telegram_id     TEXT UNIQUE NOT NULL,
  username        TEXT,
  full_name       TEXT,
  status          TEXT DEFAULT 'active',
  tags            TEXT[] DEFAULT '{}',
  subscribed_at   TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers (status);
CREATE INDEX IF NOT EXISTS subscribers_tags_idx ON subscribers USING GIN (tags);
