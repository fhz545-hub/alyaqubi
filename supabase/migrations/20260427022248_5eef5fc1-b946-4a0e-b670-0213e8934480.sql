
-- 1) Split notification INSERT into two unambiguous policies
DROP POLICY IF EXISTS "Self or principal insert notifications" ON public.notifications;

CREATE POLICY "Approved users insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_approved_user(auth.uid())
);

CREATE POLICY "Principal inserts notifications for anyone"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_principal(auth.uid())
);

-- 2) Require approval on distinguished_behavior_records UPDATE
DROP POLICY IF EXISTS "Principal or Vice can update distinguished records" ON public.distinguished_behavior_records;

CREATE POLICY "Approved principal or vice update distinguished records"
ON public.distinguished_behavior_records
FOR UPDATE
TO authenticated
USING (
  public.is_approved_user(auth.uid())
  AND (
    public.is_principal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.approved = true
        AND (p.role_title = 'وكيل' OR p.role_title ILIKE '%وكيل%')
    )
  )
)
WITH CHECK (
  public.is_approved_user(auth.uid())
  AND (
    public.is_principal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.approved = true
        AND (p.role_title = 'وكيل' OR p.role_title ILIKE '%وكيل%')
    )
  )
);
