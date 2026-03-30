-- Add all missing Airtable fields to shoots table
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS shoot_style TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS expenses NUMERIC(10,2);
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS source_site TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS service_amount NUMERIC(10,2);
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS service_currency TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS service_status TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS airtable_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS shoots_airtable_id_idx ON shoots (airtable_id) WHERE airtable_id IS NOT NULL;
