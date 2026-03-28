-- Set default deal_type = 'rent' for all existing templates
UPDATE mailing_templates SET deal_type = 'rent' WHERE deal_type IS NULL;
