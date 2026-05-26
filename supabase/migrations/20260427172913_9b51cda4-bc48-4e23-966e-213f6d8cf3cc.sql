
-- Public bucket for teacher appreciation certificates (PDF files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('teacher-certificates', 'teacher-certificates', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read for everyone (needed for WhatsApp link previews)
DROP POLICY IF EXISTS "Public can read teacher certificates" ON storage.objects;
CREATE POLICY "Public can read teacher certificates"
ON storage.objects FOR SELECT
USING (bucket_id = 'teacher-certificates');

-- Approved users can upload
DROP POLICY IF EXISTS "Approved users can upload teacher certificates" ON storage.objects;
CREATE POLICY "Approved users can upload teacher certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'teacher-certificates' AND public.is_approved_user(auth.uid()));

-- Approved users can update / overwrite
DROP POLICY IF EXISTS "Approved users can update teacher certificates" ON storage.objects;
CREATE POLICY "Approved users can update teacher certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'teacher-certificates' AND public.is_approved_user(auth.uid()));

-- Principal can delete
DROP POLICY IF EXISTS "Principal can delete teacher certificates" ON storage.objects;
CREATE POLICY "Principal can delete teacher certificates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'teacher-certificates' AND public.is_principal(auth.uid()));
