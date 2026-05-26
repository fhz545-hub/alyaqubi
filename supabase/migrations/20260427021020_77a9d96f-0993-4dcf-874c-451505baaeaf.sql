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
  SELECT false
$$;

REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean, uuid, text) FROM authenticated, anon, public;

DROP POLICY IF EXISTS "Update own profile (no privilege change)" ON public.profiles;
CREATE POLICY "Update own profile (contact fields only)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND NOT public.is_principal(auth.uid()))
WITH CHECK (false);

DROP POLICY IF EXISTS "Authenticated read actions" ON public.student_actions;
DROP POLICY IF EXISTS "Approved users read actions" ON public.student_actions;
CREATE POLICY "Approved users read actions"
ON public.student_actions
FOR SELECT
TO authenticated
USING (public.is_approved_user(auth.uid()));

DROP POLICY IF EXISTS "Reviewers can read cancel requests" ON public.note_cancel_requests;
CREATE POLICY "Reviewers can read cancel requests"
ON public.note_cancel_requests
FOR SELECT
TO authenticated
USING (
  public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'edit_actions'::public.user_permission)
  OR public.has_permission(auth.uid(), 'delete_actions'::public.user_permission)
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approved = true
      AND (p.role_title = 'وكيل' OR p.role_title ILIKE '%وكيل%' OR p.role_title = 'موجه طلابي')
  )
);