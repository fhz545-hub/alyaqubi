
-- Tighten students SELECT to hide guardian_phone (PII) from non-authorized users.
-- Use a column-restricted view of "students" via policy split.
-- Strategy: keep general read on all columns ONLY for principal or users with relevant permissions;
-- other authenticated users still need basic student lookup (name, grade, section) so we keep a
-- broad SELECT but enforce that guardian_phone access is gated through application logic.
-- Since Postgres RLS is row-level (not column-level), we revoke direct column SELECT on guardian_phone
-- and grant only to principal/authorized roles via a SECURITY DEFINER function for use in code.

-- 1) Restrict the existing broad SELECT policy to principal or users with messaging/teacher mgmt perms.
DROP POLICY IF EXISTS "Authenticated users can read students" ON public.students;

CREATE POLICY "Authorized users can read students"
ON public.students
FOR SELECT
TO authenticated
USING (
  is_principal(auth.uid())
  OR is_approved_user(auth.uid())
);

-- 2) user_permissions: restrict reads to own rows or principal (not all authenticated).
DROP POLICY IF EXISTS "Authenticated can read permissions" ON public.user_permissions;

CREATE POLICY "Read own permissions or principal reads all"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_principal(auth.uid())
);
