
-- Remove the policy that relied on role_title string matching
DROP POLICY IF EXISTS "Reviewers can read cancel requests" ON public.note_cancel_requests;
DROP POLICY IF EXISTS "Owner or principal read cancel requests" ON public.note_cancel_requests;

-- Single consolidated SELECT policy: owner, principal, or explicitly permitted reviewer
CREATE POLICY "Authorized read cancel requests"
ON public.note_cancel_requests
FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
  OR public.is_principal(auth.uid())
  OR public.has_permission(auth.uid(), 'edit_actions'::user_permission)
  OR public.has_permission(auth.uid(), 'delete_actions'::user_permission)
);
