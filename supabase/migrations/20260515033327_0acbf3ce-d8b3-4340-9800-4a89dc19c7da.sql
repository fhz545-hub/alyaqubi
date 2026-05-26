-- Auto-create a notification for the recipient when a guide_contact (or its reply) message is inserted/updated.
-- This bypasses the client-side RLS limitation where a non-principal user cannot insert notifications for the principal.

CREATE OR REPLACE FUNCTION public.notify_on_guide_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.message_type = 'guide_contact' AND NEW.recipient_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, related_id)
    VALUES (
      NEW.recipient_id,
      'رسالة جديدة من ' || COALESCE(NEW.sender_name, 'مستخدم'),
      LEFT(COALESCE(NEW.message_text, ''), 140),
      'guide_contact',
      NEW.id
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.message_type = 'guide_contact'
        AND NEW.reply_text IS NOT NULL
        AND COALESCE(OLD.reply_text, '') <> COALESCE(NEW.reply_text, '')
        AND NEW.sender_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, related_id)
    VALUES (
      NEW.sender_id,
      'رد من مدير المدرسة على رسالتك',
      LEFT(COALESCE(NEW.reply_text, ''), 140),
      'guide_contact_reply',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_guide_contact_ins ON public.messages;
CREATE TRIGGER trg_notify_on_guide_contact_ins
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_guide_contact();

DROP TRIGGER IF EXISTS trg_notify_on_guide_contact_upd ON public.messages;
CREATE TRIGGER trg_notify_on_guide_contact_upd
AFTER UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_guide_contact();