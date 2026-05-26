import { Student, ActionType } from "@/types/school";

const SCHOOL = "اليعقوبي";
export const SMS_MAX_LENGTH = 70;

const DAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

const getDateStr = (): string => {
  const now = new Date();
  const d = DAYS[now.getDay()];
  const dd = now.getDate();
  const mm = now.getMonth() + 1;
  return `${d} ${dd}/${mm}`;
};

const getTimeStr = (): string => {
  const now = new Date();
  const h = now.getHours() % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, "0");
  const p = now.getHours() < 12 ? "ص" : "م";
  return `${h}:${m}${p}`;
};

export const getStudentFirstName = (fullName: string): string => {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "الطالب";
  return normalized.split(" ")[0] || normalized;
};

export const ensureSmsMaxLength = (message: string): string => {
  const cleaned = String(message || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length <= SMS_MAX_LENGTH) return cleaned;
  return cleaned.slice(0, SMS_MAX_LENGTH).trimEnd();
};

// === قوالب الغياب والتأخر - الصيغة المعتمدة ===
// ولي أمر [الاسم الأول]: سُجل [غياب/تأخر] اليوم [التاريخ]. نأمل المتابعة. اليعقوبي
const LATE_TEMPLATE = (name: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: سُجل تأخر اليوم ${date}. نأمل المتابعة. ${SCHOOL}`);

const ABSENT_TEMPLATE = (name: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: سُجل غياب اليوم ${date}. نأمل المتابعة. ${SCHOOL}`);

// بعذر - لا تُرسل رسالة (يتم تخطيها) لكن نحتفظ بالقالب للأرشيف
const ABSENT_EXCUSED_TEMPLATE = (name: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: غاب بعذر اليوم ${date}. ${SCHOOL}`);

const ABSENT_UNEXCUSED_TEMPLATE = (name: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: سُجل غياب بدون عذر ${date}. نأمل المتابعة. ${SCHOOL}`);

const LATE_EXCUSED_TEMPLATE = (name: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: تأخر بعذر اليوم ${date}. ${SCHOOL}`);

const LATE_UNEXCUSED_TEMPLATE = (name: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: سُجل تأخر بدون عذر ${date}. نأمل المتابعة. ${SCHOOL}`);

const PERMISSION_TEMPLATE = (name: string, time: string, date: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: استأذن اليوم ${date} س${time}. ${SCHOOL}`);

// === مخالفات متدرجة بالدرجة ===
const VIOLATION_BY_DEGREE: Record<number, (name: string) => string> = {
  1: (name) => ensureSmsMaxLength(`ولي أمر ${name}: مخالفة أولى، نأمل المتابعة. ${SCHOOL}`),
  2: (name) => ensureSmsMaxLength(`ولي أمر ${name}: مخالفة ثانية، يلزم تعاونكم. ${SCHOOL}`),
  3: (name) => ensureSmsMaxLength(`ولي أمر ${name}: مخالفة ثالثة، نأمل حضوركم. ${SCHOOL}`),
  4: (name) => ensureSmsMaxLength(`ولي أمر ${name}: مخالفة رابعة، الحضور ضروري. ${SCHOOL}`),
  5: (name) => ensureSmsMaxLength(`ولي أمر ${name}: مخالفة خطيرة، الحضور فورًا. ${SCHOOL}`),
};

const CLASS_NOTE_TEMPLATES: Record<string, (name: string) => string> = {
  class_late: (name) => ensureSmsMaxLength(`ولي أمر ${name}: تأخر عن الحصة. ${SCHOOL}`),
  class_escape: (name) => ensureSmsMaxLength(`ولي أمر ${name}: خروج من الحصة. ${SCHOOL}`),
  class_chaos: (name) => ensureSmsMaxLength(`ولي أمر ${name}: سلوك صفي غير منضبط. ${SCHOOL}`),
  no_homework: (name) => ensureSmsMaxLength(`ولي أمر ${name}: لم يحضر الواجب. ${SCHOOL}`),
  sleeping: (name) => ensureSmsMaxLength(`ولي أمر ${name}: نوم أثناء الحصة. ${SCHOOL}`),
  class_note: (name) => ensureSmsMaxLength(`ولي أمر ${name}: ملاحظة صفية. ${SCHOOL}`),
};

// === تكرار (الأكثر) ===
export const FREQUENCY_TEMPLATES = {
  late: (name: string, count: number) => ensureSmsMaxLength(`ولي أمر ${name}: تكرر التأخر (${count}). نأمل المتابعة. ${SCHOOL}`),
  absent: (name: string, count: number) => ensureSmsMaxLength(`ولي أمر ${name}: تكرر الغياب (${count}). نأمل المتابعة. ${SCHOOL}`),
  violation: (name: string, count: number) => ensureSmsMaxLength(`ولي أمر ${name}: تكررت المخالفة (${count}). نأمل حضوركم. ${SCHOOL}`),
  class_note: (name: string, count: number) => ensureSmsMaxLength(`ولي أمر ${name}: تكررت الملاحظات (${count}). ${SCHOOL}`),
  permission: (name: string, count: number) => ensureSmsMaxLength(`ولي أمر ${name}: تكرر الاستئذان (${count}). نأمل المتابعة. ${SCHOOL}`),
};

export const EXIT_TEMPLATE = (name: string) =>
  ensureSmsMaxLength(`ولي أمر ${name}: خرج من المدرسة ${getTimeStr()}. ${SCHOOL}`);

export const BROADCAST_TEMPLATE = (message: string) =>
  ensureSmsMaxLength(`${message} ${SCHOOL}`);

// === قوالب الرسائل العامة - تربوية مقننة على 70 حرف ===
export const READY_TEMPLATES = [
  // تعزيز السلوك
  { key: "behavior_positive", label: "تعزيز سلوك", category: "تعزيز", text: "نشكر تعاونكم في متابعة سلوك ابنكم الإيجابي. اليعقوبي" },
  { key: "behavior_excellence", label: "تميز سلوكي", category: "تعزيز", text: "نبارك لكم تميز ابنكم السلوكي ونأمل استمراره. اليعقوبي" },
  { key: "behavior_thanks", label: "شكر ولي أمر", category: "تعزيز", text: "نقدر حرصكم ومتابعتكم لابنكم. شكرًا لتعاونكم. اليعقوبي" },
  // الحث على المذاكرة
  { key: "study_encourage", label: "حث على المذاكرة", category: "دراسة", text: "نأمل متابعة مذاكرة ابنكم والاهتمام بواجباته. اليعقوبي" },
  { key: "study_exams", label: "استعداد اختبارات", category: "دراسة", text: "الاختبارات قريبة. نأمل متابعة المذاكرة والاستعداد. اليعقوبي" },
  { key: "study_homework", label: "متابعة واجبات", category: "دراسة", text: "نأمل التأكد من أداء الواجبات المدرسية يوميًا. اليعقوبي" },
  // الانصراف
  { key: "exit_dismissal", label: "انصراف", category: "انصراف", text: "تم انصراف الطلاب. نأمل استقبال ابنكم. اليعقوبي" },
  { key: "exit_early", label: "انصراف مبكر", category: "انصراف", text: "سيتم الانصراف مبكرًا اليوم. نأمل الاستعداد. اليعقوبي" },
  // نصائح تربوية
  { key: "advice_sleep", label: "نصيحة النوم", category: "نصائح", text: "نأمل الحرص على نوم ابنكم مبكرًا لضمان نشاطه. اليعقوبي" },
  { key: "advice_phone", label: "متابعة الجوال", category: "نصائح", text: "ننصح بتنظيم استخدام ابنكم للجوال أثناء المذاكرة. اليعقوبي" },
  { key: "advice_breakfast", label: "الفطور", category: "نصائح", text: "الفطور مهم لتركيز ابنكم. نأمل الحرص عليه يوميًا. اليعقوبي" },
  // إجرائية
  { key: "meeting_parent", label: "دعوة حضور", category: "إجرائي", text: "نأمل حضوركم للمدرسة لأمر يخص ابنكم. اليعقوبي" },
  { key: "meeting_council", label: "مجلس آباء", category: "إجرائي", text: "ندعوكم لحضور مجلس الآباء والمعلمين. اليعقوبي" },
  { key: "docs_required", label: "مستندات مطلوبة", category: "إجرائي", text: "يوجد مستندات مطلوبة لابنكم. نأمل مراجعة المدرسة. اليعقوبي" },
  { key: "general_reminder", label: "تذكير عام", category: "عام", text: "تذكير بمتابعة مستوى ابنكم الدراسي والسلوكي. اليعقوبي" },
];

export const BROADCAST_CATEGORIES = [
  { key: "all", label: "جميع القوالب" },
  { key: "تعزيز", label: "تعزيز السلوك" },
  { key: "دراسة", label: "الحث على المذاكرة" },
  { key: "انصراف", label: "الانصراف" },
  { key: "نصائح", label: "نصائح تربوية" },
  { key: "إجرائي", label: "إجرائية" },
  { key: "عام", label: "عام" },
];

export const generateSmsTemplate = (
  student: Student,
  actionType: ActionType | string,
  details?: { violationCategory?: string; violationDegree?: number },
): string => {
  const name = getStudentFirstName(student.name);
  const date = getDateStr();

  // Class note types
  if (CLASS_NOTE_TEMPLATES[actionType]) {
    return CLASS_NOTE_TEMPLATES[actionType](name);
  }

  switch (actionType) {
    case "late":
      return LATE_TEMPLATE(name, date);
    case "late_excused":
      return LATE_EXCUSED_TEMPLATE(name, date);
    case "late_unexcused":
      return LATE_UNEXCUSED_TEMPLATE(name, date);
    case "absent":
      return ABSENT_TEMPLATE(name, date);
    case "absent_excused":
      return ABSENT_EXCUSED_TEMPLATE(name, date);
    case "absent_unexcused":
      return ABSENT_UNEXCUSED_TEMPLATE(name, date);
    case "violation": {
      const degree = details?.violationDegree || 1;
      const template = VIOLATION_BY_DEGREE[degree] || VIOLATION_BY_DEGREE[1];
      return template(name);
    }
    case "permission":
      return PERMISSION_TEMPLATE(name, getTimeStr(), date);
    default:
      return ensureSmsMaxLength(`ولي أمر ${name}: ${SCHOOL}`);
  }
};

export const SMS_TABS = [
  { key: "late" as const, label: "المتأخرون" },
  { key: "absent" as const, label: "الغائبون" },
  { key: "violation" as const, label: "المخالفات" },
  { key: "permission" as const, label: "المستأذنون" },
  { key: "class_notes" as const, label: "ملاحظات صفية" },
  { key: "frequency" as const, label: "الأكثر تكراراً" },
  { key: "broadcast" as const, label: "رسائل عامة" },
  { key: "alerts" as const, label: "تنبيهات" },
] as const;

export type SmsTabKey = typeof SMS_TABS[number]["key"];
