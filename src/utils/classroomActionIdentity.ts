import type { StudentAction } from "@/types/school";

const normalizeText = (value?: string | null) =>
  (value || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const buildStudentIdentityKey = (studentId?: string, studentNumber?: string) =>
  (studentNumber || studentId || "").trim();

export const matchesStudentAction = (
  action: StudentAction,
  studentId?: string,
  studentNumber?: string
) => {
  const actionKey = buildStudentIdentityKey(action.studentId, action.studentNumber);
  const targetKey = buildStudentIdentityKey(studentId, studentNumber);
  if (actionKey && targetKey) return actionKey === targetKey;

  return (
    Boolean(studentId && action.studentId && action.studentId === studentId) ||
    Boolean(studentNumber && action.studentNumber && action.studentNumber === studentNumber)
  );
};

export const isActionOwnedByTeacher = (
  action: StudentAction,
  teacherUserId?: string | null,
  teacherFullName?: string | null
) => {
  if (teacherUserId && action.performedById) {
    return action.performedById === teacherUserId;
  }

  const normalizedTeacher = normalizeText(teacherFullName);
  const normalizedActionOwner = normalizeText(action.performedByName);
  if (normalizedTeacher && normalizedActionOwner) {
    return normalizedTeacher === normalizedActionOwner;
  }

  return false;
};