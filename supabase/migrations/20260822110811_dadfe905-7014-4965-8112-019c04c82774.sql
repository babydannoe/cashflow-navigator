DELETE FROM public.cashflow_items WHERE id = 'f2610de2-a7f8-482d-8b28-54e949c96315';

INSERT INTO public.cashflow_items (bv_id, week, type, bedrag, omschrijving, categorie, bron, status)
VALUES
('9051d88f-28ce-43f3-48c7-e1e23e005392','2026-09-21','out',6000.00,'Vennootschapsbelasting','Belastingen','handmatig','actief'),
('9051d88f-28ce-43f3-48c7-e1e23e005392','2026-10-19','out',5000.00,'Vennootschapsbelasting','Belastingen','handmatig','actief'),
('9051d88f-28ce-43f3-48c7-e1e23e005392','2026-11-16','out',5000.00,'Vennootschapsbelasting','Belastingen','handmatig','actief');