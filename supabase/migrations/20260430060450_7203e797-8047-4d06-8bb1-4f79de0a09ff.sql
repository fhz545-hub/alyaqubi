-- Allow all approved users to READ teacher_settings (so the Live Periods page works for everyone).
-- Insert/Update/Delete remain restricted to the principal (existing "Principal can manage teacher settings" ALL policy).
-- The previous SELECT policy was limited to principal/manage_teacher_affairs, which prevented teachers and other approved members from seeing the live schedule.

DROP POLICY IF EXISTS "Approved users read teacher settings" ON public.teacher_settings;

CREATE POLICY "Approved users read teacher settings"
ON public.teacher_settings
FOR SELECT
TO authenticated
USING (public.is_approved_user(auth.uid()));