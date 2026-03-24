
-- Add available_divisions JSON column to exact_tokens
ALTER TABLE exact_tokens ADD COLUMN IF NOT EXISTS available_divisions jsonb DEFAULT NULL;

-- Add exact_division_code to bv table (optional per BV)
ALTER TABLE bv ADD COLUMN IF NOT EXISTS exact_division_code integer DEFAULT NULL;
