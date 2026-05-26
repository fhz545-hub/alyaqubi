import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadStudents, getStudentsFromDB } from "@/store/studentsStore";
import { Student } from "@/types/school";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { DISTINGUISHED_ITEMS, POSITIVE_RETURN_THRESHOLD, DistinguishedRecord } from "@/utils/distinguishedBehavior";
import { GRADE_CODE_MAP } from "@/utils/gradeNames";
import { filterRegularStudents } from "@/utils/distanceLearning";
import { TrendingUp, Plus, Search, Trash2, Award, AlertCircle, Sparkles, FileText, X, Save, User, Calendar, Paperclip } from "lucide-react";

interface ExitedStudent extends Student {
  negativeCounts: { absent: number; late: number; violation: number; classNote: number };
  totalNegative: number;
  earnedPoints: number;
  recordsCount: number;
}

const NEGATIVE_TYPES = ["absent", "late", "violation", "class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];

export const ImprovementTrackTab: React.FC = () => {
  const { profile } = useAuth();
  const canManage = !!(profile?.is_principal || (profile?.role_title || "").includes("وكيل"));

  const [loading, setLoading] = useState(true);
  const [exitedStudents, setExitedStudents] = useState<ExitedStudent[]>([]);
  const [records, setRecords] = useState<DistinguishedRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<ExitedStudent | null>(null);
  const [viewRecordsFor, setViewRecordsFor] = useState<ExitedStudent | null>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    await loadStudents(true);
    // استبعاد طلاب التعليم الإلكتروني (انتساب) من مسار التحسن السلوكي
    const allStudents = filterRegularStudents(getStudentsFromDB());

    // Load all negative actions counts
    const pageSize = 1000;
    const negCounts: Record<string, { absent: number; late: number; violation: number; classNote: number }> = {};

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("student_actions")
        .select("student_id, type")
        .in("type", NEGATIVE_TYPES)
        .range(from, from + pageSize - 1);
      if (error) { console.error(error); break; }
      if (!data || data.length === 0) break;
      for (const row of data) {
        if (!negCounts[row.student_id]) negCounts[row.student_id] = { absent: 0, late: 0, violation: 0, classNote: 0 };
        if (row.type === "absent") negCounts[row.student_id].absent++;
        else if (row.type === "late") negCounts[row.student_id].late++;
        else if (row.type === "violation") negCounts[row.student_id].violation++;
        else negCounts[row.student_id].classNote++;
      }
      if (data.length < pageSize) break;
    }

    // Load distinguished behavior records
    const allRecords: DistinguishedRecord[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("distinguished_behavior_records")
        .select("*")
        .order("execution_date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) { console.error(error); break; }
      if (!data || data.length === 0) break;
      allRecords.push(...(data as DistinguishedRecord[]));
      if (data.length < pageSize) break;
    }
    setRecords(allRecords);

    const pointsByStudent: Record<string, number> = {};
    const recordsCountByStudent: Record<string, number> = {};
    for (const r of allRecords) {
      pointsByStudent[r.student_id] = (pointsByStudent[r.student_id] || 0) + (r.points || 0);
      recordsCountByStudent[r.student_id] = (recordsCountByStudent[r.student_id] || 0) + 1;
    }

    // Students who exited the positive list (have at least one negative)
    const exited: ExitedStudent[] = allStudents
      .filter((s) => negCounts[s.id] && (negCounts[s.id].absent + negCounts[s.id].late + negCounts[s.id].violation + negCounts[s.id].classNote) > 0)
      .map((s) => {
        const c = negCounts[s.id];
        return {
          ...s,
          negativeCounts: c,
          totalNegative: c.absent + c.late + c.violation + c.classNote,
          earnedPoints: pointsByStudent[s.id] || 0,
          recordsCount: recordsCountByStudent[s.id] || 0,
        };
      });

    exited.sort((a, b) => b.earnedPoints - a.earnedPoints || a.gradeCode.localeCompare(b.gradeCode) || a.section - b.section || a.name.localeCompare(b.name, "ar"));
    setExitedStudents(exited);
    setLoading(false);
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  useEffect(() => {
    const channel = supabase
      .channel("improvement-track-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "distinguished_behavior_records" }, () => refreshData())
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => refreshData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  const grades = useMemo(() => {
    const codes = [...new Set(exitedStudents.map(s => s.gradeCode))];
    return codes.map(c => ({ code: c, name: GRADE_CODE_MAP[c] || c }));
  }, [exitedStudents]);

  const filtered = useMemo(() => {
    let list = exitedStudents;
    if (selectedGrade !== "all") list = list.filter(s => s.gradeCode === selectedGrade);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(s => s.name.includes(q) || s.studentNumber.includes(q));
    }
    return list;
  }, [exitedStudents, selectedGrade, search]);

  const recoveredCount = useMemo(() => exitedStudents.filter(s => s.earnedPoints >= POSITIVE_RETURN_THRESHOLD).length, [exitedStudents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">جارٍ تحميل بيانات مسار التحسن السلوكي...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Read-only banner for non-managers */}
      {!canManage && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50 border border-border/50 text-sm text-muted-foreground">
          <AlertCircle size={16} className="text-warning shrink-0" />
          <span>وضع الاطلاع فقط — إضافة درجات السلوك المتميز محصورة بمدير المدرسة ووكيل شؤون الطلاب فقط</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border border-warning/20 bg-warning/5 p-5 text-center">
          <TrendingUp size={28} className="text-warning mx-auto mb-2" />
          <p className="text-3xl font-bold text-warning">{exitedStudents.length}</p>
          <p className="text-xs font-semibold text-warning/80 mt-1">طالب في مسار التحسن</p>
        </div>
        <div className="rounded-2xl border border-success/20 bg-success/5 p-5 text-center">
          <Award size={28} className="text-success mx-auto mb-2" />
          <p className="text-3xl font-bold text-success">{recoveredCount}</p>
          <p className="text-xs font-semibold text-success/80 mt-1">جاهز للعودة للسلوك الإيجابي</p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
          <Sparkles size={28} className="text-primary mx-auto mb-2" />
          <p className="text-3xl font-bold text-primary">{records.length}</p>
          <p className="text-xs font-semibold text-primary/80 mt-1">سجل سلوك متميز</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <FileText size={28} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-3xl font-bold text-foreground">{POSITIVE_RETURN_THRESHOLD}</p>
          <p className="text-xs font-semibold text-muted-foreground mt-1">درجة مطلوبة للعودة</p>
        </div>
      </div>

      {/* Items list */}
      <div className="mb-6 bg-card rounded-2xl border border-border/50 p-5 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-warning" />
          بنود السلوك المتميز (سجل المتابعة المعتمد 1447هـ)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-center px-3 py-2 text-muted-foreground font-semibold w-12">م</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-semibold">نوع السلوك المتميز</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-semibold w-20">الدرجة</th>
              </tr>
            </thead>
            <tbody>
              {DISTINGUISHED_ITEMS.map((it) => (
                <tr key={it.number} className="border-t border-border/30">
                  <td className="px-3 py-2 text-center font-bold text-primary">{it.number}</td>
                  <td className="px-3 py-2 text-foreground">{it.label}</td>
                  <td className="px-3 py-2 text-center font-bold text-warning">{it.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو الرقم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground"
          />
        </div>
        <select
          value={selectedGrade}
          onChange={e => setSelectedGrade(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground"
        >
          <option value="all">جميع المراحل</option>
          {grades.map(g => <option key={g.code} value={g.code}>{g.name}</option>)}
        </select>
      </div>

      {/* Students list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
          <TrendingUp size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">لا يوجد طلاب في مسار التحسن السلوكي حالياً</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          <div className="divide-y divide-border/30">
            {filtered.map((s, idx) => {
              const recovered = s.earnedPoints >= POSITIVE_RETURN_THRESHOLD;
              return (
                <div key={s.id} className={`flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors ${recovered ? "bg-success/5" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground text-sm">{s.name}</p>
                        <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{s.grade} - {s.section}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{s.studentNumber}</span>
                        {recovered && (
                          <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-bold border border-success/30">جاهز للعودة ✓</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {s.negativeCounts.absent > 0 && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">غياب: {s.negativeCounts.absent}</span>}
                        {s.negativeCounts.late > 0 && <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded">تأخر: {s.negativeCounts.late}</span>}
                        {s.negativeCounts.violation > 0 && <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded">مخالفة: {s.negativeCounts.violation}</span>}
                        {s.negativeCounts.classNote > 0 && <span className="text-[10px] bg-secondary/40 text-secondary-foreground px-1.5 py-0.5 rounded">ملاحظات صفية: {s.negativeCounts.classNote}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-center min-w-[60px]">
                      <p className={`text-lg font-bold ${recovered ? "text-success" : "text-warning"}`}>{s.earnedPoints}</p>
                      <p className="text-[10px] text-muted-foreground">درجة تحسن</p>
                    </div>
                    {s.recordsCount > 0 && (
                      <button
                        onClick={() => setViewRecordsFor(s)}
                        className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-[11px] font-semibold border border-primary/20"
                        title="عرض سجل التحسن"
                      >
                        <FileText size={13} className="inline ml-1" /> {s.recordsCount}
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => { setSelectedStudent(s); setShowAddDialog(true); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 text-[11px] font-semibold border border-success/20"
                      >
                        <Plus size={13} /> إضافة درجة
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAddDialog && selectedStudent && (
        <AddRecordDialog
          student={selectedStudent}
          onClose={() => { setShowAddDialog(false); setSelectedStudent(null); }}
          onSaved={() => { setShowAddDialog(false); setSelectedStudent(null); refreshData(); }}
        />
      )}

      {viewRecordsFor && (
        <ViewRecordsDialog
          student={viewRecordsFor}
          records={records.filter(r => r.student_id === viewRecordsFor.id)}
          canManage={canManage}
          onClose={() => setViewRecordsFor(null)}
          onDeleted={() => refreshData()}
        />
      )}
    </div>
  );
};

// ====== Add Record Dialog ======
const AddRecordDialog: React.FC<{ student: ExitedStudent; onClose: () => void; onSaved: () => void }> = ({ student, onClose, onSaved }) => {
  const { profile } = useAuth();
  const [itemNumber, setItemNumber] = useState<number>(1);
  const [description, setDescription] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [executionDate, setExecutionDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customPoints, setCustomPoints] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const selectedItem = DISTINGUISHED_ITEMS.find(i => i.number === itemNumber)!;
  const finalPoints = itemNumber === 14 ? Math.min(customPoints, 6) : selectedItem.points;

  const handleSave = async () => {
    if (!description.trim()) {
      toast({ title: "يجب كتابة وصف للسلوك المنفذ", variant: "destructive" });
      return;
    }
    if (itemNumber === 14 && (customPoints < 1 || customPoints > 6)) {
      toast({ title: "درجة بند 'أخرى' من 1 إلى 6 فقط", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("distinguished_behavior_records").insert({
      student_id: student.id,
      student_name: student.name,
      student_number: student.studentNumber,
      grade: student.grade,
      grade_code: student.gradeCode,
      section: student.section,
      item_number: itemNumber,
      item_label: selectedItem.label,
      points: finalPoints,
      description: description.trim(),
      evidence_url: evidenceUrl.trim() || null,
      evidence_note: evidenceNote.trim() || null,
      execution_date: executionDate,
      recorded_by: profile?.user_id || null,
      recorded_by_name: profile?.full_name || "",
      recorded_by_role: profile?.role_title || "",
    });
    setSaving(false);
    if (error) {
      toast({ title: "تعذّر الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم حفظ درجة السلوك المتميز ✓", description: `${finalPoints} درجة للطالب ${student.name}` });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles size={20} className="text-warning" />
              إضافة درجة سلوك متميز
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{student.name} — {student.grade} ({student.section})</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">بند السلوك المتميز *</label>
            <select value={itemNumber} onChange={e => setItemNumber(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
              {DISTINGUISHED_ITEMS.map(it => (
                <option key={it.number} value={it.number}>{it.number}. {it.label} ({it.points} درجة)</option>
              ))}
            </select>
          </div>

          {itemNumber === 14 && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">الدرجة (1-6) *</label>
              <input type="number" min={1} max={6} value={customPoints} onChange={e => setCustomPoints(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-1"><Calendar size={14} /> تاريخ التنفيذ *</label>
            <input type="date" value={executionDate} onChange={e => setExecutionDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">وصف السلوك المنفذ *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="اكتب وصفًا مفصّلاً للسلوك المتميز الذي نفّذه الطالب..." className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm resize-none" />
          </div>

          <div className="bg-warning/5 rounded-xl border border-warning/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-warning text-sm font-semibold">
              <Paperclip size={14} /> الشواهد على تنفيذ السلوك
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">رابط الشاهد (صورة، ملف، فيديو...)</label>
              <input type="url" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">ملاحظة على الشاهد</label>
              <textarea value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} rows={2} placeholder="مثال: صورة الشهادة محفوظة في ملف الطالب، شهادة المشاركة من النشاط..." className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
            </div>
          </div>

          <div className="bg-primary/5 rounded-xl border border-primary/20 p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">الدرجة المضافة:</span>
            <span className="text-2xl font-bold text-primary">{finalPoints}</span>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
            <User size={12} className="inline ml-1" /> الراصد: <strong>{profile?.full_name}</strong> ({profile?.role_title})
          </div>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">إلغاء</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            <Save size={14} /> {saving ? "جارٍ الحفظ..." : "حفظ السجل"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ====== View Records Dialog ======
const ViewRecordsDialog: React.FC<{ student: ExitedStudent; records: DistinguishedRecord[]; canManage: boolean; onClose: () => void; onDeleted: () => void }> = ({ student, records, canManage, onClose, onDeleted }) => {
  const { profile } = useAuth();
  const isPrincipal = !!profile?.is_principal;

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذا السجل نهائياً؟")) return;
    const { error } = await supabase.from("distinguished_behavior_records").delete().eq("id", id);
    if (error) { toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم الحذف ✓" });
    onDeleted();
  };

  const total = records.reduce((s, r) => s + (r.points || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-border" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              سجل التحسن السلوكي
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{student.name} — مجموع درجات التحسن: <strong className="text-success">{total}</strong></p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-3">
          {records.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">لا توجد سجلات</p>
          ) : records.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">بند {r.item_number}</span>
                    <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full font-bold">+{r.points} درجة</span>
                    <span className="text-xs text-muted-foreground"><Calendar size={11} className="inline ml-1" />{r.execution_date}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{r.item_label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>
                  {(r.evidence_url || r.evidence_note) && (
                    <div className="mt-2 p-2 rounded-lg bg-warning/5 border border-warning/20">
                      <div className="text-[10px] font-bold text-warning mb-1 flex items-center gap-1"><Paperclip size={10} /> الشواهد</div>
                      {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all block">{r.evidence_url}</a>}
                      {r.evidence_note && <p className="text-xs text-muted-foreground mt-1">{r.evidence_note}</p>}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2"><User size={10} className="inline ml-1" />راصد السلوك: {r.recorded_by_name} ({r.recorded_by_role})</p>
                </div>
                {isPrincipal && (
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10" title="حذف">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImprovementTrackTab;
