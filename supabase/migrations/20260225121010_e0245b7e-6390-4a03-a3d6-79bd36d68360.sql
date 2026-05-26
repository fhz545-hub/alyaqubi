
-- Create permissions enum
CREATE TYPE public.user_permission AS ENUM (
  'record_late',
  'record_absent', 
  'record_violation',
  'record_permission',
  'send_messages',
  'add_students',
  'edit_students',
  'barcode_scan'
);

-- Create user_permissions table
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  permission user_permission NOT NULL,
  granted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read permissions
CREATE POLICY "Authenticated can read permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (true);

-- Only principal can manage permissions
CREATE POLICY "Principal can insert permissions"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.is_principal(auth.uid()));

CREATE POLICY "Principal can delete permissions"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (public.is_principal(auth.uid()));

-- Helper function to check user permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _perm user_permission)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND is_principal = true)
    OR
    EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _perm)
$$;
