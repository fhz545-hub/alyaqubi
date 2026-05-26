-- Restrict haduri_daily_records SELECT to principal or approved users
DROP POLICY IF EXISTS "Authenticated read haduri daily" ON public.haduri_daily_records;

CREATE POLICY "Approved users read haduri daily"
ON public.haduri_daily_records
FOR SELECT
TO authenticated
USING (is_principal(auth.uid()) OR is_approved_user(auth.uid()));

-- Restrict student_referrals SELECT to principal or approved users
DROP POLICY IF EXISTS "Authenticated can read referrals" ON public.student_referrals;

CREATE POLICY "Approved users read referrals"
ON public.student_referrals
FOR SELECT
TO authenticated
USING (is_principal(auth.uid()) OR is_approved_user(auth.uid()));