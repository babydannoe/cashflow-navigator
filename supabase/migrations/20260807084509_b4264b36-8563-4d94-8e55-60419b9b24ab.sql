CREATE TABLE public.forecast_notes (
  id text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_notes TO authenticated;
GRANT ALL ON public.forecast_notes TO service_role;
ALTER TABLE public.forecast_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_select" ON public.forecast_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes_insert" ON public.forecast_notes FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "notes_update" ON public.forecast_notes FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "notes_delete" ON public.forecast_notes FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER forecast_notes_updated_at BEFORE UPDATE ON public.forecast_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.forecast_notes (id, content) VALUES ('forecast', '');