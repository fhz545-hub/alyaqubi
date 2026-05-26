DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm public.user_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = _user_id
        AND is_principal = true
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = _user_id
          AND approved = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_permissions
        WHERE user_id = _user_id
          AND permission = _perm
      )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, public.user_permission) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, public.user_permission) TO authenticated;