-- Migration 012: link mailing orders and templates to subscribers
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL;
