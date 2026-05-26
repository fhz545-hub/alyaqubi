
-- Fix: Drop all RESTRICTIVE policies and recreate as PERMISSIVE

-- student_actions
DROP POLICY IF EXISTS "Allow authenticated read" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated users can delete actions" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated users can insert actions" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated users can update actions" ON public.student_actions;

CREATE POLICY "Authenticated read actions" ON public.student_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert actions" ON public.student_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Owner or principal can update" ON public.student_actions FOR UPDATE TO authenticated USING (performed_by = auth.uid() OR is_principal(auth.uid()));
CREATE POLICY "Owner or principal can delete" ON public.student_actions FOR DELETE TO authenticated USING (performed_by = auth.uid() OR is_principal(auth.uid()));

-- profiles - fix RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Principal can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Principal update any" ON public.profiles FOR UPDATE TO authenticated USING (is_principal(auth.uid()));
