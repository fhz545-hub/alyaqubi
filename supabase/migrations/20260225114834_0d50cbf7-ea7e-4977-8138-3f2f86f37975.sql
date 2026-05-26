
-- Create students table
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  student_number TEXT NOT NULL UNIQUE,
  grade TEXT NOT NULL,
  grade_code TEXT NOT NULL,
  section INTEGER NOT NULL,
  guardian_phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read students
CREATE POLICY "Authenticated users can read students"
  ON public.students FOR SELECT
  TO authenticated
  USING (true);

-- Principal can insert students
CREATE POLICY "Principal can insert students"
  ON public.students FOR INSERT
  TO authenticated
  WITH CHECK (public.is_principal(auth.uid()));

-- Principal can update students
CREATE POLICY "Principal can update students"
  ON public.students FOR UPDATE
  TO authenticated
  USING (public.is_principal(auth.uid()));

-- Principal can delete students
CREATE POLICY "Principal can delete students"
  ON public.students FOR DELETE
  TO authenticated
  USING (public.is_principal(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_students_grade_code ON public.students (grade_code);
CREATE INDEX idx_students_student_number ON public.students (student_number);
CREATE INDEX idx_students_grade_section ON public.students (grade_code, section);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
