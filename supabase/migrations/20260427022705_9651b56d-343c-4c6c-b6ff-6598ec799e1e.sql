
GRANT EXECUTE ON FUNCTION public.is_principal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, public.user_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_self_update_allowed(boolean, boolean, uuid, text) TO authenticated;
