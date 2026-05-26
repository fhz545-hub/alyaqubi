
-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT 'معلم', -- وكيل، مشرف، متابع، موجه طلابي، معلم
  national_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  is_principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read profiles
CREATE POLICY "Authenticated users can read profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- Principal can update any profile (for approval)
-- We need a security definer function to check if user is principal
CREATE OR REPLACE FUNCTION public.is_principal(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND is_principal = true
  )
$$;

CREATE POLICY "Principal can update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_principal(auth.uid()));

-- Add performed_by columns to student_actions
ALTER TABLE public.student_actions
  ADD COLUMN performed_by UUID REFERENCES auth.users(id),
  ADD COLUMN performed_by_name TEXT DEFAULT '',
  ADD COLUMN performed_by_role TEXT DEFAULT '';

-- Create trigger to auto-create profile is not needed since we create it on signup

-- Insert principal profile trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profile will be created by the registration form
  RETURN NEW;
END;
$$;
