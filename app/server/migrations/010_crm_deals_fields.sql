-- Migration 010: CRM deals import fields for mailing_orders
ALTER TABLE mailing_orders ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deal_id TEXT UNIQUE;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deal_step TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS responsible TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS tour_start_2 DATE;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS tour_end_2 DATE;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS model_sites TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS source_type TEXT;
