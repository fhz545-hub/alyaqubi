
-- 1) Restrict notifications INSERT so users can only notify themselves; principal can notify anyone
DROP POLICY IF EXISTS "Approved users insert notifications" ON public.notifications;

CREATE POLICY "Self or principal insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_approved_user(auth.uid())
  AND (
    user_id = auth.uid()
    OR public.is_principal(auth.uid())
  )
);

-- 2) Strengthen profile self-update: trigger pins all sensitive columns to existing values for non-principals
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() = OLD.user_id AND NOT public.is_principal(auth.uid()) THEN
    -- Force-pin every sensitive field to its prior value
    NEW.is_principal := OLD.is_principal;
    NEW.approved     := OLD.approved;
    NEW.approved_by  := OLD.approved_by;
    NEW.role_title   := OLD.role_title;
    NEW.full_name    := OLD.full_name;
    NEW.national_id  := OLD.national_id;
    NEW.user_id      := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_self_update ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_self_update();

-- 3) Add UPDATE policy for teacher_notices (principal or manage_teacher_affairs)
CREATE POLICY "Authorized update teacher notices"
ON public.teacher_notices
FOR UPDATE
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission))
WITH CHECK (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission));

-- 4) Add UPDATE policy for teacher_legacy_archive (principal or manage_teacher_affairs)
CREATE POLICY "Authorized update teacher legacy archive"
ON public.teacher_legacy_archive
FOR UPDATE
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission))
WITH CHECK (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission));
