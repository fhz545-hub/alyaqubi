import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { getStudentsFromDB } from "@/store/studentsStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Clock, XCircle, AlertOctagon, FileText, MessageCircle, ExternalLink, CheckCircle2, UserCheck, ClipboardList, Printer, Send, Phone, RefreshCw, LogOut, PenLine } from "lucide-react";
import { ActionType, ACTION_LABELS } from "@/types/school";
import { getFullHijriDate } from "@/utils/hijri";
import { printAlertList, printAlertSummonLetter, printWrittenPledge, type AlertListStudent } from "@/utils/print";
import WhatsAppActionDialog from "@/components/WhatsAppActionDialog";
import ReferralFormDialog from "@/components/ReferralFormDialog";
import type { Student } from "@/types/school";
import { toast } from "@/hooks/use-toast";

const ABSENCE_PROCEDURES = [
  { minCount: 1, label: "التواصل مع ولي الأمر هاتفيًا", icon: "📞" },
  { minCount: 3, label: "إشعار ولي الأمر رسميًا بالغياب المتكرر", icon: "📄" },
  { minCount: 5, label: "استدعاء ولي الأمر ومناقشة أسباب الغياب", icon: "👤" },
  { minCount: 7, label: "أخذ تعهد خطي على الطالب وولي الأمر", icon: "✍️" },
  { minCount: 10, label: "تحويل الحالة للجنة التوجيه الطلابي", icon: "⚠️" },
  { minCount: 15, label: "رفع الحالة لإدارة التعليم", icon: "🏛️" },
];

const LATE_PROCEDURES = [
  { minCount: 1, label: "تنبيه شفهي للطالب", icon: "💬" },
  { minCount: 3, label: "إشعار ولي الأمر هاتفيًا", icon: "📞" },
  { minCount: 5, label: "أخذ تعهد خطي على الطالب", icon: "✍️" },
  { minCount: 7, label: "استدعاء ولي الأمر", icon: "👤" },
  { minCount: 10, label: "تحويل الحالة للموجه الطلابي", icon: "📋" },
];

const VIOLATION_FOLLOW_PROCEDURES = [
  { minCount: 1, label: "تنبيه شفهي وتوثيق المخالفة", icon: "💬" },
  { minCount: 2, label: "إشعار ولي الأمر وحسم درجة", icon: "📞" },
  { minCount: 3, label: "تعهد خطي وحسم درجتين", icon: "✍️" },
  { minCount: 4, label: "استدعاء ولي الأمر وخطة علاجية", icon: "👤" },
  { minCount: 5, label: "تحويل الحالة للجنة التوجيه", icon: "⚠️" },
];

const PERMISSION_PROCEDURES = [
  { minCount: 1, label: "متابعة ولي الأمر هاتفيًا", icon: "📞" },
  { minCount: 3, label: "إشعار ولي الأمر رسميًا بتكرار الاستئذان", icon: "📄" },
  { minCount: 5, label: "استدعاء ولي الأمر ومناقشة الأسباب", icon: "👤" },
  { minCount: 7, label: "أخذ تعهد خطي على الطالب وولي الأمر", icon: "✍️" },
  { minCount: 10, label: "تحويل الحالة للموجه الطلابي", icon: "📋" },
];

const getNextProcedure = (type: string, count: number) => {
  const procedures = type === "absent" ? ABSENCE_PROCEDURES : type === "late" ? LATE_PROCEDURES : type === "permission" ? PERMISSION_PROCEDURES : VIOLATION_FOLLOW_PROCEDURES;
  for (let i = procedures.length - 1; i >= 0; i--) {
    if (count >= procedures[i].minCount) {
      const next = procedures[i + 1];
      return {
        current: procedures[i],
        next: next || null,
        completedSteps: i + 1,
        totalSteps: procedures.length,
      };
    }
  }
  return { current: procedures[0], next: procedures[1] || null, completedSteps: 0, totalSteps: procedures.length };
};

interface FrequentStudentDB {
  studentId: string;
  name: string;
  grade: string;
  section: number;
  count: number;
  lastDate: string;
  lastTime: string;
  guardianPhone: string;
}

const AlertFollowUpPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const alertType = searchParams.get("alert") as "absent" | "late" | "violation" | "permission" | null;
  const [whatsappStudent, setWhatsappStudent] = useState<Student | null>(null);
  const [dialogActionType, setDialogActionType] = useState<ActionType>("absent");
  const [minCount, setMinCount] = useState(3);
  const [referralStudent, setReferralStudent] = useState<{
    studentId: string; name: string; grade: string; section: number;
    count: number; caseType: string; previousActions: string[];
  } | null>(null);
  const [referralMap, setReferralMap] = useState<Record<string, { date: string }>>({});
  const [frequentStudents, setFrequentStudents] = useState<FrequentStudentDB[]>([]);
  const [loading, setLoading] = useState(true);

  const allStudents = useMemo(() => getStudentsFromDB(), []);

  // Build a phone lookup from students
  const phoneLookup = useMemo(() => {
    const map: Record<string, string> = {};
    allStudents.forEach(s => { if (s.guardianPhone) map[s.id] = s.guardianPhone; });
    return map;
  }, [allStudents]);

  // Load referral status
  useEffect(() => {
    const loadReferrals = async () => {
      const { data } = await supabase.from("student_referrals").select("student_id, referral_date");
      if (data) {
        const map: Record<string, { date: string }> = {};
        data.forEach(r => { map[r.student_id] = { date: r.referral_date }; });
        setReferralMap(map);
      }
    };
    loadReferrals();
  }, []);

  // Load frequent students directly from DB - accurate cumulative counts
  const loadFromDB = useCallback(async () => {
    if (!alertType) return;
    setLoading(true);
    try {
      const types = alertType === "permission" ? ["permission", "entry", "exit"] : [alertType];
      const pageSize = 1000;
      const rows: Array<{ student_id: string; student_name: string; grade: string; section: number; date: string; time: string }> = [];

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("student_actions")
          .select("student_id, student_name, grade, section, date, time")
          .in("type", types)
          .range(from, from + pageSize - 1);

        if (error) {
          console.error("Failed to load actions from DB:", error);
          setFrequentStudents([]);
          return;
        }

        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
      }

      const counts: Record<string, { name: string; grade: string; section: number; count: number; lastDate: string; lastTime: string }> = {};
      for (const row of rows) {
        const key = row.student_id;
        if (!counts[key]) {
          counts[key] = { name: row.student_name, grade: row.grade, section: row.section, count: 0, lastDate: row.date, lastTime: row.time };
        }
        counts[key].count++;
        if (row.date > counts[key].lastDate || (row.date === counts[key].lastDate && row.time > counts[key].lastTime)) {
          counts[key].lastDate = row.date;
          counts[key].lastTime = row.time;
        }
      }

      const result = Object.entries(counts)
        .filter(([_, v]) => v.count >= minCount)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, d]) => ({
          studentId: id,
          ...d,
          guardianPhone: phoneLookup[id] || "",
        }));

      setFrequentStudents(result);
    } catch (e) {
      console.error("loadFromDB error:", e);
    } finally {
      setLoading(false);
    }
  }, [alertType, minCount, phoneLookup]);

  useEffect(() => { loadFromDB(); }, [loadFromDB]);

  const titleMap: Record<string, string> = {
    absent: "كثيرو الغياب",
    late: "كثيرو التأخر",
    violation: "كثيرو المخالفات السلوكية",
    permission: "كثيرو الاستئذان",
  };

  const typeLabelsAr: Record<string, string> = {
    absent: "الغياب",
    late: "التأخر",
    violation: "المخالفات السلوكية",
    permission: "الاستئذان",
  };

  const iconMap: Record<string, React.ReactNode> = {
    absent: <XCircle size={22} className="text-destructive" />,
    late: <Clock size={22} className="text-warning" />,
    violation: <AlertOctagon size={22} className="text-destructive" />,
    permission: <LogOut size={22} className="text-accent-foreground" />,
  };

  const colorMap: Record<string, string> = {
    absent: "border-destructive/30",
    late: "border-warning/30",
    violation: "border-destructive/30",
    permission: "border-accent/30",
  };

  const openWhatsAppForStudent = (studentId: string) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (student) {
      setDialogActionType(alertType as ActionType || "absent");
      setWhatsappStudent(student);
    }
  };

  const getAlertListData = (): AlertListStudent[] => {
    return frequentStudents.map(s => {
      const procedure = getNextProcedure(alertType!, s.count);
      return {
        name: s.name,
        grade: s.grade,
        section: s.section,
        count: s.count,
        lastAction: procedure.current.label,
        hasReferral: !!referralMap[s.studentId],
        referralDate: referralMap[s.studentId]?.date,
      };
    });
  };

  const handlePrintList = () => {
    if (!alertType) return;
    printAlertList(alertType, getAlertListData(), minCount);
  };

  const handlePrintSummon = (student: FrequentStudentDB) => {
    if (!alertType) return;
    const procedure = getNextProcedure(alertType, student.count);
    printAlertSummonLetter(student.name, student.grade, student.section, alertType, student.count, procedure.current.label);
  };

  const handleWhatsAppSummon = (student: FrequentStudentDB) => {
    const phone = student.guardianPhone || phoneLookup[student.studentId];
    if (!phone) {
      toast({ title: "لا يوجد رقم جوال", description: "لم يتم تسجيل رقم ولي الأمر", variant: "destructive" });
      return;
    }
    const procedure = getNextProcedure(alertType!, student.count);
    const msg = `سعادة ولي أمر الطالب / ${student.name.split(" ")[0]}:\nنفيدكم بتكرر ${typeLabelsAr[alertType!]} بعدد (${student.count}) مرات.\nالإجراء المتخذ: ${procedure.current.label}\nنأمل التواصل مع المدرسة.\nثانوية اليعقوبي`;
    const formatted = phone.replace(/^0/, "966");
    window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (!alertType) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">لم يتم تحديد نوع المؤشر</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="gap-1 mb-3" onClick={() => navigate("/")}>
          <ArrowRight size={16} /> رجوع للوحة التحكم
        </Button>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          {iconMap[alertType]}
          <h1 className="text-2xl font-bold text-foreground">{titleMap[alertType] || "المؤشرات"}</h1>
          <span className="text-sm font-semibold bg-destructive/10 text-destructive px-3 py-1 rounded-full">
            {frequentStudents.length} طالب
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{getFullHijriDate()} — متابعة الحالات المتكررة واتخاذ الإجراء المناسب</p>

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">الحد الأدنى:</span>
            <Select value={String(minCount)} onValueChange={(v) => setMinCount(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} مرات</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePrintList}>
            <Printer size={14} />
            طباعة القائمة
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => loadFromDB()}>
            <RefreshCw size={14} />
            تحديث
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : frequentStudents.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-12 text-center">
          <CheckCircle2 size={48} className="mx-auto text-success mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد حالات متكررة</h3>
          <p className="text-sm text-muted-foreground">جميع الطلاب ضمن الحدود المقبولة ({minCount} مرات فأكثر)</p>
        </div>
      ) : (
        <div className="space-y-4">
          {frequentStudents.map((student, idx) => {
            const procedure = getNextProcedure(alertType, student.count);
            const progressPercent = Math.round((procedure.completedSteps / procedure.totalSteps) * 100);
            const hasReferral = !!referralMap[student.studentId];
            const guardianPhone = student.guardianPhone || phoneLookup[student.studentId] || "";

            return (
              <div
                key={student.studentId}
                className={`bg-card rounded-2xl border ${colorMap[alertType]} shadow-sm overflow-hidden transition-all hover:shadow-md ${idx === 0 ? 'ring-2 ring-destructive/30' : ''}`}
              >
                {/* Student Header */}
                <div className="flex items-center justify-between p-5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary'}`}>
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base">{student.name}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground">{student.grade} - فصل {student.section}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          alertType === "absent" || alertType === "violation" ? "bg-destructive/10 text-destructive border-destructive/30" :
                          alertType === "late" ? "bg-warning/10 text-warning border-warning/30" :
                          "bg-accent/10 text-accent-foreground border-accent/30"
                        }`}>
                          {typeLabelsAr[alertType]}
                        </span>
                        {hasReferral && (
                          <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full font-bold border border-warning/30">سبق تحويله</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-extrabold ${idx === 0 ? 'text-destructive' : 'text-destructive/80'}`}>{student.count}</span>
                    <span className="text-xs text-muted-foreground">مرة</span>
                  </div>
                </div>

                {/* Guardian info */}
                {guardianPhone && (
                  <div className="px-5 pb-2">
                    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border/30">
                      <Phone size={11} />
                      ولي الأمر: <span className="font-semibold text-foreground direction-ltr" dir="ltr">{guardianPhone}</span>
                    </div>
                  </div>
                )}

                {/* Procedure Progress */}
                <div className="px-5 pb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-foreground">تقدم الإجراءات</span>
                    <span className="text-xs text-muted-foreground">{procedure.completedSteps}/{procedure.totalSteps}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-warning to-destructive transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-warning/5 border border-warning/20 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-warning mb-1">✅ الإجراء الحالي (المستحق)</p>
                      <p className="text-xs font-medium text-foreground">{procedure.current.icon} {procedure.current.label}</p>
                    </div>
                    {procedure.next ? (
                      <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-destructive mb-1">⏭️ الإجراء التالي</p>
                        <p className="text-xs font-medium text-foreground">{procedure.next.icon} {procedure.next.label}</p>
                      </div>
                    ) : (
                      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-destructive mb-1">⚠️ تنبيه</p>
                        <p className="text-xs font-medium text-destructive">استُنفدت جميع الإجراءات التربوية</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Last record info */}
                <div className="px-5 py-2 bg-muted/30 border-t border-border/20">
                  <p className="text-[11px] text-muted-foreground">
                    آخر تسجيل: <span className="font-semibold text-foreground">{student.lastDate}</span> الساعة <span className="font-semibold text-foreground">{student.lastTime}</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-border/20 bg-muted/10">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate(`/student/${student.studentId}`)}>
                    <FileText size={14} />
                    ملف الطالب
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => openWhatsAppForStudent(student.studentId)}>
                    <MessageCircle size={14} />
                    تواصل واتساب
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handlePrintSummon(student)}>
                    <Printer size={14} />
                    خطاب استدعاء
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-warning/30 text-warning hover:bg-warning/5"
                    onClick={() => {
                      const procedure = getNextProcedure(alertType, student.count);
                      printWrittenPledge(student.name, student.grade, student.section, alertType, student.count, procedure.current.label);
                    }}
                  >
                    <PenLine size={14} />
                    تعهد خطي
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleWhatsAppSummon(student)}>
                    <Send size={14} />
                    استدعاء واتساب
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => {
                      const procedures = alertType === "absent" ? ABSENCE_PROCEDURES : alertType === "late" ? LATE_PROCEDURES : alertType === "permission" ? PERMISSION_PROCEDURES : VIOLATION_FOLLOW_PROCEDURES;
                      const completedProcedures = procedures.filter(p => student.count >= p.minCount).map(p => `${p.icon} ${p.label}`);
                      setReferralStudent({
                        studentId: student.studentId,
                        name: student.name,
                        grade: student.grade,
                        section: student.section,
                        count: student.count,
                        caseType: alertType,
                        previousActions: completedProcedures,
                      });
                    }}
                  >
                    <ClipboardList size={14} />
                    تحويل رسمي
                  </Button>
                  <Button variant="default" size="sm" className="gap-1.5 text-xs mr-auto" onClick={() => navigate(`/student/${student.studentId}`)}>
                    <ExternalLink size={14} />
                    متابعة الحالة
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {whatsappStudent && (
        <WhatsAppActionDialog
          open={!!whatsappStudent}
          onOpenChange={(open) => !open && setWhatsappStudent(null)}
          student={whatsappStudent}
          initialActionType={dialogActionType}
        />
      )}

      {referralStudent && (
        <ReferralFormDialog
          open={!!referralStudent}
          onOpenChange={(open) => !open && setReferralStudent(null)}
          studentData={referralStudent}
        />
      )}
    </AppLayout>
  );
};

export default AlertFollowUpPage;
