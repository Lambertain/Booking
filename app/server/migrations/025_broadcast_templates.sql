CREATE TABLE IF NOT EXISTS broadcast_templates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  tags       TEXT[] DEFAULT '{}',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
