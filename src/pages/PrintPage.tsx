import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { loadStudents, getStudentsFromDB, getGradesFromDB, getSectionsFromDB } from "@/store/studentsStore";
import { getActions, loadActions } from "@/store/actionsStore";
import { printAttendanceSheet, printOfficialDocument, printThermalCard } from "@/utils/print";
import { printSubjectSheet, SUBJECT_SHEET_TEMPLATES, SubjectSheetTemplate } from "@/utils/printSubjectSheets";
import { generateOfficialLetterWhatsApp, openWhatsApp, isValidSaudiPhone } from "@/utils/whatsapp";
import { Printer, FileText, ClipboardList, Download, UserCheck, AlertTriangle, FileCheck, BookOpen, MessageCircle, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import StudentSearchDialog from "@/components/StudentSearchDialog";
import { Student, VIOLATION_CATEGORIES } from "@/types/school";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { hasPermission } from "@/store/permissionsStore";

const PrintPage = () => {
  const { profile } = useAuth();
  const isTeacherRestricted = Boolean(!profile?.is_principal && profile?.approved && profile?.role_title?.includes("معلم"));
  const [allStudents, setAllStudents] = useState(getStudentsFromDB());
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [printAction, setPrintAction] = useState<string>("");
  const [summonDateDialogOpen, setSummonDateDialogOpen] = useState(false);
  const [summonDate, setSummonDate] = useState("");
  const [pendingSummonStudent, setPendingSummonStudent] = useState<Student | null>(null);
  const [examReentryDialogOpen, setExamReentryDialogOpen] = useState(false);
  const [examAbsenceDate, setExamAbsenceDate] = useState("");
  const [examExcused, setExamExcused] = useState(true);
  const [pendingExamStudent, setPendingExamStudent] = useState<Student | null>(null);
  const [violationDialogOpen, setViolationDialogOpen] = useState(false);
  const [violationDegree, setViolationDegree] = useState("degree1");
  const [violationType, setViolationType] = useState("");
  const [pendingViolationStudent, setPendingViolationStudent] = useState<Student | null>(null);
  const [subjectSheetTemplate, setSubjectSheetTemplate] = useState<SubjectSheetTemplate>("template1");
  const [subjectName, setSubjectName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [subjectGrade, setSubjectGrade] = useState("");
  const [subjectSection, setSubjectSection] = useState("");

  const canPrintSubjectSheets =
    profile?.is_principal ||
    isTeacherRestricted ||
    hasPermission(profile?.user_id || "", profile?.is_principal || false, "print_subject_sheets");

  useEffect(() => {
    Promise.all([loadStudents(), loadActions()]).then(([students]) => setAllStudents(students));
  }, []);

  const grades = useMemo(() => getGradesFromDB(), [allStudents]);
  const sections = selectedGrade ? getSectionsFromDB(selectedGrade) : [];

  const handlePrintLateSheet = () => {
    if (selectedGrade && selectedSection) {
      printAttendanceSheet(selectedGrade, Number(selectedSection), "late", allStudents);
    }
  };

  const handlePrintAbsentSheet = () => {
    if (selectedGrade && selectedSection) {
      printAttendanceSheet(selectedGrade, Number(selectedSection), "absent", allStudents);
    }
  };

  const handlePrintAllSections = (type: "late" | "absent") => {
    if (selectedGrade) {
      const secs = getSectionsFromDB(selectedGrade);
      secs.forEach((sec, i) => {
        setTimeout(() => printAttendanceSheet(selectedGrade, sec, type, allStudents), i * 500);
      });
    }
  };

  const getStudentArchive = (student: Student) => {
    const actions = getActions().filter(a => a.studentId === student.id || a.studentNumber === student.studentNumber);
    return {
      absences: actions.filter(a => a.type === "absent").length,
      lateCount: actions.filter(a => a.type === "late").length,
    };
  };

  const handleStudentSelect = (student: Student) => {
    const userName = profile?.full_name;
    const archive = getStudentArchive(student);
    if (printAction === "entry") {
      printThermalCard(student, "entry", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت دخول فصل - ${student.name}` });
    } else if (printAction === "exit") {
      printThermalCard(student, "exit", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت خروج من فصل - ${student.name}` });
    } else if (printAction === "permission") {
      printThermalCard(student, "permission", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت استئذان - ${student.name}` });
    } else if (printAction === "late") {
      printThermalCard(student, "late", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت تأخر - ${student.name}` });
    } else if (printAction === "violation") {
      setPendingViolationStudent(student);
      setViolationDialogOpen(true);
      return;
    } else if (printAction === "summon") {
      setPendingSummonStudent(student);
      setSummonDateDialogOpen(true);
      return;
    } else if (printAction === "exam-reentry") {
      setPendingExamStudent(student);
      setExamReentryDialogOpen(true);
      return;
    } else if (printAction === "violation-official") {
      printOfficialDocument(student, "violation", "");
      toast({ title: `تم طباعة إشعار مخالفة رسمي - ${student.name}` });
    } else if (printAction === "pledge") {
      printOfficialDocument(student, "general", "تعهد بعدم تكرار المخالفة والالتزام بأنظمة المدرسة وقواعد السلوك والمواظبة.");
      toast({ title: `تم طباعة تعهد - ${student.name}` });
    } else if (printAction === "whatsapp-summon" || printAction === "whatsapp-violation" || printAction === "whatsapp-pledge") {
      const whatsappType = printAction.replace("whatsapp-", "") as "summon" | "violation" | "pledge";
      if (isValidSaudiPhone(student.guardianPhone)) {
        const msg = generateOfficialLetterWhatsApp(student, whatsappType, { name: profile?.full_name, role: profile?.role_title });
        openWhatsApp(student.guardianPhone, msg);
        toast({ title: `تم إرسال ${whatsappType === "summon" ? "خطاب الاستدعاء" : whatsappType === "violation" ? "إشعار المخالفة" : "التعهد"} عبر واتساب` });
      } else {
        toast({ title: "رقم جوال ولي الأمر غير صالح", variant: "destructive" });
      }
    }
  };

  const handleConfirmSummon = () => {
    if (pendingSummonStudent) {
      printOfficialDocument(pendingSummonStudent, "summon", "", summonDate || undefined);
      toast({ title: `تم طباعة خطاب استدعاء - ${pendingSummonStudent.name}` });
    }
    setSummonDateDialogOpen(false);
    setSummonDate("");
    setPendingSummonStudent(null);
  };

  const handleConfirmExamReentry = () => {
    if (pendingExamStudent) {
      const archive = getStudentArchive(pendingExamStudent);
      printThermalCard(pendingExamStudent, "exam-reentry", undefined, {
        absenceDate: examAbsenceDate || undefined,
        excused: examExcused,
      }, profile?.full_name, archive);
      toast({ title: `تم طباعة إذن إعادة اختبار - ${pendingExamStudent.name}` });
    }
    setExamReentryDialogOpen(false);
    setExamAbsenceDate("");
    setExamExcused(true);
    setPendingExamStudent(null);
  };

  const handleConfirmViolation = () => {
    if (pendingViolationStudent) {
      const archive = getStudentArchive(pendingViolationStudent);
      printThermalCard(pendingViolationStudent, "violation", undefined, { violationType: violationType || undefined }, profile?.full_name, archive);
      toast({ title: `تم طباعة كرت مخالفة - ${pendingViolationStudent.name}` });
    }
    setViolationDialogOpen(false);
    setViolationType("");
    setViolationDegree("degree1");
    setPendingViolationStudent(null);
  };

  const openPrintSearch = (action: string) => {
    setPrintAction(action);
    setSearchOpen(true);
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Printer size={24} className="text-primary" />
          مركز الطباعة
        </h1>
        <p className="text-muted-foreground mt-1">طباعة الكشوف والكروت والخطابات الرسمية</p>
      </div>

      {!isTeacherRestricted && (
        <div className="bg-card rounded-xl border border-border/50 p-6 mb-6 animate-fade-in">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <ClipboardList size={20} className="text-primary" />
          كشوف المتابعة الأسبوعية
        </h2>

        <div className="flex flex-wrap gap-3 mb-6">
          <Select value={selectedGrade} onValueChange={(v) => { setSelectedGrade(v); setSelectedSection(""); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="اختر المرحلة" />
            </SelectTrigger>
            <SelectContent>
              {grades.map((g) => (
                <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedGrade && (
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="اختر الفصل" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s} value={String(s)}>فصل {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={handlePrintLateSheet} disabled={!selectedGrade || !selectedSection}>
            <Printer size={20} className="text-warning" />
            <span>كشف التأخر</span>
            <span className="text-xs text-muted-foreground">شعبة واحدة</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={handlePrintAbsentSheet} disabled={!selectedGrade || !selectedSection}>
            <Printer size={20} className="text-destructive" />
            <span>كشف الغياب</span>
            <span className="text-xs text-muted-foreground">شعبة واحدة</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handlePrintAllSections("late")} disabled={!selectedGrade}>
            <Download size={20} className="text-warning" />
            <span>كشوف التأخر</span>
            <span className="text-xs text-muted-foreground">جميع الشعب</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col" onClick={() => handlePrintAllSections("absent")} disabled={!selectedGrade}>
            <Download size={20} className="text-destructive" />
            <span>كشوف الغياب</span>
            <span className="text-xs text-muted-foreground">جميع الشعب</span>
          </Button>
        </div>
        </div>
      )}

      {/* Section: Subject Follow-up Sheets */}
      {canPrintSubjectSheets && (
        <div className="bg-card rounded-xl border border-border/50 p-6 mb-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <GraduationCap size={20} className="text-accent" />
            كشوف متابعة المواد
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold">نوع الكشف</Label>
              <Select value={subjectSheetTemplate} onValueChange={(v) => setSubjectSheetTemplate(v as SubjectSheetTemplate)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SUBJECT_SHEET_TEMPLATES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <div className="text-right">
                        <div className="font-semibold">{val.label}</div>
                        <div className="text-xs text-muted-foreground">{val.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">اسم المادة</Label>
              <Input
                placeholder="مثال: رياضيات 1"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">اسم المعلم</Label>
              <Input
                placeholder="اسم معلم المادة"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">المرحلة والشعبة</Label>
              <div className="flex gap-2">
                <Select value={subjectGrade} onValueChange={(v) => { setSubjectGrade(v); setSubjectSection(""); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="المرحلة" /></SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {subjectGrade && (
                  <Select value={subjectSection} onValueChange={setSubjectSection}>
                    <SelectTrigger className="w-24"><SelectValue placeholder="الشعبة" /></SelectTrigger>
                    <SelectContent>
                      {getSectionsFromDB(subjectGrade).map((s) => (
                        <SelectItem key={s} value={String(s)}>فصل {s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <Button
            className="gap-2 w-full sm:w-auto"
            onClick={() => {
              if (!subjectName.trim()) { toast({ title: "يرجى إدخال اسم المادة", variant: "destructive" }); return; }
              if (!teacherName.trim()) { toast({ title: "يرجى إدخال اسم المعلم", variant: "destructive" }); return; }
              if (!subjectGrade || !subjectSection) { toast({ title: "يرجى اختيار المرحلة والشعبة", variant: "destructive" }); return; }
              printSubjectSheet(subjectSheetTemplate, subjectName, teacherName, subjectGrade, Number(subjectSection), allStudents);
              toast({ title: `تم طباعة كشف متابعة - ${subjectName}` });
            }}
            disabled={!subjectName || !teacherName || !subjectGrade || !subjectSection}
          >
            <Printer size={18} />
            طباعة كشف المتابعة
          </Button>
        </div>
      )}

      {!isTeacherRestricted && (
        <>
          <div className="bg-card rounded-xl border border-border/50 p-6 mb-6 animate-fade-in">
        <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
          <FileText size={20} className="text-secondary" />
          خطابات رسمية A4
        </h2>
        <p className="text-xs text-muted-foreground mb-4">مخاطبات رسمية بترويسة وزارة التعليم</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col border-secondary/30 hover:bg-secondary/5" onClick={() => openPrintSearch("summon")}>
            <UserCheck size={20} className="text-secondary" />
            <span className="text-sm font-semibold">خطاب استدعاء</span>
            <span className="text-xs text-muted-foreground">طباعة A4</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col border-destructive/30 hover:bg-destructive/5" onClick={() => openPrintSearch("violation-official")}>
            <AlertTriangle size={20} className="text-destructive" />
            <span className="text-sm font-semibold">إشعار مخالفة</span>
            <span className="text-xs text-muted-foreground">طباعة A4</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-4 flex-col border-warning/30 hover:bg-warning/5" onClick={() => openPrintSearch("pledge")}>
            <FileCheck size={20} className="text-warning" />
            <span className="text-sm font-semibold">تعهد خطي</span>
            <span className="text-xs text-muted-foreground">طباعة A4</span>
          </Button>
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <MessageCircle size={16} className="text-success" />
          إرسال خطابات رسمية عبر واتساب
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="gap-2 h-auto py-3 flex-col border-success/30 hover:bg-success/5" onClick={() => openPrintSearch("whatsapp-summon")}>
            <div className="flex items-center gap-1">
              <MessageCircle size={16} className="text-success" />
              <UserCheck size={16} className="text-secondary" />
            </div>
            <span className="text-sm font-semibold">استدعاء واتساب</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-3 flex-col border-success/30 hover:bg-success/5" onClick={() => openPrintSearch("whatsapp-violation")}>
            <div className="flex items-center gap-1">
              <MessageCircle size={16} className="text-success" />
              <AlertTriangle size={16} className="text-destructive" />
            </div>
            <span className="text-sm font-semibold">إشعار مخالفة واتساب</span>
          </Button>
          <Button variant="outline" className="gap-2 h-auto py-3 flex-col border-success/30 hover:bg-success/5" onClick={() => openPrintSearch("whatsapp-pledge")}>
            <div className="flex items-center gap-1">
              <MessageCircle size={16} className="text-success" />
              <FileCheck size={16} className="text-warning" />
            </div>
            <span className="text-sm font-semibold">تعهد واتساب</span>
          </Button>
        </div>
          </div>
        </>
      )}

      <StudentSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectStudent={handleStudentSelect} />

      <Dialog open={summonDateDialogOpen} onOpenChange={setSummonDateDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تحديد تاريخ الاستدعاء</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pendingSummonStudent && (
              <p className="text-sm text-muted-foreground">الطالب: <strong className="text-foreground">{pendingSummonStudent.name}</strong></p>
            )}
            <div className="space-y-2">
              <Label>تاريخ الحضور للمدرسة (هجري)</Label>
              <Input
                placeholder="مثال: 1447/03/15"
                value={summonDate}
                onChange={(e) => setSummonDate(e.target.value)}
                className="text-right"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSummonDateDialogOpen(false); setSummonDate(""); setPendingSummonStudent(null); }}>إلغاء</Button>
            <Button onClick={handleConfirmSummon}>طباعة الخطاب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={examReentryDialogOpen} onOpenChange={setExamReentryDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إذن إعادة اختبار</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pendingExamStudent && (
              <p className="text-sm text-muted-foreground">الطالب: <strong className="text-foreground">{pendingExamStudent.name}</strong></p>
            )}
            <div className="space-y-2">
              <Label>تاريخ الغياب (هجري)</Label>
              <Input
                placeholder="مثال: 1447/03/15"
                value={examAbsenceDate}
                onChange={(e) => setExamAbsenceDate(e.target.value)}
                className="text-right"
              />
            </div>
            <div className="space-y-2">
              <Label>نوع الغياب</Label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={examExcused ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setExamExcused(true)}
                >
                  بعذر
                </Button>
                <Button
                  type="button"
                  variant={!examExcused ? "destructive" : "outline"}
                  className="flex-1"
                  onClick={() => setExamExcused(false)}
                >
                  بدون عذر
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setExamReentryDialogOpen(false); setExamAbsenceDate(""); setPendingExamStudent(null); }}>إلغاء</Button>
            <Button onClick={handleConfirmExamReentry}>طباعة الإذن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={violationDialogOpen} onOpenChange={setViolationDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تحديد نوع المخالفة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pendingViolationStudent && (
              <p className="text-sm text-muted-foreground">الطالب: <strong className="text-foreground">{pendingViolationStudent.name}</strong></p>
            )}
            <div className="space-y-2">
              <Label>درجة المخالفة</Label>
              <Select value={violationDegree} onValueChange={(v) => { setViolationDegree(v); setViolationType(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="degree1">الدرجة الأولى</SelectItem>
                  <SelectItem value="degree2">الدرجة الثانية</SelectItem>
                  <SelectItem value="degree3">الدرجة الثالثة</SelectItem>
                  <SelectItem value="degree4">الدرجة الرابعة</SelectItem>
                  <SelectItem value="degree5">الدرجة الخامسة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نوع المخالفة</Label>
              <Select value={violationType} onValueChange={setViolationType}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر نوع المخالفة" />
                </SelectTrigger>
                <SelectContent>
                  {(VIOLATION_CATEGORIES[violationDegree] || []).map((v, i) => (
                    <SelectItem key={i} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViolationDialogOpen(false); setViolationType(""); setPendingViolationStudent(null); }}>إلغاء</Button>
            <Button onClick={handleConfirmViolation} disabled={!violationType}>طباعة الكرت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default PrintPage;
