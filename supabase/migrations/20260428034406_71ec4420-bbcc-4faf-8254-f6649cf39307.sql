-- Cleanup orphaned auth users that have no profile row.
-- These are leftovers from previous failed self-registration attempts that
-- block users from re-registering with the same email.
DELETE FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_permissions up WHERE up.user_id = u.id
);