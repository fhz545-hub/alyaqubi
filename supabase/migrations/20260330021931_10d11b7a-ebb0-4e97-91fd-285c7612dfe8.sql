
CREATE TABLE public.sms_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  sms_type text NOT NULL,
  sent_date text NOT NULL,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, sms_type, sent_date)
);

ALTER TABLE public.sms_sent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sms log" ON public.sms_sent_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert sms log" ON public.sms_sent_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Principal can delete sms log" ON public.sms_sent_log
  FOR DELETE TO authenticated USING (is_principal(auth.uid()));
