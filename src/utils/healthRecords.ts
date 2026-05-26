import { supabase } from "@/integrations/supabase/client";

export type HealthSeverity = "low" | "medium" | "high";

export const HEALTH_CONDITION_TYPES = [
  "سكر",
  "صرع",
  "ربو",
  "أنيميا",
  "حساسية جلد حادة",
  "أمراض القلب",
  "حساسية القمح",
  "منجلي",
  "أمراض مصنفة",
  "ضغط الدم",
  "حساسية غذائية",
  "حساسية الأدوية",
  "حساسية الأنف / الجيوب",
  "اضطرابات الغدة الدرقية",
  "أمراض الكلى",
  "أمراض الكبد",
  "اضطرابات نفسية",
  "اضطرابات النطق",
  "ضعف بصر",
  "ضعف سمع",
  "إعاقة / احتياج خاص",
  "متابعة دوائية",
  "حالة طارئة",
  "ملاحظة عامة",
] as const;

export const SEVERITY_LABELS: Record<HealthSeverity, string> = {
  low: "بسيطة",
  medium: "متوسطة",
  high: "خطرة",
};

export interface HealthRecord {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string;
  grade: string;
  grade_code: string;
  section: number;
  condition_type: string;
  description: string;
  medications: string;
  emergency_contact: string;
  severity: HealthSeverity;
  recorded_by: string | null;
  recorded_by_name: string;
  recorded_by_role: string;
  created_at: string;
  updated_at: string;
}

export interface VitalSigns {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string;
  grade: string;
  grade_code: string;
  section: number;
  academic_year: string;
  term: 1 | 2;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  notes: string;
  recorded_by: string | null;
  recorded_by_name: string;
  recorded_by_role: string;
  created_at: string;
  updated_at: string;
}

export const calcBMI = (heightCm?: number | null, weightKg?: number | null): number | null => {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  const v = weightKg / (m * m);
  return Math.round(v * 100) / 100;
};

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

export interface BmiAssessment {
  bmi: number | null;
  category: BmiCategory | null;
  label: string;
  advice: string;
  color: "emerald" | "amber" | "orange" | "red";
}

export const assessBMI = (heightCm?: number | null, weightKg?: number | null): BmiAssessment => {
  const bmi = calcBMI(heightCm, weightKg);
  if (bmi == null) {
    return { bmi: null, category: null, label: "—", advice: "", color: "emerald" };
  }
  if (bmi < 18.5) {
    return {
      bmi,
      category: "underweight",
      label: "نقص في الوزن",
      advice: "تغذية متوازنة وزيادة السعرات مع متابعة دورية.",
      color: "amber",
    };
  }
  if (bmi < 25) {
    return {
      bmi,
      category: "normal",
      label: "وزن طبيعي",
      advice: "الاستمرار على الغذاء الصحي والنشاط البدني المنتظم.",
      color: "emerald",
    };
  }
  if (bmi < 30) {
    return {
      bmi,
      category: "overweight",
      label: "زيادة في الوزن",
      advice: "تقليل السكريات والدهون وزيادة النشاط البدني.",
      color: "orange",
    };
  }
  return {
    bmi,
    category: "obese",
    label: "سمنة",
    advice: "حمية صحية ونشاط يومي ومراجعة المرشد الصحي.",
    color: "red",
  };
};

export type BpCategory = "low" | "normal" | "elevated" | "stage1" | "stage2";

export interface BpAssessment {
  systolic: number | null;
  diastolic: number | null;
  category: BpCategory | null;
  label: string;
  advice: string;
  color: "emerald" | "amber" | "orange" | "red" | "sky";
}

export const parseBP = (raw?: string | null): { sys: number | null; dia: number | null } => {
  if (!raw) return { sys: null, dia: null };
  const s = String(raw).replace(/[^\d/]/g, "");
  const [a, b] = s.split("/");
  const sys = a ? parseInt(a, 10) : NaN;
  const dia = b ? parseInt(b, 10) : NaN;
  return { sys: Number.isFinite(sys) ? sys : null, dia: Number.isFinite(dia) ? dia : null };
};

export const formatBP = (sys?: number | null, dia?: number | null): string => {
  if (sys == null && dia == null) return "";
  return `${sys ?? ""}/${dia ?? ""}`;
};

export const assessBP = (sys?: number | null, dia?: number | null): BpAssessment => {
  if (sys == null || dia == null || !sys || !dia) {
    return { systolic: sys ?? null, diastolic: dia ?? null, category: null, label: "—", advice: "", color: "emerald" };
  }
  if (sys < 90 || dia < 60) {
    return { systolic: sys, diastolic: dia, category: "low", label: "منخفض", advice: "ترطيب وتغذية متوازنة ومراجعة عند تكرار الأعراض.", color: "sky" };
  }
  if (sys >= 140 || dia >= 90) {
    return { systolic: sys, diastolic: dia, category: "stage2", label: "مرتفع (مرحلة 2)", advice: "إحالة عاجلة للمرشد الصحي وتقليل الملح والإجهاد.", color: "red" };
  }
  if (sys >= 130 || dia >= 80) {
    return { systolic: sys, diastolic: dia, category: "stage1", label: "مرتفع (مرحلة 1)", advice: "متابعة دورية ونشاط بدني وتقليل الأملاح.", color: "orange" };
  }
  if (sys >= 120) {
    return { systolic: sys, diastolic: dia, category: "elevated", label: "مرتفع قليلاً", advice: "تعزيز النشاط البدني والغذاء الصحي ومراقبة دورية.", color: "amber" };
  }
  return { systolic: sys, diastolic: dia, category: "normal", label: "طبيعي", advice: "الاستمرار على نمط الحياة الصحي.", color: "emerald" };
};

export const fetchHealthRecordsBySection = async (gradeCode: string, section: number): Promise<HealthRecord[]> => {
  const { data, error } = await supabase
    .from("student_health_records")
    .select("*")
    .eq("grade_code", gradeCode)
    .eq("section", section)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as HealthRecord[];
};

export const fetchHealthRecordsForStudent = async (studentId: string): Promise<HealthRecord[]> => {
  const { data, error } = await supabase
    .from("student_health_records")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as HealthRecord[];
};

export const upsertHealthRecord = async (record: Partial<HealthRecord> & { student_id: string; student_name: string }) => {
  if (record.id) {
    const { id, ...rest } = record;
    const { error } = await supabase.from("student_health_records").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("student_health_records").insert(record as any);
    if (error) throw error;
  }
};

export const deleteHealthRecord = async (id: string) => {
  const { error } = await supabase.from("student_health_records").delete().eq("id", id);
  if (error) throw error;
};

export const fetchVitalSignsBySection = async (
  gradeCode: string,
  section: number,
  academicYear: string,
): Promise<VitalSigns[]> => {
  const { data, error } = await supabase
    .from("student_vital_signs")
    .select("*")
    .eq("grade_code", gradeCode)
    .eq("section", section)
    .eq("academic_year", academicYear);
  if (error) throw error;
  return (data || []) as VitalSigns[];
};

export const fetchVitalSignsForStudent = async (studentId: string): Promise<VitalSigns[]> => {
  const { data, error } = await supabase
    .from("student_vital_signs")
    .select("*")
    .eq("student_id", studentId)
    .order("term", { ascending: true });
  if (error) throw error;
  return (data || []) as VitalSigns[];
};

export const upsertVitalSigns = async (row: Partial<VitalSigns> & { student_id: string; student_name: string; academic_year: string; term: 1 | 2; }) => {
  // Try to find existing row
  const { data: existing } = await supabase
    .from("student_vital_signs")
    .select("id")
    .eq("student_id", row.student_id)
    .eq("academic_year", row.academic_year)
    .eq("term", row.term)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from("student_vital_signs").update(row).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("student_vital_signs").insert(row as any);
    if (error) throw error;
  }
};

export const HEALTH_SERVICE_TYPES = [
  "إسعافات أولية",
  "صرف دواء",
  "متابعة حالة مزمنة",
  "قياس مؤشرات حيوية",
  "إصابة / جرح",
  "ارتفاع حرارة",
  "صداع",
  "آلام بطن",
  "إغماء / دوخة",
  "أزمة ربو",
  "نوبة سكر",
  "نوبة صرع",
  "حساسية طارئة",
  "إحالة لمستشفى",
  "إبلاغ ولي الأمر",
  "توعية صحية",
  "أخرى",
] as const;

export interface HealthService {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string;
  grade: string;
  grade_code: string;
  section: number;
  service_date: string;
  service_type: string;
  related_condition: string;
  description: string;
  action_taken: string;
  follow_up: string;
  guardian_notified: boolean;
  recorded_by: string | null;
  recorded_by_name: string;
  recorded_by_role: string;
  created_at: string;
  updated_at: string;
}

export const fetchHealthServicesBySection = async (gradeCode: string, section: number): Promise<HealthService[]> => {
  const { data, error } = await supabase
    .from("student_health_services")
    .select("*")
    .eq("grade_code", gradeCode)
    .eq("section", section)
    .order("service_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as HealthService[];
};

export const fetchHealthServicesForStudent = async (studentId: string): Promise<HealthService[]> => {
  const { data, error } = await supabase
    .from("student_health_services")
    .select("*")
    .eq("student_id", studentId)
    .order("service_date", { ascending: false });
  if (error) throw error;
  return (data || []) as HealthService[];
};

export const upsertHealthService = async (row: Partial<HealthService> & { student_id: string; student_name: string }) => {
  if (row.id) {
    const { id, ...rest } = row;
    const { error } = await supabase.from("student_health_services").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("student_health_services").insert(row as any);
    if (error) throw error;
  }
};

export const deleteHealthService = async (id: string) => {
  const { error } = await supabase.from("student_health_services").delete().eq("id", id);
  if (error) throw error;
};
