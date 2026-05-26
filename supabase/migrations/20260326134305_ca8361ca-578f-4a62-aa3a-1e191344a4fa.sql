
CREATE TABLE public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

-- Principal can read and write
CREATE POLICY "Principal can manage settings"
ON public.school_settings
FOR ALL
TO authenticated
USING (public.is_principal(auth.uid()))
WITH CHECK (public.is_principal(auth.uid()));

-- Users with send_messages permission can read (to get token for sending)
CREATE POLICY "Authorized users can read settings"
ON public.school_settings
FOR SELECT
TO authenticated
USING (public.has_permission(auth.uid(), 'send_messages'));

-- Insert default rows
INSERT INTO public.school_settings (key, value) VALUES ('sms_api_token', ''), ('sms_sender_name', 'school1');
