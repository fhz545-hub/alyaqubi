
-- Table for student actions (late, absent, violation, permission, entry, exit, summon)
CREATE TABLE public.student_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  grade TEXT NOT NULL,
  grade_code TEXT NOT NULL,
  section INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('late','absent','violation','permission','entry','exit','summon')),
  details TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_actions ENABLE ROW LEVEL SECURITY;

-- Public read/write since no auth required (school internal tool)
CREATE POLICY "Allow public read" ON public.student_actions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.student_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.student_actions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.student_actions FOR DELETE USING (true);
