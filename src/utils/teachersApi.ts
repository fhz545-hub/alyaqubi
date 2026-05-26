import { supabase } from "@/integrations/supabase/client";

export interface Teacher {
  id: string;
  full_name: string;
  civil_id: string;
  phone: string;
  specialization: string;
  rank_title: string;
  job_number: string;
  current_job: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeacherNotice {
  id: string;
  teacher_id: string | null;
  teacher_name: string;
  teacher_civil_id: string;
  teacher_phone: string;
  notice_kind: "late" | "absent" | "gaib" | "note" | string;
  serial_number: number;
  greg_date: string;
  hijri_date: string;
  day_name: string;
  late_in_time: string;
  late_total_min: number;
  abs_from_time: string;
  abs_to_time: string;
  abs_total_min: number;
  note_reason: string;
  lesson_class: string;
  lesson_period: string;
  lesson_minutes: number;
  season_mode: string;
  shift_extended: boolean;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
}

export type TeacherInput = Omit<Teacher, "id" | "created_at" | "updated_at" | "active"> & { active?: boolean };

export async function listTeachers(): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from("teachers")
    .select("*")
    .eq("active", true)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data || []) as Teacher[];
}

export async function upsertTeacher(input: TeacherInput, id?: string): Promise<Teacher> {
  if (id) {
    const { data, error } = await supabase
      .from("teachers")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Teacher;
  }
  const { data, error } = await supabase
    .from("teachers")
    .insert({ ...input, active: true })
    .select()
    .single();
  if (error) throw error;
  return data as Teacher;
}

export async function deleteTeacher(id: string): Promise<void> {
  const { error } = await supabase
    .from("teachers")
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function bulkInsertTeachers(items: TeacherInput[]): Promise<number> {
  if (!items.length) return 0;
  const { data, error } = await supabase
    .from("teachers")
    .upsert(items.map((t) => ({ ...t, active: true })), { onConflict: "civil_id" })
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

/**
 * يربط بيانات حضوري المستوردة بسجل المعلمين عبر السجل المدني.
 * يقوم بإضافة المعلمين غير الموجودين تلقائياً في جدول teachers.
 * يعيد قائمة بمعرّف المعلم لكل سجل مدني (id => civil_id).
 */
export interface AutoLinkInput {
  civil_id: string;
  full_name: string;
  phone?: string;
  specialization?: string;
}

export async function autoLinkTeachersByCivilId(
  inputs: AutoLinkInput[],
): Promise<{ linkedMap: Record<string, Teacher>; created: number; matched: number }> {
  const cleaned = inputs
    .map((i) => ({
      civil_id: (i.civil_id || "").replace(/\D/g, ""),
      full_name: (i.full_name || "").replace(/^—$/, "").trim(),
      phone: (i.phone || "").replace(/\D/g, ""),
      specialization: (i.specialization || "").trim(),
    }))
    .filter((i) => i.civil_id.length === 10);

  if (cleaned.length === 0) return { linkedMap: {}, created: 0, matched: 0 };

  const civilIds = Array.from(new Set(cleaned.map((c) => c.civil_id)));

  const { data: existing, error: fetchErr } = await supabase
    .from("teachers")
    .select("*")
    .in("civil_id", civilIds);
  if (fetchErr) throw fetchErr;

  const existingMap = new Map<string, Teacher>();
  (existing || []).forEach((t: any) => existingMap.set(t.civil_id, t as Teacher));

  // Determine new teachers to create
  const toCreate: TeacherInput[] = [];
  const seen = new Set<string>();
  for (const c of cleaned) {
    if (existingMap.has(c.civil_id) || seen.has(c.civil_id)) continue;
    if (!c.full_name) continue;
    seen.add(c.civil_id);
    const phone =
      c.phone && c.phone.replace(/^966/, "").replace(/^0/, "").length === 9
        ? "966" + c.phone.replace(/^966/, "").replace(/^0/, "")
        : "";
    toCreate.push({
      full_name: c.full_name,
      civil_id: c.civil_id,
      phone,
      specialization: c.specialization || "",
      rank_title: "",
      job_number: "",
      current_job: "معلم",
    });
  }

  let created = 0;
  if (toCreate.length) {
    const { data: inserted, error: insErr } = await supabase
      .from("teachers")
      .upsert(toCreate.map((t) => ({ ...t, active: true })), { onConflict: "civil_id" })
      .select("*");
    if (insErr) throw insErr;
    (inserted || []).forEach((t: any) => existingMap.set(t.civil_id, t as Teacher));
    created = inserted?.length || 0;
  }

  const linkedMap: Record<string, Teacher> = {};
  existingMap.forEach((t, civilId) => { linkedMap[civilId] = t; });

  return { linkedMap, created, matched: existingMap.size - created };
}

export async function listNotices(filter?: { teacher_id?: string; kind?: string }): Promise<TeacherNotice[]> {
  let q = supabase.from("teacher_notices").select("*").order("created_at", { ascending: false });
  if (filter?.teacher_id) q = q.eq("teacher_id", filter.teacher_id);
  if (filter?.kind) q = q.eq("notice_kind", filter.kind);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return (data || []) as TeacherNotice[];
}

export async function nextSerialFor(kind: string): Promise<number> {
  const { count, error } = await supabase
    .from("teacher_notices")
    .select("*", { count: "exact", head: true })
    .eq("notice_kind", kind);
  if (error) throw error;
  return (count || 0) + 1;
}

export type NoticeInput = Omit<TeacherNotice, "id" | "created_at" | "serial_number"> & { serial_number?: number };

export async function createNotice(input: NoticeInput): Promise<TeacherNotice> {
  const serial = input.serial_number ?? (await nextSerialFor(input.notice_kind));
  const { data, error } = await supabase
    .from("teacher_notices")
    .insert({ ...input, serial_number: serial })
    .select()
    .single();
  if (error) throw error;
  return data as TeacherNotice;
}

export async function deleteNotice(id: string): Promise<void> {
  const { error } = await supabase.from("teacher_notices").delete().eq("id", id);
  if (error) throw error;
}