-- 1. Fix teachers table: restrict SELECT to approved staff/principal only
DROP POLICY IF EXISTS "Authenticated read teachers" ON public.teachers;

CREATE POLICY "Approved users read teachers"
ON public.teachers FOR SELECT TO authenticated
USING (is_principal(auth.uid()) OR is_approved_user(auth.uid()));

-- 2. Harden profiles UPDATE: consolidate via SECURITY DEFINER guard to avoid race conditions
-- Create a stable helper that captures the original is_principal/approved state
CREATE OR REPLACE FUNCTION public.profile_self_update_allowed(_new_is_principal boolean, _new_approved boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND is_principal = _new_is_principal
      AND approved = _new_approved
  )
$$;

-- Lock down: only principal can EXECUTE the helper indirectly via RLS check
REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean) FROM anon;

DROP POLICY IF EXISTS "Update own profile (no privilege change)" ON public.profiles;

CREATE POLICY "Update own profile (no privilege change)"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND NOT is_principal(auth.uid()))
WITH CHECK (
  auth.uid() = user_id
  AND public.profile_self_update_allowed(is_principal, approved)
);

-- 3. Revoke EXECUTE from anon on all SECURITY DEFINER helper functions
REVOKE EXECUTE ON FUNCTION public.is_principal(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_approved_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, user_permission) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean) FROM anon, public;

-- Re-grant to authenticated only (needed for RLS policy evaluation)
GRANT EXECUTE ON FUNCTION public.is_principal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, user_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean) TO authenticated;

-- Trigger functions don't need EXECUTE from clients at all
REVOKE EXECUTE ON FUNCTION public.cleanup_student_dependencies() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_distinguished_behavior_on_student_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_profile_dependencies() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;