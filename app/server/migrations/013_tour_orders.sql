-- Allow mailing_orders without client (for model-created tour cards)
ALTER TABLE mailing_orders ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS model_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
