-- DEEL 1: exact_tokens tabel voor Exact Online OAuth
CREATE TABLE IF NOT EXISTS exact_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bv_id uuid REFERENCES bv(id) ON DELETE CASCADE,
  division integer,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE exact_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON exact_tokens FOR ALL USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS exact_tokens_bv_id_idx ON exact_tokens(bv_id);

-- Trigger voor updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_exact_tokens_updated_at
  BEFORE UPDATE ON exact_tokens
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- DEEL 2: UNIQUE constraint op invoices.exact_id (vereist voor UPSERT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_exact_id_unique'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_exact_id_unique UNIQUE (exact_id);
  END IF;
END $$;