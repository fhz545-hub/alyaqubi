
-- Create internal messages table for staff communication
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT '',
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read messages
CREATE POLICY "Authenticated can read messages"
ON public.messages FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert their own messages
CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

-- Only principal can delete messages
CREATE POLICY "Principal can delete messages"
ON public.messages FOR DELETE
TO authenticated
USING (public.is_principal(auth.uid()));

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Update students RLS to allow users with add/edit permissions
DROP POLICY IF EXISTS "Principal can insert students" ON public.students;
CREATE POLICY "Authorized can insert students"
ON public.students FOR INSERT
TO authenticated
WITH CHECK (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'add_students'));

DROP POLICY IF EXISTS "Principal can update students" ON public.students;
CREATE POLICY "Authorized can update students"
ON public.students FOR UPDATE
TO authenticated
USING (public.is_principal(auth.uid()) OR public.has_permission(auth.uid(), 'edit_students'));

DROP POLICY IF EXISTS "Principal can delete students" ON public.students;
CREATE POLICY "Authorized can delete students"
ON public.students FOR DELETE
TO authenticated
USING (public.is_principal(auth.uid()));
