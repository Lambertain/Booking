ALTER TABLE mailing_orders    ADD COLUMN IF NOT EXISTS reminder_config JSONB DEFAULT '{}';
ALTER TABLE mailing_orders    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS reminder_config JSONB DEFAULT '{}';
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
