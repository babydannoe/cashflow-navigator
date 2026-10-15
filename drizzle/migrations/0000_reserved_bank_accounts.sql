ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS rekening_type text NOT NULL DEFAULT 'vrij';
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS gereserveerd_voor text NULL;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_rekening_type_chk CHECK (rekening_type IN ('vrij','gereserveerd'));
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_gereserveerd_voor_chk CHECK (gereserveerd_voor IS NULL OR gereserveerd_voor IN ('vpb','dividendbelasting','btw','overig'));

ALTER TABLE public.cashflow_items ADD COLUMN IF NOT EXISTS betaal_rekening_id uuid NULL REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.cashflow_items ADD COLUMN IF NOT EXISTS betaal_rekening_handmatig boolean NOT NULL DEFAULT false;

ALTER TABLE public.forecasts ADD COLUMN IF NOT EXISTS opening_reserved numeric DEFAULT 0;
ALTER TABLE public.forecasts ADD COLUMN IF NOT EXISTS reserve_dekking numeric DEFAULT 0;
ALTER TABLE public.forecasts ADD COLUMN IF NOT EXISTS closing_reserved numeric DEFAULT 0;

CREATE OR REPLACE FUNCTION public.auto_link_reserve_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _doel text;
  _txt text;
BEGIN
  IF NEW.betaal_rekening_handmatig THEN RETURN NEW; END IF;
  IF NEW.betaal_rekening_id IS NOT NULL AND TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  _txt := lower(coalesce(NEW.subcategorie,'') || ' ' || coalesce(NEW.omschrijving,''));
  IF coalesce(NEW.categorie,'') = 'Belastingen' AND _txt LIKE '%vennootschapsbelasting%' THEN
    _doel := 'vpb';
  ELSIF _txt LIKE '%dividendbelasting%' THEN
    _doel := 'dividendbelasting';
  ELSE
    RETURN NEW;
  END IF;
  SELECT id INTO NEW.betaal_rekening_id FROM public.bank_accounts
   WHERE bv_id = NEW.bv_id AND rekening_type = 'gereserveerd' AND gereserveerd_voor = _doel
   ORDER BY naam LIMIT 1;
  RETURN NEW;
END $$;

CREATE TRIGGER cashflow_items_auto_reserve
BEFORE INSERT OR UPDATE OF categorie, subcategorie, omschrijving, bv_id ON public.cashflow_items
FOR EACH ROW EXECUTE FUNCTION public.auto_link_reserve_account();