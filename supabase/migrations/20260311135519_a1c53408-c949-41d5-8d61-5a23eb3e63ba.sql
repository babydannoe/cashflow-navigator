
-- Allow insert/update/delete on forecasts for service role (edge function uses service role)
-- Also allow insert/update on cashflow_items for the "move to other week" feature
-- And update on invoices for "mark as paid"

CREATE POLICY "Allow anon insert on forecasts" ON public.forecasts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete on forecasts" ON public.forecasts FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth insert on forecasts" ON public.forecasts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow auth delete on forecasts" ON public.forecasts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon insert on cashflow_items" ON public.cashflow_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on cashflow_items" ON public.cashflow_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete on cashflow_items" ON public.cashflow_items FOR DELETE TO anon USING (true);
CREATE POLICY "Allow auth insert on cashflow_items" ON public.cashflow_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow auth update on cashflow_items" ON public.cashflow_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow auth delete on cashflow_items" ON public.cashflow_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon update on invoices" ON public.invoices FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow auth update on invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
