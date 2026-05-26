-- Ensure civil_id is unique to support upsert/bulk imports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_civil_id_unique'
  ) THEN
    ALTER TABLE public.teachers
      ADD CONSTRAINT teachers_civil_id_unique UNIQUE (civil_id);
  END IF;
END $$;