import { Link } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HeartPulse, Stethoscope, Activity, ArrowRight, ShieldAlert,
  Siren, Accessibility, Send, CalendarX, Phone, Megaphone, Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";

export default function HealthAffairsHubPage() {
  const { profile, loading } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canView = isPrincipal
    || hasPermission(userId, isPrincipal, "view_health_affairs")
    || hasPermission(userId, isPrincipal, "record_health_records")
    || hasPermission(userId, isPrincipal, "edit_health_records");

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background" dir="rtl">
        <div className="text-muted-foreground">جارٍ التحقق من الصلاحيات...</div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen bg-background p-6" dir="rtl">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center border-destructive/30">
            <ShieldAlert className="w-14 h-14 mx-auto text-destructive mb-3" />
            <h2 className="text-xl font-bold text-foreground">وصول مقيّد</h2>
            <p className="text-muted-foreground mt-2">
              هذا القسم يتطلب صلاحية «الاطلاع على الشؤون الصحية» أو ما يقابلها.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/"><ArrowRight className="ml-2 h-4 w-4" /> العودة للرئيسية</Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const sections = [
    {
      title: "السجل الصحي للطلاب",
      description: "الأمراض المزمنة، الحساسية، الأدوية، وجهات الطوارئ لكل طالب حسب الشعبة.",
      icon: Stethoscope,
      to: "/health-affairs/records",
      color: "bg-rose-500/10 text-rose-600",
    },
    {
      title: "سجل الحالات الطارئة والإسعافات الأولية",
      description: "توثيق الإسعافات والخدمات الصحية الطارئة المقدمة للطلاب وإجراءات المتابعة.",
      icon: Siren,
      to: "/health-affairs/emergencies",
      color: "bg-red-500/10 text-red-600",
    },
    {
      title: "سجل المؤشرات الحيوية",
      description: "قياسات الطول والوزن وحساب BMI لكل شعبة على مدى الفصلين، جاهزة للإدخال والطباعة.",
      icon: Activity,
      to: "/health-affairs/vital-signs",
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      title: "سجل الطلاب ذوي الحالات الصحية الخاصة",
      description: "الحالات المزمنة والإعاقات والتكييفات المطلوبة وخطط الطوارئ.",
      icon: Accessibility,
      to: "/health-affairs/special-cases",
      color: "bg-purple-500/10 text-purple-600",
    },
    {
      title: "سجل التحويل والمتابعة الصحية",
      description: "تحويلات الطلاب للجهات الصحية والمتابعة الناتجة عنها.",
      icon: Send,
      to: "/health-affairs/medical-referrals",
      color: "bg-cyan-500/10 text-cyan-600",
    },
    {
      title: "سجل التوعية والبرامج الصحية",
      description: "البرامج والمحاضرات والأركان التوعوية الصحية المنفذة في المدرسة.",
      icon: Megaphone,
      to: "/health-affairs/awareness",
      color: "bg-amber-500/10 text-amber-600",
    },
    {
      title: "سجل البيئة والصحة المدرسية",
      description: "جولات تفقد دورات المياه والمقصف والفصول والمرافق المدرسية.",
      icon: Sparkles,
      to: "/health-affairs/environment",
      color: "bg-teal-500/10 text-teal-600",
    },
    {
      title: "سجل الغياب المرضي",
      description: "حالات الغياب المرضي مع التشخيص والتقارير الطبية المرفقة.",
      icon: CalendarX,
      to: "/health-affairs/medical-absences",
      color: "bg-orange-500/10 text-orange-600",
    },
    {
      title: "سجل التواصل مع أولياء الأمور (الحالات الصحية)",
      description: "توثيق المكالمات والرسائل الصحية المرسلة لولي الأمر وردوده.",
      icon: Phone,
      to: "/health-affairs/guardian-contacts",
      color: "bg-blue-500/10 text-blue-600",
    },
  ];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />
      <main className="lg:mr-64 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <HeartPulse size={24} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">الشؤون الصحية المدرسية</h1>
                <p className="text-sm text-muted-foreground">
                  السجل الصحي للطلاب ومتابعة المؤشرات الحيوية لكل شعبة، مرتبطة بملف الطالب وقاعدة البيانات.
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/"><ArrowRight className="ml-2 h-4 w-4" /> العودة للرئيسية</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sections.map((s) => (
              <Link key={s.to} to={s.to} className="group block">
                <Card className="h-full p-6 border-2 hover:border-primary/40 hover:shadow-md transition-all">
                  <div className={`w-14 h-14 rounded-xl ${s.color} grid place-items-center mb-3 group-hover:scale-105 transition-transform`}>
                    <s.icon size={28} />
                  </div>
                  <h3 className="font-bold text-foreground mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-7">{s.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}