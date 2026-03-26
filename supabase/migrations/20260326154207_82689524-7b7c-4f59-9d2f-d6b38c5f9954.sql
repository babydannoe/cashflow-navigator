ALTER TABLE cashflow_items ADD COLUMN IF NOT EXISTS opmerking text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS opmerking text;