import { useAuth } from "@/contexts/AuthContext";
import { getUserPermissions, PermissionType } from "@/store/permissionsStore";

/**
 * Returns whether the current user is a "view-only" user (teacher without
 * extra permissions beyond the default teacher permissions).
 *
 * View-only users can browse data but cannot send messages, print actionable
 * documents, edit records, or open student profiles.
 */
export const useViewOnly = (): boolean => {
  const { profile } = useAuth();
  if (!profile) return false;
  if (profile.is_principal) return false;
  if (!profile.approved) return false;
  if (!profile.role_title?.includes("معلم")) return false;

  const teacherDefaultPerms = new Set<PermissionType>(["record_class_notes", "print_subject_sheets"]);
  const userPerms = getUserPermissions(profile.user_id);
  const hasExtraPerms = userPerms.some((p) => !teacherDefaultPerms.has(p));
  return !hasExtraPerms;
};

/**
 * Reusable banner copy + helper to render the banner via existing UI elements.
 */
export const VIEW_ONLY_BANNER_TEXT = "للمشاهدة فقط — هذه الصفحة مخصصة للاطلاع، ولا تتضمن صلاحيات تنفيذية";
