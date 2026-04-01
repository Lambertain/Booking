-- Track what action was taken on bot-generated AI drafts
ALTER TABLE messages ADD COLUMN IF NOT EXISTS bot_action TEXT
  CHECK (bot_action IN ('approved', 'edited', 'skipped'));
