
DROP POLICY IF EXISTS "Principal delete health records" ON public.student_health_records;
CREATE POLICY "Authorized delete health records"
ON public.student_health_records
FOR DELETE
TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
);

DROP POLICY IF EXISTS "Principal delete health services" ON public.student_health_services;
CREATE POLICY "Authorized delete health services"
ON public.student_health_services
FOR DELETE
TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
);
