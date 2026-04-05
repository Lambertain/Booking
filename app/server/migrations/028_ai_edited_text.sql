-- Migration 028: store manager's edited reply text for AI learning tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_edited_text TEXT;
