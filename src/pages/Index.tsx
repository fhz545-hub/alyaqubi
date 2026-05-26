import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { loadStudents, getStudentsFromDB, getStudentsCount, isStudentsLoaded } from "@/store/studentsStore";
import { getTodaySummary, getTodayActions, loadActions, getFrequentStudents, getFrequentStudentsFromDB, onCacheUpdate, getCacheVersion, getActionsByDate, getActionsByDateSummary } from "@/store/actionsStore";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users, Clock, XCircle, LogOut, CheckCircle, AlertTriangle, ScanBarcode, AlertOctagon, CalendarDays, RefreshCw, TrendingUp, ChevronDown, ChevronUp, MessageCircle, FileText, CheckCircle2, StickyNote, Calendar, Eye, Trophy, Radio, ArrowLeft } from "lucide-react";
import { hasPermission, getUserPermissions } from "@/store/permissionsStore";
import AcademicWeeksCalendar from "@/components/AcademicWeeksCalendar";
import { ACTION_LABELS, ACTION_COLORS, ActionType } from "@/types/school";
import BarcodeSearchDialog from "@/components/BarcodeSearchDialog";
import { getFullHijriDate } from "@/utils/hijri";
import { openWhatsApp, generateWhatsAppMessage, isValidSaudiPhone } from "@/utils/whatsapp";
import { toast } from "@/hooks/use-toast";
import { getCurrentAcademicWeek } from "@/utils/academicWeeks";
import ViewOnlyBanner from "@/components/ViewOnlyBanner";
import { isDistanceLearning, filterRegularStudents } from "@/utils/distanceLearning";

// ======= المؤشرات التنبيهية التفاعلية =======
const ABSENCE_PROCS = [
  { minCount: 1, label: "التواصل مع ولي الأمر هاتفيًا" },
  { minCount: 3, label: "إشعار ولي الأمر رسميًا" },
  { minCount: 5, label: "استدعاء ولي الأمر" },
  { minCount: 7, label: "تعهد خطي" },
  { minCount: 10, label: "تحويل للجنة التوجيه" },
  { minCount: 15, label: "رفع لإدارة التعليم" },
];
const LATE_PROCS = [
  { minCount: 1, label: "تنبيه شفهي" },
  { minCount: 3, label: "إشعار ولي الأمر" },
  { minCount: 5, label: "تعهد خطي" },
  { minCount: 7, label: "استدعاء ولي الأمر" },
  { minCount: 10, label: "تحويل للموجه الطلابي" },
];
const VIOL_PROCS = [
  { minCount: 1, label: "تنبيه شفهي وتوثيق" },
  { minCount: 2, label: "إشعار ولي الأمر وحسم" },
  { minCount: 3, label: "تعهد خطي وحسم" },
  { minCount: 4, label: "استدعاء وخطة علاجية" },
  { minCount: 5, label: "تحويل للجنة التوجيه" },
];
const PERM_PROCS = [
  { minCount: 1, label: "متابعة ولي الأمر هاتفيًا" },
  { minCount: 3, label: "إشعار ولي الأمر رسميًا" },
  { minCount: 5, label: "استدعاء ولي الأمر" },
  { minCount: 7, label: "تعهد خطي" },
  { minCount: 10, label: "تحويل للموجه الطلابي" },
];

const getProcedureLabel = (type: string, count: number) => {
  const procs = type === "absent" ? ABSENCE_PROCS : type === "late" ? LATE_PROCS : type === "permission" ? PERM_PROCS : VIOL_PROCS;
  for (let i = procs.length - 1; i >= 0; i--) {
    if (count >= procs[i].minCount) return procs[i].label;
  }
  return procs[0].label;
};

interface FrequentStudent { studentId: string; name: string; grade: string; section: number; count: number }

interface AlertIndicatorsSectionProps {
  frequentAbsent: FrequentStudent[];
  frequentLate: FrequentStudent[];
  frequentViolation: FrequentStudent[];
  frequentPermission: FrequentStudent[];
  navigate: (path: string) => void;
  allStudents: any[];
  profile: any;
  readOnly?: boolean;
}

const AlertIndicatorsSection = ({ frequentAbsent, frequentLate, frequentViolation, frequentPermission, navigate, allStudents, profile, readOnly = false }: AlertIndicatorsSectionProps) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<Record<string, string>>({});

  const indicators = [
    { key: "absent", title: "كثيرو الغياب", typeLabel: "غياب", icon: <XCircle size={20} />, students: frequentAbsent, colorBg: "bg-destructive/5", colorBorder: "border-destructive/25", colorText: "text-destructive", badgeBg: "bg-destructive/10", typeBadgeBg: "bg-destructive/15 text-destructive border-destructive/30", btnClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground" },
    { key: "late", title: "كثيرو التأخر", typeLabel: "تأخر", icon: <Clock size={20} />, students: frequentLate, colorBg: "bg-warning/5", colorBorder: "border-warning/25", colorText: "text-warning", badgeBg: "bg-warning/10", typeBadgeBg: "bg-warning/15 text-warning border-warning/30", btnClass: "bg-warning hover:bg-warning/90 text-warning-foreground" },
    { key: "violation", title: "كثيرو المخالفات السلوكية", typeLabel: "مخالفة", icon: <AlertOctagon size={20} />, students: frequentViolation, colorBg: "bg-destructive/5", colorBorder: "border-destructive/25", colorText: "text-destructive", badgeBg: "bg-destructive/10", typeBadgeBg: "bg-destructive/15 text-destructive border-destructive/30", btnClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground" },
    { key: "permission", title: "كثيرو الاستئذان", typeLabel: "استئذان", icon: <LogOut size={20} />, students: frequentPermission, colorBg: "bg-accent/5", colorBorder: "border-accent/25", colorText: "text-accent-foreground", badgeBg: "bg-accent/10", typeBadgeBg: "bg-accent/15 text-accent-foreground border-accent/30", btnClass: "bg-accent hover:bg-accent/90 text-accent-foreground" },
  ];

  const handleWhatsApp = (studentId: string, type: string) => {
    const student = allStudents.find((s: any) => s.id === studentId);
    if (!student) return;
    if (!isValidSaudiPhone(student.guardianPhone)) {
      toast({ title: "رقم ولي الأمر غير صالح", variant: "destructive" });
      return;
    }
    const msg = generateWhatsAppMessage(student, type as ActionType, {}, profile ? { name: profile.full_name, role: profile.role_title } : undefined);
    const sent = openWhatsApp(student.guardianPhone, msg);
    if (sent) {
      const procedure = getProcedureLabel(type, indicators.find(i => i.key === type)?.students.find(s => s.studentId === studentId)?.count || 1);
      setActionDone(prev => ({ ...prev, [`${type}-${studentId}`]: procedure }));
      toast({ title: `تم تنفيذ الإجراء: ${procedure}` });
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
        <AlertTriangle size={18} className="text-warning animate-pulse" />
        المؤشرات التنبيهية
        <span className="text-xs font-normal text-muted-foreground mr-2">( أداة متابعة تربوية )</span>
      </h2>
      <div className="space-y-3">
        {indicators.map((indicator) => (
          <div key={indicator.key} className={`rounded-2xl border ${indicator.colorBorder} ${indicator.colorBg} transition-all hover:shadow-md overflow-hidden`}>
            <button
              onClick={() => indicator.students.length > 0 && setExpanded(expanded === indicator.key ? null : indicator.key)}
              className="w-full flex items-center justify-between p-4 sm:p-5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${indicator.badgeBg} ${indicator.colorText} flex items-center justify-center`}>{indicator.icon}</div>
                <div className="text-right">
                  <h3 className="text-sm sm:text-base font-bold text-foreground">{indicator.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{indicator.students.length > 0 ? `${indicator.students.length} طالب` : "لا توجد حالات"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-center px-3 py-1.5 rounded-xl ${indicator.badgeBg}`}>
                  <span className={`text-2xl sm:text-3xl font-extrabold ${indicator.colorText}`}>{indicator.students.length}</span>
                </div>
                {indicator.students.length > 0 && (expanded === indicator.key ? <ChevronUp size={20} className="text-muted-foreground" /> : <ChevronDown size={20} className="text-muted-foreground" />)}
              </div>
            </button>

            {expanded === indicator.key && indicator.students.length > 0 && (
              <div className="border-t border-border/30 bg-card/50">
                <div className="flex items-center justify-between px-5 py-2 bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground">مرتبون من الأكثر تكرارًا</span>
                  {!readOnly && (
                    <button onClick={() => navigate(`/alert-followup?alert=${indicator.key}`)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${indicator.btnClass}`}>
                      الإجراء الشامل
                    </button>
                  )}
                </div>
                <div className="divide-y divide-border/20 max-h-[400px] overflow-y-auto">
                  {indicator.students.map((student, idx) => {
                    const doneKey = `${indicator.key}-${student.studentId}`;
                    const isDone = !!actionDone[doneKey];
                    const procedure = getProcedureLabel(indicator.key, student.count);
                    const isTop = idx === 0;
                    return (
                      <div key={student.studentId} className={`flex items-center justify-between px-5 py-3.5 transition-colors ${isTop ? "bg-destructive/8 border-r-4 border-r-destructive" : ""} ${isDone ? "bg-success/5" : "hover:bg-muted/20"}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDone ? "bg-success/20 text-success" : isTop ? "bg-destructive text-destructive-foreground" : `${indicator.badgeBg} ${indicator.colorText}`}`}>
                            {isDone ? <CheckCircle2 size={16} /> : idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-bold text-foreground ${isTop ? "text-base" : "text-sm"}`}>{student.name}</p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${indicator.typeBadgeBg}`}>
                                {indicator.icon && React.cloneElement(indicator.icon as React.ReactElement, { size: 11 })}
                                {indicator.typeLabel}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-extrabold ${isTop ? "text-xs bg-destructive/20 text-destructive" : `text-[11px] ${indicator.badgeBg} ${indicator.colorText}`}`}>
                                {student.count} مرة
                              </span>
                              <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                                {student.grade} - {student.section}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-semibold text-muted-foreground border border-border/30">
                                📋 {procedure}
                              </span>
                            </div>
                            {isDone && (
                              <p className="text-[11px] text-success font-bold mt-1 flex items-center gap-1">
                                <CheckCircle2 size={12} /> تم: {actionDone[doneKey]}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!readOnly && !isDone && (
                            <button onClick={() => handleWhatsApp(student.studentId, indicator.key)} className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-all" title="تواصل واتساب">
                              <MessageCircle size={14} />
                            </button>
                          )}
                          {!readOnly && (
                            <button onClick={() => navigate(`/student/${student.studentId}`)} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all" title="ملف الطالب">
                              <FileText size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const Dashboard = () => {
  // إجمالي الطلاب المنتظمين فقط (مستثنى منهم طلاب التعليم الإلكتروني/الانتساب)
  const [totalStudents, setTotalStudents] = useState(() => filterRegularStudents(getStudentsFromDB()).length);
  const [loading, setLoading] = useState(!isStudentsLoaded());
  const navigate = useNavigate();
  const { profile } = useAuth();
  // تحويل أول زيارة في الجلسة إلى دليل الاستخدام (الصفحة الكاملة)
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("user_guide_session_visited_v1")) {
        sessionStorage.setItem("user_guide_session_visited_v1", "1");
        navigate("/guide", { replace: true });
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const teacherDefaultPerms = new Set(["record_class_notes", "print_subject_sheets"]);
  const userPerms = getUserPermissions(userId);
  const hasExtraPerms = userPerms.some(p => !teacherDefaultPerms.has(p));
  const isTeacherRestricted = !isPrincipal && Boolean(profile?.approved && profile?.role_title?.includes("معلم") && !hasExtraPerms);
  const canScanBarcode = isPrincipal || hasPermission(userId, isPrincipal, "barcode_scan") || hasPermission(userId, isPrincipal, "record_late") || hasPermission(userId, isPrincipal, "record_absent");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState<"late" | "absent" | null>(null);
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const isToday = selectedDate === todayStr;

  const [summary, setSummary] = useState(() => getActionsByDateSummary(todayStr));
  const [recentActions, setRecentActions] = useState(() => getActionsByDate(todayStr));
  const [showRecent, setShowRecent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsCacheVer, setActionsCacheVer] = useState(() => getCacheVersion());

  const refreshingRef = useRef(false);
  const [frequentAbsent, setFrequentAbsent] = useState<FrequentStudent[]>([]);
  const [frequentLate, setFrequentLate] = useState<FrequentStudent[]>([]);
  const [frequentViolation, setFrequentViolation] = useState<FrequentStudent[]>([]);
  const [frequentPermission, setFrequentPermission] = useState<FrequentStudent[]>([]);
  const [positiveStudentsCount, setPositiveStudentsCount] = useState(0);

  const loadFrequentFromDB = useCallback(async () => {
    const [absent, late, violation, permission] = await Promise.all([
      getFrequentStudentsFromDB(["absent"], 3),
      getFrequentStudentsFromDB(["late"], 3),
      getFrequentStudentsFromDB(["violation"], 2),
      getFrequentStudentsFromDB(["permission", "entry", "exit", "entry_exit_permission"], 3),
    ]);
    setFrequentAbsent(absent);
    setFrequentLate(late);
    setFrequentViolation(violation);
    setFrequentPermission(permission);
  }, []);

  const loadPositiveStudentsCountFromDB = useCallback(async () => {
    const students = await loadStudents(true);
    const negativeTypes = ["absent", "late", "violation", "class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];
    const negativeStudentIds = new Set<string>();
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("student_actions")
        .select("student_id")
        .in("type", negativeTypes)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Failed to load positive behavior indicator:", error);
        return;
      }

      if (!data || data.length === 0) break;
      data.forEach((row) => {
        if (row.student_id) negativeStudentIds.add(row.student_id);
      });

      if (data.length < pageSize) break;
    }

    // استبعاد طلاب الانتساب من حساب السلوك الإيجابي
    const regular = filterRegularStudents(students);
    setPositiveStudentsCount(regular.filter((student) => !negativeStudentIds.has(student.id)).length);
  }, []);

  // Subscribe to actionsCache version changes for accurate indicator updates
  useEffect(() => {
    const unsub = onCacheUpdate((ver) => {
      setActionsCacheVer(ver);
      setSummary(getActionsByDateSummary(selectedDate));
      setRecentActions(getActionsByDate(selectedDate));
    });
    return unsub;
  }, [selectedDate]);

  // When selectedDate changes, recalculate from cache first, then fetch from DB for accuracy
  useEffect(() => {
    // Immediately show cached data
    setSummary(getActionsByDateSummary(selectedDate));
    setRecentActions(getActionsByDate(selectedDate));

    // Then fetch from DB to ensure accuracy for historical dates
    const fetchDateActions = async () => {
      try {
        const { data, error } = await supabase
          .from("student_actions")
          .select("*")
          .eq("date", selectedDate)
          .order("created_at", { ascending: false });

        if (!error && data) {
          const classroomTypes = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];
          const actions = data || [];
          const dbSummary = {
            late: actions.filter((a: any) => a.type === "late").length,
            absent: actions.filter((a: any) => a.type === "absent").length,
            violation: actions.filter((a: any) => a.type === "violation").length,
            permission: actions.filter((a: any) => a.type === "permission").length,
            entry: actions.filter((a: any) => a.type === "entry").length,
            exit: actions.filter((a: any) => a.type === "exit").length,
            summon: actions.filter((a: any) => a.type === "summon").length,
            classroomNotes: actions.filter((a: any) => classroomTypes.includes(a.type)).length,
          };
          setSummary(dbSummary);
          // Map to StudentAction format for recent actions display
          const mapped = actions.map((row: any) => ({
            id: row.id,
            studentId: row.student_id,
            studentName: row.student_name,
            studentNumber: row.student_number,
            grade: row.grade,
            section: row.section,
            type: row.type,
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
          }));
          setRecentActions(mapped);
        }
      } catch (e) {
        console.error("Error fetching date actions:", e);
      }
    };
    fetchDateActions();
  }, [selectedDate]);

  // Show cached data immediately, then refresh in background
  const refreshData = useCallback(async (showSpinner = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (showSpinner) setRefreshing(true);

    try {
      const [students] = await Promise.all([loadStudents(), loadActions()]);
      setTotalStudents(filterRegularStudents(students).length);
    } catch {
      setTotalStudents(filterRegularStudents(getStudentsFromDB()).length);
    } finally {
      setSummary(getActionsByDateSummary(selectedDate));
      setRecentActions(getActionsByDate(selectedDate));
      loadPositiveStudentsCountFromDB();
      refreshingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPositiveStudentsCountFromDB, selectedDate]);

  // On mount: show cached immediately, load fresh in background
  useEffect(() => {
    const cachedRegular = filterRegularStudents(getStudentsFromDB()).length;
    if (cachedRegular > 0) {
      setTotalStudents(cachedRegular);
      setSummary(getActionsByDateSummary(selectedDate));
      setRecentActions(getActionsByDate(selectedDate));
      setLoading(false);
      refreshData(false);
    } else {
      refreshData(false);
    }
  }, [refreshData]);

  // Realtime: instant local refresh on any change
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_actions' }, () => {
        setSummary(getActionsByDateSummary(selectedDate));
        setRecentActions(getActionsByDate(selectedDate));
        loadActions(true).then(() => {
          setSummary(getActionsByDateSummary(selectedDate));
          setRecentActions(getActionsByDate(selectedDate));
          loadPositiveStudentsCountFromDB();
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
        loadStudents(true).then((students) => {
          setTotalStudents(filterRegularStudents(students).length);
          loadPositiveStudentsCountFromDB();
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPositiveStudentsCountFromDB, selectedDate]);

  // Poll local cache every 500ms for instant barcode feedback (only for today)
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      const newSummary = getActionsByDateSummary(selectedDate);
      setSummary(prev => {
        if (prev.late !== newSummary.late || prev.absent !== newSummary.absent ||
            prev.violation !== newSummary.violation || prev.classroomNotes !== newSummary.classroomNotes) {
          setRecentActions(getActionsByDate(selectedDate));
          return newSummary;
        }
        return prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const hijriDate = useMemo(() => getFullHijriDate(), []);
  const academicWeek = useMemo(() => getCurrentAcademicWeek(), []);

  // Load on mount and on cache updates
  useEffect(() => {
    loadFrequentFromDB();
  }, [loadFrequentFromDB]);

  useEffect(() => {
    loadPositiveStudentsCountFromDB();
  }, [loadPositiveStudentsCountFromDB]);

  useEffect(() => {
    const unsub = onCacheUpdate(() => { loadFrequentFromDB(); });
    return unsub;
  }, [loadFrequentFromDB]);

  const presentCount = totalStudents - summary.absent;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  // Append ?date=YYYY-MM-DD when viewing a non-today historical date so detail pages stay in sync
  const dateSuffix = isToday ? "" : `&date=${selectedDate}`;
  const statCards = [
    { type: "present" as const, title: "الحاضرون", value: presentCount, icon: <CheckCircle size={24} />, colorClass: "bg-success/10 text-success border-success/20", route: `/action-details?type=present${dateSuffix}` },
    { type: "late" as const, title: "المتأخرون", value: summary.late, icon: <Clock size={24} />, colorClass: "bg-warning/10 text-warning border-warning/20", route: `/action-details?type=late${dateSuffix}` },
    { type: "absent" as const, title: "الغائبون", value: summary.absent, icon: <XCircle size={24} />, colorClass: "bg-destructive/10 text-destructive border-destructive/20", route: `/action-details?type=absent${dateSuffix}` },
    { type: "classroomNotes" as const, title: "الملاحظات الصفية", value: summary.classroomNotes, icon: <StickyNote size={24} />, colorClass: "bg-primary/10 text-primary border-primary/20", route: `/action-details?type=classroomNotes${dateSuffix}` },
    { type: "violation" as const, title: "المخالفات", value: summary.violation, icon: <AlertTriangle size={24} />, colorClass: "bg-secondary/10 text-secondary border-secondary/20", route: `/action-details?type=violation${dateSuffix}` },
    { type: "positiveBehavior" as const, title: "السلوك الإيجابي", value: positiveStudentsCount, icon: <Trophy size={24} />, colorClass: "bg-success/10 text-success border-success/20", route: "/positive-behavior" },
  ];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">جارٍ تحميل لوحة التحكم...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {isTeacherRestricted && (
        <ViewOnlyBanner text="للمشاهدة فقط — يمكنك مشاهدة جميع المؤشرات والبيانات، ولا تتضمن صلاحيات تنفيذية" />
      )}
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-sm text-muted-foreground">{hijriDate}</span>
              {academicWeek && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/5 px-2.5 py-1 rounded-full border border-primary/10">
                  <CalendarDays size={12} />
                  {academicWeek.semester} - {academicWeek.week}
                </span>
              )}
            </div>
            {profile && (
              <p className="text-sm text-muted-foreground mt-1">
                مرحباً، {profile.role_title} {profile.full_name}
              </p>
            )}
          </div>

          {/* Date Picker + Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-1.5 shadow-sm">
              <Calendar size={18} className="text-primary shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={todayStr}
                className="bg-transparent text-sm font-semibold text-foreground focus:outline-none min-w-[140px]"
              />
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all whitespace-nowrap"
                >
                  العودة لليوم
                </button>
              )}
            </div>
            {!isToday && (
              <span className="text-xs font-semibold text-warning bg-warning/10 px-3 py-1.5 rounded-full border border-warning/20">
                عرض بيانات: {new Date(selectedDate).toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </span>
            )}
            <button
              onClick={() => refreshData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all text-sm"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "جارٍ..." : "تحديث"}
            </button>
            {canScanBarcode && (
              <>
                <button
                  onClick={() => { setBarcodeMode("late"); setBarcodeOpen(true); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-warning/10 text-warning hover:bg-warning/20 transition-all border border-warning/30 text-sm font-semibold"
                >
                  <Clock size={16} /> مسح تأخر
                </button>
                <button
                  onClick={() => { setBarcodeMode("absent"); setBarcodeOpen(true); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all border border-destructive/30 text-sm font-semibold"
                >
                  <XCircle size={16} /> مسح غياب
                </button>
                <button
                  onClick={() => { setBarcodeMode(null); setBarcodeOpen(true); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md text-sm font-semibold"
                >
                  <ScanBarcode size={16} /> باركود
                </button>
              </>
            )}
          </div>
        </div>

        {/* Attendance Overview Bar */}
        {totalStudents > 0 && (
          <div className="mt-5 bg-card rounded-2xl border border-border/50 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {isToday
                    ? "نسبة الحضور اليوم"
                    : `نسبة الحضور — ${new Date(selectedDate).toLocaleDateString("ar-SA", { day: "numeric", month: "long" })}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-primary">{attendanceRate}%</span>
                <span className="text-xs text-muted-foreground">({presentCount}/{totalStudents})</span>
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-l from-success to-success/70 transition-all duration-700 ease-out"
                style={{ width: `${attendanceRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Daily Stats Cards */}
      <div className="mb-8">
        {/* زر متابعة الحصص اللحظي */}
        <button
          onClick={() => navigate("/live-periods")}
          className="group relative w-full mb-6 overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-l from-primary via-primary/90 to-primary/70 text-primary-foreground p-5 sm:p-6 shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all text-right"
        >
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
          <div className="absolute -bottom-12 right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur grid place-items-center ring-2 ring-white/30">
                <Radio className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> مباشر
                  </span>
                  <span className="text-[11px] font-semibold opacity-90">17 شعبة • تحديث لحظي</span>
                </div>
                <h2 className="text-lg sm:text-2xl font-black mt-1.5">متابعة الحصص اللحظي لجميع الشعب</h2>
                <p className="text-[12px] sm:text-sm opacity-90 mt-1">
                  اعرف ما الذي يدرس في كل شعبة الآن بحسب اليوم والوقت والجدول الدراسي.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/15 px-4 py-2 rounded-xl ring-1 ring-white/20 group-hover:bg-white/25 transition-colors">
              <span className="text-sm font-bold">دخول</span>
              <ArrowLeft className="w-4 h-4" />
            </div>
          </div>
        </button>

        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users size={18} className="text-primary" />
          المؤشرات اليومية
        </h2>
        <p className="text-xs text-muted-foreground mb-4">{isTeacherRestricted ? "وضع الاطلاع فقط — اضغط على أي مؤشر لعرض الأسماء" : "اضغط على أي مؤشر لعرض التفاصيل وإرسال الرسائل"}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((card) => (
            <div
              key={card.type}
              onClick={() => navigate(card.route)}
              className={`relative rounded-2xl border p-5 text-right transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-1 active:scale-[0.97] ${card.colorClass}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="opacity-80">{card.icon}</div>
                <span className="text-3xl font-bold">{card.value}</span>
              </div>
              <p className="text-sm font-semibold">{card.title}</p>
            </div>
          ))}
        </div>
      </div>

      {/* المؤشرات التنبيهية - بطاقات تفاعلية مع عرض الأسماء */}
      <AlertIndicatorsSection
        frequentAbsent={frequentAbsent}
        frequentLate={frequentLate}
        frequentViolation={frequentViolation}
        frequentPermission={frequentPermission}
        navigate={navigate}
        allStudents={getStudentsFromDB()}
        profile={profile}
        readOnly={isTeacherRestricted}
      />

      {/* Academic Weeks Calendar */}
      <div className="mb-8">
        <AcademicWeeksCalendar />
      </div>

      {/* Recent Actions */}
      {recentActions.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowRecent(!showRecent)}
            className="w-full flex items-center justify-between text-base font-semibold text-foreground mb-3 px-1 hover:text-primary transition-colors"
          >
            <span className="flex items-center gap-2">📋 آخر الإجراءات ({recentActions.length})</span>
            <span className="text-xs text-muted-foreground font-normal">{showRecent ? "إخفاء ▲" : "عرض ▼"}</span>
          </button>
          {showRecent && (
            <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/30 shadow-sm overflow-hidden">
              {recentActions.slice(0, 10).map((action) => (
                <div key={action.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {action.studentName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{action.studentName}</p>
                      <p className="text-xs text-muted-foreground">{action.grade} - فصل {action.section}</p>
                      {action.performedByName && (
                        <p className="text-xs text-primary">{action.performedByRole} {action.performedByName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ACTION_COLORS[action.type]}`}>
                      {ACTION_LABELS[action.type]}
                    </span>
                    <span className="text-xs text-muted-foreground">{action.time}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BarcodeSearchDialog open={barcodeOpen} onOpenChange={setBarcodeOpen} autoAction={barcodeMode} />
    </AppLayout>
  );
};

export default Dashboard;
