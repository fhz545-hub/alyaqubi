import { useState, useEffect, useMemo, useCallback } from "react";
import DateRangeFilter, { DateRange, FilterMode } from "@/components/DateRangeFilter";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import NoteCancelRequestDialog from "@/components/NoteCancelRequestDialog";
import PrincipalCancelRequests from "@/components/PrincipalCancelRequests";
import { useAuth } from "@/contexts/AuthContext";
import { loadStudents, getStudentsFromDB, getGradesFromDB, getSectionsFromDB } from "@/store/studentsStore";
import { addAction, getActions, loadActions } from "@/store/actionsStore";
import { Student, StudentAction, ActionType } from "@/types/school";
import { CLASSROOM_ACTION_TYPES, ACTION_LABELS, ACTION_COLORS } from "@/types/school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StudentSearchDialog from "@/components/StudentSearchDialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatGradeSection } from "@/utils/gradeNames";

import {
  AlertTriangle, BookOpen, CheckCircle, Clock, Download, Info, Search, Send,
  StickyNote, UserRound, Filter, Zap, FileText, ArrowUpRight, XCircle, ThumbsUp,
} from "lucide-react";

import {
  buildClassroomReferralPayload, ClassroomReferralPayload, formatReferralNotificationBody,
  getReferralStatusLabel, parseClassroomReferralPayload, REFERRAL_STATUS_CLASSES,
  serializeClassroomReferralPayload,
} from "@/utils/classroomReferral";
import {
  buildStudentIdentityKey, isActionOwnedByTeacher, matchesStudentAction,
} from "@/utils/classroomActionIdentity";
import HealthBadge from "@/components/HealthBadge";

const PRESET_NOTES = [
  "تأخر عن دخول الحصة", "هروب من الحصة", "إثارة فوضى داخل الحصة",
  "عدم إحضار الواجبات", "عدم إحضار متطلبات المادة", "النوم داخل الحصة",
  "استخدام الجوال أثناء الحصة", "عدم التفاعل والمشاركة",
  "سلوك غير لائق مع الزملاء", "إزعاج المعلم أثناء الشرح",
];

const PERIOD_OPTIONS = Array.from({ length: 8 }, (_, i) => i + 1);

const ESCALATION_STAGES = [
  { key: "first_notice", label: "ملاحظة أولى", icon: "1" },
  { key: "teacher_followup", label: "متابعة المعلم", icon: "2" },
  { key: "repeated", label: "تكرار", icon: "3" },
  { key: "referral", label: "إحالة رسمية", icon: "!" },
];

interface ReferralCase {
  id: string; status: string; createdAt: string; actionTaken: string;
  payload: ClassroomReferralPayload | null;
}

interface EligibleStudent {
  key: string; count: number; lastAction: StudentAction;
}

const sortByNewest = (a: StudentAction, b: StudentAction) =>
  b.date.localeCompare(a.date) || b.time.localeCompare(a.time);

const TeacherClassroomPage = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [allStudents, setAllStudents] = useState<Student[]>(getStudentsFromDB());
  const [selectedType, setSelectedType] = useState<ActionType>("class_note");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("1");
  const [subjectName, setSubjectName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Grade/Section/Student selection for classroom notes
  const [classGrade, setClassGrade] = useState("");
  const [classSection, setClassSection] = useState("");

  const grades = useMemo(() => getGradesFromDB(), [allStudents]);
  const classSections = classGrade ? getSectionsFromDB(classGrade) : [];
  const classSectionStudents = useMemo(() => {
    if (!classGrade || !classSection) return [];
    return allStudents.filter(s => s.gradeCode === classGrade && s.section === Number(classSection))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [allStudents, classGrade, classSection]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [referralSearchOpen, setReferralSearchOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendingAction, setSendingAction] = useState<StudentAction | null>(null);
  const [sendingInProgress, setSendingInProgress] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelAction, setCancelAction] = useState<StudentAction | null>(null);

  const [classroomActions, setClassroomActions] = useState<StudentAction[]>([]);
  const [transferredCases, setTransferredCases] = useState<ReferralCase[]>([]);
  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month">("today");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRange>({ from: new Date(), to: new Date() });

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const filterDateRange = useMemo(() => {
    return {
      start: format(dateRangeFilter.from, "yyyy-MM-dd"),
      end: format(dateRangeFilter.to, "yyyy-MM-dd"),
    };
  }, [dateRangeFilter]);

  const refreshClassroomActions = useCallback(() => {
    const teacherName = profile?.full_name || "";
    const next = getActions()
      .filter((a) => CLASSROOM_ACTION_TYPES.includes(a.type) && isActionOwnedByTeacher(a, user?.id, teacherName))
      .sort(sortByNewest);
    setClassroomActions(next);
  }, [profile?.full_name, user?.id]);

  const fetchTransferredCases = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from("messages")
      .select("id, status, reply_text, created_at, message_text, student_name, student_grade, sender_name, sender_role")
      .eq("sender_id", user.id).eq("message_type", "class_referral")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return;
    setTransferredCases((data || []).map((row: any) => ({
      id: row.id, status: row.status || "transferred_after_third_note",
      createdAt: row.created_at, actionTaken: row.reply_text || "",
      payload: parseClassroomReferralPayload(row.message_text, {
        studentName: row.student_name || "", grade: row.student_grade || "",
        teacherName: row.sender_name || "", teacherRole: row.sender_role || "",
      }),
    })));
  }, [user]);

  useEffect(() => {
    Promise.all([loadStudents(), loadActions(true)]).then(([students]) => {
      setAllStudents(students); refreshClassroomActions(); fetchTransferredCases();
    });
  }, [fetchTransferredCases, refreshClassroomActions]);

  useEffect(() => {
    if (!user) return;
    const ch1 = supabase.channel(`classroom-actions-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => {
        loadActions(true).then(refreshClassroomActions);
      }).subscribe();
    const ch2 = supabase.channel(`teacher-referrals-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` },
        (payload) => { if ((payload.new as any)?.message_type === "class_referral") fetchTransferredCases(); }
      ).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchTransferredCases, refreshClassroomActions, user]);

  const todayActions = useMemo(() => classroomActions.filter((a) => a.date === today), [classroomActions, today]);
  const filteredActions = useMemo(() => classroomActions.filter((a) => a.date >= filterDateRange.start && a.date <= filterDateRange.end), [classroomActions, filterDateRange]);

  const activeReferralStudentKeys = useMemo(() =>
    new Set(transferredCases.filter((c) => c.status !== "action_taken")
      .map((c) => buildStudentIdentityKey(c.payload?.studentId, c.payload?.studentNumber)).filter(Boolean)),
    [transferredCases]);

  const getEscalationStage = (count: number) => ESCALATION_STAGES[Math.min(count, 3)];

  const getStudentNoteCount = useCallback(
    (studentId: string, studentNumber: string) =>
      classroomActions.filter((a) => matchesStudentAction(a, studentId, studentNumber)).length,
    [classroomActions]
  );

  const canEscalate = useCallback((action: StudentAction) => {
    const count = getStudentNoteCount(action.studentId, action.studentNumber);
    return count >= 3 && !activeReferralStudentKeys.has(buildStudentIdentityKey(action.studentId, action.studentNumber));
  }, [activeReferralStudentKeys, getStudentNoteCount]);

  const eligibleForReferral = useMemo(() => {
    const map = new Map<string, EligibleStudent>();
    for (const a of classroomActions) {
      const key = buildStudentIdentityKey(a.studentId, a.studentNumber);
      if (!key) continue;
      const ex = map.get(key);
      if (!ex) { map.set(key, { key, count: 1, lastAction: a }); continue; }
      ex.count++; if (sortByNewest(a, ex.lastAction) < 0) ex.lastAction = a;
    }
    return Array.from(map.values()).filter((i) => i.count >= 3 && !activeReferralStudentKeys.has(i.key))
      .sort((a, b) => b.count - a.count);
  }, [activeReferralStudentKeys, classroomActions]);

  const createReferral = async (action: StudentAction, options: { auto: boolean; showToast?: boolean }) => {
    if (!user || !profile) return false;
    const studentKey = buildStudentIdentityKey(action.studentId, action.studentNumber);
    if (activeReferralStudentKeys.has(studentKey)) return true;

    const noteCount = getStudentNoteCount(action.studentId, action.studentNumber);
    const payload = buildClassroomReferralPayload(action, {
      teacherName: profile.full_name, teacherRole: profile.role_title,
      noteCount, transferTrigger: options.auto ? "auto_third_note" : "manual",
    });

    const { data: targetUsers, error: targetError } = await supabase.from("profiles")
      .select("user_id, full_name, role_title, is_principal")
      .or("role_title.ilike.%وكيل%,is_principal.eq.true").eq("approved", true);

    if (targetError || !targetUsers?.length) {
      toast({ title: "تعذر العثور على الجهات الإدارية", variant: "destructive" }); return false;
    }

    const viceUser = targetUsers.find((u: any) => String(u.role_title || "").includes("وكيل"));
    const primaryRecipient = viceUser || targetUsers.find((u: any) => Boolean(u.is_principal));
    if (!primaryRecipient) {
      toast({ title: "لا يوجد حساب وكيل أو مدير معتمد", variant: "destructive" }); return false;
    }

    const { data: inserted, error: msgError } = await supabase.from("messages").insert({
      sender_id: user.id, sender_name: profile.full_name, sender_role: profile.role_title,
      recipient_id: (primaryRecipient as any).user_id, recipient_name: (primaryRecipient as any).full_name,
      message_type: "class_referral", message_text: serializeClassroomReferralPayload(payload),
      student_name: action.studentName, student_grade: action.grade,
      status: "transferred_after_third_note",
    }).select("id, created_at, status, reply_text, message_text").single();

    if (msgError || !inserted) { toast({ title: "فشل تنفيذ التحويل", variant: "destructive" }); return false; }

    const allAdminIds = [...new Set((targetUsers || []).map((u: any) => u.user_id).filter(Boolean))];
    await Promise.all(allAdminIds.map((uid) =>
      supabase.from("notifications").insert({
        user_id: uid, related_id: inserted.id,
        title: `⚠️ تحويل رسمي - ${action.studentName}`,
        body: formatReferralNotificationBody(payload).substring(0, 800),
        type: "class_referral",
      } as any)
    ));

    setTransferredCases((prev) => [{
      id: inserted.id, status: inserted.status || "transferred_after_third_note",
      createdAt: inserted.created_at, actionTaken: inserted.reply_text || "", payload,
    }, ...prev.filter((c) => c.id !== inserted.id)]);

    if (options.showToast !== false) {
      toast({ title: options.auto ? "✅ تحويل تلقائي بعد الملاحظة الثالثة" : "✅ تم التحويل الرسمي للوكيل/المدير" });
    }
    return true;
  };

  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student);
  };

  const handleRegisterNote = async () => {
    if (submitting || !profile || !selectedStudent) return;

    if (!selectedPeriod) {
      toast({ title: "يجب تحديد رقم الحصة أولاً", variant: "destructive" });
      return;
    }
    if (!subjectName.trim()) {
      toast({ title: "يجب كتابة اسم المادة أولاً", variant: "destructive" });
      return;
    }
    if (!selectedType) {
      toast({ title: "يجب اختيار نوع الملاحظة أولاً", variant: "destructive" });
      return;
    }

    const student = selectedStudent;
    setSubmitting(true);
    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const prevCount = getStudentNoteCount(student.id, student.studentNumber);
      const stage = getEscalationStage(prevCount);
      const description = `[${stage.label}] ${note.trim() || ACTION_LABELS[selectedType]}`;

      const createdAction = await addAction({
        studentId: student.id, studentName: student.name, studentNumber: student.studentNumber,
        grade: student.gradeCode, section: student.section, type: selectedType, date, time,
        description, guardianPhone: student.guardianPhone, period: Number(selectedPeriod),
        subjectName: subjectName.trim(),
      }, profile.full_name, profile.role_title);

      await loadActions(true); refreshClassroomActions();
      const nextCount = prevCount + 1;
      if (nextCount >= 3 && !activeReferralStudentKeys.has(buildStudentIdentityKey(student.id, student.studentNumber))) {
        await createReferral(createdAction, { auto: true, showToast: true });
      }
      toast({
        title: `✅ ${ACTION_LABELS[selectedType]}`,
        description: `${student.name} - الحصة ${selectedPeriod}${subjectName ? ` - ${subjectName}` : ""}`,
      });
      setNote(""); setSelectedStudent(null); await fetchTransferredCases();
    } finally { setSubmitting(false); }
  };

  const openSendDialog = (action: StudentAction) => { setSendingAction(action); setSendDialogOpen(true); };

  const handleSendNote = async () => {
    if (!sendingAction) return;
    setSendingInProgress(true);
    const ok = await createReferral(sendingAction, { auto: false, showToast: true });
    if (ok) { setSendDialogOpen(false); setSendingAction(null); await fetchTransferredCases(); }
    setSendingInProgress(false);
  };

  const handleReferralStudentSelect = async (student: Student) => {
    await loadActions(true); refreshClassroomActions();
    const latest = getActions().filter((a) => CLASSROOM_ACTION_TYPES.includes(a.type) && isActionOwnedByTeacher(a, user?.id, profile?.full_name || "")).sort(sortByNewest);
    const noteCount = latest.filter((a) => matchesStudentAction(a, student.id, student.studentNumber)).length;
    if (noteCount < 3) {
      toast({ title: "لا يمكن التحويل", description: `يجب تسجيل 3 ملاحظات على الأقل (${noteCount}/3)`, variant: "destructive" }); return;
    }
    const lastAction = latest.find((a) => matchesStudentAction(a, student.id, student.studentNumber));
    if (lastAction) openSendDialog(lastAction);
    setReferralSearchOpen(false);
  };

  const getStudentProfilePath = (action: StudentAction) => {
    const s = allStudents.find((i) => i.id === action.studentId || i.studentNumber === action.studentNumber);
    return s ? `/student/${s.id}` : null;
  };

  const exportReferralsPDF = () => {
    if (transferredCases.length === 0) { toast({ title: "لا توجد حالات محوّلة", variant: "destructive" }); return; }

    const now = new Date();
    const hijriDate = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric", month: "long", day: "numeric" }).format(now);
    const hijriDay = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(now);
    const hijriYear = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" }).format(now);

    const caseRows = transferredCases.map((c, i) => {
      const p = c.payload;
      const statusLabel = getReferralStatusLabel(c.status);
      const statusColor = c.status === "action_taken" ? "#166534" : c.status === "under_vice_followup" ? "#92400e" : "#991b1b";
      const dateStr = new Date(c.createdAt).toLocaleDateString("ar-SA-u-ca-islamic-umalqura");
      const notes = p?.noteLabel || "-";

      return `
        <tr>
          <td class="tc">${i + 1}</td>
          <td class="bold">${p?.studentName || "-"}</td>
          <td class="tc">${p?.grade || "-"}</td>
          <td class="tc">${p?.noteCount || "-"}</td>
          <td style="font-size:9px">${notes}</td>
          <td class="tc"><span style="color:${statusColor};font-weight:800">${statusLabel}</span></td>
          <td>${c.actionTaken || "بانتظار الإجراء"}</td>
          <td class="tc">${dateStr}</td>
        </tr>`;
    }).join("");

    const summaryStats = {
      total: transferredCases.length,
      pending: transferredCases.filter(c => c.status === "transferred_after_third_note").length,
      inProgress: transferredCases.filter(c => c.status === "under_vice_followup").length,
      done: transferredCases.filter(c => c.status === "action_taken").length,
    };

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>نموذج تحويل الحالات السلوكية</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Cairo',sans-serif; padding:10mm 12mm; font-size:11px; color:#111; }
    @page { size:A4 portrait; margin:8mm; }

    .official-header {
      display:flex; justify-content:space-between; align-items:flex-start;
      padding-bottom:8px; margin-bottom:6px; border-bottom:2.5px solid #000;
    }
    .official-header .right-side { text-align:center; font-weight:700; line-height:1.7; color:#000; }
    .official-header .right-side p { margin:0; font-size:10px; }
    .official-header .right-side p:first-child { font-size:11px; font-weight:800; }
    .official-header .right-side p:last-child { font-size:11px; font-weight:800; }
    .official-header .center-logo { text-align:center; flex-shrink:0; padding:0 10px; }
    .official-header .center-logo img { height:60px; }
    .official-header .left-side {
      text-align:center; font-weight:600; line-height:1.7; font-size:10px; color:#000; min-width:150px;
    }
    .official-header .left-side p { margin:0; }

    .doc-title {
      text-align:center; font-size:16px; font-weight:900; margin:10px 0 4px;
      padding:6px 0; border:2px solid #1a365d; background:#eef2ff; color:#1a365d;
    }
    .doc-subtitle {
      text-align:center; font-size:11px; font-weight:700; color:#444; margin-bottom:8px;
    }
    .doc-ref {
      text-align:center; font-size:10px; color:#666; margin-bottom:12px;
    }

    .intro-text {
      font-size:12px; line-height:2; margin-bottom:10px; text-align:justify;
      border:1px solid #ddd; padding:10px 14px; border-radius:4px; background:#fafafa;
    }
    .intro-text strong { color:#1a365d; }

    .summary-bar {
      display:flex; justify-content:space-around; margin:10px 0 14px;
      border:1.5px solid #1a365d; border-radius:4px; padding:8px 0;
    }
    .summary-item { text-align:center; }
    .summary-item .num { font-size:20px; font-weight:900; color:#1a365d; }
    .summary-item .lbl { font-size:9px; font-weight:700; color:#555; }

    table { width:100%; border-collapse:collapse; margin-bottom:12px; }
    th { background:#1a365d; color:#fff; font-size:10px; font-weight:800; padding:6px 4px; border:1.5px solid #1a365d; }
    td { border:1.5px solid #ccc; padding:5px 6px; font-size:10px; vertical-align:top; }
    tr:nth-child(even) td { background:#f7f9fc; }
    .tc { text-align:center; }
    .bold { font-weight:800; }

    .regulation-box {
      border:1.5px solid #92400e; border-radius:4px; padding:10px 14px; margin:14px 0;
      background:#fffbeb;
    }
    .regulation-box h3 { font-size:11px; font-weight:900; color:#92400e; margin-bottom:6px; }
    .regulation-box ul { padding-right:18px; font-size:10px; line-height:1.9; color:#333; }

    .signatures {
      display:flex; justify-content:space-between; margin-top:30px; padding-top:12px;
      border-top:2px solid #000;
    }
    .sig-block { text-align:center; min-width:160px; }
    .sig-title { font-size:10px; font-weight:800; color:#000; }
    .sig-name { font-size:11px; font-weight:900; color:#1a365d; margin-top:2px; }
    .sig-line { border-bottom:1px solid #000; width:130px; margin:20px auto 4px; }
    .sig-label { font-size:8px; color:#666; }

    .footer-note {
      text-align:center; font-size:8px; color:#999; margin-top:16px;
      border-top:1px solid #ddd; padding-top:6px;
    }
  </style>
</head>
<body>
  <div class="official-header">
    <div class="right-side">
      <p>المملكة العربية السعودية</p>
      <p>وزارة التعليم</p>
      <p>الإدارة العامة للتعليم بالمنطقة الشرقية</p>
      <p>قطاع التعليم بالخبر</p>
      <p>ثانوية اليعقوبي بالخبر - مسارات</p>
    </div>
    <div class="center-logo">
      <img src="/images/moe-education-logo.png" alt="شعار وزارة التعليم" onerror="this.style.display='none'" />
    </div>
    <div class="left-side">
      <p>الرقم: ..............</p>
      <p>اليوم: ${hijriDay}</p>
      <p>التاريخ: ${hijriDate}</p>
      <p>المرفقات: ${transferredCases.length} حالة</p>
    </div>
  </div>

  <div class="doc-title">نموذج تحويل حالات سلوكية — الملاحظات الصفية المتكررة</div>
  <div class="doc-subtitle">وفق قواعد السلوك والمواظبة — الإصدار الخامس ${hijriYear}هـ</div>
  <div class="doc-ref">المرجع: المادة (10) — الإجراءات التربوية للمخالفات السلوكية (الدرجة الأولى والثانية)</div>

  <div class="intro-text">
    <strong>سعادة وكيل شؤون الطلاب /</strong> عدنان علي الزريق &nbsp;&nbsp;&nbsp; حفظه الله<br/>
    <strong>السلام عليكم ورحمة الله وبركاته ، وبعد:</strong><br/>
    إشارةً إلى ما تنص عليه قواعد السلوك والمواظبة (الإصدار الخامس) بشأن الإجراءات التربوية العلاجية المتدرجة،
    فقد تم رصد الملاحظات الصفية التالية والتي بلغت مرحلة التحويل النظامي (الملاحظة الثالثة فأكثر) 
    لاتخاذ الإجراءات اللازمة وفق المواد التنظيمية. نأمل التكرم بالاطلاع واتخاذ ما يلزم من إجراءات تربوية وتوثيقها.
  </div>

  <div class="summary-bar">
    <div class="summary-item"><div class="num">${summaryStats.total}</div><div class="lbl">إجمالي الحالات المحوّلة</div></div>
    <div class="summary-item"><div class="num" style="color:#991b1b">${summaryStats.pending}</div><div class="lbl">بانتظار الإجراء</div></div>
    <div class="summary-item"><div class="num" style="color:#92400e">${summaryStats.inProgress}</div><div class="lbl">قيد المتابعة</div></div>
    <div class="summary-item"><div class="num" style="color:#166534">${summaryStats.done}</div><div class="lbl">تم اتخاذ الإجراء</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>اسم الطالب</th>
        <th>الصف / الشعبة</th>
        <th>عدد الملاحظات</th>
        <th>تفاصيل الملاحظات</th>
        <th>الحالة</th>
        <th>الإجراء المتخذ</th>
        <th>تاريخ التحويل</th>
      </tr>
    </thead>
    <tbody>${caseRows}</tbody>
  </table>

  <div class="regulation-box">
    <h3>📋 الإجراءات النظامية المطلوبة (وفق قواعد السلوك والمواظبة):</h3>
    <ul>
      <li>التنبيه الشفهي وتوضيح أضرار السلوك غير المرغوب بأسلوب تربوي</li>
      <li>تدوين المشكلة السلوكية وإحالة الطالب إلى الموجه الطلابي لدراسة الحالة</li>
      <li>إشعار ولي الأمر هاتفياً بالمشكلة السلوكية والإجراءات المتخذة</li>
      <li>أخذ تعهد خطي على الطالب بعدم تكرار المخالفة (في حال التكرار)</li>
      <li>حسم الدرجات المستحقة من درجات السلوك الإيجابي وفق درجة المخالفة</li>
      <li>توثيق جميع الإجراءات في ملف الطالب وإفادة المعلم بالنتائج</li>
    </ul>
  </div>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-title">المعلم المُحيل</div>
      <div class="sig-name">${profile?.full_name || "................"}</div>
      <div class="sig-line"></div>
      <div class="sig-label">التوقيع</div>
    </div>
    <div class="sig-block">
      <div class="sig-title">الموجه الطلابي</div>
      <div class="sig-name">عادل علي السبعان</div>
      <div class="sig-line"></div>
      <div class="sig-label">التوقيع</div>
    </div>
    <div class="sig-block">
      <div class="sig-title">وكيل شؤون الطلاب</div>
      <div class="sig-name">عدنان علي الزريق</div>
      <div class="sig-line"></div>
      <div class="sig-label">التوقيع</div>
    </div>
    <div class="sig-block">
      <div class="sig-title">مدير المدرسة</div>
      <div class="sig-name">فهد حامد الزهراني</div>
      <div class="sig-line"></div>
      <div class="sig-label">التوقيع</div>
    </div>
  </div>

  <div class="footer-note">
    تم إعداد هذا النموذج آلياً بواسطة نظام المتابعة الإلكتروني — ثانوية اليعقوبي بالخبر — العام الدراسي ${hijriYear}هـ
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ─── RENDER ──────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-10">

        {/* ══════ HERO HEADER ══════ */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 md:p-8 text-primary-foreground shadow-lg">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-40 h-40 bg-white/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-56 h-56 bg-white/10 rounded-full translate-x-1/4 translate-y-1/4" />
          </div>
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
                <BookOpen size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">الملاحظات الصفية</h1>
                {profile && (
                  <p className="text-sm text-primary-foreground/70 mt-1 font-medium">
                    {profile.full_name} — {profile.role_title}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs font-bold shadow-md" onClick={exportReferralsPDF}>
                <Download size={14} /> تصدير PDF
              </Button>
              <Button size="sm" className="gap-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white border-white/20 shadow-md" onClick={() => setReferralSearchOpen(true)}>
                <Send size={14} /> تحويل يدوي
              </Button>
            </div>
          </div>

          {/* ── Inline Stats ── */}
          <div className="relative grid grid-cols-3 gap-3 mt-6">
            {[
              { value: todayActions.length, label: "ملاحظات اليوم", icon: <StickyNote size={20} />, bg: "bg-white/15" },
              { value: eligibleForReferral.length, label: "جاهزون للتحويل", icon: <AlertTriangle size={20} />, bg: "bg-destructive/30" },
              { value: transferredCases.length, label: "محوّلة رسمياً", icon: <CheckCircle size={20} />, bg: "bg-white/15" },
            ].map((s, i) => (
              <div key={i} className={`${s.bg} backdrop-blur-sm rounded-xl p-3 md:p-4 flex items-center gap-3 border border-white/10`}>
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{s.icon}</div>
                <div>
                  <p className="text-2xl md:text-3xl font-black leading-none">{s.value}</p>
                  <p className="text-[11px] text-primary-foreground/60 mt-0.5 font-medium">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════ REGISTRATION FORM ══════ */}
        <div className="bg-card rounded-2xl border-2 border-secondary/30 shadow-md overflow-hidden">
          <div className="bg-gradient-to-l from-secondary/10 via-secondary/5 to-transparent px-5 py-4 border-b border-secondary/20 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary/20 flex items-center justify-center">
              <Zap size={18} className="text-secondary" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">تسجيل ملاحظة جديدة</h2>
              <p className="text-[11px] text-muted-foreground">اختر الطالب وسجّل الملاحظة بسرعة</p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Grade / Section / Search */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> المرحلة
                </Label>
                <Select value={classGrade} onValueChange={(v) => { setClassGrade(v); setClassSection(""); }}>
                  <SelectTrigger className="h-10 rounded-xl border-2 border-border/60 focus:border-primary"><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" /> الشعبة
                </Label>
                <Select value={classSection} onValueChange={setClassSection} disabled={!classGrade}>
                  <SelectTrigger className="h-10 rounded-xl border-2 border-border/60 focus:border-primary"><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
                  <SelectContent>
                    {classSections.map((s) => <SelectItem key={s} value={String(s)}>شعبة {s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" /> بحث مباشر
                </Label>
                <Button variant="outline" onClick={() => setSearchOpen(true)} disabled={submitting}
                  className="w-full h-10 gap-2 text-sm rounded-xl border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 transition-all">
                  <Search size={16} className="text-primary" />
                  بحث عن طالب
                </Button>
              </div>
            </div>

            {/* Student Picker Grid */}
            {classSectionStudents.length > 0 && (
              <div className="rounded-xl border-2 border-primary/15 bg-gradient-to-b from-primary/3 to-transparent p-4">
                <Label className="text-xs font-bold text-primary mb-3 flex items-center gap-2">
                  <UserRound size={14} />
                  اختر الطالب ({classSectionStudents.length} طالب)
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {classSectionStudents.map((s) => {
                    const isSelected = selectedStudent?.id === s.id;
                    const noteCount = getStudentNoteCount(s.id, s.studentNumber);
                    return (
                      <button key={s.id} onClick={() => setSelectedStudent(isSelected ? null : s)} disabled={submitting}
                        className={`text-[12px] px-3 py-2 rounded-xl border-2 transition-all text-right truncate font-semibold relative ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-lg ring-2 ring-primary/30 scale-[1.03]"
                            : "border-border/40 bg-card hover:bg-primary/10 hover:border-primary/40"
                        }`}>
                        <span className="inline-flex items-center gap-1">
                          <HealthBadge studentId={s.id} studentNumber={s.studentNumber} size="xs" />
                          {s.name}
                        </span>
                        {noteCount > 0 && (
                          <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center shadow-sm ${
                            noteCount >= 3 ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"
                          }`}>{noteCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Student Indicator */}
                {selectedStudent && (
                  <div className="mt-3 px-4 py-2.5 rounded-xl bg-primary/10 border-2 border-primary/25 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-primary" />
                      <span className="text-sm font-bold text-foreground">تم اختيار: {selectedStudent.name}</span>
                      <span className="text-[11px] text-muted-foreground">({selectedStudent.studentNumber})</span>
                    </div>
                    <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-destructive text-xs">
                      <XCircle size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Period / Subject / Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground">رقم الحصة</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="h-10 rounded-xl border-2 border-border/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map((p) => <SelectItem key={p} value={String(p)}>الحصة {p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground">المادة</Label>
                <Input placeholder="رياضيات، علوم..." className="h-10 rounded-xl border-2 border-border/60" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground">نوع الملاحظة</Label>
                <Select value={selectedType} onValueChange={(v) => setSelectedType(v as ActionType)}>
                  <SelectTrigger className="h-10 rounded-xl border-2 border-border/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSROOM_ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{ACTION_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <Label className="text-xs font-bold text-muted-foreground mb-2.5 flex items-center gap-2">
                <Zap size={13} className="text-secondary" /> اختيار سريع
              </Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_NOTES.map((p) => (
                  <button key={p} onClick={() => setNote(p)}
                    className={`text-[12px] px-3 py-1.5 rounded-xl border-2 transition-all font-medium ${
                      note === p
                        ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                        : "bg-card text-foreground border-border/40 hover:border-primary/40 hover:bg-primary/5"
                    }`}>{p}</button>
                ))}
              </div>
            </div>

            {/* Custom note */}
            <Textarea placeholder="أو اكتب ملاحظة يدوية..." rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              className="text-sm rounded-xl border-2 border-border/60 focus:border-primary" />

            {/* Escalation Warning */}
            <div className="rounded-xl border-2 border-amber-400/40 bg-gradient-to-l from-amber-50/80 via-amber-50/40 to-transparent dark:from-amber-950/30 dark:via-amber-950/10 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div className="space-y-2 flex-1">
                  <h4 className="text-sm font-black text-amber-700 dark:text-amber-400">⚠️ تنبيه مهم — مراحل التصعيد التربوي</h4>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    وفق <strong>قواعد السلوك والمواظبة (الإصدار الأخير)</strong>، لا يتم تحويل الطالب إلا بعد <strong>٣ ملاحظات مسجّلة</strong> مع استنفاد الإجراءات التالية:
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {ESCALATION_STAGES.map((s, i) => (
                      <span key={s.key} className={`text-[11px] px-3 py-1.5 rounded-xl font-bold border-2 transition-all ${
                        i === 0 ? "bg-primary/8 text-primary border-primary/20"
                        : i === 1 ? "bg-secondary/10 text-secondary-foreground border-secondary/25"
                        : i === 2 ? "bg-warning/15 text-warning border-warning/30"
                        : "bg-destructive/15 text-destructive border-destructive/30"
                      }`}>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-current/10 text-[10px] ml-1 font-black">{s.icon}</span>
                        {s.label}
                      </span>
                    ))}
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-1 mt-2 mr-3 list-disc list-inside">
                    <li><strong>الملاحظة الأولى:</strong> توجيه شفهي وتنبيه الطالب</li>
                    <li><strong>الملاحظة الثانية:</strong> متابعة المعلم والتواصل مع ولي الأمر</li>
                    <li><strong>الملاحظة الثالثة:</strong> تكرار المخالفة → يتم التحويل تلقائياً للوكيل/المدير</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Register Button */}
            <Button
              onClick={handleRegisterNote}
              disabled={submitting || !selectedStudent}
              className="w-full h-12 text-base font-black rounded-xl shadow-lg gap-3 transition-all hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
              variant={selectedStudent ? "default" : "secondary"}
            >
              {submitting ? (
                <>جارٍ التسجيل...</>
              ) : selectedStudent ? (
                <>
                  <CheckCircle size={20} />
                  تسجيل الملاحظة على {selectedStudent.name}
                </>
              ) : (
                <>
                  <Info size={20} />
                  اختر الطالب أولاً لتسجيل الملاحظة
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ══════ ELIGIBLE FOR REFERRAL ══════ */}
        {eligibleForReferral.length > 0 && (
          <div className="rounded-2xl border-2 border-destructive/30 overflow-hidden shadow-md bg-gradient-to-b from-destructive/5 to-card">
            <div className="px-5 py-4 border-b border-destructive/15 bg-destructive/8 flex items-center justify-between">
              <h2 className="text-sm font-black text-destructive flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center animate-pulse">
                  <AlertTriangle size={16} />
                </div>
                طلاب يحتاجون تحويل رسمي ({eligibleForReferral.length})
              </h2>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {eligibleForReferral.map((item) => (
                <div key={item.key} className="rounded-xl border-2 border-destructive/15 p-4 bg-card hover:border-destructive/40 hover:shadow-lg transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-sm text-foreground">{item.lastAction.studentName}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {item.lastAction.grade} • شعبة {item.lastAction.section}
                      </p>
                    </div>
                    <span className="text-xs bg-destructive text-destructive-foreground px-2.5 py-1 rounded-lg font-bold shadow-sm">
                      {item.count} ملاحظات
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="destructive" size="sm" className="gap-1.5 h-8 text-[11px] rounded-lg flex-1 font-bold shadow-sm" onClick={() => openSendDialog(item.lastAction)}>
                      <Send size={12} /> تحويل رسمي
                    </Button>
                    {getStudentProfilePath(item.lastAction) && (
                      <Button variant="outline" size="sm" className="gap-1 h-8 text-[11px] rounded-lg"
                        onClick={() => navigate(getStudentProfilePath(item.lastAction) as string)}>
                        <UserRound size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════ TRANSFERRED CASES ══════ */}
        {transferredCases.length > 0 && (
          <div className="bg-card rounded-2xl border-2 border-border/50 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border/50 bg-gradient-to-l from-primary/5 to-transparent flex items-center justify-between">
              <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText size={16} className="text-primary" />
                </div>
                الحالات المحوّلة ({transferredCases.length})
              </h2>
            </div>
            <div className="divide-y divide-border/30 max-h-[280px] overflow-y-auto">
              {transferredCases.map((item) => (
                <div key={item.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{item.payload?.studentName || "حالة صفية"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {item.payload?.grade || ""} {item.payload?.period ? `• الحصة ${item.payload.period}` : ""}
                      {item.payload?.subjectName ? ` • ${item.payload.subjectName}` : ""}
                    </p>
                    {item.actionTaken && <p className="text-[11px] text-primary font-medium mt-0.5">✓ {item.actionTaken}</p>}
                  </div>
                  <span className={`text-[10px] px-3 py-1 rounded-lg border-2 font-bold whitespace-nowrap shrink-0 ${REFERRAL_STATUS_CLASSES[item.status] || "bg-muted text-muted-foreground border-border"}`}>
                    {getReferralStatusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════ NOTES LOG ══════ */}
        <div className="bg-card rounded-2xl border-2 border-border/50 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3 flex-wrap bg-gradient-to-l from-accent/5 to-transparent">
            <h2 className="text-sm font-black text-foreground flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Filter size={16} className="text-accent" />
              </div>
              سجل الملاحظات ({filteredActions.length})
            </h2>
            <DateRangeFilter onRangeChange={(r) => setDateRangeFilter(r)} />
          </div>

          {filteredActions.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                <StickyNote size={28} className="text-muted-foreground/40" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">لا توجد ملاحظات في الفترة المحددة</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">سجّل ملاحظات جديدة من النموذج أعلاه</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20 max-h-[420px] overflow-y-auto">
              {filteredActions.map((action) => {
                const noteCount = getStudentNoteCount(action.studentId, action.studentNumber);
                const allowEscalate = canEscalate(action);
                const archivePath = getStudentProfilePath(action);
                const stageIdx = Math.min(noteCount - 1, 3);
                const stageColors = ["bg-primary/8 border-primary/20", "bg-secondary/8 border-secondary/20", "bg-warning/10 border-warning/25", "bg-destructive/10 border-destructive/25"];

                return (
                  <div key={action.id} className="px-5 py-3.5 hover:bg-muted/10 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-sm text-foreground">{action.studentName}</p>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-lg font-bold border ${ACTION_COLORS[action.type]}`}>
                            {ACTION_LABELS[action.type]}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border ${stageColors[stageIdx] || stageColors[0]}`}>
                            {ESCALATION_STAGES[stageIdx]?.label || "ملاحظة"} ({noteCount})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1"><Clock size={11} /> {action.time}</span>
                          <span>• {action.date}</span>
                          <span>• الحصة {action.period || "-"}</span>
                          {action.subjectName && <span>• {action.subjectName}</span>}
                        </div>
                        {action.description && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1 truncate max-w-md">{action.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {archivePath && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10" onClick={() => navigate(archivePath)}>
                            <ArrowUpRight size={14} className="text-primary" />
                          </Button>
                        )}
                        {allowEscalate && (
                          <Button variant="destructive" size="sm" className="gap-1 h-8 text-[11px] rounded-lg font-bold" onClick={() => openSendDialog(action)}>
                            <Send size={11} /> تحويل
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="gap-1 h-8 text-[11px] rounded-lg text-accent hover:bg-accent/10 font-bold"
                          onClick={() => { setCancelAction(action); setCancelDialogOpen(true); }}>
                          <ThumbsUp size={11} /> إلغاء
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Principal: Cancel Requests ── */}
        {profile?.is_principal && <PrincipalCancelRequests />}

        {/* ── Dialogs ── */}
        <StudentSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectStudent={handleStudentSelect} />
        <StudentSearchDialog open={referralSearchOpen} onOpenChange={setReferralSearchOpen} onSelectStudent={handleReferralStudentSelect} />
        <NoteCancelRequestDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          action={cancelAction}
          onSuccess={() => { loadActions(true).then(refreshClassroomActions); }}
        />

        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive font-black">
                <Send size={18} /> تحويل رسمي للوكيل
              </DialogTitle>
            </DialogHeader>
            {sendingAction && (
              <div className="space-y-4 mt-1">
                <div className="bg-destructive/5 border-2 border-destructive/15 rounded-xl p-4 space-y-2 text-sm">
                  <p><strong>الطالب:</strong> {sendingAction.studentName}</p>
                  <p><strong>الرقم:</strong> {sendingAction.studentNumber}</p>
                  <p><strong>النوع:</strong> {ACTION_LABELS[sendingAction.type]}</p>
                  <p><strong>الحصة:</strong> {sendingAction.period || "-"}</p>
                  {sendingAction.subjectName && <p><strong>المادة:</strong> {sendingAction.subjectName}</p>}
                  <p className="text-destructive font-black text-base">
                    عدد الملاحظات: {getStudentNoteCount(sendingAction.studentId, sendingAction.studentNumber)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  سيتم إشعار الوكيل والمدير مباشرة مع تحديث أرشيف الطالب تلقائياً.
                </p>
                <Button onClick={handleSendNote} disabled={sendingInProgress} variant="destructive"
                  className="w-full gap-2 h-11 font-black rounded-xl text-sm shadow-lg">
                  <Send size={16} />
                  {sendingInProgress ? "جارٍ التحويل..." : "تأكيد التحويل الرسمي"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TeacherClassroomPage;
