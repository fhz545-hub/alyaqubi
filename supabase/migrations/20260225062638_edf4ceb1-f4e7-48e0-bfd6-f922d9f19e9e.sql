
-- Fix the RLS policies on student_actions to require authentication
-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Allow public delete" ON public.student_actions;
DROP POLICY IF EXISTS "Allow public insert" ON public.student_actions;
DROP POLICY IF EXISTS "Allow public update" ON public.student_actions;

-- Create proper policies for authenticated users only
CREATE POLICY "Authenticated users can insert actions"
ON public.student_actions FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update actions"
ON public.student_actions FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete actions"
ON public.student_actions FOR DELETE TO authenticated
USING (true);
