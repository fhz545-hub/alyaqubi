
-- Add classroom tracking columns to student_actions
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS period integer;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS subject_name text DEFAULT '';

-- Add new permission for classroom notes
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'record_class_notes';
