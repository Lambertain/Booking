-- Add action column to delivery_log to distinguish approved vs edited
ALTER TABLE delivery_log ADD COLUMN IF NOT EXISTS action TEXT CHECK (action IN ('approved', 'edited'));
-- Add skip tracking
ALTER TABLE delivery_log ADD COLUMN IF NOT EXISTS skipped INT DEFAULT 0;
-- Add total_skipped to pipeline_stats (manager skips in БУКИНГ)
ALTER TABLE pipeline_stats ADD COLUMN IF NOT EXISTS total_skipped INT DEFAULT 0;
