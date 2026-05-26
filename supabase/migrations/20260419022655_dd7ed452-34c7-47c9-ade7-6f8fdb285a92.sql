-- Create distinguished behavior records table for "مسار التحسن السلوكي"
CREATE TABLE public.distinguished_behavior_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL,
  grade_code TEXT NOT NULL DEFAULT '',
  section INTEGER NOT NULL DEFAULT 1,
  item_number INTEGER NOT NULL,
  item_label TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  evidence_url TEXT,
  evidence_note TEXT,
  execution_date TEXT NOT NULL,
  recorded_by UUID,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  recorded_by_role TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.distinguished_behavior_records ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated read distinguished records"
ON public.distinguished_behavior_records
FOR SELECT TO authenticated
USING (true);

-- Only Principal or Vice (وكيل) can insert
CREATE POLICY "Principal or Vice can insert distinguished records"
ON public.distinguished_behavior_records
FOR INSERT TO authenticated
WITH CHECK (
  is_principal(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
      AND (role_title = 'وكيل' OR role_title ILIKE '%وكيل%')
  )
);

-- Only Principal or Vice can update
CREATE POLICY "Principal or Vice can update distinguished records"
ON public.distinguished_behavior_records
FOR UPDATE TO authenticated
USING (
  is_principal(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
      AND (role_title = 'وكيل' OR role_title ILIKE '%وكيل%')
  )
);

-- Only Principal can delete
CREATE POLICY "Principal can delete distinguished records"
ON public.distinguished_behavior_records
FOR DELETE TO authenticated
USING (is_principal(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_distinguished_behavior_updated_at
BEFORE UPDATE ON public.distinguished_behavior_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster student lookups
CREATE INDEX idx_distinguished_behavior_student ON public.distinguished_behavior_records(student_id);
CREATE INDEX idx_distinguished_behavior_date ON public.distinguished_behavior_records(execution_date);

-- Cascade cleanup when student is deleted
CREATE OR REPLACE FUNCTION public.cleanup_distinguished_behavior_on_student_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.distinguished_behavior_records
  WHERE student_id = OLD.id::text
     OR student_number = OLD.student_number;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cleanup_distinguished_behavior
BEFORE DELETE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_distinguished_behavior_on_student_delete();