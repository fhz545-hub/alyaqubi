-- Cleanup function for student deletion to prevent orphan records
CREATE OR REPLACE FUNCTION public.cleanup_student_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_action_ids uuid[];
  related_message_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  INTO deleted_action_ids
  FROM public.student_actions
  WHERE student_id = OLD.id::text
     OR student_number = OLD.student_number;

  IF array_length(deleted_action_ids, 1) IS NOT NULL THEN
    DELETE FROM public.note_cancel_requests
    WHERE action_id = ANY(deleted_action_ids);
  END IF;

  DELETE FROM public.note_cancel_requests
  WHERE student_id = OLD.id::text
     OR student_id = OLD.student_number
     OR student_name = OLD.name;

  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  INTO related_message_ids
  FROM public.messages
  WHERE student_name = OLD.name
    AND (student_grade = OLD.grade OR student_grade = OLD.grade_code);

  IF array_length(related_message_ids, 1) IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE related_id = ANY(related_message_ids);

    DELETE FROM public.messages
    WHERE id = ANY(related_message_ids);
  END IF;

  DELETE FROM public.student_actions
  WHERE student_id = OLD.id::text
     OR student_number = OLD.student_number;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_student_dependencies ON public.students;
CREATE TRIGGER trg_cleanup_student_dependencies
BEFORE DELETE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_student_dependencies();

-- Cleanup function for profile deletion (used by admin user deletion flow)
CREATE OR REPLACE FUNCTION public.cleanup_profile_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  related_message_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  INTO related_message_ids
  FROM public.messages
  WHERE sender_id = OLD.user_id
     OR recipient_id = OLD.user_id;

  IF array_length(related_message_ids, 1) IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE related_id = ANY(related_message_ids);

    DELETE FROM public.messages
    WHERE id = ANY(related_message_ids);
  END IF;

  DELETE FROM public.note_cancel_requests
  WHERE requested_by = OLD.user_id
     OR reviewed_by = OLD.user_id;

  DELETE FROM public.student_actions
  WHERE performed_by = OLD.user_id;

  DELETE FROM public.user_permissions
  WHERE user_id = OLD.user_id;

  DELETE FROM public.notifications
  WHERE user_id = OLD.user_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_profile_dependencies ON public.profiles;
CREATE TRIGGER trg_cleanup_profile_dependencies
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_profile_dependencies();