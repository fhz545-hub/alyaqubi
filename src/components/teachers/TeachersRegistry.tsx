import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Search, Upload, Users } from "lucide-react";
import {
  listTeachers, upsertTeacher, deleteTeacher, bulkInsertTeachers, type Teacher, type TeacherInput,
} from "@/utils/teachersApi";
import { logAudit } from "@/utils/auditLog";
import { useAuth } from "@/contexts/AuthContext";

const empty: TeacherInput = {
  full_name: "", civil_id: "", phone: "", specialization: "",
  rank_title: "", job_number: "", current_job: "معلم",
};

export default function TeachersRegistry() {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const [list, setList] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<TeacherInput>(empty);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setList(await listTeachers());
    } catch (err: any) {
      toast.error("تعذّر تحميل سجل المعلمين: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return list;
    return list.filter((t) =>
      t.full_name.includes(q) ||
      t.civil_id.includes(q) ||
      t.phone.includes(q) ||
      t.specialization.includes(q)
    );
  }, [list, search]);

  const openNew = () => {
    if (!isPrincipal) return toast.error("إضافة المعلمين متاحة لمدير المدرسة فقط");
    setEditing(null);
    setForm(empty);
    setDlgOpen(true);
  };

  const openEdit = (t: Teacher) => {
    if (!isPrincipal) return toast.error("تعديل سجل المعلمين متاح لمدير المدرسة فقط");
    setEditing(t);
    setForm({
      full_name: t.full_name, civil_id: t.civil_id, phone: t.phone,
      specialization: t.specialization, rank_title: t.rank_title,
      job_number: t.job_number, current_job: t.current_job,
    });
    setDlgOpen(true);
  };

  const save = async () => {
    if (!isPrincipal) return toast.error("حفظ سجل المعلمين متاح لمدير المدرسة فقط");
    if (!form.full_name.trim()) return toast.error("الاسم مطلوب");
    if (!/^\d{10}$/.test(form.civil_id.replace(/\D/g, "")))
      return toast.error("السجل المدني يجب أن يكون 10 أرقام");
    setSaving(true);
    try {
      const cleanPhone = form.phone.replace(/\D/g, "").replace(/^966/, "").replace(/^0/, "");
      const phone = cleanPhone && cleanPhone.length === 9 && cleanPhone.startsWith("5") ? "966" + cleanPhone : "";
      const payload: TeacherInput = { ...form, phone, civil_id: form.civil_id.replace(/\D/g, "") };
      const result = await upsertTeacher(payload, editing?.id);
      toast.success(editing ? "تم تحديث بيانات المعلم" : "تم إضافة معلم جديد");
      logAudit(
        {
          action: editing ? "update" : "create",
          section: "teacher_affairs",
          entity_type: "teacher",
          entity_id: result.id,
          details: { name: result.full_name, civil_id: result.civil_id },
        },
        { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title }
      );
      setDlgOpen(false);
      refresh();
    } catch (err: any) {
      toast.error("تعذّر الحفظ: " + (err.message || "خطأ غير معروف"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Teacher) => {
    if (!isPrincipal) {
      return toast.error("حذف سجل المعلمين متاح لمدير المدرسة فقط");
    }
    if (!confirm(`هل تريد حذف المعلم: ${t.full_name}؟`)) return;
    try {
      await deleteTeacher(t.id);
      toast.success("تم حذف المعلم");
      logAudit(
        {
          action: "delete", section: "teacher_affairs",
          entity_type: "teacher", entity_id: t.id,
          details: { name: t.full_name },
        },
        { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title }
      );
      refresh();
    } catch (err: any) {
      toast.error("تعذّر الحذف: " + err.message);
    }
  };

  const importCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      // Detect headers
      const first = lines[0].split(/[,;\t]/).map((s) => s.trim());
      const isHeader = first.some((c) => /اسم|name|الهوية|civil/i.test(c));
      const dataLines = isHeader ? lines.slice(1) : lines;
      const items: TeacherInput[] = [];
      for (const ln of dataLines) {
        const cols = ln.split(/[,;\t]/).map((s) => s.trim().replace(/^"|"$/g, ""));
        if (cols.length < 2) continue;
        const civilDigits = (cols[1] || "").replace(/\D/g, "");
        if (!civilDigits || civilDigits.length !== 10) continue;
        const phoneDigits = (cols[2] || "").replace(/\D/g, "").replace(/^966/, "").replace(/^0/, "");
        items.push({
          full_name: cols[0] || "—",
          civil_id: civilDigits,
          phone: phoneDigits.length === 9 && phoneDigits.startsWith("5") ? "966" + phoneDigits : "",
          specialization: cols[3] || "",
          rank_title: cols[4] || "",
          job_number: cols[5] || "",
          current_job: cols[6] || "معلم",
        });
      }
      if (!items.length) return toast.error("لا توجد بيانات صالحة في الملف");
      const n = await bulkInsertTeachers(items);
      toast.success(`تم استيراد ${n} معلم`);
      logAudit(
        {
          action: "import", section: "teacher_affairs",
          entity_type: "teachers_csv", entity_id: file.name,
          details: { count: n },
        },
        { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title }
      );
      refresh();
    } catch (err: any) {
      toast.error("تعذّر الاستيراد: " + err.message);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الهوية أو الجوال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        {isPrincipal && (
          <>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 ml-1" />
              إضافة معلم
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".csv,.txt" onChange={importCSV} className="hidden" />
              <Button variant="outline" type="button" asChild>
                <span>
                  <Upload className="w-4 h-4 ml-1" />
                  استيراد CSV
                </span>
              </Button>
            </label>
          </>
        )}
        {!isPrincipal && (
          <span className="text-xs text-muted-foreground border rounded-md px-2 py-1">
            الإضافة والتعديل والحذف لمدير المدرسة فقط
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 text-right font-bold">#</th>
                <th className="p-3 text-right font-bold">الاسم</th>
                <th className="p-3 text-right font-bold">السجل المدني</th>
                <th className="p-3 text-right font-bold">الجوال</th>
                <th className="p-3 text-right font-bold">التخصص</th>
                <th className="p-3 text-right font-bold">المرتبة</th>
                <th className="p-3 text-right font-bold">العمل الحالي</th>
                <th className="p-3 text-center font-bold w-24">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    لا يوجد معلمون مسجلون. ابدأ بإضافة معلم أو استيراد ملف CSV.
                  </td>
                </tr>
              )}
              {filtered.map((t, i) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-semibold">{t.full_name}</td>
                  <td className="p-3 font-mono text-xs">{t.civil_id}</td>
                  <td className="p-3 font-mono text-xs">{t.phone || "—"}</td>
                  <td className="p-3">{t.specialization || "—"}</td>
                  <td className="p-3">{t.rank_title || "—"}</td>
                  <td className="p-3">{t.current_job || "—"}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {isPrincipal && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="تعديل">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(t)} title="حذف (مدير المدرسة)">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل بيانات معلم" : "إضافة معلم جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>الاسم الرباعي</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>السجل المدني</Label>
              <Input
                value={form.civil_id}
                onChange={(e) => setForm({ ...form, civil_id: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div>
              <Label>الجوال (9 أرقام)</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel"
                placeholder="5XXXXXXXX"
              />
            </div>
            <div>
              <Label>التخصص</Label>
              <Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            </div>
            <div>
              <Label>المرتبة</Label>
              <Input value={form.rank_title} onChange={(e) => setForm({ ...form, rank_title: e.target.value })} />
            </div>
            <div>
              <Label>رقم الوظيفة</Label>
              <Input value={form.job_number} onChange={(e) => setForm({ ...form, job_number: e.target.value })} />
            </div>
            <div>
              <Label>العمل الحالي</Label>
              <Input value={form.current_job} onChange={(e) => setForm({ ...form, current_job: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}