-- Migration 011: CRM deals import fields for mailing_templates
ALTER TABLE mailing_templates ALTER COLUMN content DROP NOT NULL;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deal_id TEXT UNIQUE;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deal_step TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS responsible TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS model_sites TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deal_type TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS accesses TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;
