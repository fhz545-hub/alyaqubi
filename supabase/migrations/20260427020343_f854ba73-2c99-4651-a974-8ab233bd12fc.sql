REVOKE EXECUTE ON FUNCTION public.is_principal(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_approved_user(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, public.user_permission) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean) FROM authenticated, anon, public;