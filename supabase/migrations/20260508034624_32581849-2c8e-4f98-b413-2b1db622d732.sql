DROP POLICY IF EXISTS "Authorized read haduri daily" ON public.haduri_daily_records;
CREATE POLICY "Authorized read haduri daily"
ON public.haduri_daily_records
FOR SELECT
TO authenticated
USING (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_teacher_absence_type'::public.user_permission)
);

DROP POLICY IF EXISTS "Authorized update haduri daily" ON public.haduri_daily_records;
CREATE POLICY "Authorized update haduri daily"
ON public.haduri_daily_records
FOR UPDATE
TO authenticated
USING (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_teacher_absence_type'::public.user_permission)
)
WITH CHECK (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_teacher_absence_type'::public.user_permission)
);