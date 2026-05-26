import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ACTION_COLORS, ACTION_LABELS, ActionType, CLASSROOM_ACTION_TYPES, SCHOOL_INFO, Student } from "@/types/school";
import { loadStudents, getStudentsFromDB } from "@/store/studentsStore";
import { Trash2, ArrowRight, Printer, MessageCircle, CheckCircle, FileText, StickyNote, UserCheck, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getHijriDateShort } from "@/utils/hijri";
import WhatsAppActionDialog from "@/components/WhatsAppActionDialog";
import { buildStudentIdentityKey } from "@/utils/classroomActionIdentity";
import { extractFollowupStage, getReferralStatusLabel, parseClassroomReferralPayload, stripFollowupPrefix } from "@/utils/classroomReferral";
import { useAuth } from "@/contexts/AuthContext";
import { getUserPermissions } from "@/store/permissionsStore";
import ViewOnlyBanner from "@/components/ViewOnlyBanner";

interface ActionRow {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string;
  grade: string;
  section: number;
  type: string;
  date: string;
  time: string;
  details: string | null;
  performed_by_name: string | null;
  performed_by_role: string | null;
  period?: number | null;
  subject_name?: string | null;
}

interface ClassroomTimelineItem {
  id: string;
  type: ActionType;
  date: string;
  time: string;
  period?: number;
  subjectName?: string;
  followupStage: string;
  description: string;
  performedByName?: string;
  performedByRole?: string;
}

interface ClassroomCase {
  key: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  grade: string;
  section: number;
  totalNotes: number;
  latestDate: string;
  latestTime: string;
  currentStage: string;
  referralStatus?: string;
  referralLabel?: string;
  referralActionTaken?: string;
  studentRecord?: Student;
  timeline: ClassroomTimelineItem[];
}

const getDayName = (dateStr: string) => {
  try {
    const parts = dateStr.split("-");
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
  } catch {
    return "";
  }
};

const stageToneClass = (stage: string) => {
  if (stage.includes("إنهاء") || stage.includes("تم اتخاذ")) return "bg-success/10 text-success border-success/30";
  if (stage.includes("إحالة") || stage.includes("تحويل")) return "bg-destructive/10 text-destructive border-destructive/30";
  if (stage.includes("متابعة") || stage.includes("تكرار")) return "bg-warning/10 text-warning border-warning/30";
  return "bg-primary/10 text-primary border-primary/30";
};

const ActionDetailsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const teacherDefaultPerms = new Set(["record_class_notes", "print_subject_sheets"]);
  const userPerms = getUserPermissions(userId);
  const hasExtraPerms = userPerms.some(p => !teacherDefaultPerms.has(p));
  const isTeacherRestricted = !isPrincipal && Boolean(profile?.approved && profile?.role_title?.includes("معلم") && !hasExtraPerms);

  const rawType = searchParams.get("type");
  const isPresent = rawType === "present";
  const isClassroomNotes = rawType === "classroomNotes";
  const actionType = isPresent || isClassroomNotes ? null : (rawType as ActionType | null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [presentStudents, setPresentStudents] = useState<Student[]>([]);
  const [classroomCases, setClassroomCases] = useState<ClassroomCase[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>(getStudentsFromDB());
  const [loading, setLoading] = useState(false);
  const [whatsappStudent, setWhatsappStudent] = useState<Student | null>(null);
  const [_dialogChannelUnused] = useState<"whatsapp">("whatsapp");
  const [dialogActionType, setDialogActionType] = useState<ActionType>("absent");

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  // Optional date param from dashboard: when historical date is selected, show that day's records
  const dateParam = searchParams.get("date");
  const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr;
  const isHistorical = today !== todayStr;

  const fetchClassroomCases = useCallback(async (signal: AbortSignal) => {
    const pageSize = 1000;
    const classroomRows: ActionRow[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("student_actions")
        .select("id, student_id, student_name, student_number, grade, section, type, date, time, details, performed_by_name, performed_by_role, period, subject_name")
        .in("type", CLASSROOM_ACTION_TYPES)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .range(from, from + pageSize - 1)
        .abortSignal(signal);

      if (error) throw error;
      if (!data || data.length === 0) break;
      classroomRows.push(...(data as ActionRow[]));
      if (data.length < pageSize) break;
    }

    const referralRows: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("messages")
        .select("id, status, reply_text, created_at, message_text, student_name, student_grade, sender_name, sender_role")
        .eq("message_type", "class_referral")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1)
        .abortSignal(signal);

      if (error) throw error;
      if (!data || data.length === 0) break;
      referralRows.push(...data);
      if (data.length < pageSize) break;
    }

    const students = getStudentsFromDB();
    const referralMap = new Map<string, { status: string; actionTaken: string }>();

    referralRows.forEach((row) => {
      const payload = parseClassroomReferralPayload(row.message_text, {
        studentName: row.student_name || "",
        grade: row.student_grade || "",
        teacherName: row.sender_name || "",
        teacherRole: row.sender_role || "",
      });
      const key = buildStudentIdentityKey(payload?.studentId, payload?.studentNumber);
      if (key && !referralMap.has(key)) {
        referralMap.set(key, { status: row.status || "transferred_after_third_note", actionTaken: row.reply_text || "" });
      }
    });

    const grouped = new Map<string, ClassroomCase>();

    classroomRows.forEach((row) => {
      const key = buildStudentIdentityKey(row.student_id, row.student_number) || `${row.student_id}-${row.student_number}`;
      const studentRecord = students.find((student) => student.id === row.student_id || student.studentNumber === row.student_number);
      const timelineItem: ClassroomTimelineItem = {
        id: row.id,
        type: row.type as ActionType,
        date: row.date,
        time: row.time,
        period: row.period || undefined,
        subjectName: row.subject_name || undefined,
        followupStage: extractFollowupStage(row.details || ""),
        description: stripFollowupPrefix(row.details || "") || ACTION_LABELS[row.type as ActionType],
        performedByName: row.performed_by_name || undefined,
        performedByRole: row.performed_by_role || undefined,
      };

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          studentId: row.student_id,
          studentName: row.student_name,
          studentNumber: row.student_number,
          grade: row.grade,
          section: row.section,
          totalNotes: 1,
          latestDate: row.date,
          latestTime: row.time,
          currentStage: timelineItem.followupStage,
          studentRecord,
          timeline: [timelineItem],
        });
        return;
      }

      existing.totalNotes += 1;
      existing.timeline.push(timelineItem);
      if (row.date > existing.latestDate || (row.date === existing.latestDate && row.time > existing.latestTime)) {
        existing.latestDate = row.date;
        existing.latestTime = row.time;
        existing.currentStage = timelineItem.followupStage;
      }
    });

    const cases = Array.from(grouped.values())
      .map((item) => {
        item.timeline.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        const referral = referralMap.get(item.key);
        if (referral) {
          item.referralStatus = referral.status;
          item.referralLabel = referral.status === "action_taken" ? "تم إنهاء الموقف" : getReferralStatusLabel(referral.status);
          item.referralActionTaken = referral.actionTaken;
        }
        return item;
      })
      .sort((a, b) => b.totalNotes - a.totalNotes || b.latestDate.localeCompare(a.latestDate) || b.latestTime.localeCompare(a.latestTime));

    setClassroomCases(cases);
  }, []);

  const fetchActions = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);

    setLoading(true);
    try {
      const students = await loadStudents();
      setAllStudents(students);

      if (isPresent) {
        const { data: todayActions } = await supabase
          .from("student_actions")
          .select("student_id, type")
          .eq("date", today)
          .in("type", ["absent", "permission"])
          .abortSignal(controller.signal);

        const absentIds = new Set((todayActions || []).map((a: any) => a.student_id));
        setPresentStudents(students.filter((s) => !absentIds.has(s.id)));
        setActions([]);
        setClassroomCases([]);
      } else if (isClassroomNotes) {
        await fetchClassroomCases(controller.signal);
        setActions([]);
        setPresentStudents([]);
      } else {
        let query = supabase
          .from("student_actions")
          .select("id, student_id, student_name, student_number, grade, section, type, date, time, details, performed_by_name, performed_by_role")
          .eq("date", today)
          .order("grade", { ascending: true })
          .order("section", { ascending: true })
          .order("student_name", { ascending: true })
          .abortSignal(controller.signal);

        if (actionType) query = query.eq("type", actionType);

        const { data, error } = await query;
        if (error) throw error;
        setActions((data as ActionRow[]) || []);
        setPresentStudents([]);
        setClassroomCases([]);
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.warn("Fetch actions timeout");
      } else {
        console.error("fetchActions error:", error);
      }
      setActions([]);
      setPresentStudents([]);
      setClassroomCases([]);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [actionType, fetchClassroomCases, isClassroomNotes, isPresent, today]);

  useEffect(() => {
    const guard = window.setTimeout(() => setLoading(false), 3000);
    fetchActions().finally(() => window.clearTimeout(guard));
    return () => window.clearTimeout(guard);
  }, [fetchActions]);

  useEffect(() => {
    const channel = supabase
      .channel(`action-details-realtime-${rawType || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => fetchActions());

    if (isClassroomNotes) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: "message_type=eq.class_referral" },
        () => fetchActions()
      );
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchActions, isClassroomNotes, rawType]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("student_actions").delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم إلغاء الإجراء ✅" });
      setActions((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const openStudentDialogFromAction = (action: ActionRow) => {
    const student = allStudents.find((s) => s.studentNumber === action.student_number || s.id === action.student_id);
    if (student) {
      setDialogActionType((action.type as ActionType) || "absent");
      setWhatsappStudent(student);
    }
  };

  const openStudentDialogDirect = (student: Student, initialType: ActionType = "absent") => {
    setDialogActionType(initialType);
    setWhatsappStudent(student);
  };

  const printClassroomCases = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const casesHtml = classroomCases.map((item, caseIndex) => {
      const rows = item.timeline.map((timeline, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${ACTION_LABELS[timeline.type]}</td>
          <td>${timeline.followupStage}</td>
          <td>${getDayName(timeline.date)}</td>
          <td>${timeline.date}</td>
          <td>${timeline.time}</td>
          <td>${timeline.period ? `الحصة ${timeline.period}` : "-"}</td>
          <td>${timeline.subjectName || "-"}</td>
          <td>${timeline.description || "-"}</td>
          <td>${timeline.performedByName ? `${timeline.performedByName}${timeline.performedByRole ? ` (${timeline.performedByRole})` : ""}` : "-"}</td>
        </tr>
      `).join("");

      return `
        <div class="case-block ${caseIndex > 0 ? "page-break" : ""}">
          <div class="case-head">
            <div>
              <h3>${item.studentName}</h3>
              <p>${item.grade} - فصل ${item.section} • ${item.studentNumber}</p>
            </div>
            <div class="case-meta">
              <span>عدد الملاحظات: ${item.totalNotes}</span>
              <span>الحالة الحالية: ${item.referralLabel || item.currentStage}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>نوع الملاحظة</th>
                <th>مرحلة المتابعة</th>
                <th>اليوم</th>
                <th>التاريخ</th>
                <th>الوقت</th>
                <th>الحصة</th>
                <th>المادة</th>
                <th>الوصف</th>
                <th>المنفذ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${item.referralActionTaken ? `<div class="action-taken">الإجراء النهائي: ${item.referralActionTaken}</div>` : ""}
        </div>
      `;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>السجل الرسمي للملاحظات الصفية</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', sans-serif; padding: 10mm; color: #111; }
          @page { size: A4 portrait; margin: 10mm; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
          .header-side { font-size: 10px; font-weight: 700; line-height: 1.8; text-align: center; }
          .title { text-align: center; margin: 10px 0 12px; }
          .title h1 { font-size: 20px; font-weight: 900; }
          .title p { font-size: 11px; color: #555; font-weight: 700; }
          .summary { display: flex; gap: 10px; margin-bottom: 12px; }
          .summary-item { flex: 1; border: 1.5px solid #333; border-radius: 8px; padding: 8px; text-align: center; }
          .summary-item .num { font-size: 22px; font-weight: 900; }
          .summary-item .lbl { font-size: 11px; color: #555; font-weight: 700; }
          .case-block { margin-bottom: 18px; }
          .page-break { page-break-before: always; }
          .case-head { display: flex; justify-content: space-between; align-items: center; background: #f5f7fb; border: 1.5px solid #333; border-bottom: 0; padding: 8px 10px; }
          .case-head h3 { font-size: 15px; font-weight: 900; }
          .case-head p, .case-meta span { font-size: 10px; color: #444; font-weight: 700; }
          .case-meta { display: flex; gap: 12px; flex-wrap: wrap; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #333; padding: 5px; text-align: center; font-size: 10px; vertical-align: middle; }
          th { background: #e9edf5; font-weight: 900; }
          td:nth-child(9) { text-align: right; }
          .action-taken { margin-top: 6px; border: 1px solid #333; border-radius: 6px; padding: 6px 8px; font-size: 10px; font-weight: 800; background: #f9fafb; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-side">
            <div>${SCHOOL_INFO.kingdom}</div>
            <div>${SCHOOL_INFO.ministry}</div>
            <div>${SCHOOL_INFO.region}</div>
            <div>${SCHOOL_INFO.school}</div>
          </div>
          <div class="header-side">
            <div>اليوم: ${getDayName(today)}</div>
            <div>التاريخ: ${getHijriDateShort()}</div>
            <div>عدد الطلاب: ${classroomCases.length}</div>
          </div>
        </div>
        <div class="title">
          <h1>السجل الرسمي للملاحظات الصفية</h1>
          <p>عرض تفصيلي متدرج من الملاحظة الأولى حتى إنهاء الموقف وفق الإجراءات النظامية</p>
        </div>
        <div class="summary">
          <div class="summary-item"><div class="num">${classroomCases.length}</div><div class="lbl">عدد الطلاب</div></div>
          <div class="summary-item"><div class="num">${classroomCases.reduce((sum, item) => sum + item.totalNotes, 0)}</div><div class="lbl">إجمالي الملاحظات</div></div>
          <div class="summary-item"><div class="num">${classroomCases.filter((item) => item.referralStatus).length}</div><div class="lbl">حالات محوّلة</div></div>
        </div>
        ${casesHtml || '<p>لا توجد سجلات صفية للطباعة</p>'}
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintList = () => {
    if (isClassroomNotes) {
      printClassroomCases();
      return;
    }

    const typeLabel = isPresent ? "الحاضرون" : actionType ? ACTION_LABELS[actionType] : "جميع الإجراءات";
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let sections = "";

    if (isPresent) {
      const grouped: Record<string, Student[]> = {};
      presentStudents.forEach((s) => {
        const key = `${s.grade} - فصل ${s.section}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(s);
      });

      sections = Object.entries(grouped).map(([key, items]) => `
        <div class="section-group">
          <h3>${key} (${items.length} طالب)</h3>
          <table>
            <thead><tr><th>م</th><th>اسم الطالب</th><th>رقم الهوية</th></tr></thead>
            <tbody>
              ${items.map((s, i) => `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.studentNumber}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `).join("");
    } else {
      const grouped: Record<string, ActionRow[]> = {};
      actions.forEach((a) => {
        const key = `${a.grade} - فصل ${a.section}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
      });

      sections = Object.entries(grouped).map(([key, items]) => `
        <div class="section-group">
          <h3>${key} (${items.length} طالب)</h3>
          <table>
            <thead><tr><th>م</th><th>اسم الطالب</th><th>رقم الهوية</th><th>الوقت</th><th>بواسطة</th></tr></thead>
            <tbody>
              ${items.map((a, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${a.student_name}</td>
                  <td>${a.student_number}</td>
                  <td>${a.time}</td>
                  <td>${a.performed_by_name ? `${a.performed_by_role || ""} ${a.performed_by_name}` : "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("");
    }

    const totalCount = isPresent ? presentStudents.length : actions.length;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${typeLabel} - ${getHijriDateShort()}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', sans-serif; padding: 15mm; font-size: 11px; }
          @page { size: A4; margin: 10mm; }
          h1 { text-align: center; font-size: 16px; margin-bottom: 5px; }
          h2 { text-align: center; font-size: 12px; color: #555; margin-bottom: 15px; }
          .section-group { margin-bottom: 15px; }
          .section-group h3 { font-size: 13px; background: #f0f0f0; padding: 4px 8px; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          th, td { border: 1px solid #333; padding: 3px 6px; text-align: center; font-size: 10px; }
          th { background: #e8e8e8; font-weight: 700; }
          td:nth-child(2) { text-align: right; }
        </style>
      </head>
      <body>
        <h1>كشف ${typeLabel}</h1>
        <h2>${getHijriDateShort()} - العدد: ${totalCount}</h2>
        ${sections}
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const title = isClassroomNotes ? "سجل الملاحظات الصفية" : isPresent ? "الحاضرون" : actionType ? ACTION_LABELS[actionType] : "جميع الإجراءات";
  const totalCount = isClassroomNotes ? classroomCases.length : isPresent ? presentStudents.length : actions.length;
  const totalClassroomNotes = useMemo(() => classroomCases.reduce((sum, item) => sum + item.totalNotes, 0), [classroomCases]);

  const groupedActions: Record<string, ActionRow[]> = {};
  actions.forEach((a) => {
    const key = `${a.grade} - فصل ${a.section}`;
    if (!groupedActions[key]) groupedActions[key] = [];
    groupedActions[key].push(a);
  });

  const groupedPresent: Record<string, Student[]> = {};
  presentStudents.forEach((s) => {
    const key = `${s.grade} - فصل ${s.section}`;
    if (!groupedPresent[key]) groupedPresent[key] = [];
    groupedPresent[key].push(s);
  });

  return (
    <AppLayout>
      {isTeacherRestricted && (
        <ViewOnlyBanner text="للمشاهدة فقط — هذه الصفحة مخصصة للاطلاع على البيانات، ولا تتضمن صلاحيات تنفيذية أو طباعة" />
      )}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 mb-2" onClick={() => navigate(-1)}>
            <ArrowRight size={16} /> رجوع
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {isClassroomNotes ? title : `${title} اليوم - ${getHijriDateShort()}`}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isClassroomNotes ? `${classroomCases.length} طالب • ${totalClassroomNotes} ملاحظة` : `${totalCount} طالب`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isTeacherRestricted && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/20 text-primary text-xs font-semibold">
              <Eye size={13} /> وضع الاطلاع فقط
            </span>
          )}
          {!isTeacherRestricted && totalCount > 0 && (
            <Button variant="outline" className="gap-2" onClick={handlePrintList}>
              <Printer size={16} />
              {isClassroomNotes ? "طباعة السجل الرسمي" : "طباعة الكشف"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
      ) : totalCount === 0 ? (
        <div className="p-8 text-center text-muted-foreground bg-card rounded-xl border border-border/50">لا توجد سجلات لهذا العرض</div>
      ) : isClassroomNotes ? (
        <div className="space-y-4">
          {classroomCases.map((studentCase) => (
            <div key={studentCase.key} className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border/40 bg-primary/5 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <StickyNote size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-foreground text-base">{studentCase.studentName}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20">
                        {studentCase.totalNotes} ملاحظة
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${stageToneClass(studentCase.referralLabel || studentCase.currentStage)}`}>
                        {studentCase.referralLabel || studentCase.currentStage}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {studentCase.grade} - فصل {studentCase.section} • {studentCase.studentNumber} • آخر تحديث: {getDayName(studentCase.latestDate)} {studentCase.latestDate} {studentCase.latestTime}
                    </p>
                    {studentCase.referralActionTaken && (
                      <p className="text-xs text-primary mt-1">إنهاء الموقف: {studentCase.referralActionTaken}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {studentCase.studentRecord && !isTeacherRestricted && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate(`/student/${studentCase.studentRecord!.id}`)}>
                      <FileText size={14} /> ملف الطالب
                    </Button>
                  )}
                  {!isTeacherRestricted && studentCase.studentRecord?.guardianPhone && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs text-success" onClick={() => openStudentDialogDirect(studentCase.studentRecord!, "class_note")}>
                      <MessageCircle size={14} /> ولي الأمر
                    </Button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-border/20">
                {studentCase.timeline.map((timeline, idx) => (
                  <div key={timeline.id} className="px-5 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-black shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[timeline.type]}`}>
                          {ACTION_LABELS[timeline.type]}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${stageToneClass(timeline.followupStage)}`}>
                          {timeline.followupStage}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{getDayName(timeline.date)} • {timeline.date} • {timeline.time}</span>
                        {timeline.period && <span className="text-[10px] bg-primary/5 text-primary px-1.5 py-0.5 rounded">الحصة {timeline.period}</span>}
                        {timeline.subjectName && <span className="text-[10px] bg-muted/50 text-foreground px-1.5 py-0.5 rounded">{timeline.subjectName}</span>}
                      </div>
                      <p className="text-sm text-foreground mt-1">{timeline.description}</p>
                      {(timeline.performedByName || timeline.performedByRole) && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <UserCheck size={11} />
                          {timeline.performedByName || "-"} {timeline.performedByRole ? `(${timeline.performedByRole})` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : isPresent ? (
        Object.entries(groupedPresent).sort(([a], [b]) => a.localeCompare(b, "ar")).map(([sectionKey, students]) => (
          <div key={sectionKey} className="mb-4">
            <div className="bg-success/5 px-4 py-2 rounded-t-xl border border-success/20 border-b-0">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <CheckCircle size={14} className="text-success" />
                {sectionKey} ({students.length} طالب)
              </h3>
            </div>
            <div className="bg-card rounded-b-xl border border-border/50 divide-y divide-border/20">
              {students.map((student) => (
                <div key={student.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-success/10 text-success flex items-center justify-center text-xs font-bold">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.studentNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-success/10 text-success">حاضر</span>
                    {!isTeacherRestricted && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-primary/10" onClick={() => openStudentDialogDirect(student)} title="إرسال واتساب">
                        <MessageCircle size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        Object.entries(groupedActions).map(([sectionKey, sectionActions]) => (
          <div key={sectionKey} className="mb-4">
            <div className="bg-muted/50 px-4 py-2 rounded-t-xl border border-border/50 border-b-0">
              <h3 className="font-semibold text-foreground text-sm">{sectionKey} ({sectionActions.length} طالب)</h3>
            </div>
            <div className="bg-card rounded-b-xl border border-border/50 divide-y divide-border/20">
              {sectionActions.map((action) => (
                <div key={action.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {action.student_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{action.student_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{action.time}</span>
                        {action.details && <span>• {action.details}</span>}
                      </div>
                      {action.performed_by_name && (
                        <p className="text-xs text-primary">{action.performed_by_role} {action.performed_by_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[action.type as ActionType] || ""}`}>
                      {ACTION_LABELS[action.type as ActionType] || action.type}
                    </span>
                    {!isTeacherRestricted && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-primary/10" onClick={() => openStudentDialogFromAction(action)} title="إرسال واتساب">
                          <MessageCircle size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(action.id)} title="إلغاء الإجراء">
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {whatsappStudent && (
        <WhatsAppActionDialog
          open={!!whatsappStudent}
          onOpenChange={(open) => !open && setWhatsappStudent(null)}
          student={whatsappStudent}
          initialActionType={dialogActionType}
        />
      )}
    </AppLayout>
  );
};

export default ActionDetailsPage;
