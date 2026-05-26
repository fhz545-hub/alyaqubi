-- 1) Deduplicate profiles per user_id then add unique constraint
DELETE FROM public.profiles a
USING public.profiles b
WHERE a.user_id = b.user_id
  AND a.ctid > b.ctid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_id_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- 2) Revoke EXECUTE on SECURITY DEFINER functions that are only meant to be
--    invoked by triggers / internal system context (not by app users).
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_distinguished_behavior_on_student_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_profile_dependencies()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_student_dependencies()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_self_update()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_guide_contact()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                       FROM PUBLIC, anon, authenticated;

-- Note: has_permission, is_principal, is_approved_user remain executable because
-- they are referenced inside RLS policies and must be callable by app roles.

-- 3) Make the teacher-certificates bucket private. Existing RLS policies on
--    storage.objects already restrict writes to approved users; we also add a
--    SELECT policy so authorized users can read via signed URLs / SDK.
UPDATE storage.buckets SET public = false WHERE id = 'teacher-certificates';

DROP POLICY IF EXISTS "Approved users can read teacher certificates" ON storage.objects;
CREATE POLICY "Approved users can read teacher certificates"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'teacher-certificates'
  AND public.is_approved_user(auth.uid())
);