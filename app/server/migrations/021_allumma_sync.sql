-- Track Allumma sync status for realized shoots
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS allumma_synced_at TIMESTAMPTZ;
