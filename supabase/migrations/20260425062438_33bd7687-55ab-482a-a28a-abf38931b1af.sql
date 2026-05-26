-- 1) جدول المعلمين
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  civil_id text NOT NULL,
  phone text NOT NULL DEFAULT '',
  specialization text NOT NULL DEFAULT '',
  rank_title text NOT NULL DEFAULT '',
  job_number text NOT NULL DEFAULT '',
  current_job text NOT NULL DEFAULT 'معلم',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS teachers_civil_id_key ON public.teachers (civil_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS teachers_name_idx ON public.teachers (full_name);

-- 2) جدول الإشعارات الرسمية
CREATE TABLE IF NOT EXISTS public.teacher_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  teacher_name text NOT NULL,
  teacher_civil_id text NOT NULL DEFAULT '',
  teacher_phone text NOT NULL DEFAULT '',
  notice_kind text NOT NULL,
  serial_number integer NOT NULL DEFAULT 1,
  greg_date text NOT NULL DEFAULT '',
  hijri_date text NOT NULL DEFAULT '',
  day_name text NOT NULL DEFAULT '',
  late_in_time text NOT NULL DEFAULT '',
  late_total_min integer NOT NULL DEFAULT 0,
  abs_from_time text NOT NULL DEFAULT '',
  abs_to_time text NOT NULL DEFAULT '',
  abs_total_min integer NOT NULL DEFAULT 0,
  note_reason text NOT NULL DEFAULT '',
  lesson_class text NOT NULL DEFAULT '',
  lesson_period text NOT NULL DEFAULT '',
  lesson_minutes integer NOT NULL DEFAULT 0,
  season_mode text NOT NULL DEFAULT 'summer',
  shift_extended boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_notices_teacher_idx ON public.teacher_notices (teacher_id);
CREATE INDEX IF NOT EXISTS teacher_notices_kind_idx ON public.teacher_notices (notice_kind);
CREATE INDEX IF NOT EXISTS teacher_notices_date_idx ON public.teacher_notices (greg_date);

-- 3) جدول الإعدادات
CREATE TABLE IF NOT EXISTS public.teacher_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Triggers
DROP TRIGGER IF EXISTS trg_teachers_updated_at ON public.teachers;
CREATE TRIGGER trg_teachers_updated_at
BEFORE UPDATE ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_teacher_settings_updated_at ON public.teacher_settings;
CREATE TRIGGER trg_teacher_settings_updated_at
BEFORE UPDATE ON public.teacher_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_settings ENABLE ROW LEVEL SECURITY;

-- سياسات teachers
CREATE POLICY "Authenticated read teachers" ON public.teachers
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Principal or authorized insert teachers" ON public.teachers
FOR INSERT TO authenticated
WITH CHECK (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));

CREATE POLICY "Principal or authorized update teachers" ON public.teachers
FOR UPDATE TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));

CREATE POLICY "Principal can delete teachers" ON public.teachers
FOR DELETE TO authenticated USING (public.is_principal(auth.uid()));

-- سياسات teacher_notices
CREATE POLICY "Authenticated read teacher notices" ON public.teacher_notices
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Principal or authorized insert teacher notices" ON public.teacher_notices
FOR INSERT TO authenticated
WITH CHECK (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'manage_teacher_affairs'::public.user_permission));

CREATE POLICY "Principal can delete teacher notices" ON public.teacher_notices
FOR DELETE TO authenticated USING (public.is_principal(auth.uid()));

-- سياسات teacher_settings
CREATE POLICY "Authenticated read teacher settings" ON public.teacher_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Principal can manage teacher settings" ON public.teacher_settings
FOR ALL TO authenticated
USING (public.is_principal(auth.uid()))
WITH CHECK (public.is_principal(auth.uid()));