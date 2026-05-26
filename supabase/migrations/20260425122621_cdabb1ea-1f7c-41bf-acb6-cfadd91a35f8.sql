-- إزالة سجلات الغياب الوهمية الناتجة عن خلل المطابقة بالاسم لمعلمَين يحملان نفس الاسم
DELETE FROM public.haduri_daily_records
WHERE teacher_civil_id = '1037273594'
  AND status = 'غياب'
  AND source_file = 'لم يظهر في ملف اليوم';