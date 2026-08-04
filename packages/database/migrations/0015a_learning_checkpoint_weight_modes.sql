ALTER TABLE learning_checkpoints
ADD COLUMN weight_mode TEXT NOT NULL DEFAULT 'automatic'
CHECK (weight_mode IN ('automatic', 'custom'));
