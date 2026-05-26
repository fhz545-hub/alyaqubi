CREATE TABLE public.student_health_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id text NOT NULL,
  student_name text NOT NULL,
  student_number text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  grade_code text NOT NULL DEFAULT '',
  section integer NOT NULL DEFAULT 1,
  service_date text NOT NULL DEFAULT '',
  service_type text NOT NULL DEFAULT 'إسعافات أولية',
  related_condition text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  action_taken text NOT NULL DEFAULT '',
  follow_up text NOT NULL DEFAULT '',
  guardian_notified boolean NOT NULL DEFAULT false,
  recorded_by uuid,
  recorded_by_name text NOT NULL DEFAULT '',
  recorded_by_role text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_services_student ON public.student_health_services(student_id);
CREATE INDEX idx_health_services_section ON public.student_health_services(grade_code, section);

ALTER TABLE public.student_health_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized read health services" ON public.student_health_services
FOR SELECT TO authenticated
USING (is_principal(auth.uid())
  OR has_permission(auth.uid(), 'view_health_affairs'::user_permission)
  OR has_permission(auth.uid(), 'record_health_records'::user_permission)
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission));

CREATE POLICY "Authorized insert health services" ON public.student_health_services
FOR INSERT TO authenticated
WITH CHECK (is_principal(auth.uid())
  OR has_permission(auth.uid(), 'record_health_records'::user_permission));

CREATE POLICY "Authorized update health services" ON public.student_health_services
FOR UPDATE TO authenticated
USING (is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission))
WITH CHECK (is_principal(auth.uid())
  OR has_permission(auth.uid(), 'edit_health_records'::user_permission));

CREATE POLICY "Principal delete health services" ON public.student_health_services
FOR DELETE TO authenticated
USING (is_principal(auth.uid()));

CREATE TRIGGER update_health_services_updated_at
BEFORE UPDATE ON public.student_health_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();