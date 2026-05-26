// Shift configuration for teacher attendance: مطابق لمنطق منصة حضوري

export type SeasonMode = "winter" | "summer" | "ramadan";

export interface ShiftConfig {
  startMin: number;   // وقت بداية الدوام بالدقائق
  endMin: number;     // وقت نهاية الدوام بالدقائق
  baseMin: number;    // إجمالي مدة الدوام
  label: string;
}

export const EXT_MAX_MIN = 30;

export const SHIFT_CFG: Record<SeasonMode, ShiftConfig> = {
  winter:  { startMin: 6 * 60 + 45, endMin: 13 * 60 + 30, baseMin: 405, label: "الشتوي" },
  summer:  { startMin: 6 * 60 + 30, endMin: 13 * 60 + 0,  baseMin: 390, label: "الصيفي" },
  ramadan: { startMin: 8 * 60 + 30, endMin: 13 * 60 + 0,  baseMin: 270, label: "رمضان" },
};

export function getEffectiveShift(season: SeasonMode, extended: boolean): ShiftConfig {
  const base = SHIFT_CFG[season];
  if (!extended) return base;
  return { ...base, endMin: base.endMin + EXT_MAX_MIN, baseMin: base.baseMin + EXT_MAX_MIN };
}

export function toMin(hhmm: string): number | null {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mm)) return null;
  return h * 60 + mm;
}

export function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtHM(mins: number): string {
  if (!mins || mins < 0) return "00:00";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const ARABIC_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function gregorianToHijri(y: number, m: number, d: number): { y: number; m: number; d: number } {
  // Approximation algorithm — accurate within 1 day for modern dates
  const jd = Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4)
    + Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12)
    - Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4)
    + d - 32075;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l2) / 5316)) * (Math.floor((50 * l2) / 17719))
    + (Math.floor(l2 / 5670)) * (Math.floor((43 * l2) / 15238));
  const l3 = l2 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50))
    - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const hm = Math.floor((24 * l3) / 709);
  const hd = l3 - Math.floor((709 * hm) / 24);
  const hy = 30 * n + j - 30;
  return { y: hy, m: hm, d: hd };
}

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

export function formatHijri(d: Date): string {
  const h = gregorianToHijri(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${h.d} ${HIJRI_MONTHS[h.m - 1]} ${h.y}هـ`;
}

export function formatGreg(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}م`;
}

export function dayName(d: Date): string {
  return ARABIC_DAYS[d.getDay()];
}

/**
 * حساب التأخر بالدقائق بناء على وقت الدخول وبداية الدوام
 */
export function calcLateMinutes(checkInHHMM: string, season: SeasonMode, extended: boolean): number {
  const inMin = toMin(checkInHHMM);
  if (inMin === null) return 0;
  const cfg = getEffectiveShift(season, extended);
  return Math.max(0, inMin - cfg.startMin);
}

/**
 * حساب مدة عدم التواجد بالدقائق بين وقتين
 */
export function calcAbsenceMinutes(fromHHMM: string, toHHMM: string): number {
  const a = toMin(fromHHMM);
  const b = toMin(toHHMM);
  if (a === null || b === null || b <= a) return 0;
  return b - a;
}