
CREATE TABLE public.student_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  student_name text NOT NULL,
  student_number text NOT NULL DEFAULT '',
  grade text NOT NULL,
  grade_code text NOT NULL DEFAULT '',
  section integer NOT NULL DEFAULT 1,
  referral_type text NOT NULL DEFAULT 'vice_principal',
  case_type text NOT NULL,
  repetition_count integer NOT NULL DEFAULT 1,
  previous_actions text NOT NULL DEFAULT '',
  referral_reason text NOT NULL DEFAULT '',
  referred_by uuid,
  referred_by_name text NOT NULL DEFAULT '',
  referred_to_name text NOT NULL DEFAULT '',
  referral_date text NOT NULL,
  period integer,
  counselor_notes text,
  counselor_action text,
  counselor_recommendation text,
  vice_action text,
  vice_deduction_type text,
  vice_deduction_amount text,
  registrar_action text,
  registrar_date text,
  counselor_followup_notes text,
  counselor_followup_recommendation text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read referrals" ON public.student_referrals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert referrals" ON public.student_referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Principal or referred_by can update" ON public.student_referrals
  FOR UPDATE TO authenticated USING (
    referred_by = auth.uid() OR is_principal(auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND (role_title = 'موجه طلابي' OR role_title = 'وكيل'))
  );

CREATE POLICY "Principal can delete referrals" ON public.student_referrals
  FOR DELETE TO authenticated USING (is_principal(auth.uid()));
