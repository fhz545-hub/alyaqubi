-- إضافة صلاحية مشاهدة ملف المعلم
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'view_teacher_profile';