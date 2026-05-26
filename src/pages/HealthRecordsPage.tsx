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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stethoscope, ArrowRight, Plus, Trash2, Pencil, ShieldAlert, Phone, MessageCircle, Printer, AlertTriangle, HeartPulse, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { loadStudents } from "@/store/studentsStore";
import { Student } from "@/types/school";
import { GRADE_CODE_MAP } from "@/utils/gradeNames";
import {
  HealthRecord,
  HEALTH_CONDITION_TYPES,
  SEVERITY_LABELS,
  HealthSeverity,
  fetchHealthRecordsBySection,
  upsertHealthRecord,
  deleteHealthRecord,
  HealthService,
  HEALTH_SERVICE_TYPES,
  fetchHealthServicesBySection,
  upsertHealthService,
  deleteHealthService,
} from "@/utils/healthRecords";
import { refreshHealthRecords } from "@/store/healthRecordsStore";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { logAudit } from "@/utils/auditLog";
import { getFullHijriDate } from "@/utils/hijri";

const GRADES = Object.entries(GRADE_CODE_MAP);

const severityClass = (s: HealthSeverity) =>
  s === "high" ? "bg-destructive/15 text-destructive" :
  s === "medium" ? "bg-warning/15 text-warning" :
  "bg-muted text-muted-foreground";

export default function HealthRecordsPage() {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canView = isPrincipal || hasPermission(userId, isPrincipal, "view_health_affairs") || hasPermission(userId, isPrincipal, "record_health_records") || hasPermission(userId, isPrincipal, "edit_health_records");
  const canRecord = isPrincipal || hasPermission(userId, isPrincipal, "record_health_records");
  const canEdit = isPrincipal || hasPermission(userId, isPrincipal, "edit_health_records");

  const [students, setStudents] = useState<Student[]>([]);
  const [gradeCode, setGradeCode] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [services, setServices] = useState<HealthService[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ student: Student; record?: HealthRecord } | null>(null);
  const [editingService, setEditingService] = useState<{ student: Student; service?: HealthService } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "record"; id: string; label: string }
    | { kind: "service"; id: string; label: string }
    | null
  >(null);

  useEffect(() => { loadStudents().then(setStudents); }, []);

  const sectionsForGrade = useMemo(() => {
    if (!gradeCode) return [] as number[];
    return Array.from(new Set(students.filter(s => s.gradeCode === gradeCode).map(s => s.section))).sort((a,b)=>a-b);
  }, [gradeCode, students]);

  const studentsInSection = useMemo(
    () => students
      .filter(s => s.gradeCode === gradeCode && s.section === Number(section))
      .sort((a,b) => a.name.localeCompare(b.name, "ar")),
    [students, gradeCode, section]
  );

  const reload = async () => {
    if (!gradeCode || !section) return;
    setLoading(true);
    try {
      const [recs, svcs] = await Promise.all([
        fetchHealthRecordsBySection(gradeCode, Number(section)),
        fetchHealthServicesBySection(gradeCode, Number(section)),
      ]);
      setRecords(recs);
      setServices(svcs);
    }
    catch (e: any) { toast({ title: "تعذّر تحميل السجلات", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [gradeCode, section]);

  const recordsByStudent = useMemo(() => {
    const map = new Map<string, HealthRecord[]>();
    records.forEach(r => {
      const arr = map.get(r.student_id) || [];
      arr.push(r);
      map.set(r.student_id, arr);
    });
    return map;
  }, [records]);

  const servicesByStudent = useMemo(() => {
    const map = new Map<string, HealthService[]>();
    services.forEach(s => {
      const arr = map.get(s.student_id) || [];
      arr.push(s);
      map.set(s.student_id, arr);
    });
    return map;
  }, [services]);

  const criticalCases = useMemo(
    () => records.filter(r => r.severity === "high"),
    [records]
  );

  const cleanPhone = (p: string) => (p || "").replace(/\D/g, "");
  const waLink = (p: string) => {
    const c = cleanPhone(p);
    if (!c) return "";
    const intl = c.startsWith("0") ? "966" + c.slice(1) : c;
    return `https://wa.me/${intl}`;
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === "record") {
        await deleteHealthRecord(confirmDelete.id);
        await logAudit(
          {
            action: "delete_health_record",
            section: "health_records",
            entity_type: "student_health_record",
            entity_id: confirmDelete.id,
            details: { student: confirmDelete.label },
          },
          { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title },
        );
        toast({ title: "تم حذف الحالة الصحية" });
      } else {
        await deleteHealthService(confirmDelete.id);
        await logAudit(
          {
            action: "delete_health_service",
            section: "health_records",
            entity_type: "student_health_service",
            entity_id: confirmDelete.id,
            details: { student: confirmDelete.label },
          },
          { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title },
        );
        toast({ title: "تم حذف الخدمة" });
      }
      setConfirmDelete(null);
      await reload();
      refreshHealthRecords();
    } catch (e: any) {
      toast({ title: "تعذّر الحذف", description: e.message, variant: "destructive" });
    }
  };

  if (!canView) {
    return (
      <div className="min-h-screen bg-background p-6" dir="rtl">
        <Card className="max-w-2xl mx-auto p-8 text-center border-destructive/30">
          <ShieldAlert className="w-14 h-14 mx-auto text-destructive mb-3" />
          <h2 className="text-xl font-bold">وصول مقيّد</h2>
          <p className="text-muted-foreground mt-2">يتطلب صلاحية الاطلاع على الشؤون الصحية.</p>
          <Button asChild variant="outline" className="mt-5"><Link to="/health-affairs">العودة</Link></Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />
      <main className="lg:mr-64 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/10 text-rose-600 grid place-items-center"><Stethoscope size={22} /></div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold">الحالات المرضية والصحية للطلاب</h1>
                <p className="text-xs text-muted-foreground">سجل صحي مرتبط بملف الطالب — اختر <span className="font-semibold text-foreground">الصف</span> ثم <span className="font-semibold text-foreground">الشعبة</span> لعرض وإدارة السجلات.</p>
              </div>
            </div>
            <Button variant="outline" asChild><Link to="/health-affairs"><ArrowRight className="ml-2 h-4 w-4" /> الشؤون الصحية</Link></Button>
          </div>

          <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">الصف</Label>
              <Select value={gradeCode} onValueChange={(v) => { setGradeCode(v); setSection(""); }}>
                <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                <SelectContent>
                  {GRADES.map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الشعبة</Label>
              <Select value={section} onValueChange={setSection} disabled={!gradeCode}>
                <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
                <SelectContent>
                  {sectionsForGrade.map(s => <SelectItem key={s} value={String(s)}>شعبة {s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              {gradeCode && section
                ? `عدد الطلاب: ${studentsInSection.length} · حالات: ${records.length} · خدمات: ${services.length}`
                : "اختر الصف ثم الشعبة"}
            </div>
          </Card>

          {gradeCode && section && criticalCases.length > 0 && (
            <Card className="p-3 border-destructive/50 bg-destructive/5 print:hidden">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="font-bold text-destructive text-sm">تنبيه: حالات حرجة في هذه الشعبة</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {criticalCases.map(r => (
                  <Badge key={r.id} className="bg-destructive text-destructive-foreground gap-1">
                    <HeartPulse className="h-3 w-3" />
                    {r.student_name} — {r.condition_type}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {gradeCode && section && (
            <div className="flex justify-end print:hidden">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="ml-2 h-4 w-4" /> طباعة الكشف الصحي
              </Button>
            </div>
          )}

          {gradeCode && section && (
            <Card className="overflow-hidden print:shadow-none print:border-black" id="health-print-area">
              <div className="hidden print:block text-center py-2 border-b-2 border-black">
                <div className="text-[11px]">المملكة العربية السعودية — وزارة التعليم</div>
                <div className="font-bold text-base">مدرسة اليعقوبي الثانوية</div>
                <div className="font-bold text-sm mt-1">كشف الحالات المرضية والصحية للطلاب</div>
                <div className="text-[11px] mt-1 flex justify-center gap-4 flex-wrap">
                  <span>الصف: {GRADE_CODE_MAP[gradeCode as keyof typeof GRADE_CODE_MAP]}</span>
                  <span>الشعبة: {section}</span>
                  <span>التاريخ: {getFullHijriDate()}</span>
                  <span>عدد الطلاب: {studentsInSection.length}</span>
                </div>
              </div>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-12">م</TableHead>
                    <TableHead className="text-right min-w-[180px] w-[24%]">اسم الطالب</TableHead>
                    <TableHead className="text-right w-[14%]">رقم الهوية</TableHead>
                    <TableHead className="text-right w-[20%]">نوع الحالة الصحية</TableHead>
                    <TableHead className="text-right w-[16%]">آخر خدمة مقدمة</TableHead>
                    <TableHead className="text-right w-[18%]">تواصل ولي الأمر</TableHead>
                    <TableHead className="text-right w-48 print:hidden">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsInSection.map((st, idx) => {
                    const list = recordsByStudent.get(st.id) || [];
                    const svcList = servicesByStudent.get(st.id) || [];
                    const lastSvc = svcList[0];
                    const hasHigh = list.some(r => r.severity === "high");
                    return (
                      <TableRow key={st.id} className={hasHigh ? "bg-destructive/5" : ""}>
                        <TableCell className="align-top">{idx + 1}</TableCell>
                        <TableCell className="font-semibold align-top whitespace-normal break-words leading-tight">
                          <div className="flex items-start gap-2">
                            {hasHigh && <span className="inline-block h-2 w-2 rounded-full bg-destructive animate-pulse" />}
                            <span className="block break-words">{st.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground align-top whitespace-nowrap" dir="ltr">{st.studentNumber}</TableCell>
                        <TableCell>
                          {list.length === 0 ? (
                            <span className="text-xs text-muted-foreground">لا توجد سجلات</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {list.map(r => (
                                <div key={r.id} className="flex items-center gap-1 flex-wrap">
                                  <Badge variant="outline" className={severityClass(r.severity)}>
                                    {r.condition_type} ({SEVERITY_LABELS[r.severity]})
                                  </Badge>
                                  {canEdit && (
                                    <span className="inline-flex gap-0.5 print:hidden">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0"
                                        title="تعديل الحالة"
                                        onClick={() => setEditing({ student: st, record: r })}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                        title="حذف الحالة"
                                        onClick={() => setConfirmDelete({ kind: "record", id: r.id, label: `${r.student_name} — ${r.condition_type}` })}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {lastSvc ? (
                            <div className="flex items-start gap-1">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold">{lastSvc.service_type}</div>
                                <div className="text-muted-foreground">{lastSvc.service_date || "—"}</div>
                                {svcList.length > 1 && <div className="text-[10px] text-muted-foreground">+{svcList.length - 1} سابقة</div>}
                              </div>
                              {canEdit && (
                                <span className="inline-flex flex-col gap-0.5 print:hidden">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    title="تعديل الخدمة"
                                    onClick={() => setEditingService({ student: st, service: lastSvc })}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    title="حذف الخدمة"
                                    onClick={() => setConfirmDelete({ kind: "service", id: lastSvc.id, label: `${lastSvc.student_name} — ${lastSvc.service_type}` })}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </span>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {st.guardianPhone ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span dir="ltr" className="font-mono">{st.guardianPhone}</span>
                              <a href={`tel:${cleanPhone(st.guardianPhone)}`} className="text-primary hover:opacity-80 print:hidden" title="اتصال">
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                              <a href={waLink(st.guardianPhone)} target="_blank" rel="noreferrer" className="text-emerald-600 hover:opacity-80 print:hidden" title="واتساب">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="print:hidden">
                          <div className="flex gap-1 flex-wrap">
                            {canRecord && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setEditing({ student: st })}>
                                  <HeartPulse className="ml-1 h-3 w-3" /> حالة
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingService({ student: st })}>
                                  <ClipboardList className="ml-1 h-3 w-3" /> خدمة
                                </Button>
                              </>
                            )}
                            <Link to={`/student/${st.id}`} className="text-[11px] text-primary hover:underline self-center">الملف</Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              {loading && <div className="p-4 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>}
            </Card>
          )}

          {gradeCode && section && records.length > 0 && (canEdit || isPrincipal) && (
            <Card className="p-4 print:hidden">
              <h3 className="font-bold mb-3">جميع السجلات الصحية في الشعبة</h3>
              <div className="space-y-2">
                {records.map(r => (
                  <div key={r.id} className="flex items-start justify-between gap-3 border rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.student_name}</span>
                        <Badge variant="outline" className={severityClass(r.severity)}>{r.condition_type}</Badge>
                        <span className="text-xs text-muted-foreground">{SEVERITY_LABELS[r.severity]}</span>
                      </div>
                      {r.description && <p className="text-sm text-muted-foreground mt-1 leading-6">{r.description}</p>}
                      {r.medications && <p className="text-xs text-muted-foreground mt-1">الأدوية: {r.medications}</p>}
                      {r.emergency_contact && <p className="text-xs text-muted-foreground">جهة الطوارئ: {r.emergency_contact}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">سُجِّل بواسطة {r.recorded_by_name || "—"}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => {
                          const st = studentsInSection.find(s => s.id === r.student_id);
                          if (st) setEditing({ student: st, record: r });
                        }}><Pencil className="h-3 w-3" /></Button>
                      )}
                      {(canEdit || isPrincipal) && (
                        <Button size="sm" variant="ghost" className="text-destructive" title="حذف نهائي للحالة (تعافي / خطأ تسجيل)"
                          onClick={() => setConfirmDelete({ kind: "record", id: r.id, label: `${r.student_name} — ${r.condition_type}` })}
                        ><Trash2 className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {gradeCode && section && services.length > 0 && (
            <Card className="p-4 print:hidden">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> سجل الخدمات الصحية المقدمة
              </h3>
              <div className="space-y-2">
                {services.map(s => (
                  <div key={s.id} className="flex items-start justify-between gap-3 border rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{s.student_name}</span>
                        <Badge variant="outline">{s.service_type}</Badge>
                        {s.service_date && <span className="text-xs text-muted-foreground">{s.service_date}</span>}
                        {s.guardian_notified && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">تم إبلاغ ولي الأمر</Badge>}
                      </div>
                      {s.related_condition && <p className="text-xs text-muted-foreground mt-1">الحالة: {s.related_condition}</p>}
                      {s.description && <p className="text-sm text-muted-foreground mt-1 leading-6">{s.description}</p>}
                      {s.action_taken && <p className="text-xs">الإجراء: {s.action_taken}</p>}
                      {s.follow_up && <p className="text-xs">المتابعة: {s.follow_up}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">قدّمها {s.recorded_by_name || "—"}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => {
                          const st = studentsInSection.find(x => x.id === s.student_id);
                          if (st) setEditingService({ student: st, service: s });
                        }}><Pencil className="h-3 w-3" /></Button>
                      )}
                      {(canEdit || isPrincipal) && (
                        <Button size="sm" variant="ghost" className="text-destructive" title="حذف الخدمة نهائياً"
                          onClick={() => setConfirmDelete({ kind: "service", id: s.id, label: `${s.student_name} — ${s.service_type}` })}
                        ><Trash2 className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>

      {editing && (
        <RecordDialog
          student={editing.student}
          record={editing.record}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {editingService && (
        <ServiceDialog
          student={editingService.student}
          service={editingService.service}
          existingConditions={(recordsByStudent.get(editingService.student.id) || []).map(r => r.condition_type)}
          onClose={() => setEditingService(null)}
          onSaved={() => { setEditingService(null); reload(); }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف النهائي</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "record"
                ? `سيتم حذف الحالة الصحية (${confirmDelete?.label}) نهائياً من قاعدة البيانات وملف الطالب. لا يمكن التراجع.`
                : `سيتم حذف الخدمة الصحية (${confirmDelete?.label}) نهائياً. لا يمكن التراجع.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف نهائياً
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #health-print-area, #health-print-area * { visibility: visible; }
          #health-print-area { position: absolute; inset: 0; width: 100%; }
          @page { size: A4; margin: 10mm; }
          #health-print-area { box-shadow: none !important; border: 0 !important; }
          #health-print-area .overflow-x-auto { overflow: visible !important; }
          #health-print-area table { width: 100% !important; min-width: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; font-size: 11px; margin-top: 6px; }
          #health-print-area th, #health-print-area td {
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            vertical-align: middle !important;
            word-wrap: break-word;
            overflow-wrap: anywhere;
            white-space: normal !important;
            color: #000 !important;
            background: #fff !important;
          }
          #health-print-area thead th {
            background: #f1f5f9 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-weight: 700;
            text-align: center !important;
          }
          #health-print-area tr { page-break-inside: avoid; }
          #health-print-area .badge,
          #health-print-area [class*="bg-"],
          #health-print-area [class*="text-"] {
            background: transparent !important;
            color: #000 !important;
            border-color: #000 !important;
          }
          #health-print-area button, #health-print-area a[href^="tel"], #health-print-area a[href*="wa.me"] { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function RecordDialog({ student, record, onClose, onSaved }: { student: Student; record?: HealthRecord; onClose: () => void; onSaved: () => void; }) {
  const { profile } = useAuth();
  const [conditionType, setConditionType] = useState(record?.condition_type || HEALTH_CONDITION_TYPES[0]);
  const [severity, setSeverity] = useState<HealthSeverity>(record?.severity || "low");
  const [description, setDescription] = useState(record?.description || "");
  const [medications, setMedications] = useState(record?.medications || "");
  const [emergency, setEmergency] = useState(record?.emergency_contact || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await upsertHealthRecord({
        id: record?.id,
        student_id: student.id,
        student_name: student.name,
        student_number: student.studentNumber,
        grade: student.grade,
        grade_code: student.gradeCode,
        section: student.section,
        condition_type: conditionType,
        description,
        medications,
        emergency_contact: emergency,
        severity,
        recorded_by: profile?.user_id || null,
        recorded_by_name: profile?.full_name || "",
        recorded_by_role: profile?.role_title || "",
      });
      toast({ title: "تم الحفظ" });
      onSaved();
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{record ? "تعديل" : "تسجيل"} حالة صحية — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">نوع الحالة</Label>
              <Select value={conditionType} onValueChange={setConditionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEALTH_CONDITION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">درجة الخطورة</Label>
              <Select value={severity} onValueChange={(v: any) => setSeverity(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{SEVERITY_LABELS.low}</SelectItem>
                  <SelectItem value="medium">{SEVERITY_LABELS.medium}</SelectItem>
                  <SelectItem value="high">{SEVERITY_LABELS.high}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">الوصف / التفاصيل</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="text-xs">الأدوية / التعليمات</Label>
            <Input value={medications} onChange={(e) => setMedications(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">جهة الاتصال في الطوارئ</Label>
            <Input value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="رقم ولي الأمر / الطبيب" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({ student, service, existingConditions, onClose, onSaved }: { student: Student; service?: HealthService; existingConditions: string[]; onClose: () => void; onSaved: () => void; }) {
  const { profile } = useAuth();
  const [serviceDate, setServiceDate] = useState(service?.service_date || new Date().toISOString().slice(0, 10));
  const [serviceType, setServiceType] = useState(service?.service_type || HEALTH_SERVICE_TYPES[0]);
  const [relatedCondition, setRelatedCondition] = useState(service?.related_condition || existingConditions[0] || "");
  const [description, setDescription] = useState(service?.description || "");
  const [actionTaken, setActionTaken] = useState(service?.action_taken || "");
  const [followUp, setFollowUp] = useState(service?.follow_up || "");
  const [guardianNotified, setGuardianNotified] = useState<boolean>(service?.guardian_notified || false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await upsertHealthService({
        id: service?.id,
        student_id: student.id,
        student_name: student.name,
        student_number: student.studentNumber,
        grade: student.grade,
        grade_code: student.gradeCode,
        section: student.section,
        service_date: serviceDate,
        service_type: serviceType,
        related_condition: relatedCondition,
        description,
        action_taken: actionTaken,
        follow_up: followUp,
        guardian_notified: guardianNotified,
        recorded_by: profile?.user_id || null,
        recorded_by_name: profile?.full_name || "",
        recorded_by_role: profile?.role_title || "",
      });
      toast({ title: "تم حفظ الخدمة" });
      onSaved();
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{service ? "تعديل" : "تسجيل"} خدمة صحية — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">تاريخ الخدمة</Label>
              <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">نوع الخدمة</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEALTH_SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {existingConditions.length > 0 && (
            <div>
              <Label className="text-xs">الحالة الصحية المرتبطة (اختياري)</Label>
              <Select value={relatedCondition || "none"} onValueChange={(v) => setRelatedCondition(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون —</SelectItem>
                  {existingConditions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">وصف الحالة / السبب</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">الإجراء المتخذ / الخدمة المقدمة</Label>
            <Textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">المتابعة / التوصيات</Label>
            <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="مثال: متابعة بعد يومين، إحالة، راحة..." />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={guardianNotified} onCheckedChange={(c) => setGuardianNotified(!!c)} />
            تم إبلاغ ولي الأمر
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}