-- Repair auth accounts that are missing a profile so they no longer remain stuck at account preparation
INSERT INTO public.profiles (
  user_id,
  full_name,
  role_title,
  national_id,
  phone,
  approved,
  approved_by,
  is_principal
)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), 'مستخدم جديد') AS full_name,
  'معلم' AS role_title,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'national_id', ''), 'غير مكتمل-' || left(u.id::text, 8)) AS national_id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'phone', ''), 'غير مكتمل-' || left(u.id::text, 8)) AS phone,
  false AS approved,
  NULL::uuid AS approved_by,
  false AS is_principal
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Prevent duplicate profiles for the same login account
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_user_id_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Ensure registered users have the table access required by the RLS policies
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_permissions TO authenticated;

-- Keep helper functions callable by logged-in users; policies still control what they can access
GRANT EXECUTE ON FUNCTION public.is_principal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, public.user_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean, uuid, text) TO authenticated;