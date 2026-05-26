
-- 1) Special health cases
CREATE TABLE public.student_special_health_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  grade_code TEXT NOT NULL DEFAULT '',
  section INTEGER NOT NULL DEFAULT 1,
  case_category TEXT NOT NULL DEFAULT '',
  case_severity TEXT NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL DEFAULT '',
  required_accommodations TEXT NOT NULL DEFAULT '',
  emergency_plan TEXT NOT NULL DEFAULT '',
  medications TEXT NOT NULL DEFAULT '',
  guardian_contact TEXT NOT NULL DEFAULT '',
  doctor_contact TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  recorded_by UUID,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.student_special_health_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_special_cases_student ON public.student_special_health_cases(student_id);
CREATE INDEX idx_special_cases_section ON public.student_special_health_cases(grade_code, section);

-- 2) Medical referrals
CREATE TABLE public.student_health_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  grade_code TEXT NOT NULL DEFAULT '',
  section INTEGER NOT NULL DEFAULT 1,
  referral_date TEXT NOT NULL DEFAULT '',
  referred_to TEXT NOT NULL DEFAULT '',
  referral_type TEXT NOT NULL DEFAULT 'hospital',
  reason TEXT NOT NULL DEFAULT '',
  diagnosis TEXT NOT NULL DEFAULT '',
  follow_up_result TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  attachments TEXT NOT NULL DEFAULT '',
  recorded_by UUID,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.student_health_referrals ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_health_referrals_student ON public.student_health_referrals(student_id);
CREATE INDEX idx_health_referrals_section ON public.student_health_referrals(grade_code, section);

-- 3) Medical absences
CREATE TABLE public.student_medical_absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  grade_code TEXT NOT NULL DEFAULT '',
  section INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  days_count INTEGER NOT NULL DEFAULT 1,
  diagnosis TEXT NOT NULL DEFAULT '',
  medical_report_provided BOOLEAN NOT NULL DEFAULT false,
  report_source TEXT NOT NULL DEFAULT '',
  excused BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NOT NULL DEFAULT '',
  recorded_by UUID,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.student_medical_absences ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_med_absences_student ON public.student_medical_absences(student_id);
CREATE INDEX idx_med_absences_section ON public.student_medical_absences(grade_code, section);

-- 4) Guardian health contacts
CREATE TABLE public.health_guardian_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  grade_code TEXT NOT NULL DEFAULT '',
  section INTEGER NOT NULL DEFAULT 1,
  contact_date TEXT NOT NULL DEFAULT '',
  contact_method TEXT NOT NULL DEFAULT 'phone',
  health_reason TEXT NOT NULL DEFAULT '',
  message_summary TEXT NOT NULL DEFAULT '',
  guardian_response TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '',
  contacted_by UUID,
  contacted_by_name TEXT NOT NULL DEFAULT '',
  contacted_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.health_guardian_contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_guardian_contacts_student ON public.health_guardian_contacts(student_id);
CREATE INDEX idx_guardian_contacts_section ON public.health_guardian_contacts(grade_code, section);

-- 5) Awareness programs (school-wide)
CREATE TABLE public.health_awareness_programs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_name TEXT NOT NULL DEFAULT '',
  program_type TEXT NOT NULL DEFAULT 'محاضرة',
  program_date TEXT NOT NULL DEFAULT '',
  hijri_date TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  beneficiaries_count INTEGER NOT NULL DEFAULT 0,
  presenter TEXT NOT NULL DEFAULT '',
  partner_entity TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by UUID,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.health_awareness_programs ENABLE ROW LEVEL SECURITY;

-- 6) School environment health log
CREATE TABLE public.school_environment_health_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_date TEXT NOT NULL DEFAULT '',
  hijri_date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  inspection_type TEXT NOT NULL DEFAULT 'دورية',
  observations TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'low',
  action_taken TEXT NOT NULL DEFAULT '',
  responsible_person TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  recorded_by UUID,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_environment_health_log ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as existing health tables)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'student_special_health_cases',
    'student_health_referrals',
    'student_medical_absences',
    'health_guardian_contacts',
    'health_awareness_programs',
    'school_environment_health_log'
  ]) LOOP
    EXECUTE format($p$
      CREATE POLICY "Authorized read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (is_principal(auth.uid())
        OR has_permission(auth.uid(), 'view_health_affairs'::user_permission)
        OR has_permission(auth.uid(), 'record_health_records'::user_permission)
        OR has_permission(auth.uid(), 'edit_health_records'::user_permission));
    $p$, t);
    EXECUTE format($p$
      CREATE POLICY "Authorized insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (is_principal(auth.uid())
        OR has_permission(auth.uid(), 'record_health_records'::user_permission));
    $p$, t);
    EXECUTE format($p$
      CREATE POLICY "Authorized update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (is_principal(auth.uid())
        OR has_permission(auth.uid(), 'edit_health_records'::user_permission))
      WITH CHECK (is_principal(auth.uid())
        OR has_permission(auth.uid(), 'edit_health_records'::user_permission));
    $p$, t);
    EXECUTE format($p$
      CREATE POLICY "Principal delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (is_principal(auth.uid()));
    $p$, t);
    EXECUTE format($p$
      CREATE TRIGGER trg_set_updated_at_%1$s BEFORE UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $p$, t);
  END LOOP;
END $$;
