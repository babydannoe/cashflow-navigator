CREATE OR REPLACE FUNCTION public.auto_link_reserve_account()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _doel text; _txt text;
BEGIN
  IF NEW.betaal_rekening_handmatig THEN RETURN NEW; END IF;
  IF NEW.betaal_rekening_id IS NOT NULL AND TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  _txt := lower(coalesce(NEW.subcategorie,'') || ' ' || coalesce(NEW.omschrijving,''));
  IF coalesce(NEW.categorie,'') = 'Belastingen' AND _txt LIKE '%vennootschapsbelasting%' THEN
    _doel := 'vpb';
  ELSIF _txt LIKE '%dividendbelasting%' THEN
    _doel := 'dividendbelasting';
  ELSIF coalesce(NEW.type,'') = 'out' AND (
        coalesce(NEW.ref_type,'') = 'btw_kwartaal' OR coalesce(NEW.bron,'') = 'btw_kwartaal'
        OR (coalesce(NEW.categorie,'') = 'Belastingen' AND _txt LIKE '%btw%')
        OR _txt LIKE '%suppletie btw%') THEN
    _doel := 'btw';
  ELSE
    RETURN NEW;
  END IF;
  SELECT id INTO NEW.betaal_rekening_id FROM public.bank_accounts
   WHERE bv_id = NEW.bv_id AND rekening_type = 'gereserveerd' AND gereserveerd_voor = _doel
   ORDER BY naam LIMIT 1;
  RETURN NEW;
END $function$;