import { Student } from "@/types/school";
import { supabase } from "@/integrations/supabase/client";
import { cacheData, getCachedData } from "@/utils/offlineQueue";
import { GRADE_CODE_MAP } from "@/utils/gradeNames";

// In-memory cache
let studentsCache: Student[] = [];
let loaded = false;
let loading = false;
let loadPromise: Promise<Student[]> | null = null;

const gradeMap = GRADE_CODE_MAP;

const mapRow = (row: any): Student => ({
  id: row.id,
  name: row.name,
  studentNumber: row.student_number,
  grade: row.grade,
  gradeCode: row.grade_code,
  section: row.section,
  guardianPhone: row.guardian_phone || "",
  absences: 0,
  lateCount: 0,
  violations: 0,
});

const fetchStudentsBatch = async (from: number, to: number, timeoutMs: number) => {
  const query = supabase
    .from("students")
    .select("id,name,student_number,grade,grade_code,section,guardian_phone")
    .order("grade_code")
    .order("section")
    .order("name")
    .range(from, to);

  const timeoutResult = new Promise<{ data: null; error: { message: string } }>((resolve) => {
    setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), timeoutMs);
  });

  return (await Promise.race([query as any, timeoutResult])) as {
    data: any[] | null;
    error: { message: string } | null;
  };
};

const fetchStudentsFromRemote = async (timeoutMs: number): Promise<Student[] | null> => {
  const startedAt = Date.now();
  const batchSize = 1000;
  let offset = 0;
  const allRows: any[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - startedAt);
    const batchTimeout = Math.min(4000, Math.max(1200, remaining));

    const { data, error } = await fetchStudentsBatch(offset, offset + batchSize - 1, batchTimeout);

    if (error) {
      console.error("Failed to load students batch:", error);
      break;
    }

    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  if (allRows.length === 0) return null;

  return allRows.map(mapRow);
};

export const loadStudents = async (forceRefresh = false): Promise<Student[]> => {
  if (loaded && !forceRefresh) {
    if (studentsCache.length === 0 && navigator.onLine) {
      return loadStudents(true);
    }
    return studentsCache;
  }

  if (loading && loadPromise) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    try {
      // Try cache first
      const cached = await getCachedData<Student[]>("students");
      if (cached && cached.length > 0) {
        studentsCache = cached;
        loaded = true;
      }

      if (!navigator.onLine) {
        if (studentsCache.length > 0) {
          console.log("[Offline] Students from cache:", studentsCache.length);
        }
        return studentsCache;
      }

      // Single attempt with timeout - reduced from 12-15s to 8s
      const remoteStudents = await fetchStudentsFromRemote(forceRefresh ? 10000 : 8000);

      if (remoteStudents && remoteStudents.length > 0) {
        studentsCache = remoteStudents;
        loaded = true;
        cacheData("students", studentsCache).catch(() => {});
        return studentsCache;
      }

      // Network failed - keep whatever we have
      loaded = studentsCache.length > 0;
      return studentsCache;
    } catch (err: any) {
      console.error("Unexpected loadStudents error:", err);
      loaded = studentsCache.length > 0;
      return studentsCache;
    } finally {
      loading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
};

export const getStudentsFromDB = (): Student[] => studentsCache;

export const getGradesFromDB = () => {
  const codes = [...new Set(studentsCache.map((s) => s.gradeCode))];
  return codes.map((code) => ({ code, name: gradeMap[code] || code }));
};

export const getSectionsFromDB = (gradeCode: string) => {
  const sections = [...new Set(studentsCache.filter((s) => s.gradeCode === gradeCode).map((s) => s.section))];
  return sections.sort((a, b) => a - b);
};

export const addStudent = async (student: {
  name: string;
  studentNumber: string;
  gradeCode: string;
  section: number;
  guardianPhone: string;
}): Promise<Student | null> => {
  try {
    const { data, error } = await supabase
      .from("students")
      .insert({
        name: student.name,
        student_number: student.studentNumber,
        grade: gradeMap[student.gradeCode] || student.gradeCode,
        grade_code: student.gradeCode,
        section: student.section,
        guardian_phone: student.guardianPhone,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to add student:", error);
      return null;
    }

    const newStudent = mapRow(data);
    studentsCache = [...studentsCache, newStudent].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    cacheData("students", studentsCache).catch(() => {});
    return newStudent;
  } catch (err) {
    console.error("Unexpected addStudent error:", err);
    return null;
  }
};

export const updateStudent = async (
  id: string,
  updates: Partial<{ name: string; studentNumber: string; gradeCode: string; section: number; guardianPhone: string }>
): Promise<boolean> => {
  try {
    const row: any = {};
    if (updates.name) row.name = updates.name;
    if (updates.studentNumber) row.student_number = updates.studentNumber;
    if (updates.gradeCode) {
      row.grade_code = updates.gradeCode;
      row.grade = gradeMap[updates.gradeCode] || updates.gradeCode;
    }
    if (updates.section !== undefined) row.section = updates.section;
    if (updates.guardianPhone !== undefined) row.guardian_phone = updates.guardianPhone;

    const { error } = await supabase.from("students").update(row).eq("id", id);
    if (error) {
      console.error("Failed to update student:", error);
      return false;
    }

    studentsCache = studentsCache.map((s) =>
      s.id === id
        ? {
            ...s,
            ...(updates.name && { name: updates.name }),
            ...(updates.studentNumber && { studentNumber: updates.studentNumber }),
            ...(updates.gradeCode && { gradeCode: updates.gradeCode, grade: gradeMap[updates.gradeCode] || updates.gradeCode }),
            ...(updates.section !== undefined && { section: updates.section }),
            ...(updates.guardianPhone !== undefined && { guardianPhone: updates.guardianPhone }),
          }
        : s
    );
    cacheData("students", studentsCache).catch(() => {});
    return true;
  } catch (err) {
    console.error("Unexpected updateStudent error:", err);
    return false;
  }
};

export const deleteStudent = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete student:", error);
      return false;
    }
    studentsCache = studentsCache.filter((s) => s.id !== id);
    cacheData("students", studentsCache).catch(() => {});
    return true;
  } catch (err) {
    console.error("Unexpected deleteStudent error:", err);
    return false;
  }
};

export const seedStudentsFromMockData = async (mockStudents: Student[]): Promise<boolean> => {
  try {
    const batchSize = 100;
    for (let i = 0; i < mockStudents.length; i += batchSize) {
      const batch = mockStudents.slice(i, i + batchSize).map((s) => ({
        name: s.name,
        student_number: s.studentNumber,
        grade: s.grade,
        grade_code: s.gradeCode,
        section: s.section,
        guardian_phone: s.guardianPhone,
      }));

      const { error } = await supabase.from("students").insert(batch);
      if (error) {
        console.error(`Seed batch ${i} failed:`, error);
        return false;
      }
    }

    loaded = false;
    await loadStudents();
    return true;
  } catch (err) {
    console.error("Unexpected seed error:", err);
    return false;
  }
};

export const resetStudentsCache = () => {
  studentsCache = [];
  loaded = false;
  loading = false;
  loadPromise = null;
};

export const isStudentsLoaded = () => loaded;
export const getStudentsCount = () => studentsCache.length;
