
-- جدول أرشفة الإجراءات الناتجة من ملفات شؤون المعلمين القديمة (كشف حضوري شهري + الشؤون الإدارية والمتابعة)
CREATE TABLE IF NOT EXISTS public.teacher_legacy_archive (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL, -- 'monthly_attendance' | 'admin_affairs'
  report_type TEXT NOT NULL DEFAULT '', -- نوع التقرير (تأخر/غياب/استئذان/خطاب/...)
  action_type TEXT NOT NULL DEFAULT '', -- نوع الإجراء (تنبيه/إنذار/خطاب رسمي/...)
  teacher_name TEXT NOT NULL DEFAULT '',
  teacher_civil_id TEXT NOT NULL DEFAULT '',
  teacher_phone TEXT NOT NULL DEFAULT '',
  greg_date TEXT NOT NULL DEFAULT '',
  hijri_date TEXT NOT NULL DEFAULT '',
  month_label TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tla_source ON public.teacher_legacy_archive(source);
CREATE INDEX IF NOT EXISTS idx_tla_teacher ON public.teacher_legacy_archive(teacher_name);
CREATE INDEX IF NOT EXISTS idx_tla_date ON public.teacher_legacy_archive(greg_date);
CREATE INDEX IF NOT EXISTS idx_tla_action ON public.teacher_legacy_archive(action_type);
CREATE INDEX IF NOT EXISTS idx_tla_report ON public.teacher_legacy_archive(report_type);

ALTER TABLE public.teacher_legacy_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read teacher legacy archive"
  ON public.teacher_legacy_archive FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authorized insert teacher legacy archive"
  ON public.teacher_legacy_archive FOR INSERT
  TO authenticated
  WITH CHECK (
    is_principal(auth.uid())
    OR has_permission(auth.uid(), 'manage_teacher_affairs'::user_permission)
  );

CREATE POLICY "Principal can delete teacher legacy archive"
  ON public.teacher_legacy_archive FOR DELETE
  TO authenticated USING (is_principal(auth.uid()));
