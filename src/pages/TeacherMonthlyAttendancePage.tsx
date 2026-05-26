import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, ShieldAlert, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import MonthlyAttendance from "@/components/teachers/MonthlyAttendance";

export default function TeacherMonthlyAttendancePage() {
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
              صفحة كشف الحضور الشهري للمعلمين تتطلب صلاحية «إدارة شؤون المعلمين».
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/teacher-affairs">
                <ArrowRight className="ml-2 h-4 w-4" /> العودة لمركز شؤون المعلمين
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-[1700px] mx-auto p-4 md:p-6 space-y-6">
        <div className="rounded-2xl border bg-card p-4 md:p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/15 grid place-items-center shrink-0">
              <CalendarDays className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-foreground">كشف حضوري شهري</h1>
              <p className="text-sm text-muted-foreground">
                الإصدار 4 · صفحة مستقلة واسعة لاستيراد ملفات حضوري، ربط الهوية باسم المعلم وبياناته، وطباعة الكشف الرسمي.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/teacher-affairs">
                <ArrowRight className="ml-2 h-4 w-4" /> مركز شؤون المعلمين
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">الرئيسية</Link>
            </Button>
          </div>
        </div>

        <MonthlyAttendance />
      </div>
    </div>
  );
}
