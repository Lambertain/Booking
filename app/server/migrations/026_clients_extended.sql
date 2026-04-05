-- Per-site mailing stats (Adultfolio, PurplePort, ModelMayhem, ModelKartei)
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS site_stats JSONB DEFAULT '{}';
-- Deadline and reminder tracking
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS deadline_reminded_at TIMESTAMPTZ;
-- Payment info
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS payment TEXT;

-- Template: accounts purchased for + deadline
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS accounts TEXT;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS deadline_reminded_at TIMESTAMPTZ;
