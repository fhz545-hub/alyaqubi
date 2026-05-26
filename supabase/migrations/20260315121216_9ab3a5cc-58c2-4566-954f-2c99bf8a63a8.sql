
-- Messages table for in-class communication (principal/vice -> teacher)
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT '',
  recipient_id uuid NOT NULL,
  recipient_name text NOT NULL,
  student_name text DEFAULT '',
  student_grade text DEFAULT '',
  message_type text NOT NULL DEFAULT 'general',
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  reply_text text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  replied_at timestamptz
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages" ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid() OR is_principal(auth.uid()));

CREATE POLICY "Authorized can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipient can update message" ON public.messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() OR sender_id = auth.uid() OR is_principal(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info',
  related_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
