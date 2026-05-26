
CREATE TABLE public.note_cancel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  student_id text NOT NULL,
  student_name text NOT NULL,
  grade text NOT NULL,
  section integer NOT NULL,
  action_type text NOT NULL,
  action_date text NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  requested_by_name text NOT NULL,
  requested_by_role text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_by_name text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE public.note_cancel_requests ENABLE ROW LEVEL SECURITY;

-- All authenticated can read
CREATE POLICY "Authenticated read cancel requests"
  ON public.note_cancel_requests FOR SELECT TO authenticated
  USING (true);

-- Teachers can insert their own requests
CREATE POLICY "Users insert own cancel requests"
  ON public.note_cancel_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Only principal can update (approve/reject)
CREATE POLICY "Principal update cancel requests"
  ON public.note_cancel_requests FOR UPDATE TO authenticated
  USING (is_principal(auth.uid()));

-- Only principal can delete
CREATE POLICY "Principal delete cancel requests"
  ON public.note_cancel_requests FOR DELETE TO authenticated
  USING (is_principal(auth.uid()));
