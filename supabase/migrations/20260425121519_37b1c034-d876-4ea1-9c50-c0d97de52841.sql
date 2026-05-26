CREATE POLICY "Authorized delete haduri daily"
ON public.haduri_daily_records
FOR DELETE
TO authenticated
USING (is_principal(auth.uid()) OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission));