export interface Student {
  id: string;
  name: string;
  studentNumber: string;
  grade: string;
  gradeCode: string;
  section: number;
  guardianPhone: string;
  absences: number;
  lateCount: number;
  violations: number;
}

export type ActionType = "late" | "absent" | "violation" | "permission" | "entry" | "exit" | "summon"
  | "class_late" | "class_escape" | "class_chaos" | "no_homework" | "sleeping" | "class_note";

export interface StudentAction {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  grade: string;
  section: number;
  type: ActionType;
  date: string;
  time: string;
  description: string;
  violationDegree?: 1 | 2 | 3 | 4 | 5;
  violationCategory?: string;
  guardianPhone: string;
  messageSent?: boolean;
  performedById?: string;
  performedByName?: string;
  performedByRole?: string;
  period?: number;
  subjectName?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  status: "present" | "absent" | "late";
  note?: string;
}

export interface Violation {
  id: string;
  studentId: string;
  studentName: string;
  type: string;
  date: string;
  description: string;
  severity: "low" | "medium" | "high";
}

export interface Message {
  id: string;
  studentId: string;
  studentName: string;
  guardianName: string;
  content: string;
  date: string;
  type: "sent" | "received";
}

// تصنيف المخالفات وفق قواعد السلوك والمواظبة - الإصدار الخامس 1447هـ
// المرحلة الثانوية (المواد 10-14)
export const VIOLATION_DEGREES: Record<number, { label: string; points: number; color: "warning" | "destructive"; procedureLabel: string }> = {
  1: { label: "الدرجة الأولى", points: 1, color: "warning", procedureLabel: "تنبيه شفهي وتدوين" },
  2: { label: "الدرجة الثانية", points: 2, color: "warning", procedureLabel: "إشعار ولي الأمر وحسم درجتين" },
  3: { label: "الدرجة الثالثة", points: 3, color: "destructive", procedureLabel: "تعهد خطي وحسم ثلاث درجات" },
  4: { label: "الدرجة الرابعة", points: 10, color: "destructive", procedureLabel: "حسم عشر درجات ونقل فصل" },
  5: { label: "الدرجة الخامسة", points: 15, color: "destructive", procedureLabel: "حسم خمس عشرة درجة ونقل مدرسة" },
};

export const VIOLATION_CATEGORIES: Record<string, string[]> = {
  degree1: [
    "عدم التقيد بالزي السعودي / مظهر خارجي مخالف",
    "التأخر عن الاصطفاف الصباحي",
    "عدم حضور الاصطفاف الصباحي",
    "العبث أثناء الاصطفاف الصباحي",
    "الخروج من الفصل دون استئذان",
    "التأخر عن الحصة الدراسية",
    "تناول الأطعمة أو المشروبات أثناء الدرس بدون إذن",
    "النوم داخل الفصل",
    "تكرار الخروج والدخول من البوابة قبل وقت الحضور",
    "التجمهر أمام بوابة المدرسة",
    "حيازة هاتف محمول خلاف تنظيم المدرسة",
    "اللعب داخل الصف / إعاقة سير الحصة",
  ],
  degree2: [
    "عدم الحضور أو الدخول دون استئذان",
    "إثارة الفوضى داخل الفصل أو المدرسة",
    "دخول فصل آخر دون استئذان",
    "استخدام الوسائل المدرسية بطريقة خاطئة",
  ],
  degree3: [
    "عدم التقيد بالزي المدرسي (تكرار)",
    "الشجار أو الاشتراك في مضاربة جماعية",
    "الإشارة بحركات مخلة بالأدب تجاه الطلبة",
    "التلفظ بألفاظ نابية على الطلبة أو تهديدهم",
    "إلحاق الضرر المتعمد بممتلكات الطلبة",
    "العبث بتجهيزات المدرسة أو ممتلكاتها",
    "سرقة شيء من ممتلكات الطلبة أو المدرسة",
    "التصوير أو التسجيل الصوتي للطلبة بدون إذن",
    "إحضار أو استخدام المواد أو الألعاب الخطرة",
    "مصادرة ما بحوزة الطالب من مواد ممنوعة",
    "الهروب من المدرسة",
    "إتلاف الكتب الدراسية",
    "التوقيع عن ولي الأمر بدون علمه",
    "الكتابة على الجدران وغيرها",
  ],
  degree4: [
    "إصابة أحد الطلبة بالضرب عمداً",
    "سرقة ممتلكات الطلبة أو المدرسة (جسيمة)",
    "إلحاق الضرر المتعمد بتجهيزات المدرسة والأجهزة",
    "استخدام أو إحضار مواد أو ألعاب خطرة (نارية، بخاخات حارقة)",
    "التدخين بأنواعه داخل المدرسة",
    "الهروب من المدرسة (تكرار)",
    "عرض أو توزيع المواد الإعلامية الممنوعة",
    "التصوير أو التسجيل الصوتي للطلبة ونشرها",
  ],
  degree5: [
    "الإساءة أو الاستهزاء بشعائر الإسلام",
    "الإساءة للدولة أو رموزها",
    "بث أو ترويج أفكار متطرفة أو تكفيرية",
    "إثارة الفتن القبلية أو الطائفية أو المذهبية",
    "التحرش الجسدي",
    "إشعال الحرائق داخل المدرسة",
    "حيازة آلة حادة (كالسكاكين)",
    "حيازة أو ترويج أو تعاطي المخدرات أو المسكرات",
    "الجرائم المعلوماتية بكافة أنواعها",
    "الترويج للشذوذ أو المظاهر الدالة عليه",
    "ابتزاز الطلبة",
    "التنمر بكافة أشكاله وأنواعه",
    "تزوير الوثائق الرسمية أو المدرسية",
  ],
};

// الإجراءات العلاجية التربوية لكل درجة
export const VIOLATION_PROCEDURES: Record<number, string[]> = {
  1: [
    "التنبيه الشفهي الأول من المعلم أو إدارة المدرسة",
    "توضيح أضرار السلوك غير المرغوب بأسلوب تربوي",
    "تدوين المشكلة السلوكية من المعلم المباشر",
    "حسم درجة واحدة من درجات السلوك الإيجابي",
    "إشعار ولي الأمر هاتفياً بالمشكلة السلوكية",
    "تحويل الطالب إلى الموجه الطلابي لدراسة الحالة",
  ],
  2: [
    "جميع ما ذكر في الإجراء الأول",
    "إشعار ولي الأمر هاتفياً بالمشكلة والإجراءات المتخذة",
    "حسم درجتين من درجات السلوك الإيجابي",
    "أخذ تعهد خطي على الطالب بعدم تكرار المخالفة",
    "إحالة الطالب إلى الموجه الطلابي لدراسة الحالة",
  ],
  3: [
    "تحويل الطالب إلى إدارة المدرسة",
    "دعوة ولي الأمر ومناقشة خطة تعديل السلوك",
    "وضع برنامج وقائي مشترك مع الأسرة",
    "أخذ تعهد خطي على الطالب بعدم تكرار السلوك",
    "حسم ثلاث درجات من درجات السلوك الإيجابي",
    "الاعتذار إلى من أسيء إليهم",
    "إحالة الطالب إلى الموجه الطلابي ومتابعة الحالة",
  ],
  4: [
    "تحويل الطالب إلى إدارة المدرسة",
    "دعوة ولي الأمر وتوضيح الإجراءات المترتبة",
    "حسم عشر درجات من درجات السلوك الإيجابي",
    "إنذار الطالب بالنقل إلى مدرسة أخرى في حالة التكرار",
    "نقل الطالب إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي",
    "متابعة الحالة من الموجه الطلابي وتقديم الخدمات التربوية",
  ],
  5: [
    "تدوين محضر إثبات الواقعة من إدارة المدرسة",
    "دعوة ولي الأمر وتبليغه بالمشكلة والإجراءات",
    "حسم خمس عشرة درجة من درجات السلوك الإيجابي",
    "اجتماع لجنة التوجيه الطلابي بالمدرسة فوراً",
    "رفع محضر اجتماع اللجنة إلى إدارة التعليم رسمياً وبصفة عاجلة",
    "إصدار قرار نقل الطالب إلى مدرسة أخرى من مدير التعليم",
    "تبليغ الجهات الأمنية المختصة فور وقوع المشكلة",
    "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها",
  ],
};

// نظام تقييم السلوك - 100 درجة
export const BEHAVIOR_SCORING = {
  totalScore: 100,
  positiveScore: 80,
  distinguishedScore: 20,
};

export const ACTION_LABELS: Record<ActionType, string> = {
  late: "تأخر",
  absent: "غياب",
  violation: "مخالفة",
  permission: "استئذان",
  entry: "دخول فصل",
  exit: "خروج من فصل",
  summon: "استدعاء ولي أمر",
  class_late: "تأخر عن الحصة",
  class_escape: "هروب من الحصة",
  class_chaos: "إثارة فوضى",
  no_homework: "عدم إحضار الواجبات",
  sleeping: "نوم داخل الحصة",
  class_note: "ملاحظة صفية",
};

export const ACTION_COLORS: Record<ActionType, string> = {
  late: "bg-warning/10 text-warning",
  absent: "bg-destructive/10 text-destructive",
  violation: "bg-destructive/15 text-destructive",
  permission: "bg-accent/10 text-accent",
  entry: "bg-success/10 text-success",
  exit: "bg-primary/10 text-primary",
  summon: "bg-secondary/15 text-secondary-foreground",
  class_late: "bg-warning/10 text-warning",
  class_escape: "bg-destructive/10 text-destructive",
  class_chaos: "bg-destructive/15 text-destructive",
  no_homework: "bg-secondary/10 text-secondary-foreground",
  sleeping: "bg-muted text-muted-foreground",
  class_note: "bg-primary/10 text-primary",
};

// Classroom action types
export const CLASSROOM_ACTION_TYPES: ActionType[] = [
  "class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"
];

export const SCHOOL_INFO = {
  kingdom: "المملكة العربية السعودية",
  ministry: "وزارة التعليم",
  generalAdmin: "الإدارة العامة للتعليم بالمنطقة الشرقية",
  sector: "قطاع التعليم بالخبر",
  region: "الإدارة العامة للتعليم بالمنطقة الشرقية",
  school: "ثانوية اليعقوبي بالخبر - مسارات",
  schoolShort: "ثانوية اليعقوبي بالخبر",
  viceTitle: "وكيل شؤون الطلاب",
  viceName: "عدنان علي الزريق",
  principal: "فهد حامد الزهراني",
  principalTitle: "مدير المدرسة",
};