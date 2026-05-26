
-- ========== student_health_records ==========
CREATE TABLE IF NOT EXISTS public.student_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  student_name text NOT NULL,
  student_number text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  grade_code text NOT NULL DEFAULT '',
  section integer NOT NULL DEFAULT 1,
  condition_type text NOT NULL DEFAULT 'ملاحظة عامة',
  description text NOT NULL DEFAULT '',
  medications text NOT NULL DEFAULT '',
  emergency_contact text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'low',
  recorded_by uuid,
  recorded_by_name text NOT NULL DEFAULT '',
  recorded_by_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_records_student ON public.student_health_records(student_id);
CREATE INDEX IF NOT EXISTS idx_health_records_grade_section ON public.student_health_records(grade_code, section);

ALTER TABLE public.student_health_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized read health records"
ON public.student_health_records FOR SELECT TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'view_health_affairs'::user_permission)
  OR has_permission(auth.uid(), 'record_health_records'::user_permission)
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
);

CREATE POLICY "Authorized insert health records"
ON public.student_health_records FOR INSERT TO authenticated
WITH CHECK (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'record_health_records'::user_permission)
);

CREATE POLICY "Authorized update health records"
ON public.student_health_records FOR UPDATE TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
)
WITH CHECK (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
);

CREATE POLICY "Principal delete health records"
ON public.student_health_records FOR DELETE TO authenticated
USING (is_principal(auth.uid()));

CREATE TRIGGER trg_health_records_updated_at
BEFORE UPDATE ON public.student_health_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== student_vital_signs ==========
CREATE TABLE IF NOT EXISTS public.student_vital_signs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  student_name text NOT NULL,
  student_number text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  grade_code text NOT NULL DEFAULT '',
  section integer NOT NULL DEFAULT 1,
  academic_year text NOT NULL DEFAULT '1447/1448',
  term integer NOT NULL DEFAULT 1,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  bmi numeric(5,2),
  notes text NOT NULL DEFAULT '',
  recorded_by uuid,
  recorded_by_name text NOT NULL DEFAULT '',
  recorded_by_role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vital_signs_term_check CHECK (term IN (1,2)),
  CONSTRAINT vital_signs_unique_student_term UNIQUE (student_id, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_vital_signs_grade_section ON public.student_vital_signs(grade_code, section);
CREATE INDEX IF NOT EXISTS idx_vital_signs_student ON public.student_vital_signs(student_id);

ALTER TABLE public.student_vital_signs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized read vital signs"
ON public.student_vital_signs FOR SELECT TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'view_health_affairs'::user_permission)
  OR has_permission(auth.uid(), 'record_health_records'::user_permission)
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
);

CREATE POLICY "Authorized insert vital signs"
ON public.student_vital_signs FOR INSERT TO authenticated
WITH CHECK (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'record_health_records'::user_permission)
);

CREATE POLICY "Authorized update vital signs"
ON public.student_vital_signs FOR UPDATE TO authenticated
USING (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
)
WITH CHECK (
  is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission)
);

CREATE POLICY "Principal delete vital signs"
ON public.student_vital_signs FOR DELETE TO authenticated
USING (is_principal(auth.uid()));

CREATE TRIGGER trg_vital_signs_updated_at
BEFORE UPDATE ON public.student_vital_signs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
