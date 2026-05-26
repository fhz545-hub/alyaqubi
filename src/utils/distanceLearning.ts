// تصنيف طلاب التعليم الإلكتروني (انتساب)
// يتم استبعادهم من إحصاءات الطلاب المنتظمين والمؤشرات والسلوك الإيجابي
//
// القاعدة المعتمدة:
//  - الصف الأول الثانوي  (1314): الشعبة 8
//  - الصف الثاني الثانوي (1416): الشعبة 6
//  - الصف الثالث الثانوي (1516): الشعبة 6

export const DISTANCE_LEARNING_LABEL = "تعليم إلكتروني (انتساب)";

// خريطة افتراضية (تستخدم عند عدم تحديد إعداد مخصص من المدير)
const DEFAULT_DISTANCE_LEARNING_MAP: Record<string, number[]> = {
  "1314": 8,
  "1416": 6,
  "1516": 6,
} as unknown as Record<string, number[]>;
// تطبيع الصيغة لتكون قائمة شعب لكل صف
const DEFAULT_MAP: Record<string, number[]> = {
  "1314": [8],
  "1416": [6],
  "1516": [6],
};

// نسخة قابلة للتحديث في وقت التشغيل من إعدادات المدرسة
let DYNAMIC_MAP: Record<string, number[]> | null = null;

/**
 * يضبط القائمة الديناميكية من إعدادات المدرسة.
 * إذا تم تمرير قائمة فارغة، نعود للقيم الافتراضية.
 */
export const setDynamicDistanceSections = (
  sections: { gradeCode: string; section: number }[] | null | undefined
) => {
  if (!sections || sections.length === 0) {
    DYNAMIC_MAP = null;
    return;
  }
  const map: Record<string, number[]> = {};
  for (const s of sections) {
    const code = String(s.gradeCode || "").trim();
    const sec = Number(s.section);
    if (!code || !Number.isFinite(sec)) continue;
    if (!map[code]) map[code] = [];
    if (!map[code].includes(sec)) map[code].push(sec);
  }
  DYNAMIC_MAP = map;
};

const getActiveMap = (): Record<string, number[]> => DYNAMIC_MAP || DEFAULT_MAP;

// فترة الاختبارات النهائية للفصل الدراسي الثاني 1447/1448هـ
// أثناء هذه الفترة فقط يُحتسب طلاب الانتساب ضمن المواظبة والسلوك اليومي
export const FINAL_EXAMS_PERIOD = {
  start: "2026-06-21", // بداية الأسبوع 19 — الاختبارات التحريرية النهائية
  end:   "2026-06-30", // نهاية فترة الاختبارات (شامل)
};

/**
 * هل التاريخ المعطى يقع داخل فترة الاختبارات النهائية؟
 * نتعامل مع التاريخ على شكل YYYY-MM-DD لمقارنة معجمية صحيحة.
 */
export const isExamPeriod = (date: string | Date | undefined | null): boolean => {
  if (!date) return false;
  const iso =
    typeof date === "string"
      ? date.slice(0, 10)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return iso >= FINAL_EXAMS_PERIOD.start && iso <= FINAL_EXAMS_PERIOD.end;
};

/**
 * هل يجب احتساب هذا الإجراء/الطالب ضمن إحصاءات اليوم الدراسي؟
 * طالب الانتساب لا يُحتسب إلا في فترة الاختبارات النهائية.
 * أي طالب آخر يُحتسب دائماً.
 */
export const shouldCountForDate = (
  gradeOrCode: string | undefined | null,
  section: number | string | undefined | null,
  date: string | Date | undefined | null
): boolean => {
  if (!isDistanceLearning(gradeOrCode, section)) return true;
  return isExamPeriod(date);
};

export const isDistanceLearning = (
  gradeOrCode: string | undefined | null,
  section: number | string | undefined | null
): boolean => {
  if (!gradeOrCode || section === undefined || section === null) return false;
  const sec = typeof section === "string" ? Number(section) : section;
  if (!Number.isFinite(sec)) return false;
  const code = String(gradeOrCode).trim();
  const map = getActiveMap();
  // مطابقة عبر رمز الصف
  if (code in map) {
    return map[code].includes(sec);
  }
  // fallback: مطابقة عبر الاسم العربي عند تمرير اسم الصف بدلاً من الرمز
  const nameToCode = code.includes("الأول") || code.includes("أول")
    ? "1314"
    : code.includes("الثالث") || code.includes("ثالث")
    ? "1516"
    : code.includes("الثاني") || code.includes("ثاني")
    ? "1416"
    : null;
  if (nameToCode && map[nameToCode]?.includes(sec)) return true;
  return false;
};

// مرشّح عام يعمل على أي كائن يحتوي gradeCode/grade و section
export const filterRegularStudents = <T extends { gradeCode?: string; grade?: string; section: number }>(
  list: T[]
): T[] => list.filter((s) => !isDistanceLearning(s.gradeCode || s.grade, s.section));

// عكس المرشّح
export const filterDistanceLearningStudents = <T extends { gradeCode?: string; grade?: string; section: number }>(
  list: T[]
): T[] => list.filter((s) => isDistanceLearning(s.gradeCode || s.grade, s.section));
