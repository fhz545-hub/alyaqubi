DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_permission' AND e.enumlabel = 'manage_teacher_affairs'
  ) THEN
    ALTER TYPE public.user_permission ADD VALUE 'manage_teacher_affairs';
  END IF;
END$$;