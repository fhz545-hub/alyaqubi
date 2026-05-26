import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ArrowRight, Printer, Save, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { loadStudents } from "@/store/studentsStore";
import { Student } from "@/types/school";
import { GRADE_CODE_MAP, formatGradeSection } from "@/utils/gradeNames";
import { SCHOOL_INFO } from "@/types/school";
import { getHijriDate } from "@/utils/hijri";
import {
  VitalSigns,
  calcBMI,
  assessBMI,
  assessBP,
  parseBP,
  formatBP,
  fetchVitalSignsBySection,
  upsertVitalSigns,
} from "@/utils/healthRecords";
import { toast } from "@/hooks/use-toast";

const GRADES = Object.entries(GRADE_CODE_MAP);
const ACADEMIC_YEAR = "1447/1448";

type Row = {
  studentId: string;
  name: string;
  number: string;
  t1Height: string; t1Weight: string;
  t2Height: string; t2Weight: string;
  t1BP: string; t2BP: string;
  notes: string;
};

export default function VitalSignsPage() {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canView = isPrincipal || hasPermission(userId, isPrincipal, "view_health_affairs") || hasPermission(userId, isPrincipal, "record_health_records") || hasPermission(userId, isPrincipal, "edit_health_records");
  const canRecord = isPrincipal || hasPermission(userId, isPrincipal, "record_health_records") || hasPermission(userId, isPrincipal, "edit_health_records");
  const canPrint = isPrincipal || hasPermission(userId, isPrincipal, "print_health_records");

  const [students, setStudents] = useState<Student[]>([]);
  const [gradeCode, setGradeCode] = useState("");
  const [section, setSection] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [dataEntryName, setDataEntryName] = useState("");

  useEffect(() => { loadStudents().then(setStudents); }, []);

  const sectionsForGrade = useMemo(() => {
    if (!gradeCode) return [] as number[];
    return Array.from(new Set(students.filter(s => s.gradeCode === gradeCode).map(s => s.section))).sort((a,b)=>a-b);
  }, [gradeCode, students]);

  const sectionStudents = useMemo(
    () => students
      .filter(s => s.gradeCode === gradeCode && s.section === Number(section))
      .sort((a,b) => a.name.localeCompare(b.name, "ar")),
    [students, gradeCode, section]
  );

  useEffect(() => {
    (async () => {
      if (!gradeCode || !section) { setRows([]); return; }
      let existing: VitalSigns[] = [];
      try { existing = await fetchVitalSignsBySection(gradeCode, Number(section), ACADEMIC_YEAR); }
      catch (e: any) { toast({ title: "تعذّر تحميل البيانات", description: e.message, variant: "destructive" }); }
      const byKey = (sid: string, term: 1|2) => existing.find(r => r.student_id === sid && r.term === term);
      const next: Row[] = sectionStudents.map(st => {
        const t1 = byKey(st.id, 1);
        const t2 = byKey(st.id, 2);
        return {
          studentId: st.id,
          name: st.name,
          number: st.studentNumber,
          t1Height: t1?.height_cm != null ? String(t1.height_cm) : "",
          t1Weight: t1?.weight_kg != null ? String(t1.weight_kg) : "",
          t2Height: t2?.height_cm != null ? String(t2.height_cm) : "",
          t2Weight: t2?.weight_kg != null ? String(t2.weight_kg) : "",
          t1BP: formatBP(t1?.systolic_bp, t1?.diastolic_bp),
          t2BP: formatBP(t2?.systolic_bp, t2?.diastolic_bp),
          notes: t2?.notes || t1?.notes || "",
        };
      });
      setRows(next);
      // Determine data-entry name: most recent recorder for this section
      const sorted = [...existing].sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""));
      const latest = sorted.find(r => r.recorded_by_name)?.recorded_by_name || "";
      setDataEntryName(latest);
    })();
  }, [gradeCode, section, sectionStudents]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.studentId === id ? { ...r, ...patch } : r));
  };

  const saveAll = async () => {
    if (!gradeCode || !section) return;
    setSaving(true);
    try {
      for (const r of rows) {
        const st = sectionStudents.find(s => s.id === r.studentId);
        if (!st) continue;
        const base = {
          student_id: st.id,
          student_name: st.name,
          student_number: st.studentNumber,
          grade: st.grade,
          grade_code: st.gradeCode,
          section: st.section,
          academic_year: ACADEMIC_YEAR,
          recorded_by: profile?.user_id || null,
          recorded_by_name: profile?.full_name || "",
          recorded_by_role: profile?.role_title || "",
        };
        const bp1 = parseBP(r.t1BP);
        const bp2 = parseBP(r.t2BP);
        const t1Has = r.t1Height || r.t1Weight || bp1.sys || bp1.dia;
        const t2Has = r.t2Height || r.t2Weight || bp2.sys || bp2.dia;
        if (t1Has) {
          const h = r.t1Height ? Number(r.t1Height) : null;
          const w = r.t1Weight ? Number(r.t1Weight) : null;
          await upsertVitalSigns({ ...base, term: 1, height_cm: h, weight_kg: w, bmi: calcBMI(h, w), systolic_bp: bp1.sys, diastolic_bp: bp1.dia, notes: r.notes });
        }
        if (t2Has) {
          const h = r.t2Height ? Number(r.t2Height) : null;
          const w = r.t2Weight ? Number(r.t2Weight) : null;
          await upsertVitalSigns({ ...base, term: 2, height_cm: h, weight_kg: w, bmi: calcBMI(h, w), systolic_bp: bp2.sys, diastolic_bp: bp2.dia, notes: r.notes });
        }
      }
      toast({ title: "تم حفظ السجل" });
      if (profile?.full_name) setDataEntryName(profile.full_name);
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
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

  const headerLine = gradeCode && section
    ? `${SCHOOL_INFO.school} — ${formatGradeSection(gradeCode, Number(section))} — ${getHijriDate()}`
    : "";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />
      <main className="lg:mr-64 p-4 sm:p-6 print:p-0 print:mr-0">
        <div className="max-w-[1400px] mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 grid place-items-center"><Activity size={22} /></div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold">سجل متابعة المؤشرات الحيوية للطلاب</h1>
                <p className="text-xs text-muted-foreground">قياسان لكل طالب (الفصلان) مع حساب BMI تلقائياً.</p>
              </div>
            </div>
            <div className="flex gap-2">
              {canPrint && gradeCode && section && (
                <Button variant="outline" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" /> طباعة</Button>
              )}
              <Button variant="outline" asChild><Link to="/health-affairs"><ArrowRight className="ml-2 h-4 w-4" /> الشؤون الصحية</Link></Button>
            </div>
          </div>

          <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 print:hidden">
            <div>
              <Label className="text-xs">الصف</Label>
              <Select value={gradeCode} onValueChange={(v) => { setGradeCode(v); setSection(""); }}>
                <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                <SelectContent>{GRADES.map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الشعبة</Label>
              <Select value={section} onValueChange={setSection} disabled={!gradeCode}>
                <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
                <SelectContent>{sectionsForGrade.map(s => <SelectItem key={s} value={String(s)}>شعبة {s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {canRecord && gradeCode && section && (
                <Button onClick={saveAll} disabled={saving} className="w-full"><Save className="ml-2 h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ السجل"}</Button>
              )}
            </div>
          </Card>

          {gradeCode && section && (
            <div className="print-area bg-card text-foreground rounded-xl border print:border-0 print:rounded-none">
              <header className="p-3 border-b text-center space-y-0.5 print:p-2">
                <h2 className="font-extrabold text-base print:text-sm">سجل متابعة المؤشرات الحيوية للطلاب</h2>
                <p className="text-xs print:text-[11px]">{SCHOOL_INFO.school}</p>
                <div className="flex justify-center gap-4 text-xs print:text-[11px] flex-wrap">
                  <span><b>الصف:</b> {GRADE_CODE_MAP[gradeCode] || gradeCode}</span>
                  <span><b>الفصل:</b> شعبة {section}</span>
                  <span><b>التاريخ:</b> {getHijriDate()} هـ</span>
                  <span><b>السنة:</b> {ACADEMIC_YEAR} هـ</span>
                </div>
              </header>

              <div className="overflow-x-auto print:overflow-visible">
                <table className="vital-table w-full text-[12px] border-collapse" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "3%" }} />
                    <col className="name-col" style={{ width: "21%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "6%" }} />
                    <col className="bp-col" style={{ width: "9%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "6%" }} />
                    <col className="bp-col" style={{ width: "9%" }} />
                    <col className="assessment-col" style={{ width: "18%" }} />
                  </colgroup>
                  <thead className="bg-emerald-50">
                    <tr>
                      <th rowSpan={2} className="border p-2">م</th>
                      <th rowSpan={2} className="border p-2 text-right">اسم الطالب</th>
                      <th colSpan={4} className="border p-2 bg-sky-50">القياس الأول (الفصل الأول)</th>
                      <th colSpan={4} className="border p-2 bg-violet-50">القياس الثاني (الفصل الثاني)</th>
                      <th rowSpan={2} className="border p-2 assessment-col">التقييم والملاحظات</th>
                    </tr>
                    <tr>
                      <th className="border p-1 bg-sky-50">الطول (سم)</th>
                      <th className="border p-1 bg-sky-50">الوزن (كجم)</th>
                      <th className="border p-1 bg-sky-50">BMI</th>
                      <th className="border p-1 bg-sky-50 bp-col">ضغط الدم</th>
                      <th className="border p-1 bg-violet-50">الطول (سم)</th>
                      <th className="border p-1 bg-violet-50">الوزن (كجم)</th>
                      <th className="border p-1 bg-violet-50">BMI</th>
                      <th className="border p-1 bg-violet-50 bp-col">ضغط الدم</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr:nth-child(even)]:bg-muted/20">
                    {rows.map((r, idx) => {
                      const a1 = assessBMI(Number(r.t1Height) || null, Number(r.t1Weight) || null);
                      const a2 = assessBMI(Number(r.t2Height) || null, Number(r.t2Weight) || null);
                      const bp1p = parseBP(r.t1BP); const bp2p = parseBP(r.t2BP);
                      const b1 = assessBP(bp1p.sys, bp1p.dia);
                      const b2 = assessBP(bp2p.sys, bp2p.dia);
                      const latest = a2.bmi != null ? a2 : a1;
                      const latestBp = b2.category ? b2 : b1;
                      const colorMap: Record<string, string> = {
                        emerald: "bg-emerald-50 text-emerald-800 border-emerald-300",
                        amber: "bg-amber-50 text-amber-900 border-amber-300",
                        orange: "bg-orange-50 text-orange-900 border-orange-300",
                        red: "bg-red-50 text-red-900 border-red-400",
                        sky: "bg-sky-50 text-sky-900 border-sky-300",
                      };
                      const bmiCellCls = (a: typeof a1) => `border p-1 text-center font-semibold ${a.bmi != null ? colorMap[a.color] : "bg-muted/20"}`;
                      const bpCellCls = (b: typeof b1) => `border p-0 text-center font-semibold bp-col ${b.category ? colorMap[b.color] : ""}`;
                      const ro = !canRecord;
                      return (
                        <tr key={r.studentId}>
                          <td className="border p-1 text-center align-middle">{idx + 1}</td>
                          <td className="name-col border p-2 text-right align-middle font-medium whitespace-normal break-words leading-tight" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{r.name}</td>
                          <td className="border p-0"><CellInput value={r.t1Height} onChange={(v) => updateRow(r.studentId, { t1Height: v })} readOnly={ro} /></td>
                          <td className="border p-0"><CellInput value={r.t1Weight} onChange={(v) => updateRow(r.studentId, { t1Weight: v })} readOnly={ro} /></td>
                          <td className={bmiCellCls(a1)}>{a1.bmi ?? "—"}</td>
                          <td className={bpCellCls(b1)} title={b1.category ? `${b1.label}: ${b1.advice}` : ""}>
                            <BPInput value={r.t1BP} onChange={(v) => updateRow(r.studentId, { t1BP: v })} readOnly={ro} />
                          </td>
                          <td className="border p-0"><CellInput value={r.t2Height} onChange={(v) => updateRow(r.studentId, { t2Height: v })} readOnly={ro} /></td>
                          <td className="border p-0"><CellInput value={r.t2Weight} onChange={(v) => updateRow(r.studentId, { t2Weight: v })} readOnly={ro} /></td>
                          <td className={bmiCellCls(a2)}>{a2.bmi ?? "—"}</td>
                          <td className={bpCellCls(b2)} title={b2.category ? `${b2.label}: ${b2.advice}` : ""}>
                            <BPInput value={r.t2BP} onChange={(v) => updateRow(r.studentId, { t2BP: v })} readOnly={ro} />
                          </td>
                          <td className={`border p-1 text-right text-[11px] assessment-col align-middle ${latest.bmi != null ? colorMap[latest.color] : ""}`}>
                            {latest.bmi != null && (
                              <div
                                className="leading-snug break-words"
                                title={`${latest.label}: ${latest.advice}`}
                                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                              >
                                <span className="font-bold">{latest.label}:</span> <span>{latest.advice}</span>
                              </div>
                            )}
                            {latestBp.category && (
                              <div
                                className="leading-snug break-words mt-0.5"
                                title={`ضغط الدم — ${latestBp.label}: ${latestBp.advice}`}
                                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                              >
                                <span className="font-bold">ضغط الدم — {latestBp.label}:</span> <span>{latestBp.advice}</span>
                              </div>
                            )}
                            <CellInput value={r.notes} onChange={(v) => updateRow(r.studentId, { notes: v })} readOnly={ro} text title={r.notes} />
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr><td colSpan={11} className="border p-4 text-center text-muted-foreground">لا يوجد طلاب في هذه الشعبة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="p-3 text-xs text-foreground flex justify-between items-center gap-3 print:mt-3 print:border-t print:pt-2 print:text-[11px]">
                <span className="flex-1 text-right">الموجه الصحي: خالد أحمد الشهري</span>
                <span className="flex-1 text-center">
                  {dataEntryName ? <>مدخل البيانات: {dataEntryName}</> : <span className="text-muted-foreground print:hidden">مدخل البيانات: —</span>}
                </span>
                <span className="flex-1 text-left">مدير المدرسة: {SCHOOL_INFO.principal}</span>
              </footer>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @media print {
          body { background: #fff; }
          @page { size: A4 landscape; margin: 5mm; }
          .print\\:hidden { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          aside, nav, [data-sidebar] { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .print-area { box-shadow: none !important; border: none !important; border-radius: 0 !important; background: #fff !important; width: 100% !important; max-width: 100% !important; }
          .print-area * { box-shadow: none !important; }
          .print-area header { border-bottom: 1.5px solid #000 !important; }
          .print-area table th, .print-area table td { border: 1px solid #333 !important; }
          .print-area input { border: none !important; background: transparent !important; }
          .vital-table { table-layout: fixed !important; }
          .vital-table .assessment-col,
          .vital-table td.assessment-col,
          .vital-table td.assessment-col > div { white-space: normal !important; word-break: break-word !important; overflow: visible !important; text-align: right !important; font-size: 9.5px !important; line-height: 1.3 !important; -webkit-line-clamp: unset !important; display: block !important; }
          .vital-table td.assessment-col { display: table-cell !important; }
          .vital-table .assessment-col input { text-align: right !important; padding: 0 2px !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
          .print-area .overflow-x-auto, .print-area [class*="overflow"] { overflow: visible !important; }
          ::-webkit-scrollbar { display: none !important; }
          .vital-table { font-size: 10px !important; }
          .vital-table th { padding: 2px 3px !important; line-height: 1.15 !important; }
          .vital-table td { padding: 1px 3px !important; line-height: 1.15 !important; word-break: keep-all; overflow: hidden; white-space: nowrap; }
          .vital-table td.name-col { white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important; overflow: visible !important; text-align: right !important; }
          .vital-table td input { padding: 0 !important; font-size: 10px !important; height: auto !important; }
          .vital-table .bp-col, .vital-table td.bp-col { white-space: nowrap !important; text-align: center !important; font-weight: 700 !important; }
          .vital-table td.bp-col input { text-align: center !important; font-weight: 700 !important; }
          .vital-table tbody tr { page-break-inside: avoid; }
          .print-area, .print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function CellInput({ value, onChange, readOnly, text, placeholder, title }: { value: string; onChange: (v: string) => void; readOnly?: boolean; text?: boolean; placeholder?: string; title?: string }) {
  return (
    <input
      type={text ? "text" : "number"}
      step="0.1"
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-1 py-1 text-center bg-transparent outline-none focus:bg-primary/5"
    />
  );
}

function BPInput({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  // Format like 120/80, allow only digits + a single slash, auto-insert "/" after 3 digits.
  const handle = (raw: string) => {
    let s = raw.replace(/[^\d/]/g, "");
    // collapse multiple slashes to one
    const firstSlash = s.indexOf("/");
    if (firstSlash !== -1) {
      s = s.slice(0, firstSlash + 1) + s.slice(firstSlash + 1).replace(/\//g, "");
    }
    // auto-insert slash after 3 digits if user kept typing
    if (firstSlash === -1 && s.length > 3) {
      s = s.slice(0, 3) + "/" + s.slice(3, 6);
    }
    // clamp lengths
    if (firstSlash !== -1) {
      const [a, b = ""] = s.split("/");
      s = `${a.slice(0, 3)}/${b.slice(0, 3)}`;
    }
    onChange(s);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      readOnly={readOnly}
      placeholder="120/80"
      title={value}
      onChange={(e) => handle(e.target.value)}
      className="w-full px-1 py-1 text-center bg-transparent outline-none focus:bg-primary/5 font-semibold"
    />
  );
}