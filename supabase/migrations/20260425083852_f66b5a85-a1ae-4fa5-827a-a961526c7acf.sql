-- Extend user_permission enum with granular fine-grained permissions
-- (Phase 3: multi-level permissions per department/branch/action)
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'edit_actions';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'delete_actions';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'print_reports';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'send_sms';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'send_whatsapp';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'view_audit_log';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'view_archive';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'manage_archive';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'create_referral';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'manage_referrals';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'manage_distinguished';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'view_reports';