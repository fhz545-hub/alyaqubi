-- Harden INSERT policy for student_actions (avoid WITH CHECK true)
DROP POLICY IF EXISTS "Authenticated insert actions" ON public.student_actions;

CREATE POLICY "Authenticated insert actions"
ON public.student_actions
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  OR is_principal(auth.uid())
);