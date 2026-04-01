-- Backfill bot_action for historical messages based on whether
-- a manager reply (with approved_at) exists in the same conversation after the message.
-- We can't distinguish 'approved' vs 'edited' for history, so both get 'approved'.

UPDATE messages m
SET bot_action = 'approved'
WHERE m.ai_draft IS NOT NULL
  AND m.bot_action IS NULL
  AND EXISTS (
    SELECT 1 FROM messages r
    WHERE r.conversation_id = m.conversation_id
      AND r.created_at > m.created_at
      AND r.approved_at IS NOT NULL
  );

-- Messages with ai_draft but no manager follow-up older than 2 hours → skipped
UPDATE messages m
SET bot_action = 'skipped'
WHERE m.ai_draft IS NOT NULL
  AND m.bot_action IS NULL
  AND m.created_at < NOW() - INTERVAL '2 hours'
  AND NOT EXISTS (
    SELECT 1 FROM messages r
    WHERE r.conversation_id = m.conversation_id
      AND r.created_at > m.created_at
      AND r.approved_at IS NOT NULL
  );
