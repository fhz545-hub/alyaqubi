CREATE TABLE IF NOT EXISTS public.haduri_monthly_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_label text NOT NULL DEFAULT '',
  month_key text NOT NULL DEFAULT '',
  teacher_key text NOT NULL DEFAULT '',
  teacher_name text NOT NULL DEFAULT '',
  teacher_civil_id text NOT NULL DEFAULT '',
  teacher_phone text NOT NULL DEFAULT '',
  specialization text NOT NULL DEFAULT '',
  work_min integer NOT NULL DEFAULT 0,
  late_min integer NOT NULL DEFAULT 0,
  excuse_min integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  open_days integer NOT NULL DEFAULT 0,
  present_days integer NOT NULL DEFAULT 0,
  total_days integer NOT NULL DEFAULT 0,
  imported_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS haduri_monthly_unique
  ON public.haduri_monthly_attendance (month_key, teacher_key);

CREATE INDEX IF NOT EXISTS haduri_monthly_month_idx
  ON public.haduri_monthly_attendance (month_key DESC);

CREATE INDEX IF NOT EXISTS haduri_monthly_teacher_idx
  ON public.haduri_monthly_attendance (teacher_name);

ALTER TABLE public.haduri_monthly_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read haduri monthly"
  ON public.haduri_monthly_attendance FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authorized insert haduri monthly"
  ON public.haduri_monthly_attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    is_principal(auth.uid())
    OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  );

CREATE POLICY "Authorized update haduri monthly"
  ON public.haduri_monthly_attendance FOR UPDATE
  TO authenticated
  USING (
    is_principal(auth.uid())
    OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  );

CREATE POLICY "Principal can delete haduri monthly"
  ON public.haduri_monthly_attendance FOR DELETE
  TO authenticated USING (is_principal(auth.uid()));

CREATE TRIGGER trg_haduri_monthly_updated_at
  BEFORE UPDATE ON public.haduri_monthly_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
