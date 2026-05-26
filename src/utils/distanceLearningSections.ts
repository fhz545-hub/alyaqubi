import { supabase } from "@/integrations/supabase/client";

export interface DistanceSection {
  gradeCode: string;
  section: number;
}

let cache: DistanceSection[] | null = null;
let lastFetch = 0;
const TTL = 60_000; // 1 minute

export const loadDistanceLearningSections = async (force = false): Promise<DistanceSection[]> => {
  if (!force && cache && Date.now() - lastFetch < TTL) return cache;
  try {
    const { data, error } = await supabase
      .from("school_settings")
      .select("value")
      .eq("key", "distance_learning_sections")
      .maybeSingle();
    if (error || !data) {
      cache = [];
      lastFetch = Date.now();
      return cache;
    }
    let parsed: any = [];
    try {
      parsed = JSON.parse(data.value || "[]");
    } catch {
      parsed = [];
    }
    if (!Array.isArray(parsed)) parsed = [];
    cache = parsed
      .map((p: any) => ({
        gradeCode: String(p?.gradeCode || ""),
        section: Number(p?.section || 0),
      }))
      .filter((p) => p.gradeCode && p.section > 0);
    lastFetch = Date.now();
    return cache;
  } catch (err) {
    console.warn("[distance-sections] load failed:", err);
    cache = [];
    return cache;
  }
};

export const isDistanceLearningSection = (
  gradeCode: string | null | undefined,
  section: number | string | null | undefined,
  list?: DistanceSection[]
): boolean => {
  const items = list || cache || [];
  if (!items.length) return false;
  const gc = String(gradeCode || "").trim();
  const sec = Number(section || 0);
  return items.some((it) => it.gradeCode === gc && it.section === sec);
};

export const saveDistanceLearningSections = async (
  sections: DistanceSection[],
  updatedBy?: string
): Promise<boolean> => {
  try {
    const value = JSON.stringify(sections);
    const { error } = await supabase
      .from("school_settings")
      .upsert(
        {
          key: "distance_learning_sections",
          value,
          updated_by: updatedBy || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    if (error) {
      console.error("[distance-sections] save failed:", error);
      return false;
    }
    cache = sections;
    lastFetch = Date.now();
    return true;
  } catch (err) {
    console.error("[distance-sections] save error:", err);
    return false;
  }
};

export const getCachedDistanceSections = (): DistanceSection[] => cache || [];