
CREATE TABLE public.btw_quarterly (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bv_id uuid NOT NULL REFERENCES public.bv(id) ON DELETE CASCADE,
  jaar int NOT NULL,
  kwartaal int NOT NULL CHECK (kwartaal BETWEEN 1 AND 4),
  te_betalen numeric NOT NULL DEFAULT 0,
  te_vorderen numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bv_id, jaar, kwartaal)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.btw_quarterly TO authenticated;
GRANT ALL ON public.btw_quarterly TO service_role;

ALTER TABLE public.btw_quarterly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read btw_quarterly"
  ON public.btw_quarterly FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert btw_quarterly"
  ON public.btw_quarterly FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update btw_quarterly"
  ON public.btw_quarterly FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete btw_quarterly"
  ON public.btw_quarterly FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER btw_quarterly_updated_at
  BEFORE UPDATE ON public.btw_quarterly
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
