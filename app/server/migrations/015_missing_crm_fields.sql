-- Migration 015: Add missing SendPulse CRM fields
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS review TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS lesson TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deal_currency TEXT;
