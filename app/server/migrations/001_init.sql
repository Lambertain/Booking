-- Users (all roles)
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('admin','manager','model','client')),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  password_hash TEXT,
  telegram_id   BIGINT UNIQUE,
  telegram_username TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Manager → Model assignments
CREATE TABLE manager_models (
  manager_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (manager_id, model_id)
);

-- Agency models (extends users where role='model')
CREATE TABLE agency_models (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  portfolio_url   TEXT,
  commission_pct  NUMERIC(5,2),
  notes           TEXT
);

-- Shoots (replaces Airtable)
CREATE TABLE shoots (
  id                  SERIAL PRIMARY KEY,
  model_id            INTEGER NOT NULL REFERENCES users(id),
  photographer_name   TEXT NOT NULL,
  photographer_site   TEXT,
  dialog_url          TEXT,
  shoot_date          DATE,
  location            TEXT,
  rate                NUMERIC(10,2),
  currency            TEXT DEFAULT 'EUR',
  status              TEXT NOT NULL DEFAULT 'negotiating'
                        CHECK (status IN ('negotiating','confirmed','done','cancelled')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_from_bot_at  TIMESTAMPTZ
);

-- Clients (extends users where role='client')
CREATE TABLE clients (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name    TEXT,
  contact_person  TEXT,
  notes           TEXT
);

-- Mailing templates
CREATE TABLE mailing_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  sites       TEXT[],
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mailing orders (client buys a campaign)
CREATE TABLE mailing_orders (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id),
  template_id     INTEGER REFERENCES mailing_templates(id),
  template_name   TEXT,
  target_sites    TEXT[],
  target_regions  TEXT[],
  target_genres   TEXT[],
  volume          INTEGER,
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','in_progress','done','cancelled')),
  price           NUMERIC(10,2),
  currency        TEXT DEFAULT 'EUR',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations (internal chat)
CREATE TABLE conversations (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('model_internal','client_support')),
  participant_a   INTEGER NOT NULL REFERENCES users(id),
  participant_b   INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX conversations_unique ON conversations (
  LEAST(participant_a, participant_b),
  GREATEST(participant_a, participant_b),
  type
);

-- Messages
CREATE TABLE messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  text            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  tg_message_id   INTEGER,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at);
