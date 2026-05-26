ALTER TABLE public.haduri_daily_records
ADD COLUMN IF NOT EXISTS absence_type text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS fares_upload_status text NOT NULL DEFAULT '';

DROP POLICY IF EXISTS "Principal or authorized insert teachers" ON public.teachers;
DROP POLICY IF EXISTS "Principal or authorized update teachers" ON public.teachers;
DROP POLICY IF EXISTS "Principal can delete teachers" ON public.teachers;

CREATE POLICY "Principal can insert teachers"
ON public.teachers
FOR INSERT
TO authenticated
WITH CHECK (public.is_principal(auth.uid()));

CREATE POLICY "Principal can update teachers"
ON public.teachers
FOR UPDATE
TO authenticated
USING (public.is_principal(auth.uid()))
WITH CHECK (public.is_principal(auth.uid()));

CREATE POLICY "Principal can delete teachers"
ON public.teachers
FOR DELETE
TO authenticated
USING (public.is_principal(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_haduri_daily_month_status
ON public.haduri_daily_records (month_key, status);

CREATE INDEX IF NOT EXISTS idx_haduri_daily_civil_date
ON public.haduri_daily_records (teacher_civil_id, greg_date);