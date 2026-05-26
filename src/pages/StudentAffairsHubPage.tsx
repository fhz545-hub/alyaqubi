import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, ClipboardCheck, AlertTriangle, Trophy, BookOpen,
  ClipboardList, CreditCard, Printer, ArrowRight, GraduationCap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";

type Section = {
  title: string;
  description: string;
  icon: any;
  path: string;
  color: string;
  group: "students" | "operations" | "services";
  permKey?: "add_students" | "edit_students" | "record_late" | "record_absent" | "barcode_scan" | "record_violation" | "record_class_notes" | "record_permission" | "entry_exit" | "print_subject_sheets";
  publicForTeacher?: boolean;
};

const SECTIONS: Section[] = [
  // إدارة بيانات
  {
    title: "سجل الطلاب",
    description: "بيانات الطلاب الكاملة، البحث، التعديل، استيراد البيانات",
    icon: Users,
    path: "/students",
    color: "bg-primary/10 text-primary",
    group: "students",
    permKey: "add_students",
  },
  // عمليات يومية
  {
    title: "المواظبة",
    description: "تسجيل الحضور، التأخر، الغياب، والاستئذان",
    icon: ClipboardCheck,
    path: "/attendance",
    color: "bg-emerald-500/10 text-emerald-600",
    group: "operations",
    permKey: "record_late",
    publicForTeacher: true,
  },
  {
    title: "السلوك والمخالفات",
    description: "تسجيل المخالفات السلوكية وفق لائحة 1447هـ",
    icon: AlertTriangle,
    path: "/violations",
    color: "bg-red-500/10 text-red-600",
    group: "operations",
    permKey: "record_violation",
    publicForTeacher: true,
  },
  {
    title: "الملاحظات الصفية",
    description: "ملاحظات المعلمين أثناء الحصص ومراحل التصعيد التربوي",
    icon: BookOpen,
    path: "/classroom",
    color: "bg-blue-500/10 text-blue-600",
    group: "operations",
    permKey: "record_class_notes",
    publicForTeacher: true,
  },
  {
    title: "السلوك الإيجابي والفصول المتميزة",
    description: "تكريم الطلاب والشعب الأقل في السلوكيات السلبية",
    icon: Trophy,
    path: "/positive-behavior",
    color: "bg-amber-500/10 text-amber-600",
    group: "operations",
    publicForTeacher: true,
  },
  {
    title: "الإجراءات والإحالات",
    description: "متابعة الإحالات للوكيل والموجه الطلابي",
    icon: ClipboardList,
    path: "/referral-tracking",
    color: "bg-violet-500/10 text-violet-600",
    group: "operations",
    permKey: "record_permission",
  },
  // خدمات (نقلت من «الشؤون المدرسية والخدمات» السابقة)
  {
    title: "إذن دخول وخروج",
    description: "إصدار وطباعة تصاريح الدخول والخروج للطلاب",
    icon: CreditCard,
    path: "/entry-exit",
    color: "bg-sky-500/10 text-sky-600",
    group: "services",
    permKey: "entry_exit",
  },
  {
    title: "الطباعة وكشوف المواد",
    description: "طباعة كشوف الحضور وأعمال السنة وكشوف مبسطة جاهزة",
    icon: Printer,
    path: "/print",
    color: "bg-teal-500/10 text-teal-600",
    group: "services",
    permKey: "print_subject_sheets",
    publicForTeacher: true,
  },
];

const GROUP_LABELS: Record<Section["group"], { title: string; subtitle: string }> = {
  students: {
    title: "إدارة بيانات الطلاب",
    subtitle: "السجلات الأساسية وبيانات الطلاب",
  },
  operations: {
    title: "العمليات اليومية والمتابعة",
    subtitle: "تسجيل الإجراءات اليومية والسلوك والإحالات",
  },
  services: {
    title: "الخدمات والطباعة",
    subtitle: "الإصدار والطباعة وأذونات الدخول والخروج",
  },
};

export default function StudentAffairsHubPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";

  const [counts, setCounts] = useState({
    students: 0, attendance: 0, violations: 0, notes: 0, referrals: 0, permits: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [s, att, vio, notes, ref] = await Promise.all([
          supabase.from("students").select("*", { count: "exact", head: true }),
          supabase.from("student_actions").select("*", { count: "exact", head: true }).in("type", ["late", "absent"]).eq("date", today),
          supabase.from("student_actions").select("*", { count: "exact", head: true }).eq("type", "violation"),
          supabase.from("student_actions").select("*", { count: "exact", head: true }).in("type", ["class_note", "class_late", "class_escape", "no_homework", "sleeping", "class_chaos"]),
          supabase.from("student_referrals").select("*", { count: "exact", head: true }),
        ]);
        setCounts({
          students: s.count || 0,
          attendance: att.count || 0,
          violations: vio.count || 0,
          notes: notes.count || 0,
          referrals: ref.count || 0,
          permits: 0,
        });
      } catch {
        // silent
      }
    })();
  }, []);

  const visible = SECTIONS.filter((s) => {
    if (isPrincipal) return true;
    if (s.publicForTeacher) return true;
    if (s.permKey) return hasPermission(userId, isPrincipal, s.permKey);
    return false;
  });

  const grouped = (g: Section["group"]) => visible.filter((s) => s.group === g);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="lg:mr-64 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <GraduationCap size={24} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">شؤون الطلاب</h1>
                <p className="text-sm text-muted-foreground">
                  مركز إدارة الطلاب الكامل: البيانات، المواظبة، السلوك، الإجراءات، والخدمات.
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowRight className="ml-2 h-4 w-4" />
                العودة للرئيسية
              </Link>
            </Button>
          </div>

          {/* Live KPIs from DB */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <KpiCard label="إجمالي الطلاب" value={counts.students} tone="primary" icon={<Users className="w-4 h-4" />} />
            <KpiCard label="مواظبة اليوم" value={counts.attendance} tone="success" icon={<ClipboardCheck className="w-4 h-4" />} />
            <KpiCard label="المخالفات (الكلي)" value={counts.violations} tone="danger" icon={<AlertTriangle className="w-4 h-4" />} />
            <KpiCard label="الملاحظات الصفية" value={counts.notes} tone="warning" icon={<BookOpen className="w-4 h-4" />} />
            <KpiCard label="الإحالات الرسمية" value={counts.referrals} tone="violet" icon={<ClipboardList className="w-4 h-4" />} />
          </div>

          {/* Grouped sections */}
          {(["students", "operations", "services"] as const).map((g) => {
            const items = grouped(g);
            if (!items.length) return null;
            return (
              <section key={g} className="mb-8">
                <div className="mb-3">
                  <h2 className="text-lg font-bold text-foreground">{GROUP_LABELS[g].title}</h2>
                  <p className="text-xs text-muted-foreground">{GROUP_LABELS[g].subtitle}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((s) => (
                    <Card
                      key={s.path}
                      onClick={() => navigate(s.path)}
                      className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
                    >
                      <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <s.icon size={24} />
                      </div>
                      <h3 className="font-bold text-foreground mb-1">{s.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label, value, tone, icon,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "danger" | "warning" | "violet";
  icon: React.ReactNode;
}) {
  const tones = {
    primary: "from-primary/15 to-primary/5 text-primary border-primary/30",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-300",
    danger: "from-red-500/15 to-red-500/5 text-red-700 dark:text-red-400 border-red-300",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-300",
    violet: "from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-400 border-violet-300",
  };
  return (
    <Card className={`p-3 bg-gradient-to-bl ${tones[tone]} border`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold opacity-80">{label}</div>
          <div className="text-xl font-bold mt-1">{value.toLocaleString("ar-SA")}</div>
        </div>
        <div className="opacity-80">{icon}</div>
      </div>
    </Card>
  );
}
