
-- BV tabel
CREATE TABLE public.bv (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  kleur TEXT,
  drempel_bedrag NUMERIC DEFAULT 0,
  actief BOOLEAN DEFAULT true
);

-- Bank accounts
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  iban TEXT,
  naam TEXT,
  huidig_saldo NUMERIC DEFAULT 0,
  laatste_sync TIMESTAMPTZ
);

-- Counterparties
CREATE TABLE public.counterparties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  type TEXT CHECK (type IN ('klant', 'leverancier', 'beide'))
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES public.counterparties(id),
  type TEXT CHECK (type IN ('AR', 'AP')),
  bedrag NUMERIC NOT NULL,
  vervaldatum DATE,
  factuurnummer TEXT,
  status TEXT DEFAULT 'open',
  bron TEXT DEFAULT 'handmatig',
  exact_id TEXT,
  laatste_sync TIMESTAMPTZ
);

-- Bank transactions
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  datum DATE,
  bedrag NUMERIC,
  tegenpartij TEXT,
  omschrijving TEXT,
  bunq_id TEXT,
  laatste_sync TIMESTAMPTZ
);

-- MT Pipeline items
CREATE TABLE public.mt_pipeline_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  projectnaam TEXT,
  bedrag NUMERIC,
  kans_percentage NUMERIC CHECK (kans_percentage BETWEEN 0 AND 100),
  verwachte_week DATE,
  status TEXT DEFAULT 'lead',
  opmerkingen TEXT,
  aangemaakt_door TEXT,
  aangemaakt_op TIMESTAMPTZ DEFAULT now()
);

-- Recurring rules
CREATE TABLE public.recurring_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  categorie TEXT,
  counterparty_id UUID REFERENCES public.counterparties(id),
  omschrijving TEXT,
  bedrag NUMERIC,
  frequentie TEXT,
  verwachte_betaaldag INTEGER,
  startdatum DATE,
  einddatum DATE,
  bron TEXT DEFAULT 'handmatig',
  actief BOOLEAN DEFAULT true
);

-- Cashflow items
CREATE TABLE public.cashflow_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  week DATE,
  type TEXT CHECK (type IN ('in', 'out')),
  bedrag NUMERIC,
  omschrijving TEXT,
  categorie TEXT,
  subcategorie TEXT,
  tegenpartij TEXT,
  bron TEXT,
  ref_id UUID,
  ref_type TEXT
);

-- Forecasts
CREATE TABLE public.forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  week DATE,
  opening_balance NUMERIC,
  inflow NUMERIC,
  outflow NUMERIC,
  closing_balance NUMERIC,
  gegenereerd_op TIMESTAMPTZ DEFAULT now()
);

-- Buffers
CREATE TABLE public.buffers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID REFERENCES public.bv(id) ON DELETE CASCADE,
  naam TEXT,
  bedrag NUMERIC,
  buffer_type TEXT DEFAULT 'vast',
  niveau TEXT DEFAULT 'bv',
  prioriteit INTEGER DEFAULT 1,
  actief BOOLEAN DEFAULT true
);

-- Loans
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  kredietverstrekker TEXT,
  hoofdsom NUMERIC,
  rente_percentage NUMERIC,
  startdatum DATE,
  einddatum DATE,
  aflossingsfrequentie TEXT
);

-- Loan payments
CREATE TABLE public.loan_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  betaaldatum DATE,
  hoofdsom NUMERIC,
  rente NUMERIC,
  status TEXT DEFAULT 'gepland'
);

-- Dividends
CREATE TABLE public.dividends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  bedrag NUMERIC,
  geplande_betaaldatum DATE,
  aandeelhouder TEXT,
  status TEXT DEFAULT 'gepland'
);

-- VAT positions
CREATE TABLE public.vat_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id UUID NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  periode_label TEXT,
  verschuldigd_btw NUMERIC,
  te_vorderen_btw NUMERIC,
  netto_btw NUMERIC,
  status TEXT DEFAULT 'forecast'
);

-- Audit log
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gebruiker TEXT,
  actie TEXT,
  tabel TEXT,
  record_id UUID,
  oud_waarde JSONB,
  nieuw_waarde JSONB,
  tijdstip TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.bv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt_pipeline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buffers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Allow anon read for all tables (development - no auth required yet)
CREATE POLICY "Allow anon read on bv" ON public.bv FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on bank_accounts" ON public.bank_accounts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on counterparties" ON public.counterparties FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on invoices" ON public.invoices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on bank_transactions" ON public.bank_transactions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on mt_pipeline_items" ON public.mt_pipeline_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on recurring_rules" ON public.recurring_rules FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on cashflow_items" ON public.cashflow_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on forecasts" ON public.forecasts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on buffers" ON public.buffers FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on loans" ON public.loans FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on loan_payments" ON public.loan_payments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on dividends" ON public.dividends FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on vat_positions" ON public.vat_positions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read on audit_log" ON public.audit_log FOR SELECT TO anon USING (true);

-- Allow authenticated read for all tables
CREATE POLICY "Allow auth read on bv" ON public.bv FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on counterparties" ON public.counterparties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on bank_transactions" ON public.bank_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on mt_pipeline_items" ON public.mt_pipeline_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on recurring_rules" ON public.recurring_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on cashflow_items" ON public.cashflow_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on forecasts" ON public.forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on buffers" ON public.buffers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on loans" ON public.loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on loan_payments" ON public.loan_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on dividends" ON public.dividends FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on vat_positions" ON public.vat_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow auth read on audit_log" ON public.audit_log FOR SELECT TO authenticated USING (true);
