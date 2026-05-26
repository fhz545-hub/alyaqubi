-- Ensure policies are explicitly PERMISSIVE to avoid blocking all access
-- student_actions
DROP POLICY IF EXISTS "Authenticated read actions" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated insert actions" ON public.student_actions;
DROP POLICY IF EXISTS "Owner or principal can update" ON public.student_actions;
DROP POLICY IF EXISTS "Owner or principal can delete" ON public.student_actions;

CREATE POLICY "Authenticated read actions"
ON public.student_actions
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated insert actions"
ON public.student_actions
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Owner or principal can update"
ON public.student_actions
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING ((performed_by = auth.uid()) OR is_principal(auth.uid()));

CREATE POLICY "Owner or principal can delete"
ON public.student_actions
AS PERMISSIVE
FOR DELETE
TO authenticated
USING ((performed_by = auth.uid()) OR is_principal(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Principal update any" ON public.profiles;

CREATE POLICY "Read profiles"
ON public.profiles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Insert own profile"
ON public.profiles
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own profile"
ON public.profiles
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Principal update any"
ON public.profiles
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (is_principal(auth.uid()));