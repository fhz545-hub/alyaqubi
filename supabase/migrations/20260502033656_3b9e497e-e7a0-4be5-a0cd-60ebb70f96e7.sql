-- Allow approved users to read only their own teacher attendance/profile-linked records
CREATE POLICY "Approved users read own haduri monthly"
ON public.haduri_monthly_attendance
FOR SELECT
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND regexp_replace(teacher_civil_id, '\D', '', 'g') = (
    SELECT regexp_replace(p.national_id, '\D', '', 'g')
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.approved = true OR p.is_principal = true)
    LIMIT 1
  )
);

CREATE POLICY "Approved users read own haduri daily"
ON public.haduri_daily_records
FOR SELECT
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND regexp_replace(teacher_civil_id, '\D', '', 'g') = (
    SELECT regexp_replace(p.national_id, '\D', '', 'g')
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.approved = true OR p.is_principal = true)
    LIMIT 1
  )
);

CREATE POLICY "Approved users read own teacher notices"
ON public.teacher_notices
FOR SELECT
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND regexp_replace(teacher_civil_id, '\D', '', 'g') = (
    SELECT regexp_replace(p.national_id, '\D', '', 'g')
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.approved = true OR p.is_principal = true)
    LIMIT 1
  )
);

CREATE POLICY "Approved users read own teacher legacy archive"
ON public.teacher_legacy_archive
FOR SELECT
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND regexp_replace(teacher_civil_id, '\D', '', 'g') = (
    SELECT regexp_replace(p.national_id, '\D', '', 'g')
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.approved = true OR p.is_principal = true)
    LIMIT 1
  )
);

-- Speed up exact teacher lookups used by the teacher dossier
CREATE INDEX IF NOT EXISTS idx_teachers_civil_id_active ON public.teachers (civil_id, active);
CREATE INDEX IF NOT EXISTS idx_teachers_full_name_active ON public.teachers (full_name, active);

CREATE INDEX IF NOT EXISTS idx_haduri_monthly_teacher_civil_month ON public.haduri_monthly_attendance (teacher_civil_id, month_key DESC);
CREATE INDEX IF NOT EXISTS idx_haduri_monthly_teacher_name_month ON public.haduri_monthly_attendance (teacher_name, month_key DESC);

CREATE INDEX IF NOT EXISTS idx_haduri_daily_teacher_civil_date ON public.haduri_daily_records (teacher_civil_id, greg_date DESC);
CREATE INDEX IF NOT EXISTS idx_haduri_daily_teacher_name_date ON public.haduri_daily_records (teacher_name, greg_date DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_notices_teacher_civil_created ON public.teacher_notices (teacher_civil_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_notices_teacher_name_created ON public.teacher_notices (teacher_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_legacy_teacher_civil_created ON public.teacher_legacy_archive (teacher_civil_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_legacy_teacher_name_created ON public.teacher_legacy_archive (teacher_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_settings_key ON public.teacher_settings (key);