import { supabase } from "@/integrations/supabase/client";

export type PermissionType =
  | "record_late"
  | "record_absent"
  | "record_violation"
  | "record_permission"
  | "send_messages"
  | "add_students"
  | "edit_students"
  | "barcode_scan"
  | "print_subject_sheets"
  | "record_class_notes"
  | "entry_exit"
  | "manage_teacher_affairs"
  | "print_teacher_certificates"
  | "import_teacher_files"
  | "manage_teacher_absence_type"
  | "manage_fares_upload"
  | "view_teacher_profile"
  | "edit_actions"
  | "delete_actions"
  | "print_reports"
  | "send_sms"
  | "send_whatsapp"
  | "view_audit_log"
  | "view_archive"
  | "manage_archive"
  | "create_referral"
  | "manage_referrals"
  | "manage_distinguished"
  | "view_reports"
  | "import_schedule"
  | "view_health_affairs"
  | "record_health_records"
  | "edit_health_records"
  | "print_health_records";

export const PERMISSION_LABELS: Record<PermissionType, string> = {
  record_late: "تسجيل التأخر",
  record_absent: "تسجيل الغياب",
  record_violation: "تسجيل المخالفات",
  record_permission: "تسجيل الاستئذان",
  send_messages: "إرسال الرسائل",
  add_students: "إضافة طلاب",
  edit_students: "تعديل بيانات الطلاب",
  barcode_scan: "مسح الباركود",
  print_subject_sheets: "طباعة كشوف المواد",
  record_class_notes: "تسجيل ملاحظات صفية",
  entry_exit: "إذن دخول وخروج",
  manage_teacher_affairs: "إدارة شؤون المعلمين",
  import_teacher_files: "استيراد ملفات شؤون المعلمين",
  manage_teacher_absence_type: "تعديل نوع الغياب للمعلمين",
  manage_fares_upload: "تعديل حالة الرفع في فارس",
  view_teacher_profile: "الاطلاع على ملف المعلم",
  edit_actions: "تعديل الإجراءات",
  delete_actions: "حذف الإجراءات",
  print_reports: "طباعة التقارير",
  print_teacher_certificates: "طباعة وتصدير شهادات المعلمين",
  send_sms: "إرسال رسائل SMS",
  send_whatsapp: "إرسال واتساب",
  view_audit_log: "الاطلاع على سجل المراجعة",
  view_archive: "الاطلاع على الأرشيف",
  manage_archive: "إدارة الأرشيف",
  create_referral: "إنشاء إحالة طالب",
  manage_referrals: "متابعة الإحالات",
  manage_distinguished: "إدارة السلوك الإيجابي",
  view_reports: "مشاهدة التقارير",
  import_schedule: "استيراد الجدول الدراسي",
  view_health_affairs: "الاطلاع على الشؤون الصحية",
  record_health_records: "تسجيل السجلات الصحية والمؤشرات الحيوية",
  edit_health_records: "تعديل السجلات الصحية والمؤشرات الحيوية",
  print_health_records: "طباعة السجلات الصحية",
};

export const ALL_PERMISSIONS: PermissionType[] = Object.keys(PERMISSION_LABELS) as PermissionType[];

// Grouped permissions by department for matrix UI
export interface PermissionGroup {
  key: string;
  label: string;
  icon: string;
  permissions: PermissionType[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "students_data",
    label: "بيانات الطلاب",
    icon: "👥",
    permissions: ["add_students", "edit_students", "barcode_scan"],
  },
  {
    key: "students_daily",
    label: "العمليات اليومية للطلاب",
    icon: "📋",
    permissions: [
      "record_late",
      "record_absent",
      "record_permission",
      "record_violation",
      "record_class_notes",
    ],
  },
  {
    key: "students_actions",
    label: "إدارة الإجراءات",
    icon: "⚙️",
    permissions: ["edit_actions", "delete_actions"],
  },
  {
    key: "students_referrals",
    label: "الإحالات والسلوك",
    icon: "🎯",
    permissions: ["create_referral", "manage_referrals", "manage_distinguished"],
  },
  {
    key: "services",
    label: "الخدمات والإذونات",
    icon: "🛂",
    permissions: ["entry_exit", "print_subject_sheets"],
  },
  {
    key: "messaging",
    label: "المراسلات",
    icon: "✉️",
    permissions: ["send_messages", "send_sms", "send_whatsapp"],
  },
  {
    key: "reports",
    label: "التقارير والطباعة",
    icon: "🖨️",
    permissions: ["view_reports", "print_reports"],
  },
  {
    key: "teachers",
    label: "شؤون المعلمين",
    icon: "👨‍🏫",
    permissions: ["manage_teacher_affairs", "manage_teacher_absence_type", "manage_fares_upload", "view_teacher_profile", "print_teacher_certificates", "import_teacher_files", "import_schedule", "view_archive", "manage_archive"],
  },
  {
    key: "system",
    label: "النظام والمراجعة",
    icon: "🛡️",
    permissions: ["view_audit_log"],
  },
  {
    key: "health",
    label: "الشؤون الصحية المدرسية",
    icon: "🩺",
    permissions: ["view_health_affairs", "record_health_records", "edit_health_records", "print_health_records"],
  },
];

let permissionsCache: Record<string, PermissionType[]> = {};
let loaded = false;
let loadingPromise: Promise<Record<string, PermissionType[]>> | null = null;
let version = 0;
const listeners = new Set<() => void>();

const notifyListeners = () => {
  version++;
  listeners.forEach((l) => {
    try { l(); } catch (e) { console.warn("permissions listener error", e); }
  });
};

export const getPermissionsVersion = (): number => version;

export const subscribePermissions = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export const arePermissionsLoaded = (): boolean => loaded;
export const getPermissionsLoadingPromise = (): Promise<unknown> | null => loadingPromise;

export const loadPermissions = async (): Promise<Record<string, PermissionType[]>> => {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
  const { data, error } = await supabase.from("user_permissions").select("*");
  if (error) {
    console.error("Failed to load permissions:", error);
    loadingPromise = null;
    return permissionsCache;
  }
  const next: Record<string, PermissionType[]> = {};
  (data || []).forEach((row: any) => {
    if (!next[row.user_id]) next[row.user_id] = [];
    next[row.user_id].push(row.permission);
  });
  permissionsCache = next;
  loaded = true;
  notifyListeners();
  return permissionsCache;
  })();
  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
};

export const getUserPermissions = (userId: string): PermissionType[] => {
  return permissionsCache[userId] || [];
};

export const setUserPermissions = async (
  userId: string,
  permissions: PermissionType[],
  grantedBy: string
): Promise<boolean> => {
  await supabase.from("user_permissions").delete().eq("user_id", userId);
  
  if (permissions.length === 0) {
    if (permissionsCache[userId]) delete permissionsCache[userId];
    notifyListeners();
    return true;
  }

  const rows = permissions.map((p) => ({
    user_id: userId,
    permission: p,
    granted_by: grantedBy,
  }));

  const { error } = await supabase.from("user_permissions").insert(rows);
  if (error) {
    console.error("Failed to set permissions:", error);
    return false;
  }

  permissionsCache[userId] = permissions;
  notifyListeners();
  return true;
};

export const hasPermission = (userId: string, isPrincipal: boolean, perm: PermissionType): boolean => {
  if (isPrincipal) return true;
  return (permissionsCache[userId] || []).includes(perm);
};
