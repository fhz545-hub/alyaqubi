import * as XLSX from "xlsx";
import { isRamadanShiftDate, RAMADAN_START_MIN } from "./ramadanShift";

export type TeacherDay = {
  dateKey: string;
  inMin: number | null;
  outMin: number | null;
  statusRaw: string;
  permissionMin: number;
};

export type TeacherRecord = {
  name: string;
  id: string;
  phone: string;
  spec: string;
  days: Map<string, TeacherDay>;
};

export type TeacherStats = {
  name: string;
  id: string;
  phone: string;
  spec: string;
  workMin: number;
  lateMin: number;
  excuseMin: number;
  absentDays: number;
  openDays: number;
  presentDays: number;
  totalDays: number;
};

export type DailyRecord = {
  teacher_civil_id: string;
  teacher_name: string;
  teacher_phone: string;
  specialization: string;
  greg_date: string;        // YYYY-MM-DD
  in_time: string;          // HH:MM
  out_time: string;         // HH:MM
  work_min: number;
  late_min: number;
  excuse_min: number;
  status: "حضور" | "متأخر" | "غياب" | "استئذان" | "لم يُغلق";
  absence_type?: string;
  fares_upload_status?: string;
  excuse_period?: string;
  source_file: string;
};

/** تفاصيل طلب استئذان مفرد (من ملف "تقرير الاستئذانات") */
export type ExcuseDetail = {
  teacher_civil_id: string;
  teacher_name: string;
  greg_date: string;        // YYYY-MM-DD
  from_time: string;        // HH:MM
  to_time: string;          // HH:MM
  duration_min: number;
  kind: string;             // نوع الاستئذان
  period: string;           // بداية الدوام / وسط الدوام / آخر الدوام
  status_request: string;   // مقبول/مرفوض
  request_id: string;
  source_file: string;
};

export type AttendanceParseResult = {
  teachers: TeacherStats[];
  importedDates: string[];
  warnings: string[];
  daily: DailyRecord[];
  /** نوع الملف المُحلَّل: حضور يومي عادي، أو ملف استئذانات لفترة. */
  fileKind: "attendance" | "excuses";
  /** نطاق التاريخ المستخرج من اسم الملف (للتقارير ذات فترة) */
  range?: { from: string; to: string };
  /** التفاصيل الكاملة للاستئذانات إن وُجدت */
  excuses: ExcuseDetail[];
  diagnostics?: {
    recognizedSheets: string[];
    unrecognizedSheets: string[];
    attendanceRows: number;
    excuseRows: number;
    validAttendanceDates: string[];
    /** تفاصيل ورقة-بورقة لمساعدة المستخدم على فهم سبب أي مشكلة */
    sheetReports?: SheetReport[];
    /** نمط اسم الملف الذي تعرّف عليه النظام */
    fileNamePattern?: FileNamePattern;
    /** نص واضح يلخّص حالة الملف (للعرض للمستخدم) */
    statusReason?: string;
  };
};

export type FileNamePattern =
  | "full_date"        // (2026-05-10)... أو 2026-05-10
  | "day_ordinal"      // 1.xlsx داخل مجلد شهر
  | "date_range"       // (2026-04-01_2026-04-23)
  | "unknown";

export type SheetReport = {
  sheetName: string;
  recognized: boolean;
  headerRow: number;             // -1 لو لم يُعثر
  detectedHeaders: string[];     // الترويسات الأصلية التي اعتُبرت رؤوس أعمدة
  mappedColumns: Record<string, string | null>; // {الاسم, الهوية, الحضور, الانصراف, التاريخ, الحالة}
  rowsScanned: number;
  rowsAccepted: number;
  detectedDate: string;          // التاريخ المستخرج (إن وُجد)
  reason: string;                // سبب الرفض أو ملاحظة
};

const NAME_KEYS = [
  "الاسم", "الإسم", "اسم", "اسم كامل", "الاسم الكامل", "اسم الموظف", "اسم المعلم",
  "اسم المستفيد", "اسم صاحب الطلب", "اسم مقدم الطلب", "اسم المتقدم", "اسم العامل",
  "الموظف", "المعلم", "اسم الموظفة", "اسم المعلمة",
  "Name", "Full Name", "FullName", "Employee Name", "EmployeeName", "Employee",
  "Teacher Name", "TeacherName", "Staff Name",
];
const ID_KEYS = [
  // الهوية الوطنية والإقامة
  "رقم الهوية", "رقم الهويه", "الهوية", "الهويه", "الهوية الوطنية", "الهويه الوطنيه",
  "رقم الهوية الوطنية", "رقم الهويه الوطنيه", "رقم الهوية/الإقامة", "رقم الهوية / الإقامة",
  "الهوية/الإقامة", "هوية/إقامة", "رقم الإقامة", "رقم الاقامة",
  "هوية الموظف", "هوية المعلم", "هوية صاحب الطلب", "رقم هوية صاحب الطلب",
  "هوية مقدم الطلب", "رقم هوية مقدم الطلب", "رقم الهوية للمستفيد", "هوية المستفيد",
  // السجل المدني
  "السجل المدني", "رقم السجل", "رقم السجل المدني", "سجل صاحب الطلب", "السجل",
  // الرقم الوظيفي
  "الرقم الوظيفي", "رقم وظيفي", "رقم الموظف", "كود الموظف", "الرقم الإداري",
  "الرقم التعريفي", "رقم منسوبي",
  // إنجليزي
  "Employee No", "Employee Number", "Employee ID", "EmployeeID", "Emp ID", "EmpID",
  "National ID", "NationalID", "National Id", "Civil ID", "CivilID", "Civil Id",
  "Staff ID", "StaffID", "ID Number", "Iqama", "Iqama No",
];

/**
 * Headers that LOOK like they contain "رقم"/"الرقم"/"ID" but are NOT a national/civil/employee ID.
 * These must NEVER be matched as the identity column, otherwise the parser would store the
 * request id (e.g. رقم الطلب) as the teacher civil_id and mismatch every record.
 */
const ID_DENY_KEYS = [
  "رقم الطلب", "رقم الإستئذان", "رقم الاستئذان", "رقم الإذن", "رقم الاذن",
  "رقم الجوال", "رقم الهاتف", "رقم التواصل", "رقم الواتساب",
  "رقم الحركة", "رقم القيد", "رقم الترتيب", "رقم التسلسل", "الرقم التسلسلي",
  "م", "#",
  "Request ID", "Request No", "Order No", "Phone", "Mobile",
];
const PHONE_KEYS = [
  "الجوال", "رقم الجوال", "الهاتف", "رقم الهاتف", "هاتف", "موبايل",
  "Phone", "Mobile", "Tel", "Telephone", "Cell",
];
const SPEC_KEYS = [
  "التخصص", "تخصص", "المادة", "المادة الدراسية", "المواد", "القسم",
  "Subject", "Specialization", "Speciality", "Major", "Department",
];
const IN_KEYS = [
  "توقيت الحضور", "وقت الحضور", "وقت الدخول", "وقت بداية الحضور", "بداية الدوام",
  "بصمة الدخول", "بصمة الحضور", "حضور الموظف", "دخول", "الحضور", "حضور",
  "وقت الوصول", "زمن الحضور", "زمن الدخول",
  "Check in", "Check-in", "Checkin", "In", "Time In", "TimeIn", "In Time",
  "Entry", "Entry Time", "Sign In", "SignIn",
];
const OUT_KEYS = [
  "توقيت الإنصراف", "توقيت الانصراف", "وقت الانصراف", "وقت الإنصراف", "وقت الخروج",
  "وقت نهاية الانصراف", "نهاية الدوام", "بصمة الخروج", "بصمة الانصراف",
  "انصراف الموظف", "خروج", "الانصراف", "الإنصراف", "انصراف",
  "زمن الانصراف", "زمن الخروج",
  "Check out", "Check-out", "Checkout", "Out", "Time Out", "TimeOut", "Out Time",
  "Exit", "Exit Time", "Sign Out", "SignOut",
];
const DATE_KEYS = [
  "التاريخ", "تاريخ", "اليوم", "تاريخ الحركة", "تاريخ الدوام", "تاريخ الحضور",
  "تاريخ اليوم", "التاريخ الميلادي", "الميلادي", "تاريخ ميلادي",
  "Date", "Day", "Working Date", "Attendance Date",
];
const STATUS_KEYS = [
  "الحالة", "حالة", "البيان", "الوضع", "حالة الدوام", "حالة الحضور", "حالة الموظف",
  "الاعتماد", "حالة الاعتماد", "نوع الحالة",
  "Status", "Approval", "State", "Condition",
  "ملاحظة", "الملاحظات", "ملاحظات", "Note", "Notes", "Remark", "Remarks",
];

/** أعمدة لا يجب اعتبارها "حالة الحضور" حتى لو تشابهت في الكلمات. */
const STATUS_DENY_KEYS = [
  "حالة الطلب", "نوع الاستئذان", "نوع الإستئذان", "نوع الإذن", "نوع الاذن",
];
const PERM_DURATION_KEYS = [
  "مدة الاستئذان", "مده الاستئذان", "المدة", "المده", "مدة", "مده",
  "مدة الإذن", "مدة الإجازة", "مدة الغياب", "إجمالي المدة", "اجمالي المدة",
  "Duration", "Total Duration", "Length", "Period", "الزمن",
];

const DEFAULT_START_MIN = 6 * 60 + 45; // الدوام الصيفي المعتمد: 06:45
const DEFAULT_END_MIN = 13 * 60 + 45;  // الدوام الصيفي المعتمد: 13:45
const HALF_DAY_WORK_MIN = 3 * 60 + 30; // عند عدم تسجيل الانصراف يُحتسب نصف يوم = 3:30

function normalizeDigits(v: any): string {
  return String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function normalizeHeader(s: any): string {
  return normalizeDigits(s)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * يبحث عن أنسب عمود في الترويسة. الأولويات:
 *   1) تطابق تام مع أحد المرشّحين
 *   2) ترويسة الملف تحتوي مرشّحاً كاملاً (h.includes(c)) — لكن المرشّح يجب أن يكون من
 *      نوع متعدّد الكلمات (لمنع كلمات عامة مثل "رقم" أن تلتقط "رقم الطلب").
 *   3) كلمة مرشّحة قصيرة (1 كلمة) — مقبولة فقط عند التطابق التام.
 * كما يقبل قائمة استبعاد (denyKeys) لتخطّي أي ترويسة تطابقها (مثل "رقم الطلب").
 */
function findColIndex(headers: string[], candidates: string[], denyKeys: string[] = []): number {
  const cands = candidates.map(normalizeHeader).filter(Boolean);
  const deny = denyKeys.map(normalizeHeader).filter(Boolean);
  // المنع يكون بالتطابق التام أو احتواء العبارة المركّبة فقط (مع مسافة).
  // الكلمات المفردة مثل "م" أو "#" تُمنع بالتطابق التام فقط حتى لا تُلغي ترويسات شرعية.
  const isDenied = (h: string) =>
    deny.some((d) => h === d || (d.includes(" ") && h.includes(d)));

  // 1) exact
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (!h || isDenied(h)) continue;
    if (cands.some((c) => h === c)) return i;
  }
  // 2) header contains a multi-word candidate
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (!h || isDenied(h)) continue;
    if (cands.some((c) => c.includes(" ") && h.includes(c))) return i;
  }
  // 3) candidate contains the entire header (header is a sub-phrase of candidate)
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (!h || isDenied(h)) continue;
    if (cands.some((c) => c.includes(" ") && c.includes(h) && h.length >= 3)) return i;
  }
  return -1;
}

function parseTimeToMinutes(v: any): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  if (typeof v === "number") {
    const fraction = ((v % 1) + 1) % 1;
    // قيم Excel للوقت دائمًا بين 0 و1 (كسر من اليوم).
    if (v >= 0 && v < 1) {
      const total = Math.round(v * 24 * 60);
      return ((total % 1440) + 1440) % 1440;
    }
    // قيمة مثل 1.55 (تواريخ Excel نسبية) — نأخذ الكسر فقط
    if (v >= 0 && v < 60000 && fraction > 0) {
      const total = Math.round(fraction * 24 * 60);
      return ((total % 1440) + 1440) % 1440;
    }
    return null;
  }
  const s = normalizeDigits(v).trim().replace(/[٫،]/g, ":");
  const m = s.match(/(\d{1,2})\s*[:.\u066B]\s*(\d{2})(?:\s*[:.\u066B]\s*(\d{2}))?\s*(ص|م|AM|PM|am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ampm = m[4];
  if (ampm) {
    if ((ampm === "م" || /pm/i.test(ampm)) && h < 12) h += 12;
    if ((ampm === "ص" || /am/i.test(ampm)) && h === 12) h = 0;
  }
  if (isNaN(h) || isNaN(mm)) return null;
  return ((h * 60 + mm) % 1440 + 1440) % 1440;
}

function parseDurationToMinutes(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 0 && v < 1) return Math.round(v * 24 * 60);
    if (v > 0 && v <= 12) return Math.round(v * 60);
    if (v > 0 && v <= 600) return Math.round(v);
    return null;
  }
  const s = normalizeDigits(v).trim();
  const hhmm = s.match(/(\d{1,2})[:.](\d{2})/);
  if (hhmm) return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
  const minutes = s.match(/(\d{1,3}(?:[.,]\d+)?)\s*(?:د|دقيقه|دقيقة|minutes?)/i);
  if (minutes) return Math.round(parseFloat(minutes[1].replace(",", ".")));
  const hours = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*(?:س|ساعه|ساعة|hours?)/i);
  if (hours) return Math.round(parseFloat(hours[1].replace(",", ".")) * 60);
  const plain = s.match(/^\d{1,3}$/);
  if (plain) {
    const n = parseInt(plain[0], 10);
    return n <= 12 ? n * 60 : n;
  }
  return null;
}

function minutesToHHMMlocal(min: number | null): string {
  if (min === null || min < 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseDateKey(v: any): string {
  if (!v && v !== 0) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const date = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = normalizeDigits(v).trim();
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  return "";
}

function isWeekendDay(dateKey: string): boolean {
  if (!dateKey) return false;
  const d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const wd = d.getDay();
  return wd === 5 || wd === 6;
}

function normalizePhone(v: any): string {
  if (!v) return "";
  let s = String(v).replace(/\D/g, "");
  if (s.startsWith("966")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  if (s.length === 9 && s.startsWith("5")) return "966" + s;
  return "";
}

function normalizeCivilId(v: any): string {
  const raw0 = normalizeDigits(v).replace(/,/g, "").trim();
  const asNumber = Number(raw0);
  const raw = (typeof v === "number" && Number.isFinite(v))
    ? Math.trunc(v).toString()
    : (/e|\./i.test(raw0) && Number.isFinite(asNumber) ? Math.trunc(asNumber).toString() : raw0);
  const s = raw.replace(/\D/g, "").trim();
  if (s.length === 10) return s;
  const nationalId = s.match(/[12]\d{9}/);
  if (nationalId) return nationalId[0];
  return s.length >= 4 ? s : "";
}

/**
 * Try to extract a date from a file name (daily file convention).
 * Examples we accept:
 *  - 23.xlsx  -> day-of-month only (use detected month/year)
 *  - 2026-04-23.xlsx
 *  - 23-04-2026.xlsx
 *  - 1447-10-06.xlsx (Hijri ignored — handled later)
 */
export function extractDateFromFilename(name: string, fallbackYear?: number, fallbackMonth?: number): string {
  const base = normalizeDigits(name).replace(/\.[^.]+$/, "");
  // ترتيب البدائل من الأطول إلى الأقصر لتفادي قراءة "10" كـ "1" فقط، مع حد رقمي بعدها.
  let m = base.match(/(20\d{2})[-_./\s]?(1[0-2]|0?[1-9])[-_./\s]?(3[01]|[12]\d|0?[1-9])(?!\d)/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = base.match(/(?<!\d)(3[01]|[12]\d|0?[1-9])[-_./\s](1[0-2]|0?[1-9])[-_./\s](20\d{2})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // bare day number like "23"
  const dayOnly = base.match(/^(0?[1-9]|[12]\d|3[01])$/);
  if (dayOnly && fallbackYear && fallbackMonth) {
    return `${fallbackYear}-${String(fallbackMonth).padStart(2, "0")}-${dayOnly[1].padStart(2, "0")}`;
  }
  const looseDay = fallbackYear && fallbackMonth
    ? base.match(/(?:^|[^\d])(0?[1-9]|[12]\d|3[01])(?:[^\d]|$)/)
    : null;
  if (looseDay && !/(20\d{2})[-_./\s]?(0?[1-9]|1[0-2])[-_./\s]?(0?[1-9]|[12]\d|3[01])/.test(base)) {
    return `${fallbackYear}-${String(fallbackMonth).padStart(2, "0")}-${looseDay[1].padStart(2, "0")}`;
  }
  return "";
}

/**
 * بعض صادرات حضوري داخل مجلد الشهر تأتي بأسماء تحميل عامة مثل: 1.xlsx / 1.2.xlsx
 * ولا تحتوي عمود تاريخ. هنا نعامل الرقم الأول كترتيب يوم عمل داخل الشهر، لا كتاريخ ميلادي.
 */
export function extractWorkdayOrdinalFromFilename(name: string, year: number, month: number): string {
  const base = normalizeDigits(name).replace(/\.[^.]+$/, "").trim();
  if (/20\d{2}/.test(base)) return "";
  const m = base.match(/^(0?[1-9]|[12]\d|3[01])(?:\s*(?:\.\s*\d+|\(\s*\d+\s*\)))?$/);
  if (!m) return "";
  const ordinal = Number(m[1]);
  const workingDays: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!isWeekendDay(key)) workingDays.push(key);
  }
  return workingDays[ordinal - 1] || "";
}

/**
 * استخراج فترة تاريخية من اسم الملف بصيغة (YYYY-MM-DD_YYYY-MM-DD).
 * يُستخدم لتقارير الاستئذانات التي تغطي مدة بدلاً من يوم محدد.
 */
export function extractDateRangeFromFilename(name: string): { from: string; to: string } | null {
  const normalizedName = normalizeDigits(name);
  // (2026-04-01_2026-04-23) أو 2026-04-01_2026-04-23 بدون أقواس
  const m = normalizedName.match(/\(?\s*(20\d{2}-\d{2}-\d{2})\s*[_\-]\s*(20\d{2}-\d{2}-\d{2})\s*\)?/);
  if (!m) return null;
  return { from: m[1], to: m[2] };
}

/** يحدّد نمط اسم الملف بوضوح لاستخدامه في التشخيص والقرار */
export function detectFileNamePattern(name: string): FileNamePattern {
  if (extractDateRangeFromFilename(name)) return "date_range";
  if (extractDateFromFilename(name)) return "full_date";
  const base = normalizeDigits(name).replace(/\.[^.]+$/, "").trim();
  if (/^(0?[1-9]|[12]\d|3[01])(?:\s*(?:\.\s*\d+|\(\s*\d+\s*\)))?$/.test(base)) return "day_ordinal";
  return "unknown";
}

/** كل التواريخ بين بدايتين (شاملة الطرفين) باستثناء الجمعة/السبت */
function expandWorkingDates(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return out;
  const cur = new Date(start);
  while (cur <= end) {
    const wd = cur.getDay();
    if (wd !== 5 && wd !== 6) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const EXCUSE_FROM_TIME_KEYS = ["من وقت", "وقت من", "من الساعة", "وقت البداية", "بداية الوقت", "وقت بدء", "بداية الاستئذان", "وقت الخروج", "ساعة البداية", "من", "From", "From Time", "Start Time"];
const EXCUSE_TO_TIME_KEYS = ["إلى وقت", "الى وقت", "وقت إلى", "إلى الساعة", "الى الساعة", "وقت النهاية", "نهاية الوقت", "وقت انتهاء", "نهاية الاستئذان", "وقت العودة", "ساعة النهاية", "إلى", "الى", "To", "To Time", "End Time"];
const EXCUSE_FROM_DATE_KEYS = ["من تاريخ", "تاريخ من", "من التاريخ", "تاريخ البداية", "تاريخ الطلب", "تاريخ الاستئذان", "تاريخ الإذن", "التاريخ الميلادي", "التاريخ", "تاريخ", "تاريخ الحركة", "Date", "Day"];
const EXCUSE_TO_DATE_KEYS = ["إلى تاريخ", "الى تاريخ", "تاريخ إلى", "تاريخ الى", "إلى التاريخ", "الى التاريخ", "تاريخ النهاية", "نهاية التاريخ"];
const EXCUSE_KIND_KEYS = ["نوع الاستئذان", "نوع الإستئذان", "نوع الاذن", "نوع الإذن", "النوع", "نوع الطلب", "نوع"];
const EXCUSE_STATUS_KEYS = ["حالة الطلب", "حالة الموافقة", "الاعتماد", "الموافقة", "حالة", "الحالة", "Status", "Approval"];
const EXCUSE_REQ_ID_KEYS = ["رقم الطلب", "رقم الإستئذان", "رقم الاستئذان", "رقم الاذن", "رقم الإذن"];

function classifyExcusePeriod(kind: string, fromMin: number | null, toMin: number | null): string {
  const text = String(kind || "").trim();
  if (/بداية|اول|أول|صباح|حضور/.test(text)) return "بداية الدوام";
  if (/آخر|اخر|نهاية|انصراف|خروج/.test(text)) return "آخر الدوام";
  if (/وسط|اثناء|أثناء|خلال/.test(text)) return "وسط الدوام";
  if (fromMin !== null) {
    if (fromMin <= DEFAULT_START_MIN + 90) return "بداية الدوام";
    if (fromMin >= DEFAULT_END_MIN - 120 || (toMin !== null && toMin >= DEFAULT_END_MIN - 30)) return "آخر الدوام";
  }
  return "وسط الدوام";
}

function chooseExcuseDate(fromDate: string, toDate: string, fileRange: { from: string; to: string } | null): string {
  if (fromDate) return fromDate;
  if (toDate) return toDate;
  if (fileRange?.from === fileRange?.to) return fileRange.from;
  return "";
}

function chooseExcuseDates(fromDate: string, toDate: string, fileRange: { from: string; to: string } | null): string[] {
  if (fromDate && toDate && fromDate !== toDate) return expandWorkingDates(fromDate, toDate);
  const single = chooseExcuseDate(fromDate, toDate, fileRange);
  return single ? [single] : [];
}

/**
 * كشف ما إذا كان الملف ملف "تقرير استئذانات" بالنظر لاسمه + ترويسة الورقة.
 */
function looksLikeExcusesFile(fileName: string, headers: string[]): boolean {
  const normalizedFileName = normalizeHeader(fileName);
  if (/استيذان|استيذانات|اذن|اذونات|تصريح|مغادره/.test(normalizedFileName) || /تقرير_?الاستيذانات/.test(normalizedFileName)) return true;
  const hasFromTime = findColIndex(headers, EXCUSE_FROM_TIME_KEYS) >= 0;
  const hasToTime = findColIndex(headers, EXCUSE_TO_TIME_KEYS) >= 0;
  const hasKind = findColIndex(headers, EXCUSE_KIND_KEYS) >= 0;
  const hasReqStatus = findColIndex(headers, EXCUSE_STATUS_KEYS) >= 0;
  return hasFromTime && hasToTime && (hasKind || hasReqStatus);
}

/**
 * يُحلِّل ملف "تقرير الاستئذانات" المُصدَّر من حضوري.
 * كل سطر = طلب استئذان واحد لمعلم. نأخذ الطلبات المقبولة فقط ونحوّلها إلى:
 *  - تفاصيل (ExcuseDetail) لعرضها داخل كشف المعلم
 *  - سجلات يومية (DailyRecord) بحالة "استئذان" + excuse_min، تُدمج مع باقي الكشف
 */
async function parseExcusesExcel(
  file: File,
  range: { from: string; to: string } | null,
): Promise<AttendanceParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const warnings: string[] = [];
  const excuses: ExcuseDetail[] = [];
  // greg_date::civil_id => merged DailyRecord
  const dayMap = new Map<string, DailyRecord>();
  const teachersMap = new Map<string, TeacherStats>();
  const importedDates = new Set<string>();
  const recognizedSheets: string[] = [];
  const unrecognizedSheets: string[] = [];
  let excuseRows = 0;
  const sheetReports: SheetReport[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    if (!matrix.length) continue;

    let headerRow = -1;
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      const row = matrix[i].map(normalizeHeader);
      const hits =
        (findColIndex(row, ID_KEYS, ID_DENY_KEYS) >= 0 ? 1 : 0) +
        (findColIndex(row, NAME_KEYS) >= 0 ? 1 : 0) +
        (findColIndex(row, EXCUSE_FROM_TIME_KEYS) >= 0 ? 1 : 0) +
        (findColIndex(row, EXCUSE_TO_TIME_KEYS) >= 0 ? 1 : 0) +
        (findColIndex(row, EXCUSE_FROM_DATE_KEYS) >= 0 ? 1 : 0);
      if (hits >= 3) { headerRow = i; break; }
    }
    if (headerRow < 0) {
      unrecognizedSheets.push(`${file.name} / ${sheetName}`);
      warnings.push(`لم يتم التعرف على أعمدة الاستئذان في الشيت: ${sheetName}`);
      sheetReports.push({
        sheetName, recognized: false, headerRow: -1, detectedHeaders: [],
        mappedColumns: {}, rowsScanned: matrix.length, rowsAccepted: 0,
        detectedDate: "",
        reason: "لم يُعثر على ترويسة استئذان (الاسم/الهوية/من/إلى/التاريخ).",
      });
      continue;
    }
    recognizedSheets.push(`${file.name} / ${sheetName}`);

    const headers = matrix[headerRow].map(normalizeHeader);
    const cId = findColIndex(headers, ID_KEYS, ID_DENY_KEYS);
    const cName = findColIndex(headers, NAME_KEYS);
    const cFromTime = findColIndex(headers, EXCUSE_FROM_TIME_KEYS);
    const cToTime = findColIndex(headers, EXCUSE_TO_TIME_KEYS);
    const cFromDate = findColIndex(headers, EXCUSE_FROM_DATE_KEYS);
    const cToDate = findColIndex(headers, EXCUSE_TO_DATE_KEYS);
    const cKind = findColIndex(headers, EXCUSE_KIND_KEYS);
    const cReqStatus = findColIndex(headers, EXCUSE_STATUS_KEYS);
    const cReqId = findColIndex(headers, EXCUSE_REQ_ID_KEYS);
    const cDuration = findColIndex(headers, PERM_DURATION_KEYS);
    let acceptedHere = 0;

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !row.length) continue;
      const id = cId >= 0 ? normalizeCivilId(row[cId]) : "";
      const name = cName >= 0 ? String(row[cName] || "").trim() : "";
      if (!id && !name) continue;

      const reqStatus = cReqStatus >= 0 ? String(row[cReqStatus] || "").trim() : "";
      const reqStatusNorm = normalizeHeader(reqStatus);
      // نقبل: مقبول/معتمد/اعتماد/موافق/منجز/تم/نُفّذ/مغادرة منفّذة/approved/accepted/done/executed
      // نرفض فقط: مرفوض/ملغي/معلّق/قيد المراجعة/rejected/cancelled/pending
      if (reqStatusNorm) {
        const isReject = /(مرفوض|ملغي|ملغى|معلق|معلّق|قيد|مراجعه|قيد المراجعه|rejected|cancelled|canceled|pending|denied)/i.test(reqStatusNorm);
        if (isReject) continue;
        // إذا كانت الحالة شيئاً غير معتاد ولا تحوي إيجاباً صريحاً، نقبلها افتراضيًا (لأنّ بعض المدارس تستخدم رموزاً)
      }

      const fromDate = cFromDate >= 0 ? parseDateKey(row[cFromDate]) : "";
      const toDate = cToDate >= 0 ? parseDateKey(row[cToDate]) : "";
      const dateKeys = chooseExcuseDates(fromDate, toDate, range)
        .filter((d) => d && !isWeekendDay(d))
        .filter((d) => !range || (d >= range.from && d <= range.to));
      if (!dateKeys.length) continue;

      const fromMin = cFromTime >= 0 ? parseTimeToMinutes(row[cFromTime]) : null;
      const toMin = cToTime >= 0 ? parseTimeToMinutes(row[cToTime]) : null;
      let dur = 0;
      if (fromMin !== null && toMin !== null) dur = ((toMin - fromMin) + 1440) % 1440;
      if (!dur && cDuration >= 0) dur = parseDurationToMinutes(row[cDuration]) || 0;
      if (dur <= 0) continue;
      const kind = cKind >= 0 ? String(row[cKind] || "").trim() : "";
      const period = classifyExcusePeriod(kind, fromMin, toMin);

      const perDayDur = Math.max(1, Math.round(dur / dateKeys.length));
      for (const dateKey of dateKeys) {
        const detail: ExcuseDetail = {
          teacher_civil_id: id,
          teacher_name: name,
          greg_date: dateKey,
          from_time: minutesToHHMMlocal(fromMin),
          to_time: minutesToHHMMlocal(toMin),
          duration_min: perDayDur,
          kind,
          period,
          status_request: reqStatus || "مقبول",
          request_id: cReqId >= 0 ? String(row[cReqId] || "").trim() : "",
          source_file: file.name,
        };
        excuses.push(detail);
        excuseRows++;
        acceptedHere++;
        importedDates.add(dateKey);
      }

      const key = id || name;
      // aggregate teacher excuse minutes
      const ts = teachersMap.get(key);
      if (!ts) {
        teachersMap.set(key, {
          name: name || "—", id: id || "—", phone: "", spec: "",
          workMin: 0, lateMin: 0, excuseMin: perDayDur * dateKeys.length,
          absentDays: 0, openDays: 0, presentDays: 0, totalDays: 0,
        });
      } else {
        ts.excuseMin += perDayDur * dateKeys.length;
        if (!ts.name || ts.name === "—") ts.name = name || ts.name;
        if (!ts.id || ts.id === "—") ts.id = id || ts.id;
      }

      // Merge into daily map (one row per teacher per day)
      for (const dateKey of dateKeys) {
        const dayKey = `${id || name}::${dateKey}`;
        const prev = dayMap.get(dayKey);
        if (!prev) {
          dayMap.set(dayKey, {
            teacher_civil_id: id,
            teacher_name: name,
            teacher_phone: "",
            specialization: "",
            greg_date: dateKey,
            in_time: "",
            out_time: "",
            work_min: 0,
            late_min: 0,
            excuse_min: perDayDur,
            excuse_period: period,
            status: "استئذان",
            source_file: file.name,
          });
        } else {
          prev.excuse_min += perDayDur;
          prev.excuse_period = prev.excuse_period || period;
        }
      }
    }
    sheetReports.push({
      sheetName, recognized: true, headerRow,
      detectedHeaders: matrix[headerRow].map((c) => String(c ?? "")),
      mappedColumns: {
        "الاسم": cName >= 0 ? String(matrix[headerRow][cName] ?? "") : null,
        "الهوية": cId >= 0 ? String(matrix[headerRow][cId] ?? "") : null,
        "من وقت": cFromTime >= 0 ? String(matrix[headerRow][cFromTime] ?? "") : null,
        "إلى وقت": cToTime >= 0 ? String(matrix[headerRow][cToTime] ?? "") : null,
        "من تاريخ": cFromDate >= 0 ? String(matrix[headerRow][cFromDate] ?? "") : null,
        "إلى تاريخ": cToDate >= 0 ? String(matrix[headerRow][cToDate] ?? "") : null,
        "نوع الاستئذان": cKind >= 0 ? String(matrix[headerRow][cKind] ?? "") : null,
        "حالة الطلب": cReqStatus >= 0 ? String(matrix[headerRow][cReqStatus] ?? "") : null,
      },
      rowsScanned: Math.max(0, matrix.length - headerRow - 1),
      rowsAccepted: acceptedHere,
      detectedDate: range ? `${range.from} → ${range.to}` : "",
      reason: acceptedHere > 0 ? "تم استخراج طلبات الاستئذان المقبولة." : "لم يتم اعتماد أي صف (تحقّق من حالة الطلب والتواريخ).",
    });
  }

  return {
    teachers: Array.from(teachersMap.values()).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    importedDates: Array.from(importedDates).sort(),
    warnings,
    daily: Array.from(dayMap.values()),
    fileKind: "excuses",
    range: range || undefined,
    excuses,
    diagnostics: {
      recognizedSheets,
      unrecognizedSheets,
      attendanceRows: 0,
      excuseRows,
      validAttendanceDates: [],
      sheetReports,
      fileNamePattern: range ? "date_range" : detectFileNamePattern(file.name),
      statusReason: excuseRows > 0
        ? `ملف استئذانات: ${excuseRows} طلب مقبول${range ? ` خلال ${range.from} → ${range.to}` : ""}.`
        : "لم يُعتمد أي طلب استئذان (راجع حالة الطلبات أو التواريخ).",
    },
  };
}

export async function parseHaduriExcel(
  file: File,
  ctx?: { fallbackDate?: string },
): Promise<AttendanceParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // الكشف المبكر: ملف استئذانات بصيغة فترة (YYYY-MM-DD_YYYY-MM-DD) أو ترويسة استئذانات.
  const range = extractDateRangeFromFilename(file.name);
  // فحص الترويسة في الورقة الأولى لتأكيد نوع الملف
  let isExcusesFile = false;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      const headers = matrix[i].map(normalizeHeader);
      if (looksLikeExcusesFile(file.name, headers)) { isExcusesFile = true; break; }
    }
    if (isExcusesFile) break;
  }
  if (isExcusesFile) {
    return parseExcusesExcel(file, range);
  }

  const teachers = new Map<string, TeacherRecord>();
  const importedDates = new Set<string>();
  const warnings: string[] = [];
  const dailyRows: DailyRecord[] = [];
  const recognizedSheets: string[] = [];
  const unrecognizedSheets: string[] = [];
  let attendanceRows = 0;
  const sheetReports: SheetReport[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    if (!matrix.length) continue;

    let headerRow = -1;
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      const row = matrix[i].map(normalizeHeader);
      const hasIdentity = findColIndex(row, NAME_KEYS) >= 0 || findColIndex(row, ID_KEYS, ID_DENY_KEYS) >= 0;
      const hasAttendanceSignal =
        findColIndex(row, IN_KEYS) >= 0 ||
        findColIndex(row, OUT_KEYS) >= 0 ||
        findColIndex(row, STATUS_KEYS, STATUS_DENY_KEYS) >= 0;
      if (hasIdentity && hasAttendanceSignal) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) {
      unrecognizedSheets.push(`${file.name} / ${sheetName}`);
      warnings.push(`لم يتم التعرف على أعمدة الحضور والانصراف في الشيت: ${sheetName}`);
      sheetReports.push({
        sheetName, recognized: false, headerRow: -1, detectedHeaders: [],
        mappedColumns: {}, rowsScanned: matrix.length, rowsAccepted: 0,
        detectedDate: "",
        reason: "لم يُعثر على ترويسة الحضور (الاسم/الهوية + وقت الحضور أو الانصراف).",
      });
      continue;
    }

    const headers = matrix[headerRow].map(normalizeHeader);
    const cName = findColIndex(headers, NAME_KEYS);
    const cId = findColIndex(headers, ID_KEYS, ID_DENY_KEYS);
    const cIn = findColIndex(headers, IN_KEYS);
    const cOut = findColIndex(headers, OUT_KEYS);
    const cDate = findColIndex(headers, DATE_KEYS);
    const cPhone = findColIndex(headers, PHONE_KEYS);
    const cSpec = findColIndex(headers, SPEC_KEYS);
    const cStatus = findColIndex(headers, STATUS_KEYS, STATUS_DENY_KEYS);
    const cPermDur = findColIndex(headers, PERM_DURATION_KEYS);

    if ((cName < 0 && cId < 0) || (cIn < 0 && cOut < 0 && cStatus < 0)) {
      unrecognizedSheets.push(`${file.name} / ${sheetName}`);
      warnings.push(`أعمدة الشيت غير كافية لاعتماد اليوم: ${sheetName}`);
      sheetReports.push({
        sheetName, recognized: false, headerRow,
        detectedHeaders: matrix[headerRow].map((c) => String(c ?? "")),
        mappedColumns: {}, rowsScanned: Math.max(0, matrix.length - headerRow - 1),
        rowsAccepted: 0, detectedDate: "",
        reason: "أعمدة غير كافية: ينقص الاسم/الهوية أو وقت الحضور/الانصراف/الحالة.",
      });
      continue;
    }
    recognizedSheets.push(`${file.name} / ${sheetName}`);

    // Detect file-level date (daily report case): no date column → use filename / sheet name / fallback
    let fileDateKey = extractDateFromFilename(file.name) || (ctx?.fallbackDate || "");
    if (cDate < 0) {
      if (!fileDateKey) {
        // try sheet title for things like "23" or "2026-04-23"
        fileDateKey = extractDateFromFilename(sheetName) || "";
      }
      if (!fileDateKey) {
        warnings.push(`لم يتم استخراج تاريخ اليوم من اسم الملف أو الشيت: ${file.name} / ${sheetName}`);
      }
    }
    let acceptedHere = 0;
    const sheetDates = new Set<string>();

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !row.length) continue;

      const name = cName >= 0 ? String(row[cName] || "").trim() : "";
      const idRaw = cId >= 0 ? row[cId] : "";
      const id = normalizeCivilId(idRaw);
      const normalizedName = normalizeHeader(name);
      if (/^(الاجمالي|اجمالي|المجموع|مجموع|total)$/i.test(normalizedName)) continue;
      if (findColIndex([normalizedName], NAME_KEYS) >= 0 || (id && findColIndex([normalizeHeader(idRaw)], ID_KEYS, ID_DENY_KEYS) >= 0)) continue;
      if (!name && !id) continue;
      // المفتاح الأساسي للجمع داخل الملف: الهوية (إن وُجدت).
      // عند غياب الهوية نعتمد الاسم؛ ولكن إذا كان عمود الهوية غير موجود أصلاً في الملف
      // (cId < 0) نُلحق رقم الصف بالاسم لمنع دمج معلمَين يحملان نفس الاسم في نفس الملف
      // (مثل اثنَين باسم «حسن الشهري»). إذا كان عمود الهوية موجوداً لكن خلية المعلم فارغة
      // فهذا غالباً سطر تابع لنفس المعلم، فنبقى على الاسم كمفتاح.
      const key = id ? id : (cId < 0 ? `${name}#row${r}` : name);

      const dateKey = cDate >= 0 ? (parseDateKey(row[cDate]) || fileDateKey) : fileDateKey;
      if (!dateKey) continue;
      attendanceRows++;

      let teacher = teachers.get(key);
      if (!teacher) {
        teacher = {
          name: name || "—",
          id: id || "—",
          phone: cPhone >= 0 ? normalizePhone(row[cPhone]) : "",
          spec: cSpec >= 0 ? String(row[cSpec] || "").trim() : "",
          days: new Map(),
        };
        teachers.set(key, teacher);
      } else {
        if ((!teacher.name || teacher.name === "—") && name) teacher.name = name;
        if ((!teacher.id || teacher.id === "—") && id) teacher.id = id;
        if (!teacher.phone && cPhone >= 0) teacher.phone = normalizePhone(row[cPhone]);
        if (!teacher.spec && cSpec >= 0) teacher.spec = String(row[cSpec] || "").trim();
      }

      const inMin = cIn >= 0 ? parseTimeToMinutes(row[cIn]) : null;
      const outMin = cOut >= 0 ? parseTimeToMinutes(row[cOut]) : null;
      const statusText = cStatus >= 0 ? String(row[cStatus] || "").trim() : "";
      const permDur = cPermDur >= 0 ? parseDurationToMinutes(row[cPermDur]) : null;
      if (inMin === null && outMin === null && !statusText && permDur === null) continue;
      if (isWeekendDay(dateKey)) continue;
      importedDates.add(dateKey);

      const day = teacher.days.get(dateKey) || {
        dateKey,
        inMin: null,
        outMin: null,
        statusRaw: "",
        permissionMin: 0,
      };
      if (inMin !== null) day.inMin = day.inMin === null ? inMin : Math.min(day.inMin, inMin);
      if (outMin !== null) day.outMin = day.outMin === null ? outMin : Math.max(day.outMin, outMin);

      if (statusText) day.statusRaw = day.statusRaw ? `${day.statusRaw} | ${statusText}` : statusText;

      if (permDur !== null) day.permissionMin += permDur;

      teacher.days.set(dateKey, day);
      acceptedHere++;
      sheetDates.add(dateKey);
    }
    sheetReports.push({
      sheetName, recognized: true, headerRow,
      detectedHeaders: matrix[headerRow].map((c) => String(c ?? "")),
      mappedColumns: {
        "الاسم": cName >= 0 ? String(matrix[headerRow][cName] ?? "") : null,
        "الهوية": cId >= 0 ? String(matrix[headerRow][cId] ?? "") : null,
        "وقت الحضور": cIn >= 0 ? String(matrix[headerRow][cIn] ?? "") : null,
        "وقت الانصراف": cOut >= 0 ? String(matrix[headerRow][cOut] ?? "") : null,
        "التاريخ": cDate >= 0 ? String(matrix[headerRow][cDate] ?? "") : null,
        "الحالة": cStatus >= 0 ? String(matrix[headerRow][cStatus] ?? "") : null,
        "الجوال": cPhone >= 0 ? String(matrix[headerRow][cPhone] ?? "") : null,
        "التخصص": cSpec >= 0 ? String(matrix[headerRow][cSpec] ?? "") : null,
      },
      rowsScanned: Math.max(0, matrix.length - headerRow - 1),
      rowsAccepted: acceptedHere,
      detectedDate: Array.from(sheetDates).sort().join(", ") || fileDateKey,
      reason: acceptedHere > 0
        ? "تم استخراج صفوف الحضور بنجاح."
        : (fileDateKey || cDate >= 0
            ? "لم يُعتمد أي صف (تحقّق من قيم الوقت/الحالة)."
            : "لم يُستخرج تاريخ من اسم الملف أو من الجدول أو من اسم المجلد."),
    });
  }

  // Build aggregated stats AND daily detailed rows
  const result: TeacherStats[] = [];
  for (const t of teachers.values()) {
    let workMin = 0;
    let lateMin = 0;
    let excuseMin = 0;
    let absentDays = 0;
    let openDays = 0;
    let presentDays = 0;
    const totalDays = t.days.size;

    for (const day of t.days.values()) {
      const isAbsent =
        /غياب/.test(day.statusRaw) ||
        (day.inMin === null && day.outMin === null && !/استئذان|إجازة/.test(day.statusRaw));

      let perDayLate = 0;
      let perDayWork = 0;
      let status: DailyRecord["status"] = "حضور";

      if (isAbsent) {
        absentDays++;
        status = "غياب";
      } else if (/استئذان/.test(day.statusRaw)) {
        status = "استئذان";
      } else if (day.inMin !== null && day.outMin === null) {
        openDays++;
        status = "لم يُغلق";
        perDayWork = HALF_DAY_WORK_MIN;
        workMin += perDayWork;
      } else if (day.inMin !== null && day.outMin !== null) {
        presentDays++;
        status = "حضور";
      }

      if (!isAbsent) {
        // اعتماد بداية الدوام الخاصة بأيام رمضان (09:30) في حال كان التاريخ ضمن قائمة الأيام المعتمدة
        const startForDay = isRamadanShiftDate(day.dateKey) ? RAMADAN_START_MIN : DEFAULT_START_MIN;
        if (day.inMin !== null && day.inMin > startForDay) {
          perDayLate = day.inMin - startForDay;
          lateMin += perDayLate;
          if (status === "حضور") status = "متأخر";
        }
        if (day.inMin !== null && day.outMin !== null) {
          perDayWork = Math.max(0, day.outMin - day.inMin);
          workMin += perDayWork;
        }
        excuseMin += day.permissionMin;
      }

      dailyRows.push({
        teacher_civil_id: t.id !== "—" ? t.id : "",
        teacher_name: t.name,
        teacher_phone: t.phone,
        specialization: t.spec,
        greg_date: day.dateKey,
        in_time: minutesToHHMMlocal(day.inMin),
        out_time: minutesToHHMMlocal(day.outMin),
        work_min: perDayWork,
        late_min: perDayLate,
        excuse_min: day.permissionMin,
        status,
        source_file: "",
      });
    }

    result.push({
      name: t.name,
      id: t.id,
      phone: t.phone,
      spec: t.spec,
      workMin,
      lateMin,
      excuseMin,
      absentDays,
      openDays,
      presentDays,
      totalDays,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  return {
    teachers: result,
    importedDates: Array.from(importedDates).sort(),
    warnings,
    daily: dailyRows,
    fileKind: "attendance",
    excuses: [],
    diagnostics: {
      recognizedSheets,
      unrecognizedSheets,
      attendanceRows,
      excuseRows: 0,
      validAttendanceDates: Array.from(importedDates).sort(),
      sheetReports,
      fileNamePattern: detectFileNamePattern(file.name),
      statusReason: importedDates.size > 0
        ? `ملف حضور: ${attendanceRows} صف · ${importedDates.size} يوم.`
        : "لم يُعتمد أي يوم حضور (راجع التواريخ والأعمدة في تفاصيل الورقة).",
    },
  };
}

export function minutesToHHMM(min: number): string {
  if (!min || min < 0) return "00:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Convert YYYY-MM-DD greg → "1447/10/06" Hijri (Umm al-Qura) */
export function gregToHijri(greg: string): string {
  if (!greg) return "";
  try {
    const d = new Date(greg + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const dd = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}/${m}/${dd}`;
  } catch {
    return "";
  }
}

export function arabicDayName(greg: string): string {
  if (!greg) return "";
  try {
    const d = new Date(greg + "T00:00:00");
    return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
  } catch {
    return "";
  }
}
