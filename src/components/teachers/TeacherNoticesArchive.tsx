import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Printer, MessageCircle, Trash2, Eye, Archive } from "lucide-react";
import { listNotices, listTeachers, deleteNotice, type TeacherNotice, type Teacher } from "@/utils/teachersApi";
import TeacherNoticePrint from "./TeacherNoticePrint";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/utils/auditLog";

const KIND_LABEL: Record<string, string> = {
  late: "تأخر",
  absent: "عدم تواجد",
  gaib: "مساءلة غياب",
  note: "لفت نظر",
};

const KIND_COLOR: Record<string, string> = {
  late: "bg-amber-100 text-amber-800 border-amber-200",
  absent: "bg-red-100 text-red-800 border-red-200",
  gaib: "bg-rose-100 text-rose-800 border-rose-200",
  note: "bg-blue-100 text-blue-800 border-blue-200",
};

export default function TeacherNoticesArchive() {
  const { profile } = useAuth();
  const [notices, setNotices] = useState<TeacherNotice[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [previewing, setPreviewing] = useState<TeacherNotice | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [n, t] = await Promise.all([listNotices(), listTeachers()]);
      setNotices(n);
      setTeachers(t);
    } catch (e: any) {
      toast.error("تعذّر تحميل الأرشيف: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    let list = notices;
    if (kindFilter !== "all") list = list.filter((n) => n.notice_kind === kindFilter);
    const q = search.trim();
    if (q) {
      list = list.filter((n) =>
        n.teacher_name.includes(q) ||
        n.teacher_civil_id.includes(q) ||
        n.greg_date.includes(q) ||
        n.hijri_date.includes(q)
      );
    }
    return list;
  }, [notices, search, kindFilter]);

  const teacherById = useMemo(() => {
    const map = new Map<string, Teacher>();
    teachers.forEach((t) => map.set(t.id, t));
    return map;
  }, [teachers]);

  const buildTeacherFor = (n: TeacherNotice): Teacher => {
    const t = (n.teacher_id && teacherById.get(n.teacher_id)) || null;
    if (t) return t;
    return {
      id: n.teacher_id || "—",
      full_name: n.teacher_name,
      civil_id: n.teacher_civil_id,
      phone: n.teacher_phone,
      specialization: "",
      rank_title: "",
      job_number: "",
      current_job: "",
      active: true,
      created_at: n.created_at,
      updated_at: n.created_at,
    };
  };

  const reprint = (n: TeacherNotice) => {
    setPreviewing(n);
    setTimeout(() => window.print(), 300);
  };

  const resend = (n: TeacherNotice) => {
    const kindLabel = KIND_LABEL[n.notice_kind] || "إشعار";
    let details = "";
    if (n.notice_kind === "late") {
      details = `تأخّر وحضوركم الساعة: ${n.late_in_time} (إجمالي ${n.late_total_min} دقيقة).`;
    } else if (n.notice_kind === "absent") {
      details = `عدم تواجد من ${n.abs_from_time} إلى ${n.abs_to_time} (مدة ${n.abs_total_min} دقيقة).`;
    } else if (n.notice_kind === "gaib") {
      details = `تم تسجيل مساءلة غياب لليوم الموضّح.`;
    } else if (n.notice_kind === "note") {
      details = `لفت نظر بسبب: ${n.note_reason}`;
    }
    const msg = `السلام عليكم
${kindLabel}
الاسم: ${n.teacher_name}
اليوم: ${n.day_name}
التاريخ (هـ): ${n.hijri_date}
${details}
*نظام الشؤون الإدارية والمتابعة*`;
    const phone = (n.teacher_phone || "").replace(/\D/g, "") || "966500000000";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const remove = async (n: TeacherNotice) => {
    if (!confirm(`حذف هذا الإشعار نهائيًا؟ (${KIND_LABEL[n.notice_kind]} — ${n.teacher_name})`)) return;
    try {
      await deleteNotice(n.id);
      toast.success("تم حذف الإشعار");
      logAudit(
        { action: "delete", section: "teacher_affairs", entity_type: "teacher_notice", entity_id: n.id,
          details: { kind: n.notice_kind, teacher: n.teacher_name } },
        { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title }
      );
      refresh();
    } catch (e: any) {
      toast.error("تعذّر الحذف: " + e.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الهوية أو التاريخ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="late">تأخر</SelectItem>
            <SelectItem value="absent">عدم تواجد</SelectItem>
            <SelectItem value="gaib">مساءلة غياب</SelectItem>
            <SelectItem value="note">لفت نظر</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-sm">
          {filtered.length} من {notices.length}
        </Badge>
      </div>

      <div className="teacher-table-wrap print:hidden">
        <div className="overflow-x-auto">
          <table className="teacher-table">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col />
              <col style={{ width: 170 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="text-center">#</th>
                <th>المعلم</th>
                <th>النوع</th>
                <th>التاريخ الهجري</th>
                <th>اليوم</th>
                <th>تفاصيل</th>
                <th className="text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Archive className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    لا توجد خطابات في الأرشيف بعد.
                  </td>
                </tr>
              )}
              {filtered.map((n, i) => (
                <tr key={n.id}>
                  <td className="col-num">{i + 1}</td>
                  <td>
                    <div className="font-bold leading-tight">{n.teacher_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{n.teacher_civil_id}</div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold ${KIND_COLOR[n.notice_kind] || "bg-muted"}`}>
                      {KIND_LABEL[n.notice_kind] || n.notice_kind}
                      <span className="opacity-70">#{n.serial_number}</span>
                    </span>
                  </td>
                  <td className="text-xs font-mono whitespace-nowrap" dir="ltr">{n.hijri_date}</td>
                  <td className="text-xs whitespace-nowrap">{n.day_name}</td>
                  <td className="text-xs text-muted-foreground">
                    <div className="line-clamp-2">
                      {n.notice_kind === "late" && `حضور ${n.late_in_time} (${n.late_total_min}د)`}
                      {n.notice_kind === "absent" && `${n.abs_from_time} → ${n.abs_to_time} (${n.abs_total_min}د)`}
                      {n.notice_kind === "gaib" && "غياب يوم كامل"}
                      {n.notice_kind === "note" && n.note_reason}
                    </div>
                  </td>
                  <td className="col-actions">
                    <div className="flex gap-1 justify-center">
                      <Button size="icon" variant="ghost" title="عرض / إعادة طباعة" onClick={() => setPreviewing(n)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="إعادة طباعة" onClick={() => reprint(n)}>
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="إعادة إرسال واتساب" onClick={() => resend(n)}>
                        <MessageCircle className="w-4 h-4 text-[#25D366]" />
                      </Button>
                      <Button size="icon" variant="ghost" title="حذف" onClick={() => remove(n)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent dir="rtl" className="max-w-4xl max-h-[92vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center justify-between">
              <span>معاينة الخطاب — {previewing && KIND_LABEL[previewing.notice_kind]}</span>
              <Button size="sm" onClick={() => window.print()} className="ml-4">
                <Printer className="w-4 h-4 ml-1" /> طباعة
              </Button>
            </DialogTitle>
          </DialogHeader>
          {previewing && (
            <TeacherNoticePrint
              data={previewing}
              teacher={buildTeacherFor(previewing)}
              principalName={profile?.full_name || "مدير المدرسة"}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}