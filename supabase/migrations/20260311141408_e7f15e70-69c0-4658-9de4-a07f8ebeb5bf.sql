
-- Add write policies for buffers
CREATE POLICY "Allow anon insert on buffers" ON public.buffers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on buffers" ON public.buffers FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete on buffers" ON public.buffers FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth insert on buffers" ON public.buffers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow auth update on buffers" ON public.buffers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow auth delete on buffers" ON public.buffers FOR DELETE TO authenticated USING (true);

-- Add write policies for mt_pipeline_items
CREATE POLICY "Allow anon insert on mt_pipeline_items" ON public.mt_pipeline_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on mt_pipeline_items" ON public.mt_pipeline_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete on mt_pipeline_items" ON public.mt_pipeline_items FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth insert on mt_pipeline_items" ON public.mt_pipeline_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow auth update on mt_pipeline_items" ON public.mt_pipeline_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow auth delete on mt_pipeline_items" ON public.mt_pipeline_items FOR DELETE TO authenticated USING (true);

-- Add write policies for recurring_rules
CREATE POLICY "Allow anon insert on recurring_rules" ON public.recurring_rules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on recurring_rules" ON public.recurring_rules FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete on recurring_rules" ON public.recurring_rules FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth insert on recurring_rules" ON public.recurring_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow auth update on recurring_rules" ON public.recurring_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow auth delete on recurring_rules" ON public.recurring_rules FOR DELETE TO authenticated USING (true);

-- Add write policies for audit_log
CREATE POLICY "Allow anon insert on audit_log" ON public.audit_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth insert on audit_log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
