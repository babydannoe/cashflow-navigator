
-- Payment runs table
CREATE TABLE public.payment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text,
  status text NOT NULL DEFAULT 'concept',
  bv_id uuid REFERENCES public.bv(id),
  totaal_bedrag numeric DEFAULT 0,
  aantal_facturen integer DEFAULT 0,
  aangemaakt_op timestamp with time zone DEFAULT now(),
  uitgevoerd_op timestamp with time zone
);

ALTER TABLE public.payment_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read on payment_runs" ON public.payment_runs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow auth read on payment_runs" ON public.payment_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon insert on payment_runs" ON public.payment_runs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on payment_runs" ON public.payment_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update on payment_runs" ON public.payment_runs FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow auth update on payment_runs" ON public.payment_runs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow anon delete on payment_runs" ON public.payment_runs FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on payment_runs" ON public.payment_runs FOR DELETE TO authenticated USING (true);

-- Payment run items (linking invoices to runs)
CREATE TABLE public.payment_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_run_id uuid REFERENCES public.payment_runs(id) ON DELETE CASCADE NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) NOT NULL,
  bedrag numeric NOT NULL,
  iban_begunstigde text,
  naam_begunstigde text
);

ALTER TABLE public.payment_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read on payment_run_items" ON public.payment_run_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow auth read on payment_run_items" ON public.payment_run_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon insert on payment_run_items" ON public.payment_run_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on payment_run_items" ON public.payment_run_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon delete on payment_run_items" ON public.payment_run_items FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on payment_run_items" ON public.payment_run_items FOR DELETE TO authenticated USING (true);

-- Add IBAN to counterparties for SEPA export
ALTER TABLE public.counterparties ADD COLUMN IF NOT EXISTS iban text;

-- Allow insert/delete on invoices (needed for manual invoices)
CREATE POLICY "Allow anon insert on invoices" ON public.invoices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon delete on invoices" ON public.invoices FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

-- Allow CRUD on loans
CREATE POLICY "Allow anon insert on loans" ON public.loans FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on loans" ON public.loans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update on loans" ON public.loans FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow auth update on loans" ON public.loans FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow anon delete on loans" ON public.loans FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on loans" ON public.loans FOR DELETE TO authenticated USING (true);

-- Allow CRUD on loan_payments
CREATE POLICY "Allow anon insert on loan_payments" ON public.loan_payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on loan_payments" ON public.loan_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update on loan_payments" ON public.loan_payments FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow auth update on loan_payments" ON public.loan_payments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow anon delete on loan_payments" ON public.loan_payments FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on loan_payments" ON public.loan_payments FOR DELETE TO authenticated USING (true);

-- Allow CRUD on dividends
CREATE POLICY "Allow anon insert on dividends" ON public.dividends FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on dividends" ON public.dividends FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update on dividends" ON public.dividends FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow auth update on dividends" ON public.dividends FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow anon delete on dividends" ON public.dividends FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on dividends" ON public.dividends FOR DELETE TO authenticated USING (true);

-- Allow CRUD on vat_positions
CREATE POLICY "Allow anon insert on vat_positions" ON public.vat_positions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on vat_positions" ON public.vat_positions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update on vat_positions" ON public.vat_positions FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow auth update on vat_positions" ON public.vat_positions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow anon delete on vat_positions" ON public.vat_positions FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth delete on vat_positions" ON public.vat_positions FOR DELETE TO authenticated USING (true);
