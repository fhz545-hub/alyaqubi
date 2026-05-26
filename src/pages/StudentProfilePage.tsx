import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { loadStudents, updateStudent, deleteStudent } from "@/store/studentsStore";
import { deleteAction } from "@/store/actionsStore";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ACTION_LABELS, ACTION_COLORS, ActionType, Student, StudentAction, CLASSROOM_ACTION_TYPES } from "@/types/school";
import { printStudentArchive } from "@/utils/print";
import { openWhatsApp, isValidSaudiPhone } from "@/utils/whatsapp";
import {
  type ClassroomReferralPayload,
  extractFollowupStage,
  getReferralStatusLabel,
  parseClassroomReferralPayload,
  REFERRAL_STATUS_CLASSES,
  stripFollowupPrefix,
} from "@/utils/classroomReferral";
import { buildStudentIdentityKey } from "@/utils/classroomActionIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight, Clock, XCircle, AlertTriangle, LogOut, DoorOpen, DoorClosed,
  UserCheck, User, Phone, Hash, GraduationCap, Pencil, Trash2, Printer, Send,
  BookOpen, Megaphone, BookX, Moon, StickyNote, MessageSquare,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StudentDistinguishedSection } from "@/components/StudentDistinguishedSection";
import { isDistanceLearning, DISTANCE_LEARNING_LABEL } from "@/utils/distanceLearning";
import HealthBadge from "@/components/HealthBadge";

const GRADE_OPTIONS = [
  { code: "1314", name: "أول ثانوي" },
  { code: "1416", name: "ثاني ثانوي" },
  { code: "1516", name: "ثالث ثانوي" },
];

const typeIcons: Partial<Record<ActionType, React.ReactNode>> = {
  late: <Clock size={16} />,
  absent: <XCircle size={16} />,
  violation: <AlertTriangle size={16} />,
  permission: <LogOut size={16} />,
  entry: <DoorOpen size={16} />,
  exit: <DoorClosed size={16} />,
  summon: <UserCheck size={16} />,
  class_late: <Clock size={16} />,
  class_escape: <DoorClosed size={16} />,
  class_chaos: <Megaphone size={16} />,
  no_homework: <BookX size={16} />,
  sleeping: <Moon size={16} />,
  class_note: <StickyNote size={16} />,
};

const ALL_ARCHIVE_TYPES: ActionType[] = ["absent", "late", "violation", "permission", "entry", "exit", "summon", ...CLASSROOM_ACTION_TYPES];

interface ReferralArchiveItem {
  id: string;
  status: string;
  createdAt: string;
  actionTaken: string;
  teacherName: string;
  teacherRole: string;
  payload: ClassroomReferralPayload | null;
}

interface StudentMessageArchiveItem {
  id: string;
  createdAt: string;
  date: string;
  time: string;
  title: string;
  description: string;
  messageType: string;
  performedByName?: string;
  performedByRole?: string;
}

const mapActionRow = (row: any): StudentAction => ({
  id: row.id,
  studentId: row.student_id,
  studentName: row.student_name,
  studentNumber: row.student_number,
  grade: row.grade,
  section: row.section,
  type: row.type as ActionType,
  date: row.date,
  time: row.time,
  description: row.details || "",
  guardianPhone: "",
  messageSent: false,
  performedById: row.performed_by || undefined,
  performedByName: row.performed_by_name || "",
  performedByRole: row.performed_by_role || "",
  period: row.period || undefined,
  subjectName: row.subject_name || undefined,
  violationCategory: row.details || undefined,
});

const getTimeFromTimestamp = (timestamp?: string | null) => {
  if (!timestamp) return "-";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const SMS_TYPE_LABELS: Record<string, string> = {
  absent: "رسالة غياب",
  late: "رسالة تأخر",
  violation: "رسالة مخالفة",
  permission: "رسالة استئذان",
  general: "رسالة لولي الأمر",
};

const StudentProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [expandedType, setExpandedType] = useState<ActionType | null>(null);
  const [archiveMessageOpen, setArchiveMessageOpen] = useState(false);
  const [archiveMessageMode, setArchiveMessageMode] = useState<"full" | "classroom">("full");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteActionConfirm, setDeleteActionConfirm] = useState<string | null>(null);
  const [referralCases, setReferralCases] = useState<ReferralArchiveItem[]>([]);
  const [studentActions, setStudentActions] = useState<StudentAction[]>([]);
  const [studentMessages, setStudentMessages] = useState<StudentMessageArchiveItem[]>([]);

  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const isPrincipal = profile?.is_principal === true;
  const student = useMemo(() => allStudents.find((s) => s.id === id), [id, allStudents]);

  const loadReferralCases = useCallback(async () => {
    if (!student) {
      setReferralCases([]);
      return;
    }

    const studentKey = buildStudentIdentityKey(student.id, student.studentNumber);
    const { data, error } = await supabase
      .from("messages")
      .select("id, status, reply_text, created_at, message_text, student_name, student_grade, sender_name, sender_role")
      .eq("message_type", "class_referral")
      .order("created_at", { ascending: false })
      .range(0, 999);

    if (error || !data) {
      setReferralCases([]);
      return;
    }

    const rows = (data as any[])
      .map((row) => {
        const payload = parseClassroomReferralPayload(row.message_text, {
          studentName: row.student_name || "",
          grade: row.student_grade || "",
          teacherName: row.sender_name || "",
          teacherRole: row.sender_role || "",
        });

        const payloadStudentKey = buildStudentIdentityKey(payload?.studentId, payload?.studentNumber);
        const sameByPayload = Boolean(payloadStudentKey && payloadStudentKey === studentKey);
        const sameByFallback =
          !sameByPayload &&
          row.student_name === student.name &&
          String(row.student_grade || "") === String(student.gradeCode || student.grade);

        if (!sameByPayload && !sameByFallback) return null;

        return {
          id: row.id,
          status: row.status || "transferred_after_third_note",
          createdAt: row.created_at,
          actionTaken: row.reply_text || "",
          teacherName: payload?.teacherName || row.sender_name || "",
          teacherRole: payload?.teacherRole || row.sender_role || "",
          payload,
        } as ReferralArchiveItem;
      })
      .filter(Boolean) as ReferralArchiveItem[];

    setReferralCases(rows);
  }, [student]);

  const loadStudentArchive = useCallback(async (targetStudent?: Student) => {
    if (!targetStudent) {
      setStudentActions([]);
      setStudentMessages([]);
      return;
    }

    const fetchAllActionRows = async () => {
      const pageSize = 1000;
      const rows: any[] = [];

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("student_actions")
          .select("id, student_id, student_name, student_number, grade, section, type, date, time, details, performed_by, performed_by_name, performed_by_role, period, subject_name")
          .or(`student_id.eq.${targetStudent.id},student_number.eq.${targetStudent.studentNumber}`)
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows.push(...data);

        if (data.length < pageSize) break;
      }

      return rows;
    };

    try {
      const [actionRows, smsResult] = await Promise.all([
        fetchAllActionRows(),
        supabase
          .from("sms_sent_log")
          .select("id, sms_type, sent_date, created_at, sent_by")
          .eq("student_id", targetStudent.id)
          .order("created_at", { ascending: false })
          .range(0, 999),
      ]);

      setStudentActions(
        actionRows
          .map(mapActionRow)
          .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
      );

      let senderLookup: Record<string, { name: string; role: string }> = {};
      const senderIds = [...new Set((smsResult.data || []).map((row) => row.sent_by).filter(Boolean))] as string[];

      if (senderIds.length > 0) {
        const { data: senderRows } = await supabase
          .from("profiles")
          .select("user_id, full_name, role_title")
          .in("user_id", senderIds);

        senderLookup = Object.fromEntries(
          (senderRows || []).map((row) => [row.user_id, { name: row.full_name, role: row.role_title }])
        );
      }

      setStudentMessages(
        (smsResult.data || []).map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          date: row.sent_date,
          time: getTimeFromTimestamp(row.created_at),
          title: SMS_TYPE_LABELS[row.sms_type] || "رسالة لولي الأمر",
          description: `تم إرسال ${SMS_TYPE_LABELS[row.sms_type] || "رسالة"} وتوثيقها في السجل الرسمي للطالب.`,
          messageType: row.sms_type,
          performedByName: row.sent_by ? senderLookup[row.sent_by]?.name : undefined,
          performedByRole: row.sent_by ? senderLookup[row.sent_by]?.role : undefined,
        }))
      );
    } catch (error) {
      console.error("Failed to load student archive from DB:", error);
      setStudentActions([]);
      setStudentMessages([]);
    }
  }, []);

  useEffect(() => {
    loadStudents()
      .then((students) => {
        setAllStudents(students);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadReferralCases();
  }, [loadReferralCases]);

  useEffect(() => {
    loadStudentArchive(student);
  }, [student, loadStudentArchive]);

  useEffect(() => {
    if (!student) return;

    const channel = supabase
      .channel(`student-profile-rt-${student.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => {
        loadStudentArchive(student);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sms_sent_log" }, () => {
        loadStudentArchive(student);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [student, loadStudentArchive]);

  useEffect(() => {
    if (!student) return;

    const channel = supabase
      .channel(`student-profile-referral-rt-${student.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: "message_type=eq.class_referral" },
        () => loadReferralCases()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [student, loadReferralCases]);

  const mainActionTypes: ActionType[] = ["absent", "late", "violation", "permission"];
  const otherActionTypes: ActionType[] = ["entry", "exit", "summon"];

  const summary = useMemo(() => {
    const counts: Partial<Record<ActionType, number>> = {};
    ALL_ARCHIVE_TYPES.forEach(t => { counts[t] = 0; });
    studentActions.forEach((a) => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return counts;
  }, [studentActions]);

  const actionsByType = useMemo(() => {
    const grouped: Partial<Record<ActionType, typeof studentActions>> = {};
    ALL_ARCHIVE_TYPES.forEach(t => { grouped[t] = []; });
    studentActions.forEach((a) => {
      if (!grouped[a.type]) grouped[a.type] = [];
      grouped[a.type]!.push(a);
    });
    return grouped;
  }, [studentActions]);

  const classroomActions = useMemo(() => {
    return studentActions.filter(a => CLASSROOM_ACTION_TYPES.includes(a.type));
  }, [studentActions]);

  const classroomTimeline = useMemo(() => {
    return [...classroomActions].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [classroomActions]);

  const classroomSequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    classroomTimeline.forEach((action, index) => map.set(action.id, index + 1));
    return map;
  }, [classroomTimeline]);

  const openEdit = () => {
    if (!student) return;
    setEditName(student.name);
    setEditNumber(student.studentNumber);
    setEditGrade(student.gradeCode);
    setEditSection(String(student.section));
    setEditPhone(student.guardianPhone);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!student) return;
    setSaving(true);
    const ok = await updateStudent(student.id, {
      name: editName.trim(),
      studentNumber: editNumber.trim(),
      gradeCode: editGrade,
      section: Number(editSection),
      guardianPhone: editPhone.trim(),
    });
    setSaving(false);
    if (ok) {
      toast({ title: "تم تحديث بيانات الطالب ✅" });
      setEditOpen(false);
      const fresh = await loadStudents();
      setAllStudents(fresh);
    } else {
      toast({ title: "فشل التحديث", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!student) return;
    const ok = await deleteStudent(student.id);
    if (ok) {
      toast({ title: "تم حذف الطالب" });
      navigate("/students");
    } else {
      toast({ title: "فشل الحذف", variant: "destructive" });
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    // Same-day restriction: non-principals can only delete records added today.
    const targetAction = studentActions.find((a) => a.id === actionId);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!isPrincipal && targetAction && targetAction.date !== todayStr) {
      toast({
        title: "التعديل بعد اليوم يتطلب موافقة مدير المدرسة",
        description: "يُسمح بتعديل أو حذف سجلات المواظبة والسلوك في نفس يوم الإدخال فقط.",
        variant: "destructive",
      });
      setDeleteActionConfirm(null);
      return;
    }
    const ok = await deleteAction(actionId);
    if (ok) {
      toast({ title: "تم حذف السجل ✅" });
      await loadStudentArchive(student);
    } else {
      toast({ title: "فشل الحذف", variant: "destructive" });
    }
    setDeleteActionConfirm(null);
  };

  const handlePrintArchive = () => {
    if (!student) return;
    printStudentArchive(student, studentActions.map((a) => ({
      type: a.type,
      date: a.date,
      time: a.time,
      period: a.period,
      subjectName: a.subjectName,
      followupStage: CLASSROOM_ACTION_TYPES.includes(a.type) ? extractFollowupStage(a.description) : undefined,
      followupSequence: CLASSROOM_ACTION_TYPES.includes(a.type) ? classroomSequenceMap.get(a.id) : undefined,
      description: stripFollowupPrefix(a.description),
      performedByName: a.performedByName,
      performedByRole: a.performedByRole,
    })));
  };

  const buildArchiveMessage = (mode: "full" | "classroom") => {
    if (!student) return "";

    if (mode === "classroom") {
      const rows = classroomTimeline.slice(-8).map((action, idx) => (
        `${idx + 1}) ${action.date} | الحصة ${action.period || "-"} | ${ACTION_LABELS[action.type]} | ${extractFollowupStage(action.description)} | ${action.performedByName || "-"}`
      )).join("\n");

      return `ولي أمر الطالب/ ${student.name} المحترم\n\nهذا إشعار رسمي بأرشيف الملاحظات الصفية للطالب:\nالطالب: ${student.name}\nالصف: ${student.grade} - فصل ${student.section}\nعدد الملاحظات الصفية: ${classroomTimeline.length}\n\n${rows || "لا توجد ملاحظات صفية مسجلة."}\n\nمع خالص التحية\nإدارة المدرسة`;
    }

    return `ولي أمر الطالب/ ${student.name} المحترم\n\nهذا ملخص رسمي لأرشيف الطالب:\nالغياب: ${summary.absent || 0}\nالتأخر: ${summary.late || 0}\nالمخالفات: ${summary.violation || 0}\nالملاحظات الصفية: ${classroomTimeline.length}\n\nيرجى مراجعة ملف الطالب الكامل عند الحاجة.\n\nمع خالص التحية\nإدارة المدرسة`;
  };

  const handleSendArchiveMessage = () => {
    if (!student?.guardianPhone || !isValidSaudiPhone(student.guardianPhone)) {
      toast({ title: "رقم ولي الأمر غير صالح", variant: "destructive" });
      return;
    }

    const sent = openWhatsApp(student.guardianPhone, buildArchiveMessage(archiveMessageMode));
    if (sent) {
      toast({ title: "✅ تم تجهيز المراسلة الرسمية لولي الأمر" });
      setArchiveMessageOpen(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </AppLayout>
    );
  }

  if (!student) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <User size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-bold text-foreground">لم يتم العثور على الطالب</h2>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/students")}>
              <ArrowRight size={16} /> العودة للطلاب
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const getDayName = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
    } catch { return ""; }
  };

  const renderActionRow = (action: typeof studentActions[0], idx: number, showDelete = true) => (
    <div key={action.id} className="flex items-start justify-between px-5 py-3 hover:bg-muted/20 transition-colors group border-r-2 border-r-transparent hover:border-r-primary">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${ACTION_COLORS[action.type]}`}>
          {typeIcons[action.type] || (idx + 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[action.type]}`}>
              {ACTION_LABELS[action.type]}
            </span>
            <span className="text-[10px] text-primary/70 font-semibold">{getDayName(action.date)}</span>
            <span className="text-xs text-muted-foreground">{action.date}</span>
            <span className="text-[10px] text-muted-foreground/70">{action.time}</span>
            {action.period && <span className="text-[10px] bg-primary/5 text-primary px-1.5 py-0.5 rounded">الحصة {action.period}</span>}
            {action.subjectName && <span className="text-[10px] font-semibold text-primary bg-primary/5 px-1.5 py-0.5 rounded">{action.subjectName}</span>}
          </div>
          {action.description && (
            <p className="text-xs text-foreground/80 mt-1">{action.description}</p>
          )}
          {action.performedByName && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ✍️ {action.performedByName} {action.performedByRole ? `(${action.performedByRole})` : ""}
            </p>
          )}
        </div>
      </div>
      {isPrincipal && showDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive h-7 w-7 p-0"
          onClick={() => setDeleteActionConfirm(action.id)}
        >
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate(-1)}>
          <ArrowRight size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">ملف الطالب</h1>
          {profile && (
            <p className="text-xs text-muted-foreground">المستخدم: {profile.role_title} {profile.full_name}</p>
          )}
        </div>
      </div>

      {/* Student Info Card */}
      <div className="bg-card rounded-xl border border-border/50 p-5 mb-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
              {student.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 flex-wrap">
                {student.name}
                <HealthBadge studentId={student.id} studentNumber={student.studentNumber} size="md" showLabel />
              </h2>
              <div className="flex items-center gap-4 mt-2 flex-wrap text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><GraduationCap size={14} /> {student.grade} - فصل {student.section}</span>
                <span className="flex items-center gap-1"><Hash size={14} /> {student.studentNumber}</span>
                {student.guardianPhone && (
                  <span className="flex items-center gap-1"><Phone size={14} /> {student.guardianPhone}</span>
                )}
                {isDistanceLearning(student.gradeCode, student.section) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-accent/15 text-accent-foreground border border-accent/30">
                    {DISTANCE_LEARNING_LABEL}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isPrincipal && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
                  <Pencil size={14} /> تعديل
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 size={14} /> حذف
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintArchive}>
              <Printer size={14} /> طباعة التقرير
            </Button>
            {student.guardianPhone && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-success"
                onClick={() => {
                  setArchiveMessageMode("full");
                  setArchiveMessageOpen(true);
                }}
              >
                <Send size={14} /> إرسال الأرشيف لولي الأمر
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {mainActionTypes.map((type) => (
          <button
            key={type}
            onClick={() => setExpandedType(expandedType === type ? null : type)}
            className={`rounded-xl border p-4 text-center transition-all hover:shadow-md ${
              expandedType === type ? "ring-2 ring-primary shadow-md" : "border-border/50"
            } bg-card`}
          >
            <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${ACTION_COLORS[type]}`}>
              {typeIcons[type]}
            </div>
            <p className="text-2xl font-bold text-foreground">{summary[type] || 0}</p>
            <p className="text-xs text-muted-foreground">{ACTION_LABELS[type]}</p>
          </button>
        ))}
      </div>

      {/* Other Types */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {otherActionTypes.map((type) => (
          <button
            key={type}
            onClick={() => setExpandedType(expandedType === type ? null : type)}
            className={`rounded-xl border p-3 text-center transition-all hover:shadow-sm ${
              expandedType === type ? "ring-2 ring-primary" : "border-border/50"
            } bg-card`}
          >
            <p className="text-lg font-bold text-foreground">{summary[type] || 0}</p>
            <p className="text-xs text-muted-foreground">{ACTION_LABELS[type]}</p>
          </button>
        ))}
      </div>

      {referralCases.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 mb-6 overflow-hidden">
          <div className="px-5 py-3 bg-primary/5 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm">الإجراءات النظامية المحوّلة ({referralCases.length})</h3>
            <span className="text-xs text-muted-foreground">مرتبطة مباشرة بالوكيل والمدير</span>
          </div>
          <div className="divide-y divide-border/20 max-h-[260px] overflow-y-auto">
            {referralCases.map((item) => (
              <div key={item.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.payload?.noteLabel || "إحالة صفية رسمية"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.teacherRole ? `${item.teacherRole} ` : ""}
                      {item.teacherName || "-"}
                      {item.payload?.period ? ` • الحصة ${item.payload.period}` : ""}
                      {item.payload?.subjectName ? ` • ${item.payload.subjectName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString("ar-SA")} • {item.payload?.date || ""} {item.payload?.time || ""}
                    </p>
                    {item.actionTaken && (
                      <p className="text-xs text-primary mt-1">الإجراء المتخذ: {item.actionTaken}</p>
                    )}
                  </div>
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-bold ${REFERRAL_STATUS_CLASSES[item.status] || "bg-muted text-muted-foreground border-border"}`}
                  >
                    {getReferralStatusLabel(item.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== DISTINGUISHED BEHAVIOR (IMPROVEMENT TRACK) ===== */}
      <StudentDistinguishedSection studentId={student.id} studentNumber={student.studentNumber} />

      {/* ===== FULL ARCHIVE SECTION ===== */}
      <div className="bg-card rounded-xl border border-border/50 mb-6 overflow-hidden">
        <div className="px-5 py-3 bg-primary/5 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
            <BookOpen size={18} className="text-primary" />
            أرشيف الطالب الشامل ({studentActions.length})
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" onClick={handlePrintArchive}>
              <Printer size={13} /> طباعة الأرشيف
            </Button>
            {student.guardianPhone && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-7 text-success"
                onClick={() => {
                  setArchiveMessageMode("classroom");
                  setArchiveMessageOpen(true);
                }}
              >
                <Send size={13} /> إرسال الملاحظات الصفية
              </Button>
            )}
          </div>
        </div>

        {/* Filter badges */}
        <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-border/30">
          <button
            onClick={() => setExpandedType(null)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
              expandedType === null ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            الكل ({studentActions.length})
          </button>
          {ALL_ARCHIVE_TYPES.map(type => {
            const count = summary[type] || 0;
            if (count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => setExpandedType(expandedType === type ? null : type)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
                  expandedType === type ? "ring-2 ring-primary" : ""
                } ${ACTION_COLORS[type]}`}
              >
                {ACTION_LABELS[type]}: {count}
              </button>
            );
          })}
        </div>

        {/* Archive list */}
        <div className="divide-y divide-border/20 max-h-[500px] overflow-y-auto">
          {studentActions.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">لا توجد سجلات</div>
          ) : (
            (expandedType
              ? (actionsByType[expandedType] || [])
              : studentActions
            ).map((action, idx) => renderActionRow(action, idx))
          )}
        </div>
      </div>

      {studentMessages.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 mb-6 overflow-hidden">
          <div className="px-5 py-3 bg-success/5 border-b border-border/50 flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <MessageSquare size={18} className="text-success" />
              سجل الرسائل المرسلة لولي الأمر ({studentMessages.length})
            </h3>
            <span className="text-xs text-muted-foreground">مرتبط مباشرة بقاعدة البيانات</span>
          </div>

          <div className="divide-y divide-border/20 max-h-[260px] overflow-y-auto">
            {studentMessages.map((message) => (
              <div key={message.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-success/10 text-success border border-success/20">
                        {message.title}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-muted/50 text-muted-foreground border border-border/30">
                        {message.messageType}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 mt-1">{message.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {getDayName(message.date)} • {message.date} • {message.time}
                    </p>
                    {(message.performedByName || message.performedByRole) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ✉️ {message.performedByName || "-"} {message.performedByRole ? `(${message.performedByRole})` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Action Confirm */}
      <Dialog open={!!deleteActionConfirm} onOpenChange={(o) => !o && setDeleteActionConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">حذف السجل</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا السجل؟ هذا الإجراء لا يمكن التراجع عنه.</p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteActionConfirm(null)}>إلغاء</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteActionConfirm && handleDeleteAction(deleteActionConfirm)}>حذف نهائي</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>اسم الطالب</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div><Label>رقم الهوية</Label><Input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} dir="ltr" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المرحلة</Label>
                <Select value={editGrade} onValueChange={setEditGrade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GRADE_OPTIONS.map((g) => <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>الفصل</Label><Input type="number" min={1} max={20} value={editSection} onChange={(e) => setEditSection(e.target.value)} /></div>
            </div>
            <div><Label>جوال ولي الأمر</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} dir="ltr" /></div>
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Student Confirm */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">حذف الطالب نهائياً</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم حذف الطالب <strong>{student.name}</strong> نهائياً. هذا الإجراء لا يمكن التراجع عنه.</p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(false)}>إلغاء</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete}>حذف نهائي</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveMessageOpen} onOpenChange={setArchiveMessageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>مراسلة ولي الأمر رسميًا</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={archiveMessageMode === "full" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setArchiveMessageMode("full")}
              >
                أرشيف الطالب الكامل
              </Button>
              <Button
                variant={archiveMessageMode === "classroom" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setArchiveMessageMode("classroom")}
              >
                الملاحظات الصفية فقط
              </Button>
            </div>

            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
              {buildArchiveMessage(archiveMessageMode)}
            </div>

            <Button className="w-full" onClick={handleSendArchiveMessage}>
              إرسال رسمي عبر واتساب
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default StudentProfilePage;
