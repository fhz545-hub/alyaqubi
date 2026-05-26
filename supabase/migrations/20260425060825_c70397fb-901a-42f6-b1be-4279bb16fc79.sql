
-- ============= 1) Audit Log Table =============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  actor_role text NOT NULL DEFAULT '',
  action text NOT NULL,
  section text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_section ON public.audit_log (section);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Principal can read audit log" ON public.audit_log;
CREATE POLICY "Principal can read audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (is_principal(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert audit entries" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit entries"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Principal can delete audit log" ON public.audit_log;
CREATE POLICY "Principal can delete audit log"
  ON public.audit_log FOR DELETE
  TO authenticated
  USING (is_principal(auth.uid()));

-- ============= 2) Distance Learning Sections Setting =============
INSERT INTO public.school_settings (key, value)
VALUES ('distance_learning_sections', '[]')
ON CONFLICT (key) DO NOTHING;
