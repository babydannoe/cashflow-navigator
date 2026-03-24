ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS import_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS forecast_item_id uuid REFERENCES public.cashflow_items(id);

-- Add unique constraint on exact_id if not exists (for proper upsert with selective columns)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_exact_id_unique ON public.invoices(exact_id) WHERE exact_id IS NOT NULL;