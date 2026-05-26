ALTER TABLE public.student_vital_signs
  ADD COLUMN IF NOT EXISTS systolic_bp INTEGER,
  ADD COLUMN IF NOT EXISTS diastolic_bp INTEGER;