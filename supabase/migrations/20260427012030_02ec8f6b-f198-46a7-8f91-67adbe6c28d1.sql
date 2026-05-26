-- =========================================================
-- Helper: is_approved_user
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_approved_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND (approved = true OR is_principal = true)
  )
$$;

-- =========================================================
-- profiles: tighten SELECT + protect privileged columns on UPDATE
-- =========================================================
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;

CREATE POLICY "Read own or principal reads all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_principal(auth.uid())
);

DROP POLICY IF EXISTS "Update own profile" ON public.profiles;

CREATE POLICY "Update own profile (no privilege change)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND is_principal = (SELECT p.is_principal FROM public.profiles p WHERE p.user_id = auth.uid())
  AND approved     = (SELECT p.approved     FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- =========================================================
-- note_cancel_requests: restrict SELECT
-- =========================================================
DROP POLICY IF EXISTS "Authenticated read cancel requests" ON public.note_cancel_requests;

CREATE POLICY "Owner or principal read cancel requests"
ON public.note_cancel_requests
FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
  OR public.is_principal(auth.uid())
);

-- =========================================================
-- student_actions: require approval to write
-- =========================================================
DROP POLICY IF EXISTS "Authenticated insert actions" ON public.student_actions;
CREATE POLICY "Approved users insert actions"
ON public.student_actions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_approved_user(auth.uid())
  AND ((performed_by = auth.uid()) OR public.is_principal(auth.uid()))
);

DROP POLICY IF EXISTS "Owner or principal can update" ON public.student_actions;
CREATE POLICY "Approved owner or principal update actions"
ON public.student_actions
FOR UPDATE
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND ((performed_by = auth.uid()) OR public.is_principal(auth.uid()))
);

DROP POLICY IF EXISTS "Owner or principal can delete" ON public.student_actions;
CREATE POLICY "Approved owner or principal delete actions"
ON public.student_actions
FOR DELETE
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND ((performed_by = auth.uid()) OR public.is_principal(auth.uid()))
);

-- =========================================================
-- student_referrals
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert referrals" ON public.student_referrals;
CREATE POLICY "Approved users insert referrals"
ON public.student_referrals
FOR INSERT
TO authenticated
WITH CHECK (public.is_approved_user(auth.uid()));

-- =========================================================
-- distinguished_behavior_records
-- =========================================================
DROP POLICY IF EXISTS "Principal or Vice can insert distinguished records" ON public.distinguished_behavior_records;
CREATE POLICY "Approved principal or vice insert distinguished records"
ON public.distinguished_behavior_records
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_approved_user(auth.uid())
  AND (
    public.is_principal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.role_title = 'وكيل' OR p.role_title ILIKE '%وكيل%')
    )
  )
);

-- =========================================================
-- messages
-- =========================================================
DROP POLICY IF EXISTS "Authorized can send messages" ON public.messages;
CREATE POLICY "Approved users send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_approved_user(auth.uid())
);

-- =========================================================
-- sms_sent_log
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert sms log" ON public.sms_sent_log;
CREATE POLICY "Approved users insert sms log"
ON public.sms_sent_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_approved_user(auth.uid()));

-- =========================================================
-- note_cancel_requests INSERT must also require approval
-- =========================================================
DROP POLICY IF EXISTS "Users insert own cancel requests" ON public.note_cancel_requests;
CREATE POLICY "Approved users insert own cancel requests"
ON public.note_cancel_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND public.is_approved_user(auth.uid())
);

-- =========================================================
-- notifications
-- =========================================================
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Approved users insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_approved_user(auth.uid())
);

-- =========================================================
-- audit_log
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert audit entries" ON public.audit_log;
CREATE POLICY "Approved users insert audit entries"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_approved_user(auth.uid()));
