import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import TeacherProfileDossier from "@/components/teachers/TeacherProfileDossier";
import LoadingScreen from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IdCard, AlertTriangle, ArrowRight } from "lucide-react";
import { hasPermission } from "@/store/permissionsStore";

/**
 * صفحة "ملفي" — للمعلم لعرض ملفه الكامل (للقراءة فقط)
 * أو للمصرح له (المدير / من يملك view_teacher_profile) لمشاهدة ملف معلم محدد
 * عبر باراميتر ?civil_id=...
 */
export default function MyTeacherProfilePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [civilId, setCivilId] = useState("");
  const [currentJob, setCurrentJob] = useState<string>("");
  const [notFound, setNotFound] = useState(false);

  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canViewAny = isPrincipal || hasPermission(userId, false, "view_teacher_profile") || hasPermission(userId, false, "manage_teacher_affairs");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedCivilId = (params.get("civil_id") || "").replace(/\D/g, "");

    const load = async () => {
      try {
        // 1) إذا كان هناك ?civil_id والمستخدم مصرح له، نعرض ذلك المعلم
        if (requestedCivilId && canViewAny) {
          const { data } = await supabase
            .from("teachers")
            .select("full_name, civil_id, current_job")
            .eq("civil_id", requestedCivilId)
            .eq("active", true)
            .maybeSingle();
          if (data) {
            setCivilId(data.civil_id);
            setTeacherName(data.full_name);
            setCurrentJob(data.current_job || "");
          } else {
            setNotFound(true);
          }
          return;
        }

        // 2) خلاف ذلك: نربط بـ national_id الخاص بالمستخدم الحالي
        const myId = (profile?.national_id || "").replace(/\D/g, "");
        if (!myId) {
          setNotFound(true);
          return;
        }
        const { data } = await supabase
          .from("teachers")
          .select("full_name, civil_id, current_job")
          .eq("civil_id", myId)
          .eq("active", true)
          .maybeSingle();
        if (data) {
          setCivilId(data.civil_id);
          setTeacherName(data.full_name);
          setCurrentJob(data.current_job || "");
        } else {
          // كحلّ احتياطي: ابحث بالاسم
          if (profile?.full_name) {
            const { data: byName } = await supabase
              .from("teachers")
              .select("full_name, civil_id, current_job")
              .eq("full_name", profile.full_name)
              .eq("active", true)
              .maybeSingle();
            if (byName) {
              setCivilId(byName.civil_id);
              setTeacherName(byName.full_name);
              setCurrentJob(byName.current_job || "");
              return;
            }
          }
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.national_id, profile?.full_name, canViewAny]);

  if (loading) {
    return <LoadingScreen message="جارٍ تجهيز ملفك" hint="نقوم بقراءة بياناتك من قاعدة البيانات" />;
  }

  return (
    <AppLayout>
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
              <IdCard className="text-primary" size={24} />
              ملفي الوظيفي
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              عرض كامل لبياناتك ومتابعتك (الحضور، الغياب، التأخر، الاستئذان، المخالفات والإجراءات) — للقراءة فقط
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-1">
            <ArrowRight size={16} /> رجوع
          </Button>
        </div>

        {notFound ? (
          <Card className="p-8 text-center border-warning/30 bg-warning/5">
            <AlertTriangle className="mx-auto text-warning mb-3" size={36} />
            <p className="font-bold text-foreground mb-1">لم يتم العثور على ملف معلم مرتبط بحسابك</p>
            <p className="text-sm text-muted-foreground mb-3">
              تأكد من إدخال رقم الهوية الوطنية بشكل صحيح في حسابك، أو راجع المدير لربطك بسجل المعلم في النظام.
            </p>
            {profile?.national_id && (
              <p className="text-xs text-muted-foreground">رقم هويتك المسجل: <span className="font-mono">{profile.national_id}</span></p>
            )}
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <TeacherProfileDossier
              open={true}
              onOpenChange={() => { /* صفحة مدمجة — لا تُغلق */ }}
              teacherName={teacherName}
              teacherCivilId={civilId}
              embedded
              hideTeachingSections={isNonTeachingRole(currentJob)}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

/** الأدوار التي لا تدرّس مواد ولا شعب — تُخفى عنهم تبويبات الجدول الدراسي والمواد والشعب. */
function isNonTeachingRole(job: string): boolean {
  const j = (job || "").trim();
  if (!j) return false;
  const NON_TEACHING = [
    "مدير المدرسة", "مدير",
    "وكيل", "وكيل شؤون المعلمين", "وكيل الشؤون التعليمية", "وكيل الشؤون المدرسية",
    "موجه طلابي", "موجه",
    "محضر مختبر", "محضر",
    "إداري", "اداري", "سكرتير", "مدخل بيانات",
  ];
  return NON_TEACHING.some((n) => j === n || j.includes(n));
}