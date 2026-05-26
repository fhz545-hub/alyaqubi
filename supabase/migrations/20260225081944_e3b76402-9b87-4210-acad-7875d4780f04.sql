-- Fix RLS policies: change from RESTRICTIVE to PERMISSIVE

-- student_actions
DROP POLICY IF EXISTS "Allow public read" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated users can delete actions" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated users can insert actions" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated users can update actions" ON public.student_actions;

CREATE POLICY "Allow authenticated read" ON public.student_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert actions" ON public.student_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update actions" ON public.student_actions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete actions" ON public.student_actions FOR DELETE TO authenticated USING (true);

-- profiles
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Principal can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Authenticated users can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Principal can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (is_principal(auth.uid()));
