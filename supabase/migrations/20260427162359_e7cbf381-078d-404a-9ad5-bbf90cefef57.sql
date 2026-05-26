-- Relax the role_title restriction on self-signup. Privileges are gated by
-- 'approved' + user_permissions, NOT by role_title strings. Forcing approved=false
-- and is_principal=false at insert is the real safeguard. This lets new vice
-- principals (وكيل شؤون الطلاب / وكيل شؤون المعلمين) submit signup requests
-- that the principal must then approve.

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
);
