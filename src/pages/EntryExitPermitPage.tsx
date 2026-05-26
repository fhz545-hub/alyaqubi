import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { loadStudents } from "@/store/studentsStore";
import { getActions, loadActions } from "@/store/actionsStore";
import { printThermalCard } from "@/utils/print";
import { CreditCard, DoorOpen, DoorClosed, LogOut, Printer, AlertTriangle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import StudentSearchDialog from "@/components/StudentSearchDialog";
import { ActionType, Student, VIOLATION_CATEGORIES } from "@/types/school";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const EntryExitPermitPage = () => {
  const { profile, user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [printAction, setPrintAction] = useState<string>("");
  const [autoLateCardPrint, setAutoLateCardPrint] = useState(() => localStorage.getItem("autoLateCardPrint") !== "false");

  const [examReentryDialogOpen, setExamReentryDialogOpen] = useState(false);
  const [examAbsenceDate, setExamAbsenceDate] = useState("");
  const [examExcused, setExamExcused] = useState(true);
  const [pendingExamStudent, setPendingExamStudent] = useState<Student | null>(null);

  const [violationDialogOpen, setViolationDialogOpen] = useState(false);
  const [violationDegree, setViolationDegree] = useState("degree1");
  const [violationType, setViolationType] = useState("");
  const [pendingViolationStudent, setPendingViolationStudent] = useState<Student | null>(null);

  useEffect(() => {
    Promise.all([loadStudents(), loadActions()]);
  }, []);

  const getStudentArchive = (student: Student) => {
    const actions = getActions().filter((a) => a.studentId === student.id || a.studentNumber === student.studentNumber);
    return {
      absences: actions.filter((a) => a.type === "absent").length,
      lateCount: actions.filter((a) => a.type === "late").length,
    };
  };

  const persistAction = async (student: Student, type: ActionType, details?: string) => {
    if (!user) {
      toast({ title: "تعذر حفظ الإجراء", description: "الجلسة غير متاحة حاليًا", variant: "destructive" });
      return false;
    }

    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const { error } = await supabase.from("student_actions").insert({
      student_id: student.id,
      student_name: student.name,
      student_number: student.studentNumber,
      grade: student.gradeCode,
      grade_code: student.gradeCode,
      section: student.section,
      type,
      details: details || null,
      date,
      time,
      performed_by: user.id,
      performed_by_name: profile?.full_name || "",
      performed_by_role: profile?.role_title || "",
    });

    if (error) {
      toast({ title: "فشل حفظ الإجراء", description: error.message, variant: "destructive" });
      return false;
    }

    await loadActions(true);
    return true;
  };

  const handleStudentSelect = async (student: Student) => {
    const userName = profile?.full_name;

    if (printAction === "entry") {
      const saved = await persistAction(student, "entry", "تم إصدار إذن دخول فصل");
      if (!saved) return;
      const archive = getStudentArchive(student);
      printThermalCard(student, "entry", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت دخول فصل - ${student.name}` });
      return;
    }

    if (printAction === "exit") {
      const saved = await persistAction(student, "exit", "تم إصدار إذن خروج من فصل");
      if (!saved) return;
      const archive = getStudentArchive(student);
      printThermalCard(student, "exit", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت خروج من فصل - ${student.name}` });
      return;
    }

    if (printAction === "permission") {
      const saved = await persistAction(student, "permission", "تم إصدار إذن استئذان");
      if (!saved) return;
      const archive = getStudentArchive(student);
      printThermalCard(student, "permission", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت استئذان - ${student.name}` });
      return;
    }

    if (printAction === "late") {
      const saved = await persistAction(student, "late", "تم إصدار كرت تأخر");
      if (!saved) return;
      const archive = getStudentArchive(student);
      printThermalCard(student, "late", undefined, undefined, userName, archive);
      toast({ title: `تم طباعة كرت تأخر - ${student.name}` });
      return;
    }

    if (printAction === "violation") {
      setPendingViolationStudent(student);
      setViolationDialogOpen(true);
      return;
    }

    if (printAction === "exam-reentry") {
      setPendingExamStudent(student);
      setExamReentryDialogOpen(true);
    }
  };

  const handleConfirmExamReentry = () => {
    if (pendingExamStudent) {
      const archive = getStudentArchive(pendingExamStudent);
      printThermalCard(
        pendingExamStudent,
        "exam-reentry",
        undefined,
        { absenceDate: examAbsenceDate || undefined, excused: examExcused },
        profile?.full_name,
        archive
      );
      toast({ title: `تم طباعة إذن إعادة اختبار - ${pendingExamStudent.name}` });
    }
    setExamReentryDialogOpen(false);
    setExamAbsenceDate("");
    setExamExcused(true);
    setPendingExamStudent(null);
  };

  const handleConfirmViolation = async () => {
    if (pendingViolationStudent) {
      const saved = await persistAction(pendingViolationStudent, "violation", violationType || "تم إصدار كرت مخالفة");
      if (!saved) return;
      const archive = getStudentArchive(pendingViolationStudent);
      printThermalCard(
        pendingViolationStudent,
        "violation",
        undefined,
        { violationType: violationType || undefined },
        profile?.full_name,
        archive
      );
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
          <CreditCard size={24} className="text-accent" />
          إذن دخول وخروج
        </h1>
        <p className="text-muted-foreground mt-1">اختر نوع الإذن ثم ابحث عن الطالب بالاسم أو الرقم أو الباركود للطباعة الفورية</p>
      </div>

      <div className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-warning/5 border border-warning/20">
        <div className="flex items-center gap-2 flex-1">
          <Printer size={18} className="text-warning" />
          <span className="text-sm font-semibold text-foreground">طباعة كرت التأخر تلقائيًا عند المسح بالباركود</span>
        </div>
        <Switch
          checked={autoLateCardPrint}
          onCheckedChange={(checked) => {
            setAutoLateCardPrint(checked);
            localStorage.setItem("autoLateCardPrint", String(checked));
            toast({ title: checked ? "تم تفعيل طباعة كرت التأخر التلقائية" : "تم إيقاف طباعة كرت التأخر التلقائية" });
          }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Button variant="outline" className="gap-2 h-auto py-6 flex-col border-success/30 hover:bg-success/5 transition-all" onClick={() => openPrintSearch("entry")}>
          <DoorOpen size={28} className="text-success" />
          <span className="text-sm font-bold">دخول فصل</span>
        </Button>
        <Button variant="outline" className="gap-2 h-auto py-6 flex-col border-primary/30 hover:bg-primary/5 transition-all" onClick={() => openPrintSearch("exit")}>
          <DoorClosed size={28} className="text-primary" />
          <span className="text-sm font-bold">خروج من فصل</span>
        </Button>
        <Button variant="outline" className="gap-2 h-auto py-6 flex-col border-accent/30 hover:bg-accent/5 transition-all" onClick={() => openPrintSearch("permission")}>
          <LogOut size={28} className="text-accent" />
          <span className="text-sm font-bold">استئذان</span>
        </Button>
        <Button variant="outline" className="gap-2 h-auto py-6 flex-col border-warning/30 hover:bg-warning/5 transition-all" onClick={() => openPrintSearch("late")}>
          <Printer size={28} className="text-warning" />
          <span className="text-sm font-bold">تأخر</span>
        </Button>
        <Button variant="outline" className="gap-2 h-auto py-6 flex-col border-destructive/30 hover:bg-destructive/5 transition-all" onClick={() => openPrintSearch("violation")}>
          <AlertTriangle size={28} className="text-destructive" />
          <span className="text-sm font-bold">مخالفة</span>
        </Button>
        <Button variant="outline" className="gap-2 h-auto py-6 flex-col border-accent/30 hover:bg-accent/5 transition-all" onClick={() => openPrintSearch("exam-reentry")}>
          <BookOpen size={28} className="text-accent" />
          <span className="text-sm font-bold">إعادة اختبار</span>
        </Button>
      </div>

      <StudentSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectStudent={handleStudentSelect} />

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
              <Input placeholder="مثال: 1447/03/15" value={examAbsenceDate} onChange={(e) => setExamAbsenceDate(e.target.value)} className="text-right" />
            </div>
            <div className="space-y-2">
              <Label>نوع الغياب</Label>
              <div className="flex gap-3">
                <Button type="button" variant={examExcused ? "default" : "outline"} className="flex-1" onClick={() => setExamExcused(true)}>بعذر</Button>
                <Button type="button" variant={!examExcused ? "destructive" : "outline"} className="flex-1" onClick={() => setExamExcused(false)}>بدون عذر</Button>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="اختر نوع المخالفة" /></SelectTrigger>
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

export default EntryExitPermitPage;
