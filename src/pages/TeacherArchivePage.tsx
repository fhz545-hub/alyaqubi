import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Archive, ArrowRight, ShieldAlert } from "lucide-react";
import TeacherArchiveAndData from "@/components/teachers/TeacherArchiveAndData";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";

export default function TeacherArchivePage() {
  const { profile, loading } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canManage = isPrincipal || hasPermission(userId, isPrincipal, "manage_teacher_affairs") || hasPermission(userId, isPrincipal, "view_archive");

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground" dir="rtl">جارٍ التحقق من الصلاحيات...</div>;
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-background p-6" dir="rtl">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center border-destructive/30">
            <ShieldAlert className="w-14 h-14 mx-auto text-destructive mb-3" />
            <h2 className="text-xl font-bold text-foreground">وصول مقيّد</h2>
            <p className="text-muted-foreground mt-2">الأرشيف والبيانات يتطلب صلاحية مناسبة.</p>
            <Button asChild variant="outline" className="mt-5"><Link to="/teacher-affairs"><ArrowRight className="ml-2 h-4 w-4" /> مركز شؤون المعلمين</Link></Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary grid place-items-center"><Archive className="w-6 h-6" /></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-foreground">الأرشيف والبيانات</h1>
              <p className="text-sm text-muted-foreground">سجل المعلمين وأرشيف الخطابات والإجراءات داخل صفحة مستقلة واسعة.</p>
            </div>
          </div>
          <Button variant="outline" asChild><Link to="/teacher-affairs"><ArrowRight className="ml-2 h-4 w-4" /> مركز شؤون المعلمين</Link></Button>
        </div>
        <TeacherArchiveAndData />
      </div>
    </div>
  );
}