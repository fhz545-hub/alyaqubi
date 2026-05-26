import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { loadStudents, getStudentsFromDB, getGradesFromDB, getSectionsFromDB } from "@/store/studentsStore";
import { addActionsBatch, getTodayActions, loadActions, getActions, getActionsByDateRange, updateActionDetails, updateActionTypeAndDetails, deleteAction, onCacheUpdate, getCacheVersion } from "@/store/actionsStore";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, getUserPermissions } from "@/store/permissionsStore";
import {
  CheckCircle, XCircle, Clock, ClipboardCheck, Users, Save, Search,
  ShieldCheck, ShieldX, AlertCircle, TrendingUp, History, ScanBarcode, X, ChevronLeft, Printer, Edit3, RotateCcw, CheckSquare, Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import DateRangeFilter, { DateRange, FilterMode, filterActionsByRange } from "@/components/DateRangeFilter";
import { format } from "date-fns";
import { getGradeShortName, getGradeFullName } from "@/utils/gradeNames";
import CameraBarcodeScanner from "@/components/CameraBarcodeScanner";
import { playSuccessSound, playErrorSound, playDuplicateSound } from "@/utils/scanSounds";
import { printThermalCard } from "@/utils/print";
import ViewOnlyBanner from "@/components/ViewOnlyBanner";
import HealthBadge from "@/components/HealthBadge";

type AttendanceStatus =
  | "present"
  | "late_excused"
  | "late_unexcused"
  | "absent_excused"
  | "absent_unexcused";

const STATUS_META: Record<AttendanceStatus, {
  label: string;
  dbType: "late" | "absent" | null;
  dbDetails: string;
  icon: typeof CheckCircle;
  colorClass: string;
  bgClass: string;
  branch: "late" | "absent" | "none";
}> = {
  present: {
    label: "حاضر", dbType: null, dbDetails: "",
    icon: CheckCircle, colorClass: "text-success",
    bgClass: "bg-success/10 border-success/30 text-success", branch: "none",
  },
  late_excused: {
    label: "تأخر بعذر", dbType: "late", dbDetails: "تأخر بعذر",
    icon: ShieldCheck, colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10 border-amber-500/30 text-amber-600", branch: "late",
  },
  late_unexcused: {
    label: "تأخر بدون عذر", dbType: "late", dbDetails: "تأخر بدون عذر",
    icon: Clock, colorClass: "text-warning",
    bgClass: "bg-warning/10 border-warning/30 text-warning", branch: "late",
  },
  absent_excused: {
    label: "غياب بعذر", dbType: "absent", dbDetails: "غياب بعذر",
    icon: ShieldCheck, colorClass: "text-blue-500",
    bgClass: "bg-blue-500/10 border-blue-500/30 text-blue-600", branch: "absent",
  },
  absent_unexcused: {
    label: "غياب بدون عذر", dbType: "absent", dbDetails: "غياب بدون عذر",
    icon: XCircle, colorClass: "text-destructive",
    bgClass: "bg-destructive/10 border-destructive/30 text-destructive", branch: "absent",
  },
};

const AttendancePage = () => {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canRecord = isPrincipal || hasPermission(userId, isPrincipal, "record_late") || hasPermission(userId, isPrincipal, "record_absent") || hasPermission(userId, isPrincipal, "barcode_scan");
  const today = new Date().toISOString().split("T")[0];
  const todayFormatted = new Date().toLocaleDateString("ar-SA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const [allStudents, setAllStudents] = useState(getStudentsFromDB());
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"late" | "absent">("late");
  const [, setCacheV] = useState(getCacheVersion());
  useEffect(() => onCacheUpdate(setCacheV), []);

  // Smart search dialog
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  // Bulk selection for fast multi-student marking
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Barcode scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanAction, setScanAction] = useState<"late" | "absent">("late");
  const [lastScanned, setLastScanned] = useState<{ name: string; action: string } | null>(null);

  useEffect(() => {
    Promise.all([loadStudents(), loadActions(true)]).then(([s]) => { setAllStudents(s); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedGrade || !selectedSection) return;
    const todayActions = getTodayActions();
    const sectionStudentIds = new Set(
      allStudents
        .filter(s => s.gradeCode === selectedGrade && s.section === Number(selectedSection))
        .map(s => s.id)
    );
    const newStatuses: Record<string, AttendanceStatus> = {};
    for (const action of todayActions) {
      if (!sectionStudentIds.has(action.studentId)) continue;
      if (action.type === "late") {
        newStatuses[action.studentId] = action.description?.includes("بعذر") ? "late_excused" : "late_unexcused";
      } else if (action.type === "absent") {
        newStatuses[action.studentId] = action.description?.includes("بعذر") ? "absent_excused" : "absent_unexcused";
      }
    }
    setStatuses(newStatuses);
    // Reset bulk selection when section context changes
    setSelectedIds(new Set());
  }, [selectedGrade, selectedSection, allStudents, getCacheVersion()]);

  const grades = useMemo(() => getGradesFromDB(), [allStudents]);
  const sections = selectedGrade ? getSectionsFromDB(selectedGrade) : [];

  // خريطة الإجراءات المحفوظة فعلاً اليوم (لتمييز الحالات القائمة في قاعدة
  // البيانات عن الحالات المحلية غير المحفوظة بعد).
  const todayExistingByStudent = useMemo(() => {
    const map = new Map<string, { id: string; type: "late" | "absent"; description: string }>();
    const todayActions = getTodayActions();
    for (const a of todayActions) {
      if (a.type !== "late" && a.type !== "absent") continue;
      // لا نعتبر سجلات الباركود المؤقتة في حالات تحرير قاعدة البيانات
      if (typeof a.id === "string" && a.id.startsWith("pending-")) continue;
      // أحدث سجل لكل طالب
      if (!map.has(a.studentId)) {
        map.set(a.studentId, { id: a.id, type: a.type, description: a.description || "" });
      }
    }
    return map;
  }, [getCacheVersion(), allStudents]);

  const sectionStudents = useMemo(() => {
    if (!selectedGrade || !selectedSection) return [];
    let students = allStudents.filter(
      (s) => s.gradeCode === selectedGrade && s.section === Number(selectedSection)
    );
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      students = students.filter(s => s.name.includes(q) || s.studentNumber.includes(q));
    }
    return students;
  }, [allStudents, selectedGrade, selectedSection, searchQuery]);

  // Global search results
  const globalResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.trim().toLowerCase();
    return allStudents
      .filter(s => s.name.includes(q) || s.studentNumber.includes(q) || s.guardianPhone.includes(q))
      .slice(0, 15);
  }, [globalSearch, allStudents]);

  const setStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setStatuses((prev) => {
      const current = prev[studentId] || "present";
      if (current === status) return { ...prev, [studentId]: "present" };
      return { ...prev, [studentId]: status };
    });
  }, []);

  const getStatus = useCallback(
    (studentId: string): AttendanceStatus => statuses[studentId] || "present",
    [statuses]
  );

  // Navigate to student's section from global search
  const navigateToStudent = (student: typeof allStudents[0]) => {
    setSelectedGrade(student.gradeCode);
    setSelectedSection(String(student.section));
    setSearchOpen(false);
    setGlobalSearch("");
  };

  // Barcode handler
  const handleBarcodeScan = useCallback(async (code: string) => {
    const student = allStudents.find(s => s.studentNumber === code || s.id === code);
    if (!student) {
      playErrorSound();
      toast({ title: "لم يتم التعرف على الطالب", description: `الكود: ${code}`, variant: "destructive" });
      return;
    }

    const todayActions = getTodayActions();
    const oppositeType = scanAction === "late" ? "absent" : "late";
    const alreadyRecorded = todayActions.some(a => a.studentId === student.id && a.type === scanAction);
    const hasOpposite = todayActions.some(a => a.studentId === student.id && a.type === oppositeType);

    if (alreadyRecorded) {
      playDuplicateSound();
      setLastScanned({ name: student.name, action: "مسجل مسبقاً" });
      toast({ title: "مسجل مسبقاً", description: `${student.name} مسجل ${scanAction === "late" ? "تأخر" : "غياب"} بالفعل` });
      return;
    }
    if (hasOpposite) {
      playErrorSound();
      setLastScanned({ name: student.name, action: "تعارض" });
      toast({ title: "تعارض", description: `${student.name} مسجل ${oppositeType === "late" ? "تأخر" : "غياب"} بالفعل`, variant: "destructive" });
      return;
    }

    const now = new Date();
    const actionData = [{
      studentId: student.id,
      studentName: student.name,
      studentNumber: student.studentNumber,
      grade: student.grade,
      section: student.section,
      type: scanAction as "late" | "absent",
      date: today,
      time: now.toTimeString().slice(0, 5),
      description: scanAction === "late" ? "تأخر بدون عذر" : "غياب بدون عذر",
      guardianPhone: student.guardianPhone,
    }];

    await addActionsBatch(actionData, profile?.full_name, profile?.role_title);
    await loadActions(true);
    playSuccessSound();
    const actionLabel = scanAction === "late" ? "تأخر" : "غياب";
    setLastScanned({ name: student.name, action: actionLabel });
    toast({ title: `تم تسجيل ${actionLabel}`, description: student.name });
  }, [allStudents, scanAction, profile, today]);

  const handleSaveAll = async () => {
    if (saving) return;
    setSaving(true);
    const now = new Date();
    const pendingActions = [] as Parameters<typeof addActionsBatch>[0];
    const existingToday = getTodayActions();

    for (const [studentId, status] of Object.entries(statuses)) {
      if (status === "present") continue;
      const meta = STATUS_META[status];
      if (!meta.dbType) continue;
      const student = allStudents.find((s) => s.id === studentId);
      if (!student) continue;
      const alreadyRecorded = existingToday.some(a => a.studentId === studentId && a.type === meta.dbType);
      if (alreadyRecorded) continue;
      const oppositeType = meta.dbType === "late" ? "absent" : "late";
      const hasOpposite = existingToday.some(a => a.studentId === studentId && a.type === oppositeType);
      if (hasOpposite) continue;

      pendingActions.push({
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        grade: student.grade,
        section: student.section,
        type: meta.dbType,
        date: today,
        time: now.toTimeString().slice(0, 5),
        description: meta.dbDetails,
        guardianPhone: student.guardianPhone,
      });
    }

    const count = await addActionsBatch(pendingActions, profile?.full_name, profile?.role_title);
    await loadActions(true);
    setSaving(false);
    toast({ title: "تم حفظ المواظبة", description: `تم تسجيل ${count} إجراء` });
  };

  const summary = useMemo(() => {
    const s = { present: 0, late_excused: 0, late_unexcused: 0, absent_excused: 0, absent_unexcused: 0 };
    sectionStudents.forEach(st => { s[getStatus(st.id)]++; });
    return s;
  }, [sectionStudents, getStatus]);

  const totalLate = summary.late_excused + summary.late_unexcused;
  const totalAbsent = summary.absent_excused + summary.absent_unexcused;
  const hasChanges = Object.values(statuses).some(s => s !== "present");
  const attendanceRate = sectionStudents.length > 0
    ? Math.round((summary.present / sectionStudents.length) * 100) : 0;

  // Eligible (= unmarked & not already saved today) students in current section
  const eligibleForBulk = useMemo(
    () => sectionStudents.filter(
      (s) => !todayExistingByStudent.has(s.id) && (statuses[s.id] || "present") === "present",
    ),
    [sectionStudents, todayExistingByStudent, statuses],
  );
  const selectedCount = useMemo(
    () => eligibleForBulk.filter((s) => selectedIds.has(s.id)).length,
    [eligibleForBulk, selectedIds],
  );
  const allEligibleSelected = eligibleForBulk.length > 0 && selectedCount === eligibleForBulk.length;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (eligibleForBulk.length > 0 && eligibleForBulk.every((s) => prev.has(s.id))) {
        // Deselect only the eligible ones; keep any unrelated entries (none expected)
        const next = new Set(prev);
        eligibleForBulk.forEach((s) => next.delete(s.id));
        return next;
      }
      const next = new Set(prev);
      eligibleForBulk.forEach((s) => next.add(s.id));
      return next;
    });
  }, [eligibleForBulk]);

  const applyBulkStatus = useCallback((status: AttendanceStatus) => {
    if (selectedIds.size === 0) {
      toast({ title: "لا يوجد طلاب محددون", description: "اختر الطلاب أولاً ثم طبّق الحالة", variant: "destructive" });
      return;
    }
    setStatuses((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        if (todayExistingByStudent.has(id)) return; // never overwrite a saved record silently
        next[id] = status;
      });
      return next;
    });
    toast({
      title: `تم تطبيق: ${STATUS_META[status].label}`,
      description: `على ${selectedIds.size} طالب — اضغط (حفظ المواظبة) للتأكيد`,
    });
  }, [selectedIds, todayExistingByStudent]);

  // Apply a status to ALL eligible students (no prior selection needed).
  // Used for the two fast modes:
  //  - "اعتبار الجميع حاضرًا" → reset all to present
  //  - "اعتبار الجميع غائبًا/متأخرًا" → mark every eligible student with the chosen status
  const applyToAllEligible = useCallback((status: AttendanceStatus) => {
    if (eligibleForBulk.length === 0) {
      toast({ title: "لا يوجد طلاب قابلون للتعديل", description: "كل الطلاب لديهم حالات محفوظة بالفعل", variant: "destructive" });
      return;
    }
    setStatuses((prev) => {
      const next = { ...prev };
      eligibleForBulk.forEach((s) => { next[s.id] = status; });
      return next;
    });
    setSelectedIds(new Set());
    toast({
      title: `تم تعليم الجميع: ${STATUS_META[status].label}`,
      description: `${eligibleForBulk.length} طالب — اضغط (حفظ المواظبة) لتثبيت التغييرات`,
    });
  }, [eligibleForBulk]);

  // Reset all unsaved markings in the current section back to "present".
  const resetAllToPresent = useCallback(() => {
    setStatuses((prev) => {
      const next = { ...prev };
      sectionStudents.forEach((s) => {
        if (todayExistingByStudent.has(s.id)) return; // keep saved records intact
        if (next[s.id] && next[s.id] !== "present") delete next[s.id];
      });
      return next;
    });
    setSelectedIds(new Set());
    toast({ title: "تم اعتبار الجميع حاضرًا", description: "يمكنك الآن تعليم الاستثناءات فقط" });
  }, [sectionStudents, todayExistingByStudent]);

  const renderBulkBar = (branch: "late" | "absent") => {
    if (!canRecord) return null;
    const isLate = branch === "late";
    const excused: AttendanceStatus = isLate ? "late_excused" : "absent_excused";
    const unexcused: AttendanceStatus = isLate ? "late_unexcused" : "absent_unexcused";
    return (
      <div className="px-4 sm:px-5 py-3 bg-muted/20 border-b border-border/40 flex flex-col gap-3 print:hidden">
        {/* Fast modes: act on every eligible student in one click */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-semibold ml-1">وضع سريع:</span>
          <button
            type="button"
            onClick={resetAllToPresent}
            disabled={eligibleForBulk.length === 0 && !Object.values(statuses).some((s) => s !== "present")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-success/10 text-success border-success/40 hover:bg-success/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="إعادة جميع الطلاب إلى حالة (حاضر) ثم علّم الاستثناءات"
          >
            <CheckCircle size={14} />
            اعتبار الجميع حاضرًا
          </button>
          <button
            type="button"
            onClick={() => applyToAllEligible(unexcused)}
            disabled={eligibleForBulk.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isLate
                ? "bg-warning/10 text-warning border-warning/40 hover:bg-warning/20"
                : "bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={isLate ? "تعليم كل الطلاب كمتأخرين بدون عذر" : "تعليم كل الطلاب كغائبين بدون عذر"}
          >
            {isLate ? <Clock size={14} /> : <XCircle size={14} />}
            {isLate ? "تعليم الجميع متأخرًا" : "اعتبار الجميع غائبًا"}
          </button>
          <button
            type="button"
            onClick={() => applyToAllEligible(excused)}
            disabled={eligibleForBulk.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isLate
                ? "bg-amber-500/10 text-amber-700 border-amber-500/40 hover:bg-amber-500/20"
                : "bg-blue-500/10 text-blue-700 border-blue-500/40 hover:bg-blue-500/20"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={isLate ? "تعليم كل الطلاب كمتأخرين بعذر" : "تعليم كل الطلاب كغائبين بعذر"}
          >
            <ShieldCheck size={14} />
            {isLate ? "تعليم الجميع متأخرًا بعذر" : "اعتبار الجميع غائبًا بعذر"}
          </button>
        </div>
        <div className="h-px bg-border/40" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={eligibleForBulk.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              allEligibleSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-primary/40 text-foreground"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {allEligibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {allEligibleSelected ? "إلغاء تحديد الجميع" : "تحديد الجميع للتطبيق"}
          </button>
          <Badge variant="secondary" className="text-[11px]">
            {selectedCount} / {eligibleForBulk.length} طالب
          </Badge>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              مسح التحديد
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-[11px] text-muted-foreground">تطبيق:</span>
          <button
            type="button"
            onClick={() => applyBulkStatus(excused)}
            disabled={selectedIds.size === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isLate
                ? "bg-amber-500/10 text-amber-700 border-amber-500/40 hover:bg-amber-500/20"
                : "bg-blue-500/10 text-blue-700 border-blue-500/40 hover:bg-blue-500/20"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <ShieldCheck size={14} />
            {isLate ? "تأخر بعذر" : "غياب بعذر"}
          </button>
          <button
            type="button"
            onClick={() => applyBulkStatus(unexcused)}
            disabled={selectedIds.size === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isLate
                ? "bg-warning/10 text-warning border-warning/40 hover:bg-warning/20"
                : "bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isLate ? <Clock size={14} /> : <XCircle size={14} />}
            {isLate ? "تأخر بدون عذر" : "غياب بدون عذر"}
          </button>
        </div>
        </div>
      </div>
    );
  };

  // Count today's total across all sections
  const todaySummary = useMemo(() => {
    const todayActions = getTodayActions();
    const late = todayActions.filter(a => a.type === "late").length;
    const absent = todayActions.filter(a => a.type === "absent").length;
    return { late, absent, total: allStudents.length };
  }, [allStudents]);

  const renderStudentRow = (student: typeof sectionStudents[0], idx: number, branch: "late" | "absent") => {
    const status = getStatus(student.id);
    const meta = STATUS_META[status];
    const StatusIcon = meta.icon;
    const isMarked = status !== "present" && meta.branch === branch;
    const existing = todayExistingByStudent.get(student.id);
    const hasExisting = !!existing;
    const isSelectable = canRecord && !hasExisting && status === "present";
    const isSelected = selectedIds.has(student.id);

    const options: AttendanceStatus[] = branch === "late"
      ? ["late_excused", "late_unexcused"]
      : ["absent_excused", "absent_unexcused"];

    // التحويل المباشر لإجراء محفوظ (تصحيح غياب ↔ تأخر، أو إلغاء كامل).
    const convertExisting = async (target: AttendanceStatus) => {
      if (!existing) return;
      const cfg = STATUS_META[target];
      if (!cfg.dbType) return;
      const ok = await updateActionTypeAndDetails(existing.id, cfg.dbType, cfg.dbDetails);
      if (ok) {
        toast({ title: "تم تعديل الحالة", description: `${student.name} → ${cfg.label}` });
      } else {
        toast({ title: "تعذر تعديل الحالة", description: "تأكد من الصلاحيات أو الاتصال بالشبكة", variant: "destructive" });
      }
    };

    const cancelExisting = async () => {
      if (!existing) return;
      if (!confirm(`إلغاء حالة ${student.name} لهذا اليوم؟`)) return;
      const ok = await deleteAction(existing.id);
      if (ok) {
        setStatuses((prev) => {
          const copy = { ...prev };
          delete copy[student.id];
          return copy;
        });
        toast({ title: "تم إلغاء الحالة", description: student.name });
      } else {
        toast({ title: "تعذر الإلغاء", description: "تأكد من الصلاحيات", variant: "destructive" });
      }
    };

    return (
      <div
        key={student.id}
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-5 py-3 transition-all ${
          isMarked ? "bg-muted/20 border-r-2 border-r-current " + meta.colorClass : "hover:bg-muted/10"
        }`}
      >
        <div className="flex items-center gap-3 mb-2 sm:mb-0">
          {isSelectable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(student.id)) next.delete(student.id);
                  else next.add(student.id);
                  return next;
                });
              }}
              className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary"
              }`}
              title={isSelected ? "إلغاء التحديد" : "تحديد"}
            >
              {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            </button>
          )}
          <span className="w-7 text-center text-xs text-muted-foreground font-mono">{idx + 1}</span>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
            isMarked ? meta.bgClass + " border" : "bg-primary/5 text-primary"
          }`}>
            {isMarked ? <StatusIcon size={18} /> : student.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-foreground text-sm flex items-center gap-1.5 flex-wrap">
              {student.name}
              <HealthBadge studentId={student.id} studentNumber={student.studentNumber} size="xs" showLabel />
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">{student.studentNumber}</p>
          </div>
          {isMarked && (
            <Badge variant="outline" className={`text-[10px] ${meta.bgClass} border hidden sm:inline-flex`}>
              {meta.label}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {status !== "present" && STATUS_META[status].branch !== branch && STATUS_META[status].branch !== "none" && (
            <Badge variant="outline" className={`text-[10px] ${STATUS_META[status].bgClass} border`}>
              {STATUS_META[status].label}
            </Badge>
          )}

          {canRecord && isMarked && (
            <button
              onClick={() => {
                const todayActions = getTodayActions();
                const absences = todayActions.filter(a => a.studentId === student.id && a.type === "absent").length;
                const lateCount = todayActions.filter(a => a.studentId === student.id && a.type === "late").length;
                const purpose = meta.dbType as "late" | "absent";
                if (purpose === "late") {
                  printThermalCard(student, "late", meta.dbDetails, undefined, profile?.full_name, { absences, lateCount });
                } else {
                  printThermalCard(student, "late", meta.dbDetails, undefined, profile?.full_name, { absences, lateCount });
                }
                toast({ title: `تم طباعة كرت ${meta.label} — ${student.name}` });
              }}
              title="طباعة كرت"
              className="p-1.5 rounded-lg border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-primary transition-all"
            >
              <Printer size={13} />
            </button>
          )}

          {canRecord && hasExisting && (
            <button
              onClick={cancelExisting}
              title="إلغاء الحالة (حذف من قاعدة البيانات)"
              className="p-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
            >
              <RotateCcw size={13} />
            </button>
          )}

          {canRecord && options.map((s) => {
            const cfg = STATUS_META[s];
            const Icon = cfg.icon;
            const isActive = status === s;
            // لم نعد نعطّل الأزرار بناءً على فرع آخر؛ المستخدم المصرّح له
            // قد يحتاج إلى تحويل حالة الطالب من غياب إلى تأخر أو العكس
            // في نفس اليوم. التحويل يحدث فوراً على قاعدة البيانات إذا
            // كان الإجراء محفوظاً مسبقاً.
            const isDisabled = false;
            const willConvert = hasExisting && existing && cfg.dbType && existing.type !== cfg.dbType;

            return (
              <button
                key={s}
                onClick={() => {
                  if (isDisabled) return;
                  if (hasExisting) {
                    // إذا ضغط على نفس الحالة المحفوظة → إلغاء الحالة كاملةً.
                    if (isActive) {
                      cancelExisting();
                    } else {
                      convertExisting(s);
                    }
                  } else {
                    setStatus(student.id, s);
                  }
                }}
                disabled={isDisabled}
                title={
                  willConvert
                    ? `تحويل إلى ${cfg.label}`
                    : hasExisting && isActive
                      ? `إلغاء ${cfg.label}`
                      : cfg.label
                }
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                  isActive
                    ? `${cfg.bgClass} ring-2 ring-current/20 shadow-sm scale-[1.02]`
                    : isDisabled
                      ? "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                      : "border-border/50 text-muted-foreground hover:bg-muted/50 hover:border-border active:scale-95"
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{s.includes("excused") && !s.includes("un") ? "بعذر" : "بدون عذر"}</span>
                <span className="sm:hidden">{s.includes("excused") && !s.includes("un") ? "✓" : "✗"}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      {/* Read-only banner for teachers */}
      {!canRecord && (
        <ViewOnlyBanner text="للمشاهدة فقط — هذه الصفحة مخصصة للاطلاع على بيانات المواظبة، ولا تتضمن صلاحيات تنفيذية" />
      )}
      {/* Hero Header */}
      <div className="relative mb-6 rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
        <div className="relative border border-primary/10 rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-inner">
                <ClipboardCheck size={24} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">المواظبة اليومية</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{todayFormatted}</p>
              </div>
            </div>

            {/* Action Buttons */}
            {canRecord && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-xl"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={15} />
                <span className="hidden sm:inline">بحث سريع</span>
                <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                  Ctrl+K
                </kbd>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setScannerOpen(true)}
              >
                <ScanBarcode size={15} />
                <span className="hidden sm:inline">مسح باركود</span>
              </Button>
            </div>
            )}
          </div>

          {/* Today's quick stats */}
          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20">
              <Clock size={13} className="text-warning" />
              <span className="text-xs font-bold text-warning">{todaySummary.late} متأخر</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <XCircle size={13} className="text-destructive" />
              <span className="text-xs font-bold text-destructive">{todaySummary.absent} غائب</span>
            </div>
            {sectionStudents.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 border border-success/20">
                <TrendingUp size={13} className="text-success" />
                <span className="text-xs font-bold text-success">{attendanceRate}% حضور</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grade & Section Selection - Visual Grid */}
      <div className="bg-card rounded-2xl border border-border/50 p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">اختيار الصف والشعبة</h2>
          {selectedGrade && selectedSection && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-xs text-muted-foreground h-7"
              onClick={() => { setSelectedGrade(""); setSelectedSection(""); setStatuses({}); }}
            >
              <X size={12} className="ml-1" /> تغيير
            </Button>
          )}
        </div>

        {/* Grade Selection as Cards */}
        {!selectedGrade ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {grades.map(g => {
              const gradeStudents = allStudents.filter(s => s.gradeCode === g.code);
              const gradeSections = getSectionsFromDB(g.code);
              const todayActions = getTodayActions();
              const gradeLate = todayActions.filter(a => a.type === "late" && gradeStudents.some(s => s.id === a.studentId)).length;
              const gradeAbsent = todayActions.filter(a => a.type === "absent" && gradeStudents.some(s => s.id === a.studentId)).length;

              return (
                <button
                  key={g.code}
                  onClick={() => setSelectedGrade(g.code)}
                  className="relative group p-5 rounded-xl border-2 border-border/50 hover:border-primary/40 hover:shadow-md transition-all text-right bg-gradient-to-br from-card to-muted/20 hover:from-primary/5 hover:to-card"
                >
                  <div className="flex items-start justify-between">
                    <ChevronLeft size={18} className="text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                    <div>
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">{g.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{gradeStudents.length} طالب · {gradeSections.length} شعب</p>
                    </div>
                  </div>
                  {(gradeLate > 0 || gradeAbsent > 0) && (
                    <div className="flex items-center gap-2 mt-3 justify-end">
                      {gradeLate > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">{gradeLate} متأخر</span>
                      )}
                      {gradeAbsent > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">{gradeAbsent} غائب</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : !selectedSection ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelectedGrade("")}>
                <ChevronLeft size={12} className="rotate-180" /> رجوع
              </Button>
              <span className="text-sm font-bold text-primary">{getGradeFullName(selectedGrade)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {sections.map(sec => {
                const secStudents = allStudents.filter(s => s.gradeCode === selectedGrade && s.section === sec);
                const todayActions = getTodayActions();
                const secLate = todayActions.filter(a => a.type === "late" && secStudents.some(s => s.id === a.studentId)).length;
                const secAbsent = todayActions.filter(a => a.type === "absent" && secStudents.some(s => s.id === a.studentId)).length;
                const done = secLate > 0 || secAbsent > 0;

                return (
                  <button
                    key={sec}
                    onClick={() => { setSelectedSection(String(sec)); setStatuses({}); }}
                    className={`relative p-4 rounded-xl border-2 transition-all text-center hover:shadow-md ${
                      done ? "border-primary/30 bg-primary/5" : "border-border/50 hover:border-primary/30 bg-card"
                    }`}
                  >
                    <div className="text-2xl font-bold text-foreground mb-1">{sec}</div>
                    <div className="text-[11px] text-muted-foreground">شعبة {sec}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{secStudents.length} طالب</div>
                    {done && (
                      <div className="flex items-center gap-1 justify-center mt-2">
                        {secLate > 0 && <span className="w-2 h-2 rounded-full bg-warning" title={`${secLate} متأخر`} />}
                        {secAbsent > 0 && <span className="w-2 h-2 rounded-full bg-destructive" title={`${secAbsent} غائب`} />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-sm font-bold text-primary">
                {getGradeShortName(selectedGrade)} / شعبة {selectedSection}
              </span>
              <Badge variant="secondary" className="text-[10px]">{sectionStudents.length} طالب</Badge>
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الرقم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-9 text-sm rounded-xl"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {sectionStudents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {([
            { label: "حاضر", value: summary.present, icon: CheckCircle, cls: "bg-success/10 border-success/20 text-success" },
            { label: "تأخر بعذر", value: summary.late_excused, icon: ShieldCheck, cls: "bg-amber-500/10 border-amber-500/20 text-amber-600" },
            { label: "تأخر بدون عذر", value: summary.late_unexcused, icon: Clock, cls: "bg-warning/10 border-warning/20 text-warning" },
            { label: "غياب بعذر", value: summary.absent_excused, icon: ShieldCheck, cls: "bg-blue-500/10 border-blue-500/20 text-blue-600" },
            { label: "غياب بدون عذر", value: summary.absent_unexcused, icon: XCircle, cls: "bg-destructive/10 border-destructive/20 text-destructive" },
          ]).map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className={`rounded-xl border p-3 text-center transition-all hover:shadow-sm ${cls}`}>
              <Icon size={18} className="mx-auto mb-1 opacity-70" />
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-[10px] font-semibold mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky Save Bar */}
      {canRecord && hasChanges && (
        <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-lg border border-border/50 rounded-xl p-3 mb-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle size={16} className="text-primary" />
            <Badge variant="secondary" className="text-xs">
              {Object.values(statuses).filter(s => s !== "present").length}
            </Badge>
            <span>إجراء جاهز للحفظ</span>
          </div>
          <Button onClick={handleSaveAll} disabled={saving} className="gap-2 shadow-md px-6">
            <Save size={16} />
            {saving ? "جارٍ الحفظ..." : "حفظ المواظبة"}
          </Button>
        </div>
      )}

      {/* Main Content */}
      {sectionStudents.length > 0 ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "late" | "absent")} className="space-y-4">
          <TabsList className="w-full grid grid-cols-2 h-14 rounded-2xl bg-muted/50 p-1.5 border border-border/50">
            <TabsTrigger value="late" className="rounded-xl text-sm font-bold data-[state=active]:bg-warning/15 data-[state=active]:text-warning data-[state=active]:shadow-sm gap-2 h-full">
              <Clock size={18} />
              <span>التأخر</span>
              {totalLate > 0 && <Badge variant="secondary" className="bg-warning/20 text-warning text-[10px] px-1.5">{totalLate}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="absent" className="rounded-xl text-sm font-bold data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive data-[state=active]:shadow-sm gap-2 h-full">
              <XCircle size={18} />
              <span>الغياب</span>
              {totalAbsent > 0 && <Badge variant="secondary" className="bg-destructive/20 text-destructive text-[10px] px-1.5">{totalAbsent}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="late" className="mt-0">
            <div className="bg-card rounded-2xl border border-warning/20 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-l from-warning/5 to-transparent border-b border-warning/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-warning" />
                  <h3 className="text-sm font-bold text-foreground">تسجيل التأخر</h3>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-amber-500" /> بعذر: {summary.late_excused}</span>
                  <span className="flex items-center gap-1"><Clock size={12} className="text-warning" /> بدون عذر: {summary.late_unexcused}</span>
                </div>
              </div>
              {renderBulkBar("late")}
              <div className="divide-y divide-border/30">
                {sectionStudents.map((student, idx) => renderStudentRow(student, idx, "late"))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="absent" className="mt-0">
            <div className="bg-card rounded-2xl border border-destructive/20 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-l from-destructive/5 to-transparent border-b border-destructive/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle size={16} className="text-destructive" />
                  <h3 className="text-sm font-bold text-foreground">تسجيل الغياب</h3>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-blue-500" /> بعذر: {summary.absent_excused}</span>
                  <span className="flex items-center gap-1"><XCircle size={12} className="text-destructive" /> بدون عذر: {summary.absent_unexcused}</span>
                </div>
              </div>
              {renderBulkBar("absent")}
              <div className="divide-y divide-border/30">
                {sectionStudents.map((student, idx) => renderStudentRow(student, idx, "absent"))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : selectedGrade && selectedSection ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users size={32} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">لا يوجد طلاب في هذا الفصل</p>
        </div>
      ) : null}

      {/* Attendance History */}
      <AttendanceHistory allStudents={allStudents} />

      {/* ═══ Smart Search Dialog ═══ */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <div className="flex items-center border-b border-border px-4">
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم أو الرقم أو الجوال..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="border-0 focus-visible:ring-0 h-12 text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-[350px] overflow-y-auto">
            {!globalSearch.trim() ? (
              <div className="text-center py-10 text-sm text-muted-foreground">ابدأ بكتابة اسم الطالب أو رقمه</div>
            ) : globalResults.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">لا توجد نتائج</div>
            ) : (
              globalResults.map(student => (
                <button
                  key={student.id}
                  onClick={() => navigateToStudent(student)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-right border-b border-border/30 last:border-0"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {student.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate flex items-center gap-1.5">
                      <span className="truncate">{student.name}</span>
                      <HealthBadge studentId={student.id} studentNumber={student.studentNumber} size="xs" />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getGradeShortName(student.gradeCode)} / شعبة {student.section} · {student.studentNumber}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">انتقال</Badge>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Barcode Scanner Dialog ═══ */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="max-w-md gap-4">
          <div className="text-center mb-2">
            <ScanBarcode size={28} className="mx-auto text-primary mb-2" />
            <h3 className="text-lg font-bold text-foreground">مسح باركود المواظبة</h3>
            <p className="text-xs text-muted-foreground">امسح باركود الطالب لتسجيل التأخر أو الغياب فوراً</p>
          </div>

          {/* Action Type Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setScanAction("late")}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                scanAction === "late"
                  ? "border-warning bg-warning/10 text-warning"
                  : "border-border/50 text-muted-foreground hover:border-warning/30"
              }`}
            >
              <Clock size={20} className="mx-auto mb-1" />
              <span className="text-xs font-bold">تأخر</span>
            </button>
            <button
              onClick={() => setScanAction("absent")}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                scanAction === "absent"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border/50 text-muted-foreground hover:border-destructive/30"
              }`}
            >
              <XCircle size={20} className="mx-auto mb-1" />
              <span className="text-xs font-bold">غياب</span>
            </button>
          </div>

          <CameraBarcodeScanner
            active={scannerOpen}
            onDetected={handleBarcodeScan}
            onError={(err) => toast({ title: "خطأ في الكاميرا", description: err, variant: "destructive" })}
          />

          {lastScanned && (
            <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-center animate-in fade-in">
              <p className="text-sm font-bold text-success">✓ {lastScanned.name}</p>
              <p className="text-xs text-success/80">{lastScanned.action}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

/** Attendance History Sub-component */
const AttendanceHistory = ({ allStudents }: { allStudents: ReturnType<typeof getStudentsFromDB> }) => {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRange>({ from: new Date(), to: new Date() });
  const [filterMode, setFilterMode] = useState<FilterMode>("day");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isPrincipalOrVice = profile?.is_principal || profile?.role_title === "وكيل";
  const isPrincipal = profile?.is_principal === true;

  const historyActions = useMemo(() => {
    const fromStr = format(range.from, "yyyy-MM-dd");
    const toStr = format(range.to, "yyyy-MM-dd");
    return getActionsByDateRange(fromStr, toStr)
      .filter(a => a.type === "late" || a.type === "absent")
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [range]);

  const lateActions = historyActions.filter(a => a.type === "late");
  const absentActions = historyActions.filter(a => a.type === "absent");

  const handleToggleExcuse = async (action: typeof historyActions[0]) => {
    if (!isPrincipalOrVice) {
      toast({ title: "غير مصرح", description: "التعديل متاح للوكيل أو المدير فقط", variant: "destructive" });
      return;
    }
    // Same-day edit restriction: non-principals can only edit records added today
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (!isPrincipal && action.date !== todayStr) {
      toast({
        title: "التعديل بعد اليوم يتطلب موافقة مدير المدرسة",
        description: "يُسمح بالتعديل في نفس يوم الإدخال فقط. تواصل مع مدير المدرسة لتعديل سجل سابق.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const isCurrentlyExcused = action.description?.includes("بعذر") && !action.description?.includes("بدون");
    const typeLabel = action.type === "late" ? "تأخر" : "غياب";
    const newDetails = isCurrentlyExcused ? `${typeLabel} بدون عذر` : `${typeLabel} بعذر`;

    const success = await updateActionDetails(action.id, newDetails);
    if (success) {
      await loadActions(true);
      toast({ title: "تم تعديل الحالة", description: `${action.studentName}: ${newDetails}` });
    } else {
      toast({ title: "فشل التعديل", variant: "destructive" });
    }
    setSaving(false);
    setEditingId(null);
  };

  const renderActionRow = (a: typeof historyActions[0], i: number, type: "late" | "absent") => {
    const isExcused = a.description?.includes("بعذر") && !a.description?.includes("بدون");
    const isEditing = editingId === a.id;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const canEditThisRow = isPrincipal || a.date === todayStr;

    return (
      <div key={a.id} className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/10 text-xs transition-all ${isEditing ? "bg-primary/5 ring-1 ring-primary/20 rounded" : ""}`}>
        <div className="flex items-center gap-2">
          <span className="w-5 text-center text-muted-foreground">{i + 1}</span>
          <div>
            <span className="font-medium text-foreground">{a.studentName}</span>
            <span className="text-muted-foreground mr-2">{a.grade} - {a.section}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleToggleExcuse(a)}
                disabled={saving}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                  isExcused
                    ? "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                    : "bg-success/10 text-success border border-success/30 hover:bg-success/20"
                }`}
              >
                {saving ? "..." : isExcused ? "تغيير إلى: بدون عذر" : "تغيير إلى: بعذر"}
              </button>
              <button onClick={() => setEditingId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <Badge variant="outline" className={`text-[9px] ${
                type === "late"
                  ? isExcused ? "bg-amber-500/10 text-amber-600 border-amber-500/30" : "bg-warning/10 text-warning border-warning/30"
                  : isExcused ? "bg-blue-500/10 text-blue-600 border-blue-500/30" : "bg-destructive/10 text-destructive border-destructive/30"
              }`}>
                {isExcused ? "بعذر" : "بدون عذر"}
              </Badge>
              <span className="text-muted-foreground font-mono">{a.date}</span>
              {isPrincipalOrVice && canEditThisRow && (
                <button
                  onClick={() => setEditingId(a.id)}
                  className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                  title="تعديل الحالة"
                >
                  <Edit3 size={12} />
                </button>
              )}
              {isPrincipalOrVice && !canEditThisRow && (
                <span
                  className="text-[9px] text-muted-foreground/70"
                  title="التعديل بعد اليوم يتطلب موافقة مدير المدرسة"
                >
                  🔒
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-8">
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-l from-primary/5 to-transparent border-b border-border/30">
          <div className="flex items-center gap-2 mb-3">
            <History size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">سجل المواظبة</h2>
            {isPrincipalOrVice && (
              <Badge variant="outline" className="text-[9px] mr-2 bg-primary/5 border-primary/20 text-primary">
                <Edit3 size={10} className="ml-1" /> تعديل متاح
              </Badge>
            )}
          </div>
          <DateRangeFilter onRangeChange={(r, m) => { setRange(r); setFilterMode(m); }} />
        </div>

        {historyActions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ClipboardCheck size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">لا توجد سجلات في هذه الفترة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
            <div>
              <div className="px-4 py-2.5 bg-warning/5 border-b border-warning/10 flex items-center gap-2">
                <Clock size={14} className="text-warning" />
                <span className="text-xs font-bold text-warning">المتأخرون ({lateActions.length})</span>
              </div>
              <div className="divide-y divide-border/20 max-h-64 overflow-y-auto">
                {lateActions.length > 0 ? lateActions.map((a, i) => renderActionRow(a, i, "late"))
                  : <div className="py-6 text-center text-muted-foreground text-xs">لا يوجد</div>}
              </div>
            </div>
            <div>
              <div className="px-4 py-2.5 bg-destructive/5 border-b border-destructive/10 flex items-center gap-2">
                <XCircle size={14} className="text-destructive" />
                <span className="text-xs font-bold text-destructive">الغائبون ({absentActions.length})</span>
              </div>
              <div className="divide-y divide-border/20 max-h-64 overflow-y-auto">
                {absentActions.length > 0 ? absentActions.map((a, i) => renderActionRow(a, i, "absent"))
                  : <div className="py-6 text-center text-muted-foreground text-xs">لا يوجد</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendancePage;
