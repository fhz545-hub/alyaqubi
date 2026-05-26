// Academic weeks for Saudi school year - updated from official MOE calendar
// الفصل الدراسي الثاني 1447/1448هـ - 19 أسبوع

interface AcademicWeek {
  week: number;
  label: string;
  startDate: string; // Gregorian YYYY-MM-DD (Sunday)
  endDate: string;   // Gregorian YYYY-MM-DD (Thursday)
  hijriStart?: string;
  hijriEnd?: string;
  note?: string;
}

// الفصل الدراسي الثاني 1446هـ
const semester2Weeks: AcademicWeek[] = [
  { week: 1, label: "الأسبوع الأول", startDate: "2025-01-12", endDate: "2025-01-16" },
  { week: 2, label: "الأسبوع الثاني", startDate: "2025-01-19", endDate: "2025-01-23" },
  { week: 3, label: "الأسبوع الثالث", startDate: "2025-01-26", endDate: "2025-01-30" },
  { week: 4, label: "الأسبوع الرابع", startDate: "2025-02-02", endDate: "2025-02-06" },
  { week: 5, label: "الأسبوع الخامس", startDate: "2025-02-09", endDate: "2025-02-13" },
  { week: 6, label: "الأسبوع السادس", startDate: "2025-02-16", endDate: "2025-02-20" },
  { week: 7, label: "الأسبوع السابع", startDate: "2025-02-23", endDate: "2025-02-27" },
  { week: 8, label: "الأسبوع الثامن", startDate: "2025-03-02", endDate: "2025-03-06" },
  { week: 9, label: "الأسبوع التاسع", startDate: "2025-03-09", endDate: "2025-03-13" },
  { week: 10, label: "الأسبوع العاشر", startDate: "2025-03-16", endDate: "2025-03-20" },
  { week: 11, label: "الأسبوع الحادي عشر", startDate: "2025-03-23", endDate: "2025-03-27" },
  { week: 12, label: "الأسبوع الثاني عشر", startDate: "2025-04-06", endDate: "2025-04-10" },
  { week: 13, label: "الأسبوع الثالث عشر", startDate: "2025-04-13", endDate: "2025-04-17" },
  { week: 14, label: "الأسبوع الرابع عشر", startDate: "2025-04-20", endDate: "2025-04-24" },
  { week: 15, label: "الأسبوع الخامس عشر", startDate: "2025-04-27", endDate: "2025-05-01" },
  { week: 16, label: "الأسبوع السادس عشر", startDate: "2025-05-04", endDate: "2025-05-08" },
  { week: 17, label: "الأسبوع السابع عشر", startDate: "2025-05-11", endDate: "2025-05-15" },
  { week: 18, label: "الأسبوع الثامن عشر", startDate: "2025-05-18", endDate: "2025-05-22" },
];

// الفصل الدراسي الثالث 1446هـ
const semester3Weeks: AcademicWeek[] = [
  { week: 1, label: "الأسبوع الأول", startDate: "2025-06-01", endDate: "2025-06-05" },
  { week: 2, label: "الأسبوع الثاني", startDate: "2025-06-08", endDate: "2025-06-12" },
  { week: 3, label: "الأسبوع الثالث", startDate: "2025-06-15", endDate: "2025-06-19" },
  { week: 4, label: "الأسبوع الرابع", startDate: "2025-06-22", endDate: "2025-06-26" },
  { week: 5, label: "الأسبوع الخامس", startDate: "2025-07-06", endDate: "2025-07-10" },
  { week: 6, label: "الأسبوع السادس", startDate: "2025-07-13", endDate: "2025-07-17" },
  { week: 7, label: "الأسبوع السابع", startDate: "2025-07-20", endDate: "2025-07-24" },
  { week: 8, label: "الأسبوع الثامن", startDate: "2025-07-27", endDate: "2025-07-31" },
  { week: 9, label: "الأسبوع التاسع", startDate: "2025-08-03", endDate: "2025-08-07" },
  { week: 10, label: "الأسبوع العاشر", startDate: "2025-08-10", endDate: "2025-08-14" },
  { week: 11, label: "الأسبوع الحادي عشر", startDate: "2025-08-17", endDate: "2025-08-21" },
  { week: 12, label: "الأسبوع الثاني عشر", startDate: "2025-08-24", endDate: "2025-08-28" },
  { week: 13, label: "الأسبوع الثالث عشر", startDate: "2025-08-31", endDate: "2025-09-04" },
  { week: 14, label: "الأسبوع الرابع عشر", startDate: "2025-09-07", endDate: "2025-09-11" },
  { week: 15, label: "الأسبوع الخامس عشر", startDate: "2025-09-14", endDate: "2025-09-18" },
  { week: 16, label: "الأسبوع السادس عشر", startDate: "2025-09-21", endDate: "2025-09-25" },
  { week: 17, label: "الأسبوع السابع عشر", startDate: "2025-09-28", endDate: "2025-10-02" },
  { week: 18, label: "الأسبوع الثامن عشر", startDate: "2025-10-05", endDate: "2025-10-09" },
];

// الفصل الدراسي الأول 1447/1448هـ
const semester1_1447Weeks: AcademicWeek[] = [
  { week: 1, label: "الأسبوع الأول", startDate: "2025-10-26", endDate: "2025-10-30" },
  { week: 2, label: "الأسبوع الثاني", startDate: "2025-11-02", endDate: "2025-11-06" },
  { week: 3, label: "الأسبوع الثالث", startDate: "2025-11-09", endDate: "2025-11-13" },
  { week: 4, label: "الأسبوع الرابع", startDate: "2025-11-16", endDate: "2025-11-20" },
  { week: 5, label: "الأسبوع الخامس", startDate: "2025-11-23", endDate: "2025-11-27" },
  { week: 6, label: "الأسبوع السادس", startDate: "2025-11-30", endDate: "2025-12-04" },
  { week: 7, label: "الأسبوع السابع", startDate: "2025-12-07", endDate: "2025-12-11" },
  { week: 8, label: "الأسبوع الثامن", startDate: "2025-12-14", endDate: "2025-12-18" },
  { week: 9, label: "الأسبوع التاسع", startDate: "2025-12-21", endDate: "2025-12-25" },
  { week: 10, label: "الأسبوع العاشر", startDate: "2025-12-28", endDate: "2026-01-01" },
  { week: 11, label: "الأسبوع الحادي عشر", startDate: "2026-01-04", endDate: "2026-01-08" },
];

// الفصل الدراسي الثاني 1447/1448هـ - محدّث من التقويم الرسمي (19 أسبوع)
const semester2_1447Weeks: AcademicWeek[] = [
  { week: 1, label: "الأسبوع الأول", startDate: "2026-01-18", endDate: "2026-01-22", hijriStart: "١٤٤٧/٧/٢٩", hijriEnd: "١٤٤٧/٨/٣" },
  { week: 2, label: "الأسبوع الثاني", startDate: "2026-01-25", endDate: "2026-01-29", hijriStart: "١٤٤٧/٨/٦", hijriEnd: "١٤٤٧/٨/١٠" },
  { week: 3, label: "الأسبوع الثالث", startDate: "2026-02-01", endDate: "2026-02-05", hijriStart: "١٤٤٧/٨/١٣", hijriEnd: "١٤٤٧/٨/١٧" },
  { week: 4, label: "الأسبوع الرابع", startDate: "2026-02-08", endDate: "2026-02-12", hijriStart: "١٤٤٧/٨/٢٠", hijriEnd: "١٤٤٧/٨/٢٤" },
  { week: 5, label: "الأسبوع الخامس", startDate: "2026-02-15", endDate: "2026-02-19", hijriStart: "١٤٤٧/٨/٢٧", hijriEnd: "١٤٤٧/٩/٢" },
  { week: 6, label: "الأسبوع السادس", startDate: "2026-02-22", endDate: "2026-02-26", hijriStart: "١٤٤٧/٩/٥", hijriEnd: "١٤٤٧/٩/٩", note: "إجازة يوم التأسيس" },
  { week: 7, label: "الأسبوع السابع", startDate: "2026-03-01", endDate: "2026-03-05", hijriStart: "١٤٤٧/٩/١٢", hijriEnd: "١٤٤٧/٩/١٦" },
  { week: 8, label: "الأسبوع الثامن", startDate: "2026-03-29", endDate: "2026-04-02", hijriStart: "١٤٤٧/١٠/١٠", hijriEnd: "١٤٤٧/١٠/١٤", note: "نهاية تبدأ إجازة عيد الفطر" },
  { week: 9, label: "الأسبوع التاسع", startDate: "2026-04-05", endDate: "2026-04-09", hijriStart: "١٤٤٧/١٠/١٧", hijriEnd: "١٤٤٧/١٠/٢١" },
  { week: 10, label: "الأسبوع العاشر", startDate: "2026-04-12", endDate: "2026-04-16", hijriStart: "١٤٤٧/١٠/٢٤", hijriEnd: "١٤٤٧/١٠/٢٨" },
  { week: 11, label: "الأسبوع الحادي عشر", startDate: "2026-04-19", endDate: "2026-04-23", hijriStart: "١٤٤٧/١١/٢", hijriEnd: "١٤٤٧/١١/٦" },
  { week: 12, label: "الأسبوع الثاني عشر", startDate: "2026-04-26", endDate: "2026-04-30", hijriStart: "١٤٤٧/١١/٩", hijriEnd: "١٤٤٧/١١/١٣" },
  { week: 13, label: "الأسبوع الثالث عشر", startDate: "2026-05-03", endDate: "2026-05-07", hijriStart: "١٤٤٧/١١/١٦", hijriEnd: "١٤٤٧/١١/٢٠" },
  { week: 14, label: "الأسبوع الرابع عشر", startDate: "2026-05-10", endDate: "2026-05-14", hijriStart: "١٤٤٧/١١/٢٣", hijriEnd: "١٤٤٧/١١/٢٧" },
  { week: 15, label: "الأسبوع الخامس عشر", startDate: "2026-05-17", endDate: "2026-05-21", hijriStart: "١٤٤٧/١١/٣٠", hijriEnd: "١٤٤٧/١٢/٤", note: "نهاية تبدأ إجازة عيد الأضحى" },
  { week: 16, label: "الأسبوع السادس عشر", startDate: "2026-06-02", endDate: "2026-06-04", hijriStart: "١٤٤٧/١٢/١٦", hijriEnd: "١٤٤٧/١٢/١٨", note: "استكمال إجازة عيد الأضحى والعودة يوم الثلاثاء" },
  { week: 17, label: "الأسبوع السابع عشر", startDate: "2026-06-07", endDate: "2026-06-11", hijriStart: "١٤٤٧/١٢/٢١", hijriEnd: "١٤٤٧/١٢/٢٥" },
  { week: 18, label: "الأسبوع الثامن عشر", startDate: "2026-06-14", endDate: "2026-06-18", hijriStart: "١٤٤٧/١٢/٢٨", hijriEnd: "١٤٤٨/١/٣" },
  { week: 19, label: "الأسبوع التاسع عشر", startDate: "2026-06-21", endDate: "2026-06-25", hijriStart: "١٤٤٨/١/٦", hijriEnd: "١٤٤٨/١/١٠", note: "الاختبارات التحريرية النهائية" },
];

interface SemesterInfo {
  semester: string;
  weeks: AcademicWeek[];
}

const allSemesters: SemesterInfo[] = [
  { semester: "الفصل الدراسي الثاني 1446هـ", weeks: semester2Weeks },
  { semester: "الفصل الدراسي الثالث 1446هـ", weeks: semester3Weeks },
  { semester: "الفصل الدراسي الأول 1447/1448هـ", weeks: semester1_1447Weeks },
  { semester: "الفصل الدراسي الثاني 1447/1448هـ", weeks: semester2_1447Weeks },
];

export const getCurrentAcademicWeek = (date: Date = new Date()): { semester: string; week: string; weekNumber: number } | null => {
  const dateStr = date.toISOString().split("T")[0];
  
  for (const sem of allSemesters) {
    for (const w of sem.weeks) {
      if (dateStr >= w.startDate && dateStr <= w.endDate) {
        return { semester: sem.semester, week: w.label, weekNumber: w.week };
      }
    }
  }
  
  for (let i = 0; i < allSemesters.length; i++) {
    const sem = allSemesters[i];
    const lastWeek = sem.weeks[sem.weeks.length - 1];
    const nextSem = allSemesters[i + 1];
    
    if (nextSem && dateStr > lastWeek.endDate && dateStr < nextSem.weeks[0].startDate) {
      return { semester: "إجازة بين الفصلين", week: "إجازة", weekNumber: 0 };
    }
  }
  
  return null;
};

export const getAcademicDayName = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(date);
};

// Get current semester weeks for display
export const getCurrentSemesterWeeks = (): { semester: string; weeks: AcademicWeek[] } | null => {
  const dateStr = new Date().toISOString().split("T")[0];
  
  // Find which semester we're currently in
  for (const sem of allSemesters) {
    const firstWeek = sem.weeks[0];
    const lastWeek = sem.weeks[sem.weeks.length - 1];
    if (dateStr >= firstWeek.startDate && dateStr <= lastWeek.endDate) {
      return { semester: sem.semester, weeks: sem.weeks };
    }
    // If we're in break before this semester but close to it
    if (dateStr < firstWeek.startDate) {
      const daysBefore = Math.floor((new Date(firstWeek.startDate).getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
      if (daysBefore <= 14) {
        return { semester: sem.semester, weeks: sem.weeks };
      }
    }
  }
  
  // Default: return the last semester
  const last = allSemesters[allSemesters.length - 1];
  return { semester: last.semester, weeks: last.weeks };
};

export type { AcademicWeek };
