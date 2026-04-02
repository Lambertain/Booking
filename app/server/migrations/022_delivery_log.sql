CREATE TABLE IF NOT EXISTS delivery_log (
  id SERIAL PRIMARY KEY,
  model_slug TEXT NOT NULL,
  model_name TEXT,
  photographer TEXT NOT NULL,
  site TEXT NOT NULL,
  status TEXT CHECK (status IN ('sent', 'failed')) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stats (
  id SERIAL PRIMARY KEY,
  model_slug TEXT NOT NULL,
  model_name TEXT,
  total_seen INT DEFAULT 0,
  total_queued INT DEFAULT 0,
  total_uninterested INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
