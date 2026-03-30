-- Migration 016: Add start time and duration to shoots
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS shoot_time TIME;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(4,1);
