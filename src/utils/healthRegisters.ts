import { supabase } from "@/integrations/supabase/client";

export type FieldType = "text" | "textarea" | "number" | "select" | "date" | "boolean";

export interface RegisterField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  printable?: boolean; // show in printed table
  width?: string; // table column width
}

export interface RegisterConfig {
  id: string;
  table: string;
  title: string;
  subtitle: string;
  scope: "student" | "school"; // student-scoped (filtered by grade+section) or school-wide
  fields: RegisterField[];
  // For school-scoped: column to use as "title row" in the list
  titleField?: string; // e.g. program_name / location
  dateField?: string;  // e.g. program_date / inspection_date
}

export const HEALTH_REGISTERS: Record<string, RegisterConfig> = {
  "special-cases": {
    id: "special-cases",
    table: "student_special_health_cases",
    title: "سجل الطلاب ذوي الحالات الصحية الخاصة",
    subtitle: "تسجيل الحالات المزمنة والإعاقات والتكييفات المطلوبة وخطط الطوارئ.",
    scope: "student",
    fields: [
      { key: "case_category", label: "نوع الحالة", type: "select", required: true, printable: true, width: "16%",
        options: ["مرض مزمن","حساسية حادة","إعاقة حركية","إعاقة بصرية","إعاقة سمعية","صعوبات تعلم","اضطراب نفسي","حالة تستدعي متابعة","أخرى"] },
      { key: "case_severity", label: "الدرجة", type: "select", required: true, printable: true, width: "10%",
        options: ["low","medium","high"] },
      { key: "description", label: "وصف الحالة", type: "textarea", required: true, printable: true, width: "22%" },
      { key: "required_accommodations", label: "التكييفات المطلوبة", type: "textarea", printable: true, width: "18%" },
      { key: "emergency_plan", label: "خطة الطوارئ", type: "textarea", printable: true, width: "18%" },
      { key: "medications", label: "الأدوية", type: "text", printable: false },
      { key: "guardian_contact", label: "تواصل ولي الأمر", type: "text", printable: false },
      { key: "doctor_contact", label: "الطبيب المعالج", type: "text", printable: false },
      { key: "active", label: "حالة نشطة", type: "boolean", printable: true, width: "8%" },
    ],
  },
  "medical-referrals": {
    id: "medical-referrals",
    table: "student_health_referrals",
    title: "سجل التحويل والمتابعة الصحية",
    subtitle: "تحويلات الطلاب للجهات الصحية والمتابعة الناتجة عنها.",
    scope: "student",
    fields: [
      { key: "referral_date", label: "تاريخ التحويل", type: "date", required: true, printable: true, width: "12%" },
      { key: "referral_type", label: "جهة التحويل", type: "select", required: true, printable: true, width: "12%",
        options: ["مستشفى","مركز صحي","مرشد طلابي","مرشد صحي","عيادة خاصة","الدفاع المدني","أخرى"] },
      { key: "referred_to", label: "اسم الجهة", type: "text", printable: true, width: "16%" },
      { key: "reason", label: "سبب التحويل", type: "textarea", required: true, printable: true, width: "20%" },
      { key: "diagnosis", label: "التشخيص", type: "textarea", printable: true, width: "16%" },
      { key: "follow_up_result", label: "نتيجة المتابعة", type: "textarea", printable: true, width: "16%" },
      { key: "status", label: "الحالة", type: "select", required: true, printable: true, width: "8%",
        options: ["open","in_progress","closed"] },
      { key: "attachments", label: "المرفقات / ملاحظات", type: "textarea", printable: false },
    ],
  },
  "medical-absences": {
    id: "medical-absences",
    table: "student_medical_absences",
    title: "سجل الغياب المرضي",
    subtitle: "حالات الغياب المرضي مع التشخيص والتقارير الطبية المرفقة.",
    scope: "student",
    fields: [
      { key: "start_date", label: "من تاريخ", type: "date", required: true, printable: true, width: "12%" },
      { key: "end_date", label: "إلى تاريخ", type: "date", required: true, printable: true, width: "12%" },
      { key: "days_count", label: "عدد الأيام", type: "number", required: true, printable: true, width: "8%" },
      { key: "diagnosis", label: "التشخيص", type: "textarea", printable: true, width: "26%" },
      { key: "report_source", label: "مصدر التقرير", type: "text", printable: true, width: "14%" },
      { key: "medical_report_provided", label: "تقرير طبي مرفق", type: "boolean", printable: true, width: "10%" },
      { key: "excused", label: "بعذر مقبول", type: "boolean", printable: true, width: "10%" },
      { key: "notes", label: "ملاحظات", type: "textarea", printable: false },
    ],
  },
  "guardian-contacts": {
    id: "guardian-contacts",
    table: "health_guardian_contacts",
    title: "سجل التواصل مع أولياء الأمور (الحالات الصحية)",
    subtitle: "توثيق المكالمات والرسائل الصحية المرسلة لولي الأمر وردوده.",
    scope: "student",
    fields: [
      { key: "contact_date", label: "تاريخ التواصل", type: "date", required: true, printable: true, width: "12%" },
      { key: "contact_method", label: "وسيلة التواصل", type: "select", required: true, printable: true, width: "12%",
        options: ["مكالمة هاتفية","رسالة نصية","واتساب","حضور لولي الأمر","رسالة رسمية"] },
      { key: "health_reason", label: "السبب الصحي", type: "text", required: true, printable: true, width: "20%" },
      { key: "message_summary", label: "ملخص ما تم", type: "textarea", required: true, printable: true, width: "24%" },
      { key: "guardian_response", label: "رد ولي الأمر", type: "textarea", printable: true, width: "16%" },
      { key: "action_taken", label: "الإجراء المتخذ", type: "textarea", printable: true, width: "16%" },
    ],
  },
  "awareness": {
    id: "awareness",
    table: "health_awareness_programs",
    title: "سجل التوعية والبرامج الصحية",
    subtitle: "البرامج والمحاضرات والأركان التوعوية الصحية المنفذة في المدرسة.",
    scope: "school",
    titleField: "program_name",
    dateField: "program_date",
    fields: [
      { key: "program_name", label: "اسم البرنامج", type: "text", required: true, printable: true, width: "22%" },
      { key: "program_type", label: "نوع البرنامج", type: "select", required: true, printable: true, width: "12%",
        options: ["محاضرة","ورشة","حملة","ركن توعوي","نشرة","فيلم تعريفي","يوم صحي","أخرى"] },
      { key: "program_date", label: "التاريخ الميلادي", type: "date", required: true, printable: true, width: "11%" },
      { key: "hijri_date", label: "التاريخ الهجري", type: "text", printable: true, width: "12%" },
      { key: "target_audience", label: "الفئة المستهدفة", type: "text", required: true, printable: true, width: "13%" },
      { key: "beneficiaries_count", label: "عدد المستفيدين", type: "number", printable: true, width: "8%" },
      { key: "presenter", label: "المنفذ", type: "text", printable: true, width: "12%" },
      { key: "partner_entity", label: "الجهة الشريكة", type: "text", printable: false },
      { key: "objectives", label: "الأهداف", type: "textarea", printable: false },
      { key: "outcomes", label: "المخرجات والنتائج", type: "textarea", printable: false },
      { key: "notes", label: "ملاحظات", type: "textarea", printable: false },
    ],
  },
  "environment": {
    id: "environment",
    table: "school_environment_health_log",
    title: "سجل البيئة والصحة المدرسية",
    subtitle: "جولات تفقد دورات المياه والمقصف والفصول والمرافق المدرسية.",
    scope: "school",
    titleField: "location",
    dateField: "inspection_date",
    fields: [
      { key: "inspection_date", label: "تاريخ الجولة", type: "date", required: true, printable: true, width: "12%" },
      { key: "hijri_date", label: "التاريخ الهجري", type: "text", printable: true, width: "12%" },
      { key: "location", label: "الموقع", type: "select", required: true, printable: true, width: "14%",
        options: ["دورات المياه","المقصف","الفصول","الممرات","الفناء","صالة الرياضة","المختبرات","المسجد","الإدارة","المداخل","أخرى"] },
      { key: "inspection_type", label: "نوع الفحص", type: "select", printable: true, width: "10%",
        options: ["دورية","مفاجئة","شكوى","حادثة"] },
      { key: "observations", label: "الملاحظات", type: "textarea", required: true, printable: true, width: "20%" },
      { key: "risk_level", label: "مستوى الخطورة", type: "select", required: true, printable: true, width: "10%",
        options: ["low","medium","high"] },
      { key: "action_taken", label: "الإجراء المتخذ", type: "textarea", printable: true, width: "14%" },
      { key: "responsible_person", label: "المسؤول", type: "text", printable: true, width: "12%" },
      { key: "status", label: "الحالة", type: "select", required: true, printable: true, width: "8%",
        options: ["open","in_progress","closed"] },
    ],
  },
  "emergencies": {
    id: "emergencies",
    table: "student_health_services",
    title: "سجل الحالات الطارئة والإسعافات الأولية",
    subtitle: "توثيق الإسعافات والخدمات الصحية المقدمة للطلاب.",
    scope: "student",
    fields: [
      { key: "service_date", label: "التاريخ", type: "date", required: true, printable: true, width: "12%" },
      { key: "service_type", label: "نوع الخدمة", type: "select", required: true, printable: true, width: "16%",
        options: ["إسعافات أولية","صرف دواء","متابعة حالة مزمنة","قياس مؤشرات حيوية","إصابة / جرح","ارتفاع حرارة","صداع","آلام بطن","إغماء / دوخة","أزمة ربو","نوبة سكر","نوبة صرع","حساسية طارئة","إحالة لمستشفى","إبلاغ ولي الأمر","توعية صحية","أخرى"] },
      { key: "related_condition", label: "الحالة المرتبطة", type: "text", printable: true, width: "14%" },
      { key: "description", label: "وصف الحالة", type: "textarea", required: true, printable: true, width: "22%" },
      { key: "action_taken", label: "الإجراء المتخذ", type: "textarea", printable: true, width: "20%" },
      { key: "follow_up", label: "المتابعة", type: "textarea", printable: false },
      { key: "guardian_notified", label: "تم إبلاغ ولي الأمر", type: "boolean", printable: true, width: "10%" },
    ],
  },
};

export const STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المتابعة",
  closed: "مغلقة",
  low: "بسيطة",
  medium: "متوسطة",
  high: "خطرة",
};

export const labelOf = (v: any) => (typeof v === "string" && STATUS_LABELS[v]) ? STATUS_LABELS[v] : (v ?? "");

export const fetchRegisterRowsBySection = async (
  table: string, gradeCode: string, section: number,
) => {
  const { data, error } = await (supabase as any)
    .from(table).select("*").eq("grade_code", gradeCode).eq("section", section)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const fetchRegisterRowsAll = async (table: string) => {
  const { data, error } = await (supabase as any)
    .from(table).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const upsertRegisterRow = async (table: string, row: Record<string, any>) => {
  if (row.id) {
    const { id, ...rest } = row;
    const { error } = await (supabase as any).from(table).update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from(table).insert(row);
    if (error) throw error;
  }
};

export const deleteRegisterRow = async (table: string, id: string) => {
  const { error } = await (supabase as any).from(table).delete().eq("id", id);
  if (error) throw error;
};
