import { ACTION_LABELS, ActionType, StudentAction } from "@/types/school";

const CLASS_REFERRAL_PREFIX = "CLASS_REFERRAL_V1::";

export type ClassroomReferralStatus =
  | "transferred_after_third_note"
  | "under_vice_followup"
  | "action_taken";

export interface ClassroomReferralPayload {
  studentId: string;
  studentName: string;
  studentNumber: string;
  grade: string;
  section: number;
  noteType: ActionType;
  noteLabel: string;
  noteDescription: string;
  period?: number;
  subjectName?: string;
  teacherName: string;
  teacherRole: string;
  noteCount: number;
  date: string;
  time: string;
  followupStage: string;
  transferTrigger: "auto_third_note" | "manual";
}

export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  transferred_after_third_note: "تم التحويل بعد الملاحظة الثالثة",
  under_vice_followup: "تحت متابعة وكيل شؤون الطلاب",
  action_taken: "تم اتخاذ الإجراء النظامي",
};

export const REFERRAL_STATUS_CLASSES: Record<string, string> = {
  transferred_after_third_note: "bg-warning/10 text-warning border-warning/30",
  under_vice_followup: "bg-primary/10 text-primary border-primary/30",
  action_taken: "bg-success/10 text-success border-success/30",
};

export const getReferralStatusLabel = (status: string) =>
  REFERRAL_STATUS_LABELS[status] || "حالة غير معروفة";

export const extractFollowupStage = (description?: string): string => {
  if (!description) return "متابعة صفية";
  const match = description.match(/^\[(.+?)\]\s*/);
  return match?.[1] || "متابعة صفية";
};

export const stripFollowupPrefix = (description?: string): string => {
  if (!description) return "";
  return description.replace(/^\[(.+?)\]\s*/, "").trim();
};

export const buildClassroomReferralPayload = (
  action: StudentAction,
  options: {
    teacherName: string;
    teacherRole: string;
    noteCount: number;
    transferTrigger: "auto_third_note" | "manual";
  }
): ClassroomReferralPayload => {
  return {
    studentId: action.studentId,
    studentName: action.studentName,
    studentNumber: action.studentNumber,
    grade: action.grade,
    section: action.section,
    noteType: action.type,
    noteLabel: ACTION_LABELS[action.type],
    noteDescription: stripFollowupPrefix(action.description),
    period: action.period,
    subjectName: action.subjectName,
    teacherName: options.teacherName,
    teacherRole: options.teacherRole,
    noteCount: options.noteCount,
    date: action.date,
    time: action.time,
    followupStage: extractFollowupStage(action.description),
    transferTrigger: options.transferTrigger,
  };
};

export const serializeClassroomReferralPayload = (payload: ClassroomReferralPayload): string => {
  return `${CLASS_REFERRAL_PREFIX}${JSON.stringify(payload)}`;
};

export const parseClassroomReferralPayload = (
  messageText?: string | null,
  fallback?: Partial<Pick<ClassroomReferralPayload, "studentName" | "grade" | "teacherName" | "teacherRole">>
): ClassroomReferralPayload | null => {
  if (!messageText) return null;

  if (messageText.startsWith(CLASS_REFERRAL_PREFIX)) {
    try {
      return JSON.parse(messageText.slice(CLASS_REFERRAL_PREFIX.length)) as ClassroomReferralPayload;
    } catch {
      return null;
    }
  }

  const studentMatch = messageText.match(/الطالب:\s*([^\n\(]+)\s*(?:\(([^\)]+)\))?/);
  const gradeMatch = messageText.match(/الصف:\s*([^\n]+)/);
  const countMatch = messageText.match(/عدد الملاحظات المسجلة:\s*(\d+)/);
  const typeMatch = messageText.match(/النوع:\s*([^\n]+)/);
  const periodMatch = messageText.match(/الحصة:\s*([^\n]+)/);
  const subjectMatch = messageText.match(/المادة:\s*([^\n]+)/);
  const detailsMatch = messageText.match(/التفاصيل:\s*([^\n]+)/);
  const dateMatch = messageText.match(/التاريخ:\s*([^\n\-]+)\s*-\s*([^\n]+)/);
  const teacherMatch = messageText.match(/تحويل رسمي من\s*([^\n]+)/);

  if (!studentMatch && !fallback?.studentName) return null;

  return {
    studentId: "",
    studentName: (studentMatch?.[1] || fallback?.studentName || "").trim(),
    studentNumber: (studentMatch?.[2] || "").trim(),
    grade: (gradeMatch?.[1] || fallback?.grade || "").trim(),
    section: 0,
    noteType: "class_note",
    noteLabel: (typeMatch?.[1] || ACTION_LABELS.class_note).trim(),
    noteDescription: (detailsMatch?.[1] || "").trim(),
    period: periodMatch?.[1] && periodMatch[1] !== "-" ? Number(periodMatch[1]) : undefined,
    subjectName: (subjectMatch?.[1] || "").trim() || undefined,
    teacherName: (teacherMatch?.[1] || fallback?.teacherName || "").trim(),
    teacherRole: fallback?.teacherRole || "معلم",
    noteCount: Number(countMatch?.[1] || 3),
    date: (dateMatch?.[1] || "").trim(),
    time: (dateMatch?.[2] || "").trim(),
    followupStage: extractFollowupStage(detailsMatch?.[1] || ""),
    transferTrigger: "manual",
  };
};

export const formatReferralNotificationBody = (payload: ClassroomReferralPayload): string => {
  const transferText =
    payload.transferTrigger === "auto_third_note"
      ? "تحويل تلقائي بعد الملاحظة الثالثة"
      : "تحويل رسمي من المعلم";

  return [
    `${transferText}`,
    `الطالب: ${payload.studentName} (${payload.studentNumber})`,
    `الصف: ${payload.grade} - شعبة ${payload.section}`,
    `نوع الملاحظة: ${payload.noteLabel}`,
    `الحصة: ${payload.period || "-"}${payload.subjectName ? ` • ${payload.subjectName}` : ""}`,
    `المعلم: ${payload.teacherName}`,
    `التاريخ: ${payload.date} - ${payload.time}`,
  ].join("\n");
};