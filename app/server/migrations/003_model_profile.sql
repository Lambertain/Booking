-- Migration 003: model profile fields

-- Add profile fields to agency_models
ALTER TABLE agency_models ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE agency_models ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE agency_models ADD COLUMN IF NOT EXISTS rates TEXT;
ALTER TABLE agency_models ADD COLUMN IF NOT EXISTS sites_json JSONB DEFAULT '[]';
ALTER TABLE agency_models ADD COLUMN IF NOT EXISTS tours_json JSONB DEFAULT '[]';

-- Fix data: delete empty duplicate user (ana-v user without agency_models entry)
DELETE FROM users WHERE id = 2 AND role = 'model' AND name = 'ana-v' AND telegram_username IS NULL;

-- Rename Morning → Ana V
UPDATE users SET name = 'Ana V' WHERE name = 'Morning' AND telegram_username = 'the_morning_st';

-- Fill Ana V sites from booking bot config
UPDATE agency_models SET sites_json = '[
  {"id":"model-kartei","label":"Model-Kartei","url":"https://www.model-kartei.de/"},
  {"id":"adultfolio","label":"Adultfolio","url":"https://adultfolio.com/"},
  {"id":"modelmayhem","label":"Model Mayhem","url":"https://www.modelmayhem.com/"}
]' WHERE slug = 'ana-v';
