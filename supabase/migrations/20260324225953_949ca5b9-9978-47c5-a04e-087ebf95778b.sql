
-- Fix: drop the existing audit_log insert policy first then recreate
DROP POLICY IF EXISTS "Allow auth insert on audit_log" ON public.audit_log;
CREATE POLICY "Allow auth insert on audit_log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
