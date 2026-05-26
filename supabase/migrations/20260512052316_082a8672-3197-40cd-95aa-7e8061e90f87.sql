
-- Add new permission enum values
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'view_health_affairs';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'record_health_records';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'edit_health_records';
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'print_health_records';
