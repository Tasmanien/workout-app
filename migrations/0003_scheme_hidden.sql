ALTER TABLE scheme ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

UPDATE scheme SET hidden = 1 WHERE kind = 'fixed' AND name NOT IN ('3x3', '5x5');

DELETE FROM scheme WHERE kind = 'free' AND id NOT IN (SELECT scheme_id FROM log_entry);
