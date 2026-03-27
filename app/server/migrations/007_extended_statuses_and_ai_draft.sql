-- Migration 007: extended shoot statuses + ai_draft for messages

-- Drop old status constraint and add new one with 9 statuses
ALTER TABLE shoots DROP CONSTRAINT IF EXISTS shoots_status_check;
ALTER TABLE shoots ADD CONSTRAINT shoots_status_check
  CHECK (status IN (
    'negotiating','reserve','day_scheduled','confirmed','done','cancelled',
    'cancelled_photographer','cancelled_model','cancelled_agency'
  ));

-- Add ai_draft column to messages for АПКА Telegram approve flow
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_draft TEXT;
