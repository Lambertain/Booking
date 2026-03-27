-- Media support in messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT; -- image/video/file
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_size INTEGER;

-- Store pending user registrations from chat
CREATE TABLE IF NOT EXISTS chat_registrations (
  id          SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  telegram_username TEXT,
  first_name  TEXT,
  proposed_role TEXT CHECK (proposed_role IN ('model','client','manager')),
  proposed_name TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
