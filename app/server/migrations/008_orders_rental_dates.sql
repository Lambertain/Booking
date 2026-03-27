-- Migration 008: order_type + rental dates for orders and templates
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'rent' CHECK (order_type IN ('rent', 'sale'));
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS rental_start DATE;
ALTER TABLE mailing_orders ADD COLUMN IF NOT EXISTS rental_end DATE;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS rental_start DATE;
ALTER TABLE mailing_templates ADD COLUMN IF NOT EXISTS rental_end DATE;
