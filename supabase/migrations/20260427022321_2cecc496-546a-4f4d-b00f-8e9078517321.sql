
-- Enforce one profile per user to prevent duplicate-row privilege tricks
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
