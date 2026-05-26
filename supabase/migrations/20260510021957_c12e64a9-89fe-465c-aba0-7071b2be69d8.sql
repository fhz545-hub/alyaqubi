DROP POLICY IF EXISTS "Authorized update haduri daily" ON public.haduri_daily_records;
CREATE POLICY "Authorized update haduri daily"
ON public.haduri_daily_records
FOR UPDATE
TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  OR has_permission(auth.uid(), 'manage_teacher_absence_type'::user_permission)
  OR has_permission(auth.uid(), 'manage_fares_upload'::user_permission)
)
WITH CHECK (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  OR has_permission(auth.uid(), 'manage_teacher_absence_type'::user_permission)
  OR has_permission(auth.uid(), 'manage_fares_upload'::user_permission)
);

DROP POLICY IF EXISTS "Authorized read haduri daily" ON public.haduri_daily_records;
CREATE POLICY "Authorized read haduri daily"
ON public.haduri_daily_records
FOR SELECT
TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  OR has_permission(auth.uid(), 'manage_teacher_absence_type'::user_permission)
  OR has_permission(auth.uid(), 'manage_fares_upload'::user_permission)
);