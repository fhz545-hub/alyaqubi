import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  action: string;
  section: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, any>;
}

/**
 * Records a sensitive operation to the audit log.
 * Fails silently — never blocks user flow.
 */
export const logAudit = async (
  entry: AuditEntry,
  actor?: { id?: string | null; name?: string | null; role?: string | null }
): Promise<void> => {
  try {
    await supabase.from("audit_log").insert({
      actor_id: actor?.id || null,
      actor_name: actor?.name || "",
      actor_role: actor?.role || "",
      action: entry.action,
      section: entry.section,
      entity_type: entry.entity_type || "",
      entity_id: entry.entity_id || "",
      details: entry.details || {},
    });
  } catch (err) {
    console.warn("[audit] failed to log:", err);
  }
};

export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  section: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  created_at: string;
}

export const fetchAuditLog = async (limit = 200): Promise<AuditRow[]> => {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[audit] fetch failed:", error);
    return [];
  }
  return (data || []) as AuditRow[];
};