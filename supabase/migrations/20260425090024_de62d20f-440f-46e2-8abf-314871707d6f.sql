
-- Daily attendance records imported from Haduri (one row per teacher per day)
CREATE TABLE IF NOT EXISTS public.haduri_daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key TEXT NOT NULL DEFAULT '',
  month_label TEXT NOT NULL DEFAULT '',
  teacher_civil_id TEXT NOT NULL DEFAULT '',
  teacher_name TEXT NOT NULL DEFAULT '',
  teacher_phone TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  greg_date TEXT NOT NULL DEFAULT '', -- YYYY-MM-DD
  hijri_date TEXT NOT NULL DEFAULT '', -- 1447/10/06
  day_name TEXT NOT NULL DEFAULT '',
  in_time TEXT NOT NULL DEFAULT '',     -- HH:MM
  out_time TEXT NOT NULL DEFAULT '',    -- HH:MM
  work_min INTEGER NOT NULL DEFAULT 0,
  late_min INTEGER NOT NULL DEFAULT 0,
  excuse_min INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'حضور',  -- حضور | غياب | استئذان | لم يُغلق
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_file TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT haduri_daily_records_uniq UNIQUE (month_key, teacher_civil_id, greg_date)
);

CREATE INDEX IF NOT EXISTS haduri_daily_month_idx
  ON public.haduri_daily_records (month_key);

CREATE INDEX IF NOT EXISTS haduri_daily_teacher_idx
  ON public.haduri_daily_records (teacher_civil_id);

ALTER TABLE public.haduri_daily_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read haduri daily"
  ON public.haduri_daily_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized insert haduri daily"
  ON public.haduri_daily_records FOR INSERT
  TO authenticated
  WITH CHECK (
    is_principal(auth.uid())
    OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  );

CREATE POLICY "Authorized update haduri daily"
  ON public.haduri_daily_records FOR UPDATE
  TO authenticated
  USING (
    is_principal(auth.uid())
    OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  );

CREATE POLICY "Principal can delete haduri daily"
  ON public.haduri_daily_records FOR DELETE
  TO authenticated
  USING (is_principal(auth.uid()));

CREATE TRIGGER haduri_daily_set_updated_at
  BEFORE UPDATE ON public.haduri_daily_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
