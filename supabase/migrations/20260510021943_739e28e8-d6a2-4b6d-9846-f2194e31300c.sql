-- Add a dedicated permission for managing the Fares upload status, separate from absence type management.
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'manage_fares_upload';