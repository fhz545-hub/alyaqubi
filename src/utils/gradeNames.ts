// Utility: convert grade codes to full readable names
// 1314 = الصف الأول الثانوي
// 1416 = الصف الثاني الثانوي
// 1516 = الصف الثالث الثانوي

export const GRADE_CODE_MAP: Record<string, string> = {
  "1314": "الصف الأول الثانوي",
  "1416": "الصف الثاني الثانوي",
  "1516": "الصف الثالث الثانوي",
};

export const GRADE_SHORT_MAP: Record<string, string> = {
  "1314": "أول ثانوي",
  "1416": "ثاني ثانوي",
  "1516": "ثالث ثانوي",
};

/**
 * Get the full grade name from a grade code or existing grade string.
 * If already a name (not a code), return as-is.
 */
export const getGradeFullName = (gradeOrCode: string): string => {
  return GRADE_CODE_MAP[gradeOrCode] || gradeOrCode;
};

/**
 * Get the short grade name
 */
export const getGradeShortName = (gradeOrCode: string): string => {
  return GRADE_SHORT_MAP[gradeOrCode] || gradeOrCode;
};

/**
 * Format grade + section for display
 * e.g. "الصف الأول الثانوي - شعبة 3"
 */
export const formatGradeSection = (gradeOrCode: string, section: number): string => {
  const gradeName = getGradeFullName(gradeOrCode);
  return `${gradeName} - شعبة ${section}`;
};

/**
 * Format short grade + section
 * e.g. "أول ثانوي / 3"
 */
export const formatGradeSectionShort = (gradeOrCode: string, section: number): string => {
  const gradeName = getGradeShortName(gradeOrCode);
  return `${gradeName} / ${section}`;
};
