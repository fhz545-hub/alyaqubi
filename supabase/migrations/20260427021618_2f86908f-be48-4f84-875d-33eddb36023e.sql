
-- 1) Allow users to delete own notifications, principal can delete any
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Principal delete any notification" ON public.notifications;

CREATE POLICY "Users delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Principal delete any notification"
ON public.notifications
FOR DELETE
TO authenticated
USING (public.is_principal(auth.uid()));

-- 2) Replace broken self-update policy on profiles with a working one that
-- only permits editing safe contact fields (phone) and forbids privilege changes.
-- The trigger prevent_profile_privilege_self_update already blocks privilege column changes,
-- but we also enforce immutability of sensitive columns directly in the policy WITH CHECK.

DROP POLICY IF EXISTS "Update own profile (contact fields only)" ON public.profiles;

CREATE POLICY "Update own profile (contact fields only)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND NOT public.is_principal(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  AND is_principal = false
  AND approved = false
  AND approved_by IS NULL
  AND role_title IN (SELECT role_title FROM public.profiles WHERE user_id = auth.uid())
  AND full_name IN (SELECT full_name FROM public.profiles WHERE user_id = auth.uid())
  AND national_id IN (SELECT national_id FROM public.profiles WHERE user_id = auth.uid())
);
