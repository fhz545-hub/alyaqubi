import { supabase } from "@/integrations/supabase/client";

export interface HaduriMonthRow {
  id: string;
  month_label: string;
  month_key: string;
  teacher_key: string;
  teacher_name: string;
  teacher_civil_id: string;
  teacher_phone: string;
  specialization: string;
  work_min: number;
  late_min: number;
  excuse_min: number;
  absent_days: number;
  open_days: number;
  present_days: number;
  total_days: number;
  imported_dates: string[];
  source_files: string[];
  created_by_name: string;
  created_at: string;
}

export interface HaduriUpsertInput {
  month_label: string;
  month_key: string;
  teacher_key: string;
  teacher_name: string;
  teacher_civil_id: string;
  teacher_phone: string;
  specialization: string;
  work_min: number;
  late_min: number;
  excuse_min: number;
  absent_days: number;
  open_days: number;
  present_days: number;
  total_days: number;
  imported_dates: string[];
  source_files: string[];
  created_by?: string | null;
  created_by_name?: string;
}

export async function listHaduriMonths(): Promise<HaduriMonthRow[]> {
  const { data, error } = await supabase
    .from("haduri_monthly_attendance")
    .select("*")
    .order("month_key", { ascending: false })
    .order("teacher_name", { ascending: true });
  if (error) throw error;
  return (data || []) as any as HaduriMonthRow[];
}

export async function upsertHaduriMonths(rows: HaduriUpsertInput[]): Promise<number> {
  if (!rows.length) return 0;
  // Dedupe by (month_key, teacher_key) — same constraint as the unique index.
  // If the same teacher appears multiple times across imported files, keep the
  // record with the largest totals (cumulative summary) to avoid overwriting
  // good data with a partial daily file.
  const dedup = new Map<string, HaduriUpsertInput>();
  for (const r of rows) {
    const key = `${r.month_key}::${r.teacher_key}`;
    const prev = dedup.get(key);
    if (!prev) { dedup.set(key, r); continue; }
    const merged: HaduriUpsertInput = {
      ...prev,
      teacher_name: prev.teacher_name || r.teacher_name,
      teacher_civil_id: prev.teacher_civil_id || r.teacher_civil_id,
      teacher_phone: prev.teacher_phone || r.teacher_phone,
      specialization: prev.specialization || r.specialization,
      work_min: Math.max(prev.work_min, r.work_min),
      late_min: Math.max(prev.late_min, r.late_min),
      excuse_min: Math.max(prev.excuse_min, r.excuse_min),
      absent_days: Math.max(prev.absent_days, r.absent_days),
      open_days: Math.max(prev.open_days, r.open_days),
      present_days: Math.max(prev.present_days, r.present_days),
      total_days: Math.max(prev.total_days, r.total_days),
      imported_dates: Array.from(new Set([...(prev.imported_dates || []), ...(r.imported_dates || [])])).sort(),
      source_files: Array.from(new Set([...(prev.source_files || []), ...(r.source_files || [])])),
    };
    dedup.set(key, merged);
  }
  const payload = Array.from(dedup.values());
  const { data, error } = await supabase
    .from("haduri_monthly_attendance")
    .upsert(payload as any, { onConflict: "month_key,teacher_key" })
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

// ===== Daily records (one row per teacher per day) =====

export interface HaduriDailyUpsert {
  month_key: string;
  month_label: string;
  teacher_civil_id: string;
  teacher_name: string;
  teacher_phone: string;
  specialization: string;
  greg_date: string;
  hijri_date: string;
  day_name: string;
  in_time: string;
  out_time: string;
  work_min: number;
  late_min: number;
  excuse_min: number;
  status: string;
  absence_type?: string;
  fares_upload_status?: string;
  excuse_period?: string;
  source_file: string;
  created_by?: string | null;
  created_by_name?: string;
}

export interface HaduriDailyRow extends HaduriDailyUpsert {
  id: string;
  created_at: string;
}

function normalizeFaresUploadStatus(raw: unknown): "تم الإدخال" | "لم يتم الإدخال" {
  const s = String(raw ?? "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (/(لم يتم|لم يرفع|غير مدخل|غير مرفوع|ليس مدخل|ليس مرفوع|بدون رفع|not uploaded|not entered|no)/i.test(s)) return "لم يتم الإدخال";
  if (/(تم الادخال|تم الرفع|ادخال|رفع|مدخل|مرفوع|رفعت|نعم|uploaded|entered|yes)/i.test(s)) return "تم الإدخال";
  return "لم يتم الإدخال";
}

export async function updateDailyAbsenceMeta(
  id: string,
  absence_type: string,
  fares_upload_status: string,
): Promise<{ id: string; absence_type: string; fares_upload_status: string }> {
  const canonicalFaresStatus = normalizeFaresUploadStatus(fares_upload_status);
  const { data, error } = await supabase
    .from("haduri_daily_records")
    .update({ absence_type, fares_upload_status: canonicalFaresStatus } as any)
    .eq("id", id)
    .select("id,absence_type,fares_upload_status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("لم يتم حفظ التعديل؛ تحقق من الصلاحية أو رقم السجل");
  return data as any;
}

export async function upsertHaduriDaily(rows: HaduriDailyUpsert[]): Promise<number> {
  if (!rows.length) return 0;
  // Filter rows that have a civil id; ones without civil_id can't be deduped reliably
  const usable = rows.filter((r) => r.teacher_civil_id && r.greg_date);
  if (!usable.length) return 0;
  // Deduplicate by the unique constraint (month_key, teacher_civil_id, greg_date)
  // Postgres' ON CONFLICT cannot touch the same row twice in a single statement,
  // so we MUST collapse duplicates client-side. We keep the "richest" row
  // (one with in/out times or non-zero work_min) and prefer the latest source_file.
  const dedup = new Map<string, HaduriDailyUpsert>();
  const statusRank = (status: string) => {
    // ترتيب الأولوية عند تعارض حالة لنفس المعلم في نفس اليوم.
    // الاستئذان لا يجب أن يَطمس حالة الحضور الحقيقية، فالمعلم قد حضر ثم استأذن.
    if (status === "غياب") return 1;       // أدنى أولوية
    if (status === "استئذان") return 2;    // أعلى من غياب فقط
    if (status === "حضور") return 4;
    if (status === "متأخر") return 5;
    if (status === "لم يُغلق") return 6;   // أعلى أولوية (يتطلب متابعة)
    return 0;
  };
  for (const r of usable) {
    const key = `${r.month_key}::${r.teacher_civil_id}::${r.greg_date}`;
    const prev = dedup.get(key);
    if (!prev) {
      dedup.set(key, r);
      continue;
    }
    // Merge: keep the most informative values
    const merged: HaduriDailyUpsert = {
      ...prev,
      teacher_name: r.teacher_name || prev.teacher_name,
      teacher_phone: r.teacher_phone || prev.teacher_phone,
      specialization: r.specialization || prev.specialization,
      hijri_date: r.hijri_date || prev.hijri_date,
      day_name: r.day_name || prev.day_name,
      in_time: prev.in_time || r.in_time,
      out_time: r.out_time || prev.out_time,
      work_min: Math.max(prev.work_min || 0, r.work_min || 0),
      late_min: Math.max(prev.late_min || 0, r.late_min || 0),
      // الاستئذان: نفضّل المجموع عند الجمع بين ملف حضور (= 0) وملف استئذانات (= قيمة فعلية)
      // باستخدام الأكبر بدلًا من الجمع لتفادي مضاعفة الأرقام عند رفع نفس الملف مرتين.
      excuse_min: Math.max(prev.excuse_min || 0, r.excuse_min || 0),
      status: statusRank(r.status) >= statusRank(prev.status) ? r.status : prev.status,
      absence_type: r.absence_type || prev.absence_type || "",
      fares_upload_status: r.fares_upload_status || prev.fares_upload_status || "",
      excuse_period: r.excuse_period || prev.excuse_period || "",
      source_file: r.source_file || prev.source_file,
    };
    dedup.set(key, merged);
  }
  const payload = Array.from(dedup.values());
  const { data, error } = await supabase
    .from("haduri_daily_records")
    .upsert(payload as any, { onConflict: "month_key,teacher_civil_id,greg_date" })
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

export async function replaceHaduriDailyForDates(month_key: string, dates: string[], rows: HaduriDailyUpsert[]): Promise<number> {
  if (!month_key) return upsertHaduriDaily(rows);
  const cleanDates = Array.from(new Set(dates.filter(Boolean)));
  if (cleanDates.length) {
    // ★ الاستيراد إضافي/تحديثي فقط — لا حذف إطلاقاً:
    //   • لو السجل موجود سابقاً واعتُمدت عليه قيم يدوية (نوع الغياب، الرفع في فارس،
    //     قبول/فترة العذر) فإننا نُبقيها كما هي تماماً ولا نلمسها.
    //   • الحقول الإلزامية المحسوبة من الملف (الأوقات، الدقائق، الحالة) يتم تحديثها
    //     من الاستيراد الجديد (الأكبر/الأحدث) كما هو الحال في `upsertHaduriDaily`.
    //   • السجلات الموجودة في قاعدة البيانات لأيام مستوردة ولم ترد في الملف الجديد
    //     تبقى دون أي مساس بها.
    //
    // نقرأ القيم اليدوية السابقة لجميع المعلمين في الأيام المستوردة (بأي هوية مدنية،
    // ليس فقط الواردة في الدفعة الجديدة) ثم نُسقطها على الصفوف الجديدة قبل الـ upsert،
    // كي لا يتمكّن `ON CONFLICT` من استبدالها بقيم فارغة.
    const { data: existing, error: readError } = await supabase
      .from("haduri_daily_records")
      .select("teacher_civil_id,greg_date,absence_type,fares_upload_status,excuse_period")
      .eq("month_key", month_key)
      .in("greg_date", cleanDates);
    if (readError) throw readError;
    const prevEdits = new Map<string, { absence_type: string; fares_upload_status: string; excuse_period: string }>();
    for (const r of (existing || []) as any[]) {
      const k = `${r.teacher_civil_id || ""}::${r.greg_date || ""}`;
      prevEdits.set(k, {
        absence_type: r.absence_type || "",
        fares_upload_status: r.fares_upload_status || "",
        excuse_period: r.excuse_period || "",
      });
    }
    for (const row of rows) {
      const k = `${row.teacher_civil_id || ""}::${row.greg_date || ""}`;
      const prev = prevEdits.get(k);
      if (prev) {
        // القيم اليدوية السابقة لها الأولوية المطلقة — لا تُمس مهما كان الاستيراد.
        if (prev.absence_type) row.absence_type = prev.absence_type;
        if (prev.fares_upload_status) row.fares_upload_status = prev.fares_upload_status;
        if (prev.excuse_period) row.excuse_period = prev.excuse_period;
      }
    }
  }
  // الاستيراد لا يمحو شيئاً — فقط يضيف الجديد ويُحدِّث الناقص مع الحفاظ على الإجراءات اليدوية.
  return upsertHaduriDaily(rows);
}

export async function listDailyForTeacher(
  teacher_civil_id: string,
  month_key?: string,
): Promise<HaduriDailyRow[]> {
  let q = supabase
    .from("haduri_daily_records")
    .select("*")
    .eq("teacher_civil_id", teacher_civil_id)
    .order("greg_date", { ascending: false });
  if (month_key) q = q.eq("month_key", month_key);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any as HaduriDailyRow[];
}

export async function listDailyForMonth(month_key: string): Promise<HaduriDailyRow[]> {
  const { data, error } = await supabase
    .from("haduri_daily_records")
    .select("*")
    .eq("month_key", month_key)
    .order("greg_date", { ascending: false });
  if (error) throw error;
  return (data || []) as any as HaduriDailyRow[];
}

// ===== Archive deletion (Principal only — RLS enforces this server-side) =====

/** يحذف جميع سجلات شهر معيّن (الملخص الشهري + السجلات اليومية). */
export async function deleteArchiveMonth(month_key: string): Promise<void> {
  if (!month_key) return;
  const { error: e1 } = await supabase
    .from("haduri_daily_records")
    .delete()
    .eq("month_key", month_key);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("haduri_monthly_attendance")
    .delete()
    .eq("month_key", month_key);
  if (e2) throw e2;
}

/** يحذف جميع سجلات الأرشيف بالكامل (تصفير شامل — لبدء سنة دراسية جديدة). */
export async function deleteAllArchive(): Promise<void> {
  // نحدد where بدائي لتفادي حذف بدون شرط (Supabase تشترط شرطاً صريحاً للأمان)
  const { error: e1 } = await supabase
    .from("haduri_daily_records")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("haduri_monthly_attendance")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (e2) throw e2;
}

// Build a stable month_key (YYYY-MM) from a label like "نوفمبر 2025"
const AR_MONTH_TO_NUM: Record<string, string> = {
  "يناير": "01", "فبراير": "02", "مارس": "03", "أبريل": "04", "ابريل": "04",
  "مايو": "05", "يونيو": "06", "يوليو": "07", "أغسطس": "08", "اغسطس": "08",
  "سبتمبر": "09", "أكتوبر": "10", "اكتوبر": "10", "نوفمبر": "11", "ديسمبر": "12",
};

export function monthKeyFromLabel(label: string, fallbackDate?: string): string {
  if (label) {
    for (const [name, num] of Object.entries(AR_MONTH_TO_NUM)) {
      if (label.includes(name)) {
        const y = label.match(/(20\d{2})/);
        if (y) return `${y[1]}-${num}`;
        // Hijri year fallback: keep label-based key
      }
    }
    const m = label.match(/(20\d{2})[-_/.\s]?(0?[1-9]|1[0-2])/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  }
  if (fallbackDate) {
    const m = fallbackDate.match(/(20\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  return label || new Date().toISOString().slice(0, 7);
}
