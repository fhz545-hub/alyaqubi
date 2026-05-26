
-- Fix students table policies: drop restrictive, create permissive
DROP POLICY IF EXISTS "Authenticated users can read students" ON public.students;
DROP POLICY IF EXISTS "Authorized can insert students" ON public.students;
DROP POLICY IF EXISTS "Authorized can update students" ON public.students;
DROP POLICY IF EXISTS "Authorized can delete students" ON public.students;

CREATE POLICY "Authenticated users can read students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can insert students" ON public.students FOR INSERT TO authenticated WITH CHECK (is_principal(auth.uid()) OR has_permission(auth.uid(), 'add_students'::user_permission));
CREATE POLICY "Authorized can update students" ON public.students FOR UPDATE TO authenticated USING (is_principal(auth.uid()) OR has_permission(auth.uid(), 'edit_students'::user_permission));
CREATE POLICY "Authorized can delete students" ON public.students FOR DELETE TO authenticated USING (is_principal(auth.uid()));

-- Fix student_actions table policies
DROP POLICY IF EXISTS "Authenticated read actions" ON public.student_actions;
DROP POLICY IF EXISTS "Authenticated insert actions" ON public.student_actions;
DROP POLICY IF EXISTS "Owner or principal can update" ON public.student_actions;
DROP POLICY IF EXISTS "Owner or principal can delete" ON public.student_actions;

CREATE POLICY "Authenticated read actions" ON public.student_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert actions" ON public.student_actions FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid() OR is_principal(auth.uid()));
CREATE POLICY "Owner or principal can update" ON public.student_actions FOR UPDATE TO authenticated USING (performed_by = auth.uid() OR is_principal(auth.uid()));
CREATE POLICY "Owner or principal can delete" ON public.student_actions FOR DELETE TO authenticated USING (performed_by = auth.uid() OR is_principal(auth.uid()));

-- Fix profiles table policies
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Principal update any" ON public.profiles;

CREATE POLICY "Read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Principal update any" ON public.profiles FOR UPDATE TO authenticated USING (is_principal(auth.uid()));

-- Fix user_permissions table policies
DROP POLICY IF EXISTS "Authenticated can read permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Principal can insert permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Principal can delete permissions" ON public.user_permissions;

CREATE POLICY "Authenticated can read permissions" ON public.user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Principal can insert permissions" ON public.user_permissions FOR INSERT TO authenticated WITH CHECK (is_principal(auth.uid()));
CREATE POLICY "Principal can delete permissions" ON public.user_permissions FOR DELETE TO authenticated USING (is_principal(auth.uid()));
