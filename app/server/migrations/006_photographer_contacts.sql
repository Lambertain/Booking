-- Migration 006: photographer contact fields for shoots
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS photographer_email   TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS photographer_phone   TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS photographer_telegram TEXT;
