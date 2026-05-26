import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Archive, CalendarDays, ClipboardList, Database, ShieldAlert, UserCog } from "lucide-react";
import TeacherIndicatorsBoard from "@/components/teachers/TeacherIndicatorsBoard";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";

const branches = [
  {
    title: "الأرشيف والبيانات",
    description: "سجل المعلمين، أرشيف الخطابات، وأرشيف الإجراءات في واجهة موحدة مستقلة.",
    path: "/teacher-affairs/archive",
    icon: Archive,
  },
  {
    title: "الشؤون الإدارية",
    description: "النماذج والإجراءات الإدارية والمتابعة الخاصة بالمعلمين دون تداخل مع بقية الفروع.",
    path: "/teacher-affairs/admin",
    icon: ClipboardList,
  },
  {
    title: "كشف حضوري شهري",
    description: "استيراد ملفات حضوري، ربط الهوية بالاسم والبيانات، وطباعة كشف شهري رسمي.",
    path: "/teacher-affairs/monthly-attendance",
    icon: CalendarDays,
  },
];

export default function TeacherAffairsPage() {
  const { profile, loading } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canManage = isPrincipal || hasPermission(userId, isPrincipal, "manage_teacher_affairs");

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background" dir="rtl">
        <div className="text-muted-foreground">جارٍ التحقق من الصلاحيات...</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-background p-6" dir="rtl">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center border-destructive/30">
            <ShieldAlert className="w-14 h-14 mx-auto text-destructive mb-3" />
            <h2 className="text-xl font-bold text-foreground">وصول مقيّد</h2>
            <p className="text-muted-foreground mt-2">
              مركز شؤون المعلمين يتطلب صلاحية «إدارة شؤون المعلمين».
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/">
                <ArrowRight className="ml-2 h-4 w-4" /> العودة للرئيسية
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-bl from-primary/10 via-background to-background" dir="rtl">
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <header className="rounded-2xl border bg-card/95 p-5 md:p-7 shadow-sm overflow-hidden relative">
          <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg">
                <UserCog className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-foreground">مركز شؤون المعلمين</h1>
                <p className="text-muted-foreground mt-2 max-w-3xl">
                  مركز مستقل ومنظم لفروع شؤون المعلمين، مع مؤشرات مباشرة من قاعدة البيانات وربط كامل بهوية المعلم.
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowRight className="ml-2 h-4 w-4" /> الرئيسية
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {branches.map((branch) => (
            <Link key={branch.path} to={branch.path} className="group block">
              <Card className="h-full p-6 border-2 hover:border-primary/50 hover:shadow-lg transition-all bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <branch.icon className="w-7 h-7" />
                  </div>
                  <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h2 className="text-xl font-black text-foreground mt-5">{branch.title}</h2>
                <p className="text-sm text-muted-foreground leading-7 mt-2">{branch.description}</p>
              </Card>
            </Link>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-foreground font-black text-lg">
            <Database className="w-5 h-5 text-primary" /> مؤشرات شؤون المعلمين المباشرة
          </div>
          <TeacherIndicatorsBoard />
        </section>
      </div>
    </div>
  );
}