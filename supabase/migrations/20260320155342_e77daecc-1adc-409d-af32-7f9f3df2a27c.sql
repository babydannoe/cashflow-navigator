ALTER TABLE cashflow_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'actief';
ALTER TABLE cashflow_items ADD COLUMN IF NOT EXISTS goedgekeurd_op timestamptz;