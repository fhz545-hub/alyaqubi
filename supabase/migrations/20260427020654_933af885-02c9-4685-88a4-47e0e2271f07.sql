DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles', 'notifications', 'student_actions', 'messages']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_self_update_allowed(
  _new_is_principal boolean,
  _new_approved boolean,
  _new_approved_by uuid,
  _new_role_title text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = auth.uid()
      AND is_principal IS NOT DISTINCT FROM _new_is_principal
      AND approved IS NOT DISTINCT FROM _new_approved
      AND approved_by IS NOT DISTINCT FROM _new_approved_by
      AND role_title IS NOT DISTINCT FROM _new_role_title
  )
$$;

REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean, uuid, text) FROM authenticated, anon, public;

DROP POLICY IF EXISTS "Update own profile (no privilege change)" ON public.profiles;
CREATE POLICY "Update own profile (no privilege change)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND NOT public.is_principal(auth.uid()))
WITH CHECK (
  auth.uid() = user_id
  AND public.profile_self_update_allowed(is_principal, approved, approved_by, role_title)
);

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() = OLD.user_id
     AND NOT public.is_principal(auth.uid())
     AND (
       NEW.is_principal IS DISTINCT FROM OLD.is_principal
       OR NEW.approved IS DISTINCT FROM OLD.approved
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.role_title IS DISTINCT FROM OLD.role_title
     ) THEN
    RAISE EXCEPTION 'لا يمكن تغيير صلاحيات الحساب أو حالة الاعتماد من الملف الشخصي';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_self_update() FROM authenticated, anon, public;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_self_update ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_self_update();

DROP POLICY IF EXISTS "Authorized users can read students" ON public.students;
CREATE POLICY "Authorized users can read students"
ON public.students
FOR SELECT
TO authenticated
USING (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'add_students'::public.user_permission)
  OR public.has_permission(auth.uid(), 'edit_students'::public.user_permission)
  OR public.has_permission(auth.uid(), 'record_late'::public.user_permission)
  OR public.has_permission(auth.uid(), 'record_absent'::public.user_permission)
  OR public.has_permission(auth.uid(), 'record_violation'::public.user_permission)
  OR public.has_permission(auth.uid(), 'record_permission'::public.user_permission)
  OR public.has_permission(auth.uid(), 'record_class_notes'::public.user_permission)
  OR public.has_permission(auth.uid(), 'entry_exit'::public.user_permission)
  OR public.has_permission(auth.uid(), 'print_subject_sheets'::public.user_permission)
  OR public.has_permission(auth.uid(), 'send_messages'::public.user_permission)
  OR public.has_permission(auth.uid(), 'send_sms'::public.user_permission)
  OR public.has_permission(auth.uid(), 'send_whatsapp'::public.user_permission)
  OR public.has_permission(auth.uid(), 'view_reports'::public.user_permission)
  OR public.has_permission(auth.uid(), 'create_referral'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_referrals'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_distinguished'::public.user_permission)
);

DROP POLICY IF EXISTS "Authenticated read teacher notices" ON public.teacher_notices;
DROP POLICY IF EXISTS "Authorized read teacher notices" ON public.teacher_notices;
CREATE POLICY "Authorized read teacher notices"
ON public.teacher_notices
FOR SELECT
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));

DROP POLICY IF EXISTS "Authenticated read haduri monthly" ON public.haduri_monthly_attendance;
DROP POLICY IF EXISTS "Authorized read haduri monthly" ON public.haduri_monthly_attendance;
CREATE POLICY "Authorized read haduri monthly"
ON public.haduri_monthly_attendance
FOR SELECT
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));

DROP POLICY IF EXISTS "Approved users read haduri daily" ON public.haduri_daily_records;
DROP POLICY IF EXISTS "Authorized read haduri daily" ON public.haduri_daily_records;
CREATE POLICY "Authorized read haduri daily"
ON public.haduri_daily_records
FOR SELECT
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));

DROP POLICY IF EXISTS "Authenticated read teacher legacy archive" ON public.teacher_legacy_archive;
DROP POLICY IF EXISTS "Authorized read teacher legacy archive" ON public.teacher_legacy_archive;
CREATE POLICY "Authorized read teacher legacy archive"
ON public.teacher_legacy_archive
FOR SELECT
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));