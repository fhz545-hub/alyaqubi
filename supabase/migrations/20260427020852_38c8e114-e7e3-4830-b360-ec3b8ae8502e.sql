DROP FUNCTION IF EXISTS public.profile_self_update_allowed(boolean, boolean);

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
  OR public.has_permission(auth.uid(), 'entry_exit'::public.user_permission)
  OR public.has_permission(auth.uid(), 'send_sms'::public.user_permission)
  OR public.has_permission(auth.uid(), 'create_referral'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_referrals'::public.user_permission)
  OR public.has_permission(auth.uid(), 'manage_distinguished'::public.user_permission)
);