import { supabase } from "@/integrations/supabase/client";
import { gregorianToHijri } from "./teacherShifts";

/**
 * إعدادات أيام رمضان الخاصة (دوام 9:30 ص لمدة 5 ساعات).
 * - تُحفظ كقائمة تواريخ ميلادية بصيغة YYYY-MM-DD داخل جدول school_settings تحت المفتاح ramadan_special_dates.
 * - عند احتساب التأخر، إن كان تاريخ اليوم ضمن هذه القائمة، نعتبر بداية الدوام 09:30 (570 د) ولا نحسب تأخرات قبل هذا الوقت.
 */

export const RAMADAN_SHIFT_KEY = "ramadan_special_dates";
export const RAMADAN_START_MIN = 9 * 60 + 30;          // 09:30
export const RAMADAN_DURATION_MIN = 5 * 60;            // 5 ساعات
export const RAMADAN_END_MIN = RAMADAN_START_MIN + RAMADAN_DURATION_MIN; // 14:30

let cache: Set<string> | null = null;
let cachePromise: Promise<Set<string>> | null = null;

export function clearRamadanCache() {
  cache = null;
  cachePromise = null;
}

/** يجلب قائمة التواريخ من قاعدة البيانات (مع تخزين مؤقت في الذاكرة). */
export async function loadRamadanDates(): Promise<Set<string>> {
  if (cache) return cache;
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("school_settings")
        .select("value")
        .eq("key", RAMADAN_SHIFT_KEY)
        .maybeSingle();
      if (error || !data) {
        cache = new Set();
        return cache;
      }
      const raw = String(data.value || "[]");
      let arr: string[] = [];
      try { arr = JSON.parse(raw); } catch { arr = []; }
      cache = new Set((arr || []).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)));
      return cache;
    } catch {
      cache = new Set();
      return cache;
    }
  })();
  return cachePromise;
}

export async function saveRamadanDates(dates: string[]): Promise<boolean> {
  const cleaned = Array.from(new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
  const { data: existing } = await supabase
    .from("school_settings")
    .select("id")
    .eq("key", RAMADAN_SHIFT_KEY)
    .maybeSingle();
  const payload = { key: RAMADAN_SHIFT_KEY, value: JSON.stringify(cleaned) };
  let error;
  if (existing) {
    ({ error } = await supabase.from("school_settings").update(payload).eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("school_settings").insert(payload));
  }
  if (!error) {
    cache = new Set(cleaned);
  }
  return !error;
}

/** متزامن: يفترض أن loadRamadanDates() قد استُدعيت مسبقاً. */
export function isRamadanShiftDate(dateKey: string): boolean {
  if (!cache) return false;
  return cache.has(dateKey);
}

/** يعيد دقيقة بداية الدوام لذلك التاريخ (570 إن كان يوماً رمضانياً، وإلا الافتراضي). */
export function getStartMinForDate(dateKey: string, defaultStart: number): number {
  return isRamadanShiftDate(dateKey) ? RAMADAN_START_MIN : defaultStart;
}

/**
 * منطق مرن لاقتراح أيام رمضان (دوام 9:30) ضمن نطاق ميلادي معين.
 * - يمر على كل يوم بين startDate و endDate.
 * - يأخذ فقط أيام العمل الرسمية (الأحد..الخميس).
 * - يحوّله إلى تاريخ هجري ويختار ما يقع في شهر رمضان (الشهر 9).
 * - يرجع قائمة YYYY-MM-DD مرتّبة.
 * هذا يجعل الحل صالحاً لأي عام دراسي وأي توقيت رمضان متغير.
 */
export function suggestRamadanDatesInRange(startDate: Date, endDate: Date): string[] {
  const out: string[] = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur.getTime() <= end.getTime()) {
    const dow = cur.getDay(); // 0=Sun, 5=Fri, 6=Sat
    if (dow !== 5 && dow !== 6) {
      const h = gregorianToHijri(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
      if (h.m === 9) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        out.push(`${y}-${m}-${d}`);
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** اقتراح أيام رمضان لـ "الموسم الحالي" — نمسح من قبل 60 يومًا حتى بعد 60 يومًا. */
export function suggestRamadanDatesForCurrentSeason(reference: Date = new Date()): string[] {
  const start = new Date(reference); start.setDate(start.getDate() - 60);
  const end = new Date(reference); end.setDate(end.getDate() + 60);
  return suggestRamadanDatesInRange(start, end);
}