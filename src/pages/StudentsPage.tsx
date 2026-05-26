import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import {
  loadStudents, getStudentsFromDB, getGradesFromDB, getSectionsFromDB,
  addStudent, updateStudent, deleteStudent, getStudentsCount,
} from "@/store/studentsStore";
import { MessageCircle, Users, Search, Plus, Pencil, Trash2, Send, RefreshCw, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";
import BulkWhatsAppDialog from "@/components/BulkWhatsAppDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import WhatsAppActionDialog from "@/components/WhatsAppActionDialog";
import { Student } from "@/types/school";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { isDistanceLearning, DISTANCE_LEARNING_LABEL } from "@/utils/distanceLearning";
import HealthBadge from "@/components/HealthBadge";

const GRADE_OPTIONS = [
  { code: "1314", name: "أول ثانوي" },
  { code: "1416", name: "ثاني ثانوي" },
  { code: "1516", name: "ثالث ثانوي" },
];

const StudentFormDialog = ({
  open,
  onOpenChange,
  student,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
  onSave: () => void;
}) => {
  const [name, setName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [gradeCode, setGradeCode] = useState("");
  const [section, setSection] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setName(student.name);
      setStudentNumber(student.studentNumber);
      setGradeCode(student.gradeCode);
      setSection(String(student.section));
      setGuardianPhone(student.guardianPhone);
    } else {
      setName(""); setStudentNumber(""); setGradeCode(""); setSection(""); setGuardianPhone("");
    }
  }, [student, open]);

  const handleSave = async () => {
    if (!name.trim() || !studentNumber.trim() || !gradeCode || !section) {
      toast({ title: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (student) {
        const success = await updateStudent(student.id, {
          name: name.trim(), studentNumber: studentNumber.trim(),
          gradeCode, section: Number(section), guardianPhone: guardianPhone.trim(),
        });
        if (success) { toast({ title: "تم تحديث بيانات الطالب ✅" }); onSave(); onOpenChange(false); }
        else toast({ title: "فشل تحديث البيانات", variant: "destructive" });
      } else {
        const result = await addStudent({
          name: name.trim(), studentNumber: studentNumber.trim(),
          gradeCode, section: Number(section), guardianPhone: guardianPhone.trim(),
        });
        if (result) { toast({ title: "تم إضافة الطالب بنجاح ✅" }); onSave(); onOpenChange(false); }
        else toast({ title: "فشل إضافة الطالب", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{student ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>اسم الطالب *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" />
          </div>
          <div>
            <Label>رقم الهوية *</Label>
            <Input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} placeholder="رقم الهوية" dir="ltr" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المرحلة *</Label>
              <Select value={gradeCode} onValueChange={setGradeCode}>
                <SelectTrigger><SelectValue placeholder="المرحلة" /></SelectTrigger>
                <SelectContent>
                  {GRADE_OPTIONS.map((g) => (
                    <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفصل *</Label>
              <Input type="number" min={1} max={20} value={section} onChange={(e) => setSection(e.target.value)} placeholder="رقم الفصل" />
            </div>
          </div>
          <div>
            <Label>جوال ولي الأمر</Label>
            <Input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="966XXXXXXXXX" dir="ltr" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? "جارٍ الحفظ..." : student ? "تحديث" : "إضافة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const StudentsPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [_dialogChannelUnused] = useState<"whatsapp">("whatsapp");
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const canExport = !!profile && (profile.is_principal || !!profile.role_title?.includes("وكيل"));

  const exportSectionToExcel = (gradeCode: string, section: number) => {
    const gradeName = GRADE_OPTIONS.find((g) => g.code === gradeCode)?.name || gradeCode;
    const list = allStudents
      .filter((s) => s.gradeCode === gradeCode && s.section === section)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    if (list.length === 0) {
      toast({ title: "لا يوجد طلاب في هذه الشعبة", variant: "destructive" });
      return;
    }
    const aoa: any[][] = [
      [`${gradeName} - فصل ${section}`],
      [`عدد الطلاب: ${list.length}`],
      [],
      ["م", "اسم الطالب", "رقم الهوية"],
      ...list.map((s, i) => [i + 1, s.name, s.studentNumber]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 40 }, { wch: 18 }];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    ];
    if (!(ws as any)["!sheetView"]) (ws as any)["!sheetView"] = {};
    (ws as any)["!sheetView"].rightToLeft = true;
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, `فصل ${section}`);
    XLSX.writeFile(wb, `طلاب_${gradeName}_فصل_${section}.xlsx`);
    toast({ title: "تم تصدير الملف ✅" });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refreshStudents = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const data = await Promise.race([
        loadStudents(forceRefresh),
        new Promise<Student[]>((resolve) => setTimeout(() => resolve(getStudentsFromDB()), 12000)),
      ]);
      setAllStudents(Array.isArray(data) ? data : getStudentsFromDB());
    } catch (error) {
      console.error("Failed to refresh students:", error);
      setAllStudents(getStudentsFromDB());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshStudents(true); }, [refreshStudents]);

  const grades = useMemo(() => getGradesFromDB(), [allStudents]);

  const handleDeleteStudent = async (id: string) => {
    const success = await deleteStudent(id);
    if (success) { toast({ title: "تم حذف الطالب" }); setDeleteConfirm(null); await refreshStudents(); }
    else toast({ title: "فشل حذف الطالب", variant: "destructive" });
  };

  // Derived data
  const sections = selectedGrade ? getSectionsFromDB(selectedGrade) : [];
  const displayStudents = useMemo(() => {
    if (!selectedGrade || selectedSection === null) return [];
    let list = allStudents
      .filter((s) => s.gradeCode === selectedGrade && s.section === selectedSection)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    if (search) {
      list = list.filter((s) => s.name.includes(search) || s.studentNumber.includes(search));
    }
    return list;
  }, [allStudents, selectedGrade, selectedSection, search]);

  const toggleSelectAll = () => {
    if (selectedIds.size === displayStudents.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayStudents.map((s) => s.id)));
  };
  const selectedStudents = displayStudents.filter((s) => selectedIds.has(s.id));

  const gradeColors: Record<string, string> = {
    "1314": "from-primary/20 to-primary/5 border-primary/30 text-primary",
    "1416": "from-accent/20 to-accent/5 border-accent/30 text-accent-foreground",
    "1516": "from-secondary/20 to-secondary/5 border-secondary/30 text-secondary-foreground",
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">جارٍ تحميل بيانات الطلاب...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (allStudents.length === 0) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md">
            <Users size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">لا توجد بيانات طلاب</h2>
            <p className="text-muted-foreground text-sm mb-6">تعذر تحميل بيانات الطلاب حالياً أو أن القاعدة فارغة.</p>
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => refreshStudents(true)} className="gap-2">
                <RefreshCw size={18} /> تحديث مباشر من قاعدة البيانات
              </Button>
              <Button variant="outline" onClick={() => { setEditingStudent(null); setFormOpen(true); }} className="gap-2">
                <Plus size={18} /> إضافة طالب جديد
              </Button>
            </div>
          </div>
        </div>
        <StudentFormDialog open={formOpen} onOpenChange={setFormOpen} student={editingStudent} onSave={refreshStudents} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">شؤون الطلاب</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إجمالي {allStudents.length} طالب</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refreshStudents(true)}>
            <RefreshCw size={14} /> تحديث
          </Button>
          <Button onClick={() => { setEditingStudent(null); setFormOpen(true); }} size="sm" className="gap-1.5">
            <Plus size={16} /> إضافة طالب
          </Button>
        </div>
      </div>

      {/* Grades as side-by-side columns */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {grades.map((grade) => {
          const count = allStudents.filter((s) => s.gradeCode === grade.code).length;
          const isActive = selectedGrade === grade.code;
          return (
            <button
              key={grade.code}
              onClick={() => {
                setSelectedGrade(isActive ? null : grade.code);
                setSelectedSection(null);
                setSearch("");
              }}
              className={`rounded-xl border-2 p-4 text-center transition-all ${
                isActive
                  ? `bg-gradient-to-b ${gradeColors[grade.code]} border-2 shadow-md scale-[1.02]`
                  : "bg-card border-border/50 hover:border-primary/30 hover:bg-muted/30"
              }`}
            >
              <Users size={22} className={`mx-auto mb-1.5 ${isActive ? "" : "text-muted-foreground"}`} />
              <p className={`font-bold text-sm ${isActive ? "" : "text-foreground"}`}>{grade.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{count} طالب</p>
            </button>
          );
        })}
      </div>

      {/* Sections row */}
      {selectedGrade && sections.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {sections.map((sec) => {
            const count = allStudents.filter((s) => s.gradeCode === selectedGrade && s.section === sec).length;
            const isActive = selectedSection === sec;
            const isDL = isDistanceLearning(selectedGrade, sec);
            return (
              <button
                key={sec}
                onClick={() => { setSelectedSection(isActive ? null : sec); setSearch(""); }}
                className={`px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                  isActive
                    ? (isDL
                        ? "bg-accent text-accent-foreground border-accent shadow-sm"
                        : "bg-primary text-primary-foreground border-primary shadow-sm")
                    : (isDL
                        ? "bg-accent/10 border-accent/40 text-accent-foreground hover:bg-accent/20"
                        : "bg-card border-border/50 text-foreground hover:bg-muted/40")
                }`}
                title={isDL ? DISTANCE_LEARNING_LABEL : undefined}
              >
                فصل {sec}
                <span className={`mr-1.5 text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>({count})</span>
                {isDL && (
                  <span className={`mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-background/20" : "bg-accent/20 text-accent-foreground"}`}>
                    انتساب
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Student list */}
      {selectedGrade && selectedSection !== null && (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-border/30 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو رقم الهوية..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={displayStudents.length > 0 && selectedIds.size === displayStudents.length}
                onCheckedChange={toggleSelectAll}
                className="h-5 w-5"
              />
              <span className="text-xs text-muted-foreground">تحديد الكل</span>
              {canExport && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => exportSectionToExcel(selectedGrade!, selectedSection!)}
                  title="تصدير الشعبة إلى Excel"
                >
                  <FileDown size={14} /> تصدير Excel
                </Button>
              )}
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-success hover:bg-success/90 text-success-foreground text-xs"
                  onClick={() => setBulkDialogOpen(true)}
                >
                  <Send size={14} />
                  إرسال جماعي ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>

          {displayStudents.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">لا توجد نتائج</div>
          ) : (
            <div className="divide-y divide-border/20">
              {displayStudents.map((student, idx) => (
                <div key={student.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.has(student.id)}
                      onCheckedChange={() => toggleSelect(student.id)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                    <div
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/student/${student.id}`)}
                    >
                      <p className="font-medium text-foreground text-sm flex items-center gap-1.5 flex-wrap">
                        {student.name}
                        <HealthBadge studentId={student.id} studentNumber={student.studentNumber} size="xs" showLabel />
                        {isDistanceLearning(student.gradeCode, student.section) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent-foreground border border-accent/30">
                            {DISTANCE_LEARNING_LABEL}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{student.studentNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                      onClick={() => { setEditingStudent(student); setFormOpen(true); }}
                    >
                      <Pencil size={14} />
                    </Button>
                    {profile?.is_principal && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirm(student.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                    {student.guardianPhone && (
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10"
                          onClick={() => { setSelectedStudent(student); setWhatsappDialogOpen(true); }}
                          title="إرسال واتساب"
                        >
                          <MessageCircle size={16} />
                        </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prompt to select */}
      {!selectedGrade && (
        <div className="text-center py-12 text-muted-foreground">
          <Users size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">اختر المرحلة للوصول لبيانات الطلاب</p>
        </div>
      )}
      {selectedGrade && selectedSection === null && (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">اختر الفصل لعرض الطلاب</p>
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">تأكيد حذف الطالب</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا الطالب نهائياً؟</p>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" onClick={() => deleteConfirm && handleDeleteStudent(deleteConfirm)}>حذف نهائي</Button>
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StudentFormDialog open={formOpen} onOpenChange={setFormOpen} student={editingStudent} onSave={refreshStudents} />
      {selectedStudent && (
        <WhatsAppActionDialog
          student={selectedStudent}
          open={whatsappDialogOpen}
          onOpenChange={setWhatsappDialogOpen}
        />
      )}
      <BulkWhatsAppDialog students={selectedStudents} open={bulkDialogOpen} onOpenChange={setBulkDialogOpen} />
    </AppLayout>
  );
};

export default StudentsPage;
