import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HealthRecord } from "@/utils/healthRecords";

let cache: HealthRecord[] = [];
let byStudent: Map<string, HealthRecord[]> = new Map();
let byNumber: Map<string, HealthRecord[]> = new Map();
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

const rebuildIndex = () => {
  byStudent = new Map();
  byNumber = new Map();
  cache.forEach((r) => {
    if (r.student_id) {
      const arr = byStudent.get(r.student_id) || [];
      arr.push(r);
      byStudent.set(r.student_id, arr);
    }
    if (r.student_number) {
      const arr = byNumber.get(r.student_number) || [];
      arr.push(r);
      byNumber.set(r.student_number, arr);
    }
  });
};

const notify = () => listeners.forEach((l) => l());

export const loadAllHealthRecords = async (force = false): Promise<void> => {
  if (loaded && !force) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("student_health_records")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      cache = (data || []) as HealthRecord[];
      rebuildIndex();
      loaded = true;
      notify();
    } catch (e) {
      // silent — feature is non-critical for teachers without permission
      cache = [];
      rebuildIndex();
      loaded = true;
      notify();
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
};

export const refreshHealthRecords = () => loadAllHealthRecords(true);

export const getHealthRecordsForStudent = (
  studentId?: string | null,
  studentNumber?: string | null,
): HealthRecord[] => {
  const a = (studentId && byStudent.get(studentId)) || [];
  const b = (studentNumber && byNumber.get(studentNumber)) || [];
  if (!a.length) return b;
  if (!b.length) return a;
  const seen = new Set<string>();
  return [...a, ...b].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};

export const useHealthRecordsForStudent = (
  studentId?: string | null,
  studentNumber?: string | null,
) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    if (!loaded) loadAllHealthRecords();
    return () => { listeners.delete(l); };
  }, []);
  return getHealthRecordsForStudent(studentId, studentNumber);
};
