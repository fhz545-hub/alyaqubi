
-- Allow principal to delete profiles (for rejecting registrations)
CREATE POLICY "Principal can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (is_principal(auth.uid()));
