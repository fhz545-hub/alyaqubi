DROP POLICY IF EXISTS "Insert own profile" ON public.profiles;
CREATE POLICY "Insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_principal = false
  AND approved = false
  AND approved_by IS NULL
  AND NOT (role_title = 'موجه طلابي' OR role_title ILIKE '%وكيل%')
);

DROP POLICY IF EXISTS "Authenticated read distinguished records" ON public.distinguished_behavior_records;
DROP POLICY IF EXISTS "Approved users read distinguished records" ON public.distinguished_behavior_records;
CREATE POLICY "Approved users read distinguished records"
ON public.distinguished_behavior_records
FOR SELECT
TO authenticated
USING (public.is_approved_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read sms log" ON public.sms_sent_log;
DROP POLICY IF EXISTS "Authorized users read sms log" ON public.sms_sent_log;
CREATE POLICY "Authorized users read sms log"
ON public.sms_sent_log
FOR SELECT
TO authenticated
USING (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'send_sms'::public.user_permission)
  OR public.has_permission(auth.uid(), 'send_messages'::public.user_permission)
);

DROP POLICY IF EXISTS "Authenticated read teacher settings" ON public.teacher_settings;
DROP POLICY IF EXISTS "Authorized read teacher settings" ON public.teacher_settings;
CREATE POLICY "Authorized read teacher settings"
ON public.teacher_settings
FOR SELECT
TO authenticated
USING (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission)
);