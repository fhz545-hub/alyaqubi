import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, Pencil, Trash2, Printer, ShieldAlert, Search, HeartPulse } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { loadStudents } from "@/store/studentsStore";
import { Student } from "@/types/school";
import { GRADE_CODE_MAP, formatGradeSection } from "@/utils/gradeNames";
import { getFullHijriDate } from "@/utils/hijri";
import { toast } from "@/hooks/use-toast";
import {
  RegisterConfig, RegisterField,
  fetchRegisterRowsBySection, fetchRegisterRowsAll,
  upsertRegisterRow, deleteRegisterRow, labelOf,
} from "@/utils/healthRegisters";

const GRADES = Object.entries(GRADE_CODE_MAP);
const SCHOOL_NAME = "مدرسة اليعقوبي الثانوية";

interface Props {
  config: RegisterConfig;
}

export default function HealthRegisterPage({ config }: Props) {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canView = isPrincipal
    || hasPermission(userId, isPrincipal, "view_health_affairs")
    || hasPermission(userId, isPrincipal, "record_health_records")
    || hasPermission(userId, isPrincipal, "edit_health_records");
  const canRecord = isPrincipal || hasPermission(userId, isPrincipal, "record_health_records");
  const canEdit = isPrincipal || hasPermission(userId, isPrincipal, "edit_health_records");

  const isStudent = config.scope === "student";

  const [students, setStudents] = useState<Student[]>([]);
  const [gradeCode, setGradeCode] = useState("");
  const [section, setSection] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ row?: any; student?: Student } | null>(null);

  useEffect(() => { if (isStudent) loadStudents().then(setStudents); }, [isStudent]);

  const sectionsForGrade = useMemo(() => {
    if (!gradeCode) return [] as number[];
    return Array.from(new Set(students.filter(s => s.gradeCode === gradeCode).map(s => s.section))).sort((a,b)=>a-b);
  }, [gradeCode, students]);

  const studentsInSection = useMemo(
    () => students
      .filter(s => s.gradeCode === gradeCode && s.section === Number(section))
      .sort((a,b) => a.name.localeCompare(b.name, "ar")),
    [students, gradeCode, section],
  );

  const reload = async () => {
    if (isStudent && (!gradeCode || !section)) { setRows([]); return; }
    setLoading(true);
    try {
      const data = isStudent
        ? await fetchRegisterRowsBySection(config.table, gradeCode, Number(section))
        : await fetchRegisterRowsAll(config.table);
      setRows(data);
    } catch (e: any) {
      toast({ title: "تعذّر تحميل السجل", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [gradeCode, section]);
  useEffect(() => { if (!isStudent) reload(); /* eslint-disable-next-line */ }, []);

  const rowsByStudent = useMemo(() => {
    const m = new Map<string, any[]>();
    rows.forEach(r => {
      const arr = m.get(r.student_id) || [];
      arr.push(r); m.set(r.student_id, arr);
    });
    return m;
  }, [rows]);

  const filteredSchoolRows = useMemo(() => {
    if (isStudent) return rows;
    const s = search.trim();
    if (!s) return rows;
    return rows.filter(r => Object.values(r).some(v => typeof v === "string" && v.includes(s)));
  }, [rows, search, isStudent]);

  const handleSave = async (formData: Record<string, any>) => {
    if (!editing) return;
    try {
      const base: Record<string, any> = { ...formData };
      if (isStudent && editing.student) {
        base.student_id = editing.student.id;
        base.student_name = editing.student.name;
        base.student_number = editing.student.studentNumber || "";
        base.grade = editing.student.grade || "";
        base.grade_code = editing.student.gradeCode || "";
        base.section = editing.student.section || 1;
      }
      if (editing.row?.id) base.id = editing.row.id;
      // recorded_by / contacted_by
      const ownerKey = config.table === "health_guardian_contacts" ? "contacted_by" : "recorded_by";
      const ownerNameKey = config.table === "health_guardian_contacts" ? "contacted_by_name" : "recorded_by_name";
      const ownerRoleKey = config.table === "health_guardian_contacts" ? "contacted_by_role" : "recorded_by_role";
      base[ownerKey] = profile?.user_id || null;
      base[ownerNameKey] = profile?.full_name || "";
      base[ownerRoleKey] = profile?.role_title || "";
      await upsertRegisterRow(config.table, base);
      toast({ title: editing.row?.id ? "تم تحديث السجل" : "تم حفظ السجل" });
      setEditing(null);
      reload();
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذا السجل نهائيًا؟")) return;
    try {
      await deleteRegisterRow(config.table, id);
      toast({ title: "تم الحذف" });
      reload();
    } catch (e: any) {
      toast({ title: "تعذّر الحذف", description: e.message, variant: "destructive" });
    }
  };

  const printableFields = config.fields.filter(f => f.printable);

  const handlePrint = () => window.print();

  if (!canView) {
    return (
      <div className="min-h-screen bg-background p-6" dir="rtl">
        <Card className="max-w-2xl mx-auto p-8 text-center border-destructive/30">
          <ShieldAlert className="w-14 h-14 mx-auto text-destructive mb-3" />
          <h2 className="text-xl font-bold">وصول مقيّد</h2>
          <p className="text-muted-foreground mt-2">يتطلب صلاحية الاطلاع على الشؤون الصحية.</p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/health-affairs"><ArrowRight className="ml-2 h-4 w-4" /> العودة</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
          aside, nav, [data-sidebar], .no-print { display:none !important; }
          .print-area { margin:0 !important; padding:0 !important; box-shadow:none !important; border:none !important; background:#fff !important; }
          .print-area * { box-shadow:none !important; }
          .reg-table { width:100%; border-collapse:collapse; font-size:10.5px; table-layout:fixed; }
          .reg-table th, .reg-table td { border:1px solid #333; padding:4px 5px; vertical-align:middle; word-break:break-word; }
          .reg-table th { background:#f0f4f8; font-weight:700; }
          .reg-table td.name-col { white-space:normal; overflow-wrap:anywhere; }
        }
        .reg-table { width:100%; border-collapse:collapse; }
        .reg-table th, .reg-table td { border:1px solid hsl(var(--border)); padding:6px 8px; vertical-align:middle; font-size:12px; }
        .reg-table th { background:hsl(var(--muted)); font-weight:600; }
      `}</style>
      <AppSidebar />
      <main className="lg:mr-64 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto print-area">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4 no-print">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <HeartPulse size={22} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold">{config.title}</h1>
                <p className="text-sm text-muted-foreground">{config.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handlePrint} disabled={!rows.length}>
                <Printer className="ml-2 h-4 w-4" /> طباعة
              </Button>
              <Button variant="outline" asChild>
                <Link to="/health-affairs"><ArrowRight className="ml-2 h-4 w-4" /> العودة</Link>
              </Button>
            </div>
          </div>

          {/* Print header */}
          <div className="hidden print:block mb-3 text-center">
            <div className="font-bold text-lg">{SCHOOL_NAME}</div>
            <div className="font-semibold">{config.title}</div>
            <div className="text-xs">{getFullHijriDate()}</div>
            {isStudent && gradeCode && section ? (
              <div className="text-xs">{formatGradeSection(gradeCode, Number(section))}</div>
            ) : null}
          </div>

          {/* Filter bar */}
          {isStudent ? (
            <Card className="p-4 mb-4 no-print">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>الصف</Label>
                  <Select value={gradeCode} onValueChange={(v) => { setGradeCode(v); setSection(""); }}>
                    <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map(([code, name]) => (<SelectItem key={code} value={code}>{name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الشعبة</Label>
                  <Select value={section} onValueChange={setSection} disabled={!gradeCode}>
                    <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
                    <SelectContent>
                      {sectionsForGrade.map(s => (<SelectItem key={s} value={String(s)}>شعبة {s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>بحث باسم الطالب</Label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث..." />
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-4 mb-4 no-print">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Label>بحث</Label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في السجلات..." />
                  </div>
                </div>
                {canRecord && (
                  <Button onClick={() => setEditing({})} className="self-end">
                    <Plus className="ml-2 h-4 w-4" /> إضافة سجل جديد
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Body */}
          {isStudent ? (
            <StudentScopedView
              students={studentsInSection.filter(s => !search || s.name.includes(search) || (s.studentNumber||"").includes(search))}
              rowsByStudent={rowsByStudent}
              config={config}
              canRecord={canRecord}
              canEdit={canEdit}
              isPrincipal={isPrincipal}
              loading={loading}
              onAdd={(student) => setEditing({ student })}
              onEdit={(student, row) => setEditing({ student, row })}
              onDelete={handleDelete}
              gradeCode={gradeCode}
              section={section}
            />
          ) : (
            <SchoolScopedView
              rows={filteredSchoolRows}
              config={config}
              canEdit={canEdit}
              isPrincipal={isPrincipal}
              loading={loading}
              onEdit={(row) => setEditing({ row })}
              onDelete={handleDelete}
            />
          )}

          {/* Print signature footer */}
          <div className="hidden print:flex justify-between items-center mt-6 text-xs">
            <div>الموجه الصحي: ............................</div>
            <div>مدخل البيانات: {profile?.full_name || "............................"}</div>
            <div>مدير المدرسة: فهد حامد الزهراني</div>
          </div>
        </div>
      </main>

      {editing && (
        <RegisterFormDialog
          open={true}
          config={config}
          row={editing.row}
          student={editing.student}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/* ---------------- Student-scoped view ---------------- */
function StudentScopedView({
  students, rowsByStudent, config, canRecord, canEdit, isPrincipal, loading,
  onAdd, onEdit, onDelete, gradeCode, section,
}: any) {
  if (!gradeCode || !section) {
    return <Card className="p-8 text-center text-muted-foreground">اختر الصف والشعبة لعرض السجل.</Card>;
  }
  if (loading) return <Card className="p-8 text-center text-muted-foreground">جارٍ التحميل...</Card>;
  if (!students.length) return <Card className="p-8 text-center text-muted-foreground">لا يوجد طلاب في هذه الشعبة.</Card>;

  const printableFields: RegisterField[] = config.fields.filter((f: RegisterField) => f.printable);

  return (
    <>
      {/* Print table — flat list */}
      <div className="hidden print:block">
        <table className="reg-table">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>م</th>
              <th style={{ width: "20%" }}>اسم الطالب</th>
              {printableFields.map((f: RegisterField) => (
                <th key={f.key} style={{ width: f.width }}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.flatMap((s: Student, si: number) => {
              const list = rowsByStudent.get(s.id) || [];
              if (!list.length) {
                return [(
                  <tr key={s.id}>
                    <td>{si + 1}</td>
                    <td className="name-col">{s.name}</td>
                    {printableFields.map((f: RegisterField) => <td key={f.key}></td>)}
                  </tr>
                )];
              }
              return list.map((r: any, ri: number) => (
                <tr key={r.id}>
                  {ri === 0 ? <td rowSpan={list.length}>{si + 1}</td> : null}
                  {ri === 0 ? <td rowSpan={list.length} className="name-col">{s.name}</td> : null}
                  {printableFields.map((f: RegisterField) => (
                    <td key={f.key}>{renderCell(r[f.key], f)}</td>
                  ))}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* Screen view — student cards with their entries */}
      <div className="space-y-3 print:hidden">
        {students.map((s: Student) => {
          const list = rowsByStudent.get(s.id) || [];
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-foreground">{s.name}</div>
                  <div className="text-xs text-muted-foreground">رقم الطالب: {s.studentNumber || "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{list.length} سجل</Badge>
                  {canRecord && (
                    <Button size="sm" onClick={() => onAdd(s)}>
                      <Plus className="ml-1 h-4 w-4" /> إضافة
                    </Button>
                  )}
                </div>
              </div>
              {list.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="reg-table min-w-[640px]">
                    <thead>
                      <tr>
                        {printableFields.map((f: RegisterField) => <th key={f.key}>{f.label}</th>)}
                        <th style={{ width: "10%" }} className="no-print">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r: any) => (
                        <tr key={r.id}>
                          {printableFields.map((f: RegisterField) => (
                            <td key={f.key}>{renderCell(r[f.key], f)}</td>
                          ))}
                          <td className="no-print">
                            <div className="flex gap-1">
                              {canEdit && (
                                <Button size="sm" variant="ghost" onClick={() => onEdit(s, r)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {isPrincipal && (
                                <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- School-scoped view ---------------- */
function SchoolScopedView({ rows, config, canEdit, isPrincipal, loading, onEdit, onDelete }: any) {
  if (loading) return <Card className="p-8 text-center text-muted-foreground">جارٍ التحميل...</Card>;
  if (!rows.length) return <Card className="p-8 text-center text-muted-foreground">لا توجد سجلات بعد.</Card>;
  const printableFields: RegisterField[] = config.fields.filter((f: RegisterField) => f.printable);

  return (
    <Card className="p-3 overflow-x-auto">
      <table className="reg-table min-w-[800px]">
        <thead>
          <tr>
            <th style={{ width: "4%" }}>م</th>
            {printableFields.map((f: RegisterField) => <th key={f.key} style={{ width: f.width }}>{f.label}</th>)}
            <th style={{ width: "8%" }} className="no-print">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              {printableFields.map((f: RegisterField) => (
                <td key={f.key}>{renderCell(r[f.key], f)}</td>
              ))}
              <td className="no-print">
                <div className="flex gap-1">
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {isPrincipal && (
                    <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ---------------- Cell renderer ---------------- */
function renderCell(value: any, field: RegisterField) {
  if (value == null || value === "") return "—";
  if (field.type === "boolean") return value ? "نعم" : "لا";
  if (field.type === "select") return labelOf(value);
  return String(value);
}

/* ---------------- Form Dialog ---------------- */
function RegisterFormDialog({
  open, config, row, student, onClose, onSave,
}: {
  open: boolean; config: RegisterConfig; row?: any; student?: Student;
  onClose: () => void; onSave: (data: Record<string, any>) => void;
}) {
  const [data, setData] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    config.fields.forEach(f => {
      init[f.key] = row?.[f.key] ?? (f.type === "boolean" ? false : f.type === "number" ? 0 : "");
    });
    return init;
  });

  const setField = (k: string, v: any) => setData(d => ({ ...d, [k]: v }));

  const submit = () => {
    // basic required check
    for (const f of config.fields) {
      if (f.required && (data[f.key] === "" || data[f.key] == null)) {
        toast({ title: `الحقل "${f.label}" مطلوب`, variant: "destructive" });
        return;
      }
    }
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {row?.id ? "تعديل سجل" : "إضافة سجل جديد"}
            {student ? ` — ${student.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          {config.fields.map((f) => (
            <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
              <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
              {f.type === "text" && (
                <Input value={data[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)} placeholder={f.placeholder} />
              )}
              {f.type === "number" && (
                <Input type="number" value={data[f.key] ?? 0} onChange={(e) => setField(f.key, Number(e.target.value))} />
              )}
              {f.type === "date" && (
                <Input type="date" value={data[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)} />
              )}
              {f.type === "textarea" && (
                <Textarea rows={3} value={data[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)} />
              )}
              {f.type === "select" && (
                <Select value={data[f.key] || ""} onValueChange={(v) => setField(f.key, v)}>
                  <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    {f.options?.map(o => (<SelectItem key={o} value={o}>{labelOf(o)}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              {f.type === "boolean" && (
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox checked={!!data[f.key]} onCheckedChange={(v) => setField(f.key, !!v)} />
                  <span className="text-sm text-muted-foreground">{f.label}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
