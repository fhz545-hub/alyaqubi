import { useEffect, useMemo, useState, useCallback } from "react";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { loadStudents, getStudentsFromDB, getGradesFromDB, getSectionsFromDB } from "@/store/studentsStore";
import { getActions, loadActions, addAction } from "@/store/actionsStore";
import { hasPermission } from "@/store/permissionsStore";
import { printThermalCard } from "@/utils/print";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, Search, MessageCircle, Printer, RefreshCw, Shield,
  ChevronDown, ChevronUp, Users, FileText, Scale, Clock,
  TrendingUp, AlertOctagon, ShieldAlert, ShieldCheck, Eye, Gavel,
  ArrowDownRight, Flame, ArrowRight, GraduationCap, LayoutGrid
} from "lucide-react";
import {
  ACTION_LABELS, ActionType, VIOLATION_CATEGORIES, VIOLATION_DEGREES,
  VIOLATION_PROCEDURES, Student, BEHAVIOR_SCORING
} from "@/types/school";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { printOfficialDocument } from "@/utils/print";
import WhatsAppActionDialog from "@/components/WhatsAppActionDialog";
import { useNavigate } from "react-router-dom";
import { getGradeShortName } from "@/utils/gradeNames";
import ViewOnlyBanner from "@/components/ViewOnlyBanner";

const DEGREE_THEMES: Record<number, { gradient: string; bg: string; text: string; border: string; badge: string; icon: string; glow: string }> = {
  1: { gradient: "from-amber-500/20 to-amber-500/5", bg: "bg-amber-500/5", text: "text-amber-600", border: "border-amber-500/25", badge: "bg-amber-500/10 text-amber-700 border-amber-500/30", icon: "bg-amber-500/15", glow: "shadow-amber-500/10" },
  2: { gradient: "from-orange-500/20 to-orange-500/5", bg: "bg-orange-500/5", text: "text-orange-600", border: "border-orange-500/25", badge: "bg-orange-500/10 text-orange-700 border-orange-500/30", icon: "bg-orange-500/15", glow: "shadow-orange-500/10" },
  3: { gradient: "from-red-500/20 to-red-500/5", bg: "bg-red-500/5", text: "text-red-600", border: "border-red-500/25", badge: "bg-red-500/10 text-red-700 border-red-500/30", icon: "bg-red-500/15", glow: "shadow-red-500/10" },
  4: { gradient: "from-red-600/25 to-red-600/5", bg: "bg-red-600/5", text: "text-red-700", border: "border-red-600/25", badge: "bg-red-600/10 text-red-800 border-red-600/30", icon: "bg-red-600/20", glow: "shadow-red-600/15" },
  5: { gradient: "from-red-800/30 to-red-800/5", bg: "bg-red-800/5", text: "text-red-800", border: "border-red-800/30", badge: "bg-red-800/15 text-red-900 border-red-800/30", icon: "bg-red-800/20", glow: "shadow-red-800/15" },
};

const GRADE_COLORS = [
  { bg: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/25", text: "text-emerald-700", icon: "bg-emerald-500/15", activeBg: "bg-emerald-500/10", badge: "bg-emerald-500/15 text-emerald-700" },
  { bg: "from-blue-500/15 to-blue-500/5", border: "border-blue-500/25", text: "text-blue-700", icon: "bg-blue-500/15", activeBg: "bg-blue-500/10", badge: "bg-blue-500/15 text-blue-700" },
  { bg: "from-purple-500/15 to-purple-500/5", border: "border-purple-500/25", text: "text-purple-700", icon: "bg-purple-500/15", activeBg: "bg-purple-500/10", badge: "bg-purple-500/15 text-purple-700" },
];

const ViolationsPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const isTeacherRestricted = !isPrincipal && Boolean(profile?.approved && profile?.role_title?.includes("معلم") && !hasPermission(userId, false, "record_violation"));
  const [allStudents, setAllStudents] = useState(getStudentsFromDB());
  const grades = useMemo(() => getGradesFromDB(), [allStudents]);
  const [actions, setActions] = useState(getActions());
  const [loading, setLoading] = useState(true);
  const [selectedGradeCode, setSelectedGradeCode] = useState("");
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [violationDegree, setViolationDegree] = useState<"1" | "2" | "3" | "4" | "5">("1");
  const [violationCategory, setViolationCategory] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [whatsappStudent, setWhatsappStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState(isTeacherRestricted ? "archive" : "register");
  const [expandedDegree, setExpandedDegree] = useState<number | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveDateRange, setArchiveDateRange] = useState<DateRange>({ from: new Date(), to: new Date() });

  const sections = selectedGradeCode ? getSectionsFromDB(selectedGradeCode) : [];

  const refreshActions = useCallback(async (forceRefresh = false) => {
    try {
      await loadActions(forceRefresh);
      setActions(getActions());
    } catch (error) {
      console.error("Failed to refresh actions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const students = await loadStudents();
      setAllStudents(students);
      await refreshActions();
    })();
  }, [refreshActions]);

  useEffect(() => {
    const channel = supabase
      .channel("violations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => refreshActions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshActions]);

  // Build grade name to code map for reverse lookup
  const gradeNameToCode = useMemo(() => {
    const map: Record<string, string> = {};
    grades.forEach(g => { map[g.name] = g.code; });
    return map;
  }, [grades]);

  // Violation counts per grade/section
  const violationCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const today = new Date().toISOString().split("T")[0];
    actions.filter(a => a.type === "violation" && a.date === today).forEach(a => {
      const code = gradeNameToCode[a.grade] || a.grade;
      const key = `${code}-${a.section}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [actions, gradeNameToCode]);

  const studentsInClass = useMemo(() => {
    if (!selectedGradeCode || selectedSection === null) return [];
    const searchText = search.trim();
    return allStudents.filter((s) => {
      if (s.gradeCode !== selectedGradeCode || s.section !== selectedSection) return false;
      if (!searchText) return true;
      return s.name.includes(searchText) || s.studentNumber.includes(searchText);
    });
  }, [allStudents, selectedGradeCode, selectedSection, search]);

  const selectedStudent = useMemo(
    () => allStudents.find((s) => s.id === selectedStudentId) || null,
    [allStudents, selectedStudentId]
  );

  const violationActions = useMemo(
    () => actions.filter((a) => a.type === "violation"),
    [actions]
  );

  const stats = useMemo(() => {
    const byDegree: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const today = new Date().toISOString().split("T")[0];
    let todayCount = 0;
    const studentSet = new Set<string>();

    violationActions.forEach(a => {
      const deg = a.violationDegree || 1;
      byDegree[deg] = (byDegree[deg] || 0) + 1;
      if (a.date === today) todayCount++;
      studentSet.add(a.studentId);
    });

    return { byDegree, todayCount, totalStudents: studentSet.size, total: violationActions.length };
  }, [violationActions]);

  const degreeCategories = VIOLATION_CATEGORIES[`degree${violationDegree}` as keyof typeof VIOLATION_CATEGORIES] || [];

  const filteredArchive = useMemo(() => {
    const fromStr = format(archiveDateRange.from, "yyyy-MM-dd");
    const toStr = format(archiveDateRange.to, "yyyy-MM-dd");
    let items = violationActions.filter(a => a.date >= fromStr && a.date <= toStr);
    if (archiveSearch.trim()) {
      const q = archiveSearch.trim();
      items = items.filter(a => a.studentName.includes(q) || a.studentNumber.includes(q));
    }
    return items.slice(0, 200);
  }, [violationActions, archiveSearch, archiveDateRange]);

  const handleCreateViolation = async () => {
    if (!selectedStudent) { toast({ title: "اختر الطالب أولاً", variant: "destructive" }); return; }
    if (!violationCategory) { toast({ title: "اختر نوع المخالفة", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const now = new Date();
      const degreeNumber = Number(violationDegree);
      const degreeMeta = VIOLATION_DEGREES[degreeNumber];
      const firstProcedure = VIOLATION_PROCEDURES[degreeNumber]?.[0] || "تطبيق الإجراء النظامي المعتمد.";

      await addAction({
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        studentNumber: selectedStudent.studentNumber,
        grade: selectedStudent.grade,
        section: selectedStudent.section,
        type: "violation",
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().slice(0, 5),
        description: details?.trim()
          ? details.trim()
          : `نوع المخالفة: ${violationCategory} | الدرجة: ${degreeMeta?.label || `الدرجة ${violationDegree}`} (${degreeMeta?.points || degreeNumber} درجة) | الإجراء المتخذ: ${firstProcedure}`,
        violationDegree: degreeNumber as 1 | 2 | 3 | 4 | 5,
        violationCategory,
        guardianPhone: selectedStudent.guardianPhone,
        messageSent: false,
      }, profile?.full_name, profile?.role_title);

      setDetails("");
      toast({ title: "تم تسجيل المخالفة بنجاح ✅" });
      await refreshActions();
    } catch (error) {
      console.error("Failed to create violation:", error);
      toast({ title: "تعذر تسجيل المخالفة", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePrintOfficial = (studentNumber: string, description: string) => {
    const student = allStudents.find((s) => s.studentNumber === studentNumber);
    if (!student) { toast({ title: "تعذر العثور على بيانات الطالب", variant: "destructive" }); return; }
    printOfficialDocument(student, "violation", description || "مخالفة سلوكية");
  };

  const getDegreeFromDescription = (desc: string): number => {
    const match = desc.match(/الدرجة[:\s]*(\d)/);
    return match ? parseInt(match[1]) : 1;
  };

  const getStudentScore = (studentId: string) => {
    const studentViolations = violationActions.filter(a => a.studentId === studentId);
    let totalDeducted = 0;
    studentViolations.forEach(a => {
      const deg = a.violationDegree || getDegreeFromDescription(a.description);
      totalDeducted += VIOLATION_DEGREES[deg]?.points || 1;
    });
    return Math.max(0, BEHAVIOR_SCORING.totalScore - totalDeducted);
  };

  const handleSelectGrade = (code: string) => {
    if (selectedGradeCode === code) {
      setSelectedGradeCode("");
      setSelectedSection(null);
    } else {
      setSelectedGradeCode(code);
      setSelectedSection(null);
    }
    setSelectedStudentId("");
    setSearch("");
  };

  const handleSelectSection = (sec: number) => {
    if (selectedSection === sec) {
      setSelectedSection(null);
    } else {
      setSelectedSection(sec);
    }
    setSelectedStudentId("");
    setSearch("");
  };

  return (
    <AppLayout>
      {/* ══════ HERO HEADER ══════ */}
      <div className="relative mb-6 overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent" />
        <div className="absolute -top-20 -left-20 w-60 h-60 bg-destructive/8 rounded-full blur-3xl" />
        <div className="relative border-2 border-destructive/15 rounded-2xl p-5 md:p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-destructive/25 to-destructive/10 flex items-center justify-center shadow-lg shadow-destructive/10 border border-destructive/20">
                <Scale size={28} className="text-destructive" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">السلوك والمخالفات</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                  وفق قواعد السلوك والمواظبة — الإصدار الخامس 1447هـ
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl border-2 font-bold" onClick={() => { setLoading(true); loadStudents(true).then(s => { setAllStudents(s); refreshActions(true); }); }}>
              <RefreshCw size={14} /> تحديث
            </Button>
          </div>
        </div>
      </div>

      {/* ══════ GRADES & SECTIONS NAVIGATION ══════ */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap size={18} className="text-primary" />
          <h2 className="text-sm font-black text-foreground">اختر المرحلة والفصل</h2>
        </div>

        {/* Grade Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {grades.map((g, idx) => {
            const color = GRADE_COLORS[idx % GRADE_COLORS.length];
            const isActive = selectedGradeCode === g.code;
            const gradeSections = getSectionsFromDB(g.code);
            const gradeStudentCount = allStudents.filter(s => s.gradeCode === g.code).length;
            const today = new Date().toISOString().split("T")[0];
            const gradeViolationsToday = actions.filter(a => a.type === "violation" && a.grade === g.name && a.date === today).length;

            return (
              <button
                key={g.code}
                onClick={() => handleSelectGrade(g.code)}
                className={`relative overflow-hidden rounded-2xl border-2 p-4 text-right transition-all ${
                  isActive
                    ? `${color.border} ${color.activeBg} ring-2 ring-primary/20 shadow-lg scale-[1.02]`
                    : `border-border/40 hover:border-border hover:shadow-md`
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${color.bg} opacity-60`} />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${color.icon} flex items-center justify-center border ${color.border}`}>
                      <GraduationCap size={20} className={color.text} />
                    </div>
                    <div>
                      <div className="text-sm font-black text-foreground">{g.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{gradeStudentCount} طالب</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-muted-foreground">{gradeSections.length} فصول</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    {gradeViolationsToday > 0 && (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] font-black">
                        {gradeViolationsToday} مخالفة
                      </Badge>
                    )}
                    {isActive && <ArrowRight size={16} className="text-primary" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Section Cards */}
        {selectedGradeCode && sections.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
            {sections.map(sec => {
              const isActive = selectedSection === sec;
              const count = violationCounts[`${selectedGradeCode}-${sec}`] || 0;
              const sectionStudents = allStudents.filter(s => s.gradeCode === selectedGradeCode && s.section === sec).length;

              return (
                <button
                  key={sec}
                  onClick={() => handleSelectSection(sec)}
                  className={`relative rounded-xl border-2 p-3 text-center transition-all ${
                    isActive
                      ? "border-primary/40 bg-primary/5 ring-2 ring-primary/20 shadow-md scale-105"
                      : "border-border/40 hover:border-primary/20 hover:bg-muted/30"
                  }`}
                >
                  <div className="text-lg font-black text-foreground">{sec}</div>
                  <div className="text-[10px] text-muted-foreground font-bold">فصل</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">{sectionStudents} طالب</div>
                  {count > 0 && (
                    <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-black flex items-center justify-center shadow-sm">
                      {count}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════ MINI STATS ══════ */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[
          { icon: <Flame size={18} />, value: stats.total, label: "الإجمالي", color: "text-destructive" },
          { icon: <Clock size={18} />, value: stats.todayCount, label: "اليوم", color: "text-amber-600" },
          { icon: <Users size={18} />, value: stats.totalStudents, label: "طالب", color: "text-primary" },
          { icon: <TrendingUp size={18} />, value: BEHAVIOR_SCORING.totalScore, label: "الدرجة", color: "text-muted-foreground" },
        ].map((s, i) => (
          <div key={i} className="rounded-xl border border-border/40 p-3 text-center bg-card/50">
            <div className={`${s.color} opacity-60 mb-1 flex justify-center`}>{s.icon}</div>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[9px] font-bold text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ══════ DEGREE DISTRIBUTION ══════ */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {Object.entries(VIOLATION_DEGREES).map(([key, deg]) => {
          const num = Number(key);
          const theme = DEGREE_THEMES[num];
          const count = stats.byDegree[num] || 0;
          return (
            <div key={key} className={`rounded-xl border ${theme.border} p-2.5 text-center ${theme.bg}`}>
              <div className={`text-base font-black ${theme.text}`}>{count}</div>
              <div className={`text-[9px] font-bold ${theme.text} opacity-70`}>د{key}</div>
            </div>
          );
        })}
      </div>

      {/* ══════ MAIN TABS ══════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        {isTeacherRestricted ? (
          <ViewOnlyBanner text="للمشاهدة فقط — هذه الصفحة مخصصة للاطلاع على سجل المخالفات والدليل، ولا تتضمن صلاحيات تنفيذية" className="mb-2" />
        ) : null}
        <TabsList className={`w-full grid ${isTeacherRestricted ? "grid-cols-2" : "grid-cols-3"} h-12 rounded-xl bg-muted/40 p-1 border border-border/40`}>
          {!isTeacherRestricted && (
            <TabsTrigger value="register" className="rounded-lg text-xs font-black gap-1.5 data-[state=active]:bg-gradient-to-b data-[state=active]:from-destructive/15 data-[state=active]:to-destructive/5 data-[state=active]:text-destructive data-[state=active]:shadow-sm">
              <ShieldAlert size={16} /> تسجيل
            </TabsTrigger>
          )}
          <TabsTrigger value="archive" className="rounded-lg text-xs font-black gap-1.5 data-[state=active]:bg-gradient-to-b data-[state=active]:from-primary/15 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm">
            <FileText size={16} /> السجل
            {violationActions.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-black">{violationActions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules" className="rounded-lg text-xs font-black gap-1.5 data-[state=active]:bg-gradient-to-b data-[state=active]:from-accent/15 data-[state=active]:to-accent/5 data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm">
            <Gavel size={16} /> الدليل
          </TabsTrigger>
        </TabsList>

        {/* ═══ Register Tab ═══ */}
        <TabsContent value="register" className="mt-0">
          <div className="bg-card rounded-2xl border-2 border-destructive/10 p-5 shadow-sm space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-border/30">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
                <ShieldAlert size={18} className="text-destructive" />
              </div>
              <div>
                <h2 className="text-sm font-black text-foreground">تسجيل مخالفة جديدة</h2>
                <p className="text-[10px] text-muted-foreground">
                  {selectedGradeCode && selectedSection !== null
                    ? `${getGradeShortName(selectedGradeCode)} - فصل ${selectedSection}`
                    : "اختر المرحلة والفصل من الأعلى"}
                </p>
              </div>
            </div>

            {/* No selection state */}
            {(!selectedGradeCode || selectedSection === null) && (
              <div className="text-center py-10 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mx-auto mb-3">
                  <LayoutGrid size={28} className="opacity-30" />
                </div>
                <p className="text-sm font-black">اختر المرحلة والفصل</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">حدد المرحلة ثم الفصل من القسم أعلاه للبدء</p>
              </div>
            )}

            {/* Student selection when grade+section selected */}
            {selectedGradeCode && selectedSection !== null && (
              <>
                {/* Search */}
                <div className="relative">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..." className="pr-10 h-10 rounded-xl border-2" />
                </div>

                {/* Student list as clickable cards */}
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border/30 divide-y divide-border/20">
                  {studentsInClass.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs">لا يوجد طلاب</div>
                  ) : (
                    studentsInClass.map(s => {
                      const isSelected = selectedStudentId === s.id;
                      const score = getStudentScore(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedStudentId(isSelected ? "" : s.id)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-right transition-all ${
                            isSelected ? "bg-primary/5 border-r-4 border-r-primary" : "hover:bg-muted/30"
                          }`}
                        >
                          <div>
                            <span className="text-sm font-bold text-foreground">{s.name}</span>
                            <span className="text-[10px] text-muted-foreground mr-2">{s.studentNumber}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {score < BEHAVIOR_SCORING.totalScore && (
                              <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive font-black">
                                {score}/{BEHAVIOR_SCORING.totalScore}
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Selected Student Info */}
                {selectedStudent && (
                  <div className="rounded-xl border-2 border-primary/15 bg-gradient-to-l from-primary/5 to-transparent p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-foreground">{selectedStudent.name}</p>
                      <p className="text-[10px] text-muted-foreground">{selectedStudent.grade} - فصل {selectedStudent.section}</p>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-black text-primary">{getStudentScore(selectedStudent.id)}</div>
                      <div className="text-[8px] font-bold text-muted-foreground">درجة السلوك</div>
                    </div>
                  </div>
                )}

                {/* Violation Classification */}
                <div className="border-2 border-border/30 rounded-xl p-4 bg-muted/5 space-y-4">
                  <h3 className="text-xs font-black text-foreground flex items-center gap-2">
                    <Shield size={14} className="text-destructive" /> تصنيف المخالفة
                  </h3>

                  {/* Degree Picker */}
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(VIOLATION_DEGREES).map(([key, deg]) => {
                      const num = Number(key);
                      const theme = DEGREE_THEMES[num];
                      const isActive = violationDegree === key;
                      return (
                        <button
                          key={key}
                          onClick={() => { setViolationDegree(key as any); setViolationCategory(""); }}
                          className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                            isActive
                              ? `${theme.badge} border-current ring-2 ring-current/20 shadow-md scale-105`
                              : `border-border/40 text-muted-foreground hover:${theme.bg}`
                          }`}
                        >
                          <div className="text-lg font-black">{key}</div>
                          <div className="text-[8px] font-bold mt-0.5">{deg.points} درجة</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Category */}
                  <Select value={violationCategory} onValueChange={setViolationCategory}>
                    <SelectTrigger className="h-10 rounded-xl border-2 text-xs"><SelectValue placeholder="اختر نوع المخالفة" /></SelectTrigger>
                    <SelectContent>
                      {degreeCategories.map((item) => (
                        <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Preview */}
                  {violationCategory && (
                    <div className={`rounded-xl border-2 p-3 ${DEGREE_THEMES[Number(violationDegree)].bg} ${DEGREE_THEMES[Number(violationDegree)].border}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className={DEGREE_THEMES[Number(violationDegree)].text + " shrink-0 mt-0.5"} />
                        <div>
                          <p className="text-xs font-bold text-foreground">{violationCategory}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <ArrowDownRight size={10} />
                            {VIOLATION_DEGREES[Number(violationDegree)]?.procedureLabel}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="وصف إضافي (اختياري)..." className="min-h-16 text-xs rounded-xl border-2" />

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border/20">
                  <Button onClick={handleCreateViolation} disabled={saving || !selectedStudentId || !violationCategory} className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl h-10 px-5 font-black text-xs shadow-lg shadow-destructive/20">
                    <AlertTriangle size={14} />
                    {saving ? "جارٍ التسجيل..." : "تسجيل المخالفة"}
                  </Button>
                  {selectedStudent && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => {
                        const studentViolations = violationActions.filter(a => a.studentId === selectedStudent.id);
                        const archive = { absences: 0, lateCount: 0 };
                        actions.forEach(a => {
                          if (a.studentId === selectedStudent.id) {
                            if (a.type === "absent") archive.absences++;
                            if (a.type === "late") archive.lateCount++;
                          }
                        });
                        printThermalCard(selectedStudent, "violation", violationCategory || details, { violationType: violationCategory || undefined }, profile?.full_name, archive);
                        toast({ title: `تم طباعة كرت المخالفة — ${selectedStudent.name}` });
                      }} className="gap-1.5 rounded-xl border-2 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
                        <Printer size={14} /> كرت المخالفة
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setWhatsappStudent(selectedStudent)} className="gap-1.5 rounded-xl border-2 text-xs">
                        <MessageCircle size={14} /> واتساب
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handlePrintOfficial(selectedStudent.studentNumber, details || violationCategory)} className="gap-1.5 rounded-xl border-2 text-xs">
                        <Printer size={14} /> طباعة رسمية
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/student/${selectedStudent.id}`)} className="gap-1.5 rounded-xl border-2 text-xs">
                        <Eye size={14} /> الملف
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══ Archive Tab ═══ */}
        <TabsContent value="archive" className="mt-0">
          <div className="space-y-4">
            <DateRangeFilter onRangeChange={(range) => setArchiveDateRange(range)} />
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="بحث في سجل المخالفات..." className="pr-10 h-10 rounded-xl border-2" />
            </div>

            {loading ? (
              <div className="text-center py-16 text-muted-foreground">
                <RefreshCw size={24} className="mx-auto animate-spin mb-3 opacity-30" />
                <p className="text-xs font-bold">جارٍ التحميل...</p>
              </div>
            ) : filteredArchive.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mx-auto mb-3">
                  <Scale size={28} className="opacity-20" />
                </div>
                <p className="text-xs font-black">لا توجد مخالفات مسجلة</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border-2 border-border/30 shadow-sm overflow-hidden">
                {filteredArchive.map((action, idx) => {
                  const degree = action.violationDegree || getDegreeFromDescription(action.description);
                  const theme = DEGREE_THEMES[degree] || DEGREE_THEMES[1];
                  const detailsParts = action.description.split("|").map(s => s.trim());
                  const violationText = detailsParts.find(p => p.startsWith("نوع المخالفة:"))?.replace("نوع المخالفة:", "").trim() || action.violationCategory || action.description;
                  const procedureText = detailsParts.find(p => p.startsWith("الإجراء المتخذ:"))?.replace("الإجراء المتخذ:", "").trim();

                  return (
                    <div key={action.id} className={`flex items-start gap-3 px-4 py-3 border-b border-border/10 last:border-0 hover:bg-muted/10 transition-all ${idx === 0 ? "bg-muted/5" : ""}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-2 ${theme.badge} ${theme.glow} shadow-sm`}>
                        <span className="text-base font-black">{degree}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-foreground">{action.studentName}</span>
                          <span className="text-[9px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{action.grade} - {action.section}</span>
                          <Badge variant="outline" className={`text-[9px] ${theme.badge} border font-bold`}>
                            {VIOLATION_DEGREES[degree]?.label || `د${degree}`}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-foreground/80 mt-0.5 line-clamp-1">{violationText}</p>
                        {procedureText && (
                          <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Gavel size={9} /> {procedureText}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                          <span>{action.date}</span>
                          <span>{action.time}</span>
                          {action.performedByName && (
                            <span className="text-primary font-bold">👤 {action.performedByName}</span>
                          )}
                        </div>
                      </div>
                      {!isTeacherRestricted && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary hover:bg-primary/10 rounded-lg" onClick={() => {
                            const student = allStudents.find(s => s.studentNumber === action.studentNumber);
                            if (student) setWhatsappStudent(student);
                          }}>
                            <MessageCircle size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted rounded-lg" onClick={() => handlePrintOfficial(action.studentNumber, action.description)}>
                            <Printer size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted rounded-lg" onClick={() => navigate(`/student/${action.studentId}`)}>
                            <Eye size={14} />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ Rules Reference Tab ═══ */}
        <TabsContent value="rules" className="mt-0">
          <div className="bg-card rounded-2xl border-2 border-border/30 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/20">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Gavel size={18} className="text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-black text-foreground">دليل تصنيف المخالفات</h2>
                <p className="text-[10px] text-muted-foreground">المرحلة الثانوية — 1447هـ</p>
              </div>
            </div>

            <div className="space-y-3">
              {Object.entries(VIOLATION_DEGREES).map(([key, deg]) => {
                const num = Number(key);
                const theme = DEGREE_THEMES[num];
                const categories = VIOLATION_CATEGORIES[`degree${key}` as keyof typeof VIOLATION_CATEGORIES] || [];
                const procedures = VIOLATION_PROCEDURES[num] || [];
                const isExpanded = expandedDegree === num;

                return (
                  <div key={key} className={`rounded-xl border-2 overflow-hidden transition-all ${theme.border} ${isExpanded ? `${theme.bg} shadow-lg ${theme.glow}` : "hover:shadow-md"}`}>
                    <button
                      onClick={() => setExpandedDegree(isExpanded ? null : num)}
                      className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border-2 text-sm font-black ${theme.badge} ${theme.border}`}>
                          {key}
                        </div>
                        <div>
                          <span className={`text-xs font-black ${theme.text}`}>{deg.label}</span>
                          <span className="text-[10px] text-muted-foreground mr-1.5">({deg.points} درجة)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[9px] ${theme.badge} border font-bold`}>
                          {categories.length} مخالفة
                        </Badge>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        <div className="rounded-lg bg-card border border-border/30 p-3">
                          <h4 className="text-[10px] font-black text-primary mb-2 flex items-center gap-1.5">
                            <ShieldCheck size={12} /> {deg.procedureLabel}
                          </h4>
                          <div className="space-y-1.5">
                            {procedures.map((proc, i) => (
                              <div key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-black ${theme.badge} border ${theme.border}`}>
                                  {i + 1}
                                </span>
                                <span className="pt-0.5">{proc}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[10px] font-black text-foreground mb-2 flex items-center gap-1.5">
                            <AlertOctagon size={12} /> أنواع المخالفات
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {categories.map((cat, i) => (
                              <div key={i} className={`text-[10px] rounded-lg border px-3 py-2 ${theme.bg} ${theme.border} ${theme.text} font-medium`}>
                                <span className="font-black ml-1">{i + 1}.</span> {cat}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {whatsappStudent && (
        <WhatsAppActionDialog
          open={!!whatsappStudent}
          onOpenChange={(open) => !open && setWhatsappStudent(null)}
          student={whatsappStudent}
          initialActionType="violation"
          initialViolationDegree={violationDegree}
          initialViolationCategory={violationCategory}
        />
      )}
    </AppLayout>
  );
};

export default ViolationsPage;
