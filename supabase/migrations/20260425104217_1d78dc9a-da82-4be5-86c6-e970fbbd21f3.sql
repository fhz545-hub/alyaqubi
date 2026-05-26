ALTER TABLE public.haduri_daily_records
ADD COLUMN IF NOT EXISTS excuse_period text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_haduri_daily_excuse_period
ON public.haduri_daily_records (month_key, excuse_period)
WHERE excuse_period <> '';