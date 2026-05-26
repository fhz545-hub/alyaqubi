DROP POLICY IF EXISTS "Public can read teacher certificates" ON storage.objects;

DROP POLICY IF EXISTS "Approved users can upload teacher certificates" ON storage.objects;
CREATE POLICY "Authorized users can upload teacher certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'teacher-certificates'
  AND (
    public.is_principal(auth.uid())
    OR public.has_permission(auth.uid(), 'print_teacher_certificates'::public.user_permission)
  )
);

DROP POLICY IF EXISTS "Approved users can update teacher certificates" ON storage.objects;
CREATE POLICY "Authorized users can update teacher certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'teacher-certificates'
  AND (
    public.is_principal(auth.uid())
    OR public.has_permission(auth.uid(), 'print_teacher_certificates'::public.user_permission)
  )
)
WITH CHECK (
  bucket_id = 'teacher-certificates'
  AND (
    public.is_principal(auth.uid())
    OR public.has_permission(auth.uid(), 'print_teacher_certificates'::public.user_permission)
  )
);