import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, ClipboardCheck, AlertTriangle,
  GraduationCap, Menu, X, Search, Printer, Shield, LogOut, BarChart3,
  BookOpen, Bell, ClipboardList, MessageSquare, CreditCard, Trophy,
  ChevronDown, HandshakeIcon, Building2,
  FileSearch, Settings, UserCog, Archive, CalendarDays, RefreshCw, IdCard, Lock,
  HeartPulse, Stethoscope, Activity,
} from "lucide-react";
import StudentSearchDialog from "./StudentSearchDialog";
import WhatsAppActionDialog from "./WhatsAppActionDialog";
import NotificationBell from "./NotificationBell";
import { Student } from "@/types/school";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, getUserPermissions } from "@/store/permissionsStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import logoUrl from "@/assets/yaqoubi-logo.jpeg";

const AppSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  
  // Teacher is restricted ONLY if no extra permissions granted
  const teacherDefaultPerms = new Set(["record_class_notes", "print_subject_sheets"]);
  const userPerms = getUserPermissions(userId);
  const hasExtraPerms = userPerms.some(p => !teacherDefaultPerms.has(p));
  const isTeacherRestricted = !isPrincipal && Boolean(profile?.approved && profile?.role_title?.includes("معلم") && !hasExtraPerms);

  useEffect(() => {
    if (!isPrincipal) return;
    const fetchPending = async () => {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("approved", false)
        .eq("is_principal", false);
      setPendingCount(count || 0);
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [isPrincipal]);

  // ===== Group navigation by official school sections =====
  type NavItem = { path: string; label: string; icon: any; badge?: number; allowed: boolean; description: string };
  type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

  const groups: NavGroup[] = useMemo(() => {
    const can = (perm: string) => hasPermission(userId, false, perm as any);
    // كل الأقسام تظهر دائماً للجميع، مع تمييز ما هو مصرّح به وقفل ما هو غير مصرّح به
    const result: NavGroup[] = [
      {
        id: "leadership", label: "القيادة المدرسية والحوكمة", icon: Building2, items: [
          { path: "/", label: "لوحة التحكم", icon: LayoutDashboard, allowed: true, description: "نظرة عامة على المؤشرات اليومية والأكاديمية." },
          { path: "/users", label: "المستخدمون والصلاحيات", icon: Shield, badge: pendingCount, allowed: isPrincipal, description: "إدارة المستخدمين واعتمادهم وضبط صلاحياتهم — للمدير فقط." },
          { path: "/audit-log", label: "سجل التدقيق", icon: FileSearch, allowed: isPrincipal, description: "سجل شامل لجميع الإجراءات في النظام — للمدير فقط." },
          { path: "/distance-learning-settings", label: "شعب الانتساب", icon: Settings, allowed: isPrincipal, description: "إعدادات شعب التعليم الإلكتروني/الانتساب — للمدير فقط." },
        ]
      },
      {
        id: "students", label: "شؤون الطلاب", icon: Users, items: [
          { path: "/student-affairs", label: "مركز شؤون الطلاب", icon: GraduationCap, allowed: true, description: "الصفحة الجامعة لشؤون الطلاب." },
          { path: "/students", label: "شؤون الطلاب", icon: Users, allowed: isPrincipal || can("add_students") || can("edit_students"), description: "إضافة وتعديل بيانات الطلاب." },
          { path: "/attendance", label: "المواظبة", icon: ClipboardCheck, allowed: isPrincipal || isTeacherRestricted || can("record_late") || can("record_absent") || can("barcode_scan"), description: "تسجيل التأخر والغياب ومتابعة المواظبة." },
          { path: "/violations", label: "السلوك", icon: AlertTriangle, allowed: isPrincipal || isTeacherRestricted || can("record_violation"), description: "تسجيل المخالفات السلوكية ومتابعتها." },
          { path: "/positive-behavior", label: "السلوك الإيجابي والفصول المتميزة", icon: Trophy, allowed: isPrincipal || isTeacherRestricted || can("manage_distinguished"), description: "متابعة السلوك الإيجابي للطلاب والفصول." },
          { path: "/classroom", label: "الملاحظات الصفية", icon: BookOpen, allowed: isPrincipal || isTeacherRestricted || can("record_class_notes"), description: "تسجيل الملاحظات الصفية وفق المراحل المعتمدة." },
          { path: "/referral-tracking", label: "الإجراءات والإحالات", icon: ClipboardList, allowed: isPrincipal || can("record_permission") || can("manage_referrals"), description: "متابعة الإحالات والإجراءات الرسمية." },
          { path: "/entry-exit", label: "إذن دخول وخروج", icon: CreditCard, allowed: isPrincipal || can("entry_exit"), description: "إصدار إذونات الدخول والخروج للطلاب." },
          { path: "/print", label: "الطباعة وكشوف المواد", icon: Printer, allowed: isPrincipal || isTeacherRestricted || can("print_subject_sheets") || can("print_reports"), description: "طباعة كشوف المواد والتقارير." },
        ]
      },
      {
        id: "educational", label: "الشؤون التعليمية", icon: GraduationCap, items: [
          { path: "/educational-affairs", label: "مركز الشؤون التعليمية", icon: GraduationCap, allowed: isPrincipal, description: "الصفحة الجامعة للشؤون التعليمية — للمدير فقط." },
          { path: "/daily-report", label: "التقرير اليومي والتراكمي", icon: BarChart3, allowed: isPrincipal || can("view_reports"), description: "تقارير يومية وتراكمية شاملة." },
        ]
      },
      {
        id: "teachers", label: "شؤون المعلمين", icon: UserCog, items: [
          { path: "/teacher-affairs", label: "مركز شؤون المعلمين", icon: UserCog, allowed: isPrincipal || can("manage_teacher_affairs"), description: "الصفحة الجامعة لشؤون المعلمين." },
          { path: "/teacher-affairs/archive", label: "الأرشيف والبيانات", icon: Archive, allowed: isPrincipal || can("manage_teacher_affairs") || can("view_archive"), description: "أرشيف بيانات المعلمين والتقارير." },
          { path: "/teacher-affairs/admin", label: "الشؤون الإدارية", icon: ClipboardList, allowed: isPrincipal || can("manage_teacher_affairs"), description: "الشؤون الإدارية للمعلمين والإشعارات." },
          { path: "/teacher-affairs/monthly-attendance", label: "كشف حضوري شهري", icon: CalendarDays, allowed: isPrincipal || can("manage_teacher_affairs"), description: "كشف الحضور والانصراف الشهري." },
        ]
      },
      {
        id: "health", label: "الشؤون الصحية المدرسية", icon: HeartPulse, items: [
          { path: "/health-affairs", label: "مركز الشؤون الصحية", icon: HeartPulse, allowed: isPrincipal || can("view_health_affairs") || can("record_health_records") || can("edit_health_records"), description: "السجل الصحي للطلاب والمؤشرات الحيوية." },
          { path: "/health-affairs/records", label: "الحالات المرضية والصحية", icon: Stethoscope, allowed: isPrincipal || can("view_health_affairs") || can("record_health_records") || can("edit_health_records"), description: "تسجيل الحالات المرضية ومتابعتها لكل طالب." },
          { path: "/health-affairs/vital-signs", label: "سجل المؤشرات الحيوية", icon: Activity, allowed: isPrincipal || can("view_health_affairs") || can("record_health_records") || can("edit_health_records"), description: "سجل الطول والوزن وBMI لكل شعبة، قابل للطباعة." },
        ]
      },
      {
        id: "comms", label: "الشراكة والاتصال", icon: HandshakeIcon, items: [
          { path: "/sms", label: "إدارة الرسائل (SMS)", icon: MessageSquare, allowed: isPrincipal || can("send_messages") || can("send_sms"), description: "إرسال الرسائل النصية وأرشيفها." },
        ]
      },
      {
        id: "guide", label: "الدليل والمساعدة", icon: BookOpen, items: [
          { path: "/guide", label: "دليل الاستخدام", icon: BookOpen, allowed: true, description: "دليل شامل للنظام يحتوي ملفك الوظيفي وصلاحياتك والقواعد." },
          ...(isPrincipal ? [] : [{ path: "/guide?tab=contact", label: "تواصل مع المدير", icon: MessageSquare, allowed: true, description: "أرسل استفساراً أو ملاحظة أو طلب دعم مباشرة لمدير المدرسة." } as NavItem]),
        ]
      },
    ];
    return result;
  }, [isPrincipal, isTeacherRestricted, userId, pendingCount]);

  // كل الأقسام مغلقة افتراضياً — تُفتح فقط عند ضغط المستخدم
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student);
    setWhatsappOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const handleNavClick = (item: NavItem) => {
    if (!item.allowed) {
      toast({
        title: "غير مصرح لك بالدخول",
        description: item.description || "هذا القسم محصور بمن يملك الصلاحية.",
        variant: "destructive",
      });
      return;
    }
    navigate(item.path);
    setMobileOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "إغلاق القائمة" : "فتح القائمة"}
        className="fixed top-4 right-4 z-50 bg-primary text-primary-foreground p-2.5 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all"
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-30" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-72 z-40 flex flex-col transition-transform duration-300 ease-out bg-gradient-to-b from-[hsl(var(--sidebar-gradient-from))] to-[hsl(var(--sidebar-gradient-to))] shadow-[0_0_50px_-10px_rgba(0,0,0,0.55)] border-l border-sidebar-border/60 ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="relative flex items-center gap-3 px-5 py-5 border-b border-sidebar-border/60 bg-gradient-to-l from-[hsl(var(--sidebar-primary)/0.18)] via-transparent to-transparent">
          <div className="relative w-12 h-12 rounded-2xl bg-white grid place-items-center shadow-[0_8px_22px_-8px_hsl(var(--sidebar-glow)/0.55)] ring-2 ring-[hsl(var(--sidebar-primary)/0.45)] overflow-hidden shrink-0">
            <img src={logoUrl} alt="مدرسة اليعقوبي الثانوية" className="w-10 h-10 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-extrabold text-sidebar-foreground leading-tight tracking-tight">مدرسة اليعقوبي</h1>
            <p className="text-[11px] text-sidebar-foreground/60 mt-0.5">النظام المدرسي · الثانوية</p>
          </div>
          <NotificationBell />
        </div>

        {profile && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/40 border border-sidebar-border/50">
            <p className="text-xs text-sidebar-foreground font-bold truncate">{profile.full_name}</p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">{profile.role_title}</p>
          </div>
        )}

        {isPrincipal && pendingCount > 0 && (
          <button
            onClick={() => { navigate("/users"); setMobileOpen(false); }}
            className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs font-semibold hover:bg-warning/20 transition-all"
          >
            <Bell size={14} className="animate-pulse" />
            <span>{pendingCount} طلب تسجيل جديد</span>
          </button>
        )}

        {!isTeacherRestricted && (
          <div className="px-3 pt-4 pb-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sidebar-accent/50 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all text-sm"
            >
              <Search size={16} />
              <span>بحث عن طالب...</span>
            </button>
          </div>
        )}

        <nav className="flex-1 px-2.5 py-2 space-y-1.5 overflow-y-auto sidebar-scroll">
          {groups.map((group) => {
            const isOpen = openGroup === group.id;
            const hasActive = group.items.some((it) => it.path === location.pathname);
            const totalBadge = group.items.reduce((sum, it) => sum + (it.badge || 0), 0);
            return (
              <div key={group.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-extrabold transition-all duration-200 ${
                    hasActive || isOpen
                      ? "bg-sidebar-accent/70 text-sidebar-foreground shadow-[inset_0_0_0_1px_hsl(var(--sidebar-primary)/0.35)]"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 transition-colors ${
                    hasActive ? "bg-[hsl(var(--sidebar-primary)/0.25)] text-[hsl(var(--sidebar-primary))]"
                              : "bg-sidebar-accent/40 text-sidebar-foreground/80"
                  }`}>
                    <group.icon size={15} />
                  </span>
                  <span className="flex-1 text-right truncate">{group.label}</span>
                  {totalBadge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                      {totalBadge}
                    </span>
                  )}
                  <ChevronDown size={15} className={`shrink-0 transition-transform duration-200 opacity-70 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="mt-1.5 mr-3 space-y-1 border-r-2 border-[hsl(var(--sidebar-primary)/0.25)] pr-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      const locked = !item.allowed;
                      return (
                        <button
                          key={item.path}
                          onClick={() => handleNavClick(item)}
                          title={locked ? `غير مصرح لك بالدخول — ${item.description}` : item.description}
                          className={`${isActive ? "sidebar-item-active" : "sidebar-item"} w-full relative text-[13px] ${locked ? "opacity-55 cursor-not-allowed" : ""}`}
                        >
                          <item.icon size={15} className={`shrink-0 ${isActive ? "text-[hsl(var(--sidebar-primary))]" : ""}`} />
                          <span className="truncate flex-1 text-right">{item.label}</span>
                          {locked && (
                            <Lock size={12} className="text-sidebar-foreground/45 shrink-0" aria-label="غير مصرح" />
                          )}
                          {item.badge && item.badge > 0 && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 pb-2 pt-2 border-t border-sidebar-border/50">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              const fn = (window as any).__checkForUpdates as (() => Promise<void>) | undefined;
              if (fn) {
                try { await fn(); } catch { /* ignore */ }
              }
              // إذا لم يظهر إشعار التحديث، أعِد التحميل بقوة لجلب أحدث نسخة
              const url = new URL(window.location.href);
              url.searchParams.set("_v", Date.now().toString());
              window.location.replace(url.toString());
            }}
            className="sidebar-item w-full text-primary/90 hover:text-primary hover:bg-primary/10"
            type="button"
            title="جلب أحدث نسخة من النظام مع تنظيف الذاكرة المؤقتة"
          >
            <RefreshCw size={16} />
            <span className="text-[13px] font-bold">تحقق من التحديث</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleSignOut(); }}
            className="sidebar-item w-full text-destructive/80 hover:text-destructive hover:bg-destructive/10"
            type="button"
          >
            <LogOut size={16} />
            <span className="text-[13px] font-bold">تسجيل الخروج</span>
          </button>
        </div>

        <div className="px-6 py-3 border-t border-sidebar-border/50 flex items-center justify-between">
          <p className="text-[10px] font-extrabold text-sidebar-foreground/70">الإصدار 4</p>
          <p className="text-[10px] text-sidebar-foreground/40">© اليعقوبي</p>
        </div>
      </aside>

      {!isTeacherRestricted && (
        <>
          <StudentSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectStudent={handleStudentSelect} />
          {selectedStudent && (
            <WhatsAppActionDialog student={selectedStudent} open={whatsappOpen} onOpenChange={setWhatsappOpen} />
          )}
        </>
      )}
    </>
  );
};

export default AppSidebar;
