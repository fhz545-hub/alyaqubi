
-- Fix Ramadan-day late records: shift starts at 09:30 (570 min) for these dates.
-- Recompute late_min = max(0, in_minutes - 570). Update status accordingly.

DO $$
DECLARE
  ramadan_dates date[] := ARRAY[
    '2026-02-18','2026-02-19','2026-02-23','2026-02-24','2026-02-25',
    '2026-02-26','2026-03-01','2026-03-02','2026-03-03','2026-03-04','2026-03-05'
  ]::date[];
BEGIN
  -- 1) Recompute late_min on daily records for Ramadan dates
  UPDATE public.haduri_daily_records r
  SET
    late_min = GREATEST(
      0,
      (split_part(r.in_time, ':', 1)::int * 60 + split_part(r.in_time, ':', 2)::int) - 570
    )
  WHERE r.greg_date::date = ANY(ramadan_dates)
    AND r.in_time ~ '^\d{1,2}:\d{2}$';

  -- 2) If after fix late_min = 0 and current status is 'متأخر' -> set to 'حضور'
  UPDATE public.haduri_daily_records r
  SET status = 'حضور'
  WHERE r.greg_date::date = ANY(ramadan_dates)
    AND r.status = 'متأخر'
    AND COALESCE(r.late_min, 0) = 0
    AND r.in_time IS NOT NULL AND r.in_time <> ''
    AND r.out_time IS NOT NULL AND r.out_time <> '';

  -- 3) Recompute monthly aggregates from daily for affected (teacher, month_label) combos
  UPDATE public.haduri_monthly_attendance m
  SET late_min = sub.total_late
  FROM (
    SELECT teacher_civil_id, teacher_name, month_label, SUM(COALESCE(late_min, 0))::int AS total_late
    FROM public.haduri_daily_records
    GROUP BY teacher_civil_id, teacher_name, month_label
  ) sub
  WHERE m.month_label = sub.month_label
    AND (
      (m.teacher_civil_id IS NOT NULL AND m.teacher_civil_id = sub.teacher_civil_id)
      OR (m.teacher_name = sub.teacher_name)
    )
    AND m.month_label IN (
      SELECT DISTINCT month_label FROM public.haduri_daily_records
      WHERE greg_date::date = ANY(ramadan_dates)
    );
END $$;
