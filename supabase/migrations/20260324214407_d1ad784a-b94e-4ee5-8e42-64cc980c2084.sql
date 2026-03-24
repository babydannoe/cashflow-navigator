CREATE POLICY "Allow auth update on bv" 
ON public.bv FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow anon update on bv" 
ON public.bv FOR UPDATE 
TO anon 
USING (true) 
WITH CHECK (true);