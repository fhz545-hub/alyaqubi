import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, FileText, Printer, Search, Loader2, Archive, ChevronLeft } from "lucide-react";
import { listHaduriMonths, listDailyForTeacher, type HaduriMonthRow } from "@/utils/haduriArchiveApi";
import { isExcludedTeacher } from "@/components/teachers/MonthlyAttendance";
import { buildMonthlyPrintHTML } from "@/utils/teacherMonthlyPrint";
import { toast } from "sonner";

/**
 * متصفح أرشيف كشف الحضور والانصراف لجميع الأشهر السابقة.
 * يقرأ من جدول haduri_monthly_attendance ويسمح بالاطلاع وطباعة تقرير لكل معلم.
 */
export default function MonthlyArchiveBrowser() {
  const [rows, setRows] = useState<HaduriMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await listHaduriMonths();
        setRows((data || []).filter((r) => !isExcludedTeacher(r.teacher_civil_id, r.teacher_name)));
      } catch (e: any) {
        toast.error("تعذّر تحميل الأرشيف: " + (e?.message || "خطأ"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group by month_key
  const months = useMemo(() => {
    const map = new Map<string, { key: string; label: string; teachers: HaduriMonthRow[]; updated: string }>();
    for (const r of rows) {
      const m = map.get(r.month_key);
      if (!m) {
        map.set(r.month_key, { key: r.month_key, label: r.month_label || r.month_key, teachers: [r], updated: r.created_at });
      } else {
        m.teachers.push(r);
        if (r.created_at > m.updated) m.updated = r.created_at;
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [rows]);

  const filteredMonths = useMemo(() => {
    if (!search.trim()) return months;
    const q = search.trim();
    return months.filter((m) => m.label.includes(q) || m.key.includes(q));
  }, [months, search]);

  const selectedMonth = useMemo(
    () => months.find((m) => m.key === selectedKey) || null,
    [months, selectedKey],
  );

  const filteredTeachers = useMemo(() => {
    if (!selectedMonth) return [];
    const list = [...selectedMonth.teachers].sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, "ar"));
    if (!search.trim()) return list;
    const q = search.trim();
    return list.filter((t) => t.teacher_name.includes(q) || (t.teacher_civil_id || "").includes(q));
  }, [selectedMonth, search]);

  const handlePrintTeacher = async (row: HaduriMonthRow) => {
    if (!selectedMonth) return;
    try {
      // اسحب السجل اليومي الفعلي للمعلم في هذا الشهر حتى لا يظهر الكشف فارغاً
      let daily: any[] = [];
      if (row.teacher_civil_id) {
        try {
          const rows = await listDailyForTeacher(row.teacher_civil_id, row.month_key);
          daily = [...rows].sort((a, b) => (a.greg_date || "").localeCompare(b.greg_date || ""));
        } catch (err: any) {
          console.warn("daily fetch failed for print:", err?.message);
        }
      }
      const html = buildMonthlyPrintHTML({
        teacher: {
          name: row.teacher_name,
          civil_id: row.teacher_civil_id || "—",
          phone: row.teacher_phone || "",
          specialization: row.specialization || "",
        },
        monthLabel: selectedMonth.label,
        totals: {
          work_min: row.work_min || 0,
          late_min: row.late_min || 0,
          excuse_min: row.excuse_min || 0,
          absent_days: row.absent_days || 0,
          open_days: row.open_days || 0,
          present_days: row.present_days || 0,
          total_days: row.total_days || 0,
        },
        daily,
        excuses: [],
      });
      const w = window.open("", "_blank");
      if (!w) return toast.error("تعذّر فتح نافذة الطباعة");
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 400);
    } catch (e: any) {
      toast.error("تعذّرت الطباعة: " + (e?.message || "خطأ"));
    }
  };

  const handlePrintAll = async () => {
    if (!selectedMonth || !filteredTeachers.length) return;
    toast.info(`جارٍ تجهيز ${filteredTeachers.length} تقرير...`);
    for (let i = 0; i < filteredTeachers.length; i++) {
      // تسلسلياً مع تأخير بسيط حتى لا يحجب المتصفح النوافذ
      // eslint-disable-next-line no-await-in-loop
      await handlePrintTeacher(filteredTeachers[i]);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16 text-muted-foreground" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-3">جارٍ تحميل أرشيف الأشهر...</p>
      </div>
    );
  }

  if (!months.length) {
    return (
      <Card className="p-10 text-center" dir="rtl">
        <Archive className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
        <h3 className="text-base font-bold text-foreground">لا يوجد أرشيف بعد</h3>
        <p className="text-sm text-muted-foreground mt-1">سيظهر هنا أرشيف الأشهر تلقائياً عند استيراد ملفات الكشف الشهري.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Search + breadcrumb */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedMonth && (
          <Button variant="outline" size="sm" onClick={() => setSelectedKey(null)} className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> العودة لقائمة الأشهر
          </Button>
        )}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={selectedMonth ? "بحث باسم المعلم أو الهوية..." : "بحث في الأشهر..."}
            className="pr-9"
          />
        </div>
        {selectedMonth && filteredTeachers.length > 0 && (
          <Button size="sm" onClick={handlePrintAll} className="gap-1.5">
            <Printer className="w-4 h-4" /> طباعة كل المعلمين ({filteredTeachers.length})
          </Button>
        )}
      </div>

      {!selectedMonth ? (
        // Months grid
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMonths.map((m) => (
            <button
              key={m.key}
              onClick={() => setSelectedKey(m.key)}
              className="group text-right rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <Badge variant="secondary" className="text-[10px]">{m.teachers.length} معلم</Badge>
              </div>
              <h4 className="text-sm font-extrabold text-foreground leading-tight">{m.label}</h4>
              <p className="text-[11px] text-muted-foreground mt-1">المفتاح: {m.key}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-2">آخر تحديث: {new Date(m.updated).toLocaleString("ar")}</p>
            </button>
          ))}
          {filteredMonths.length === 0 && (
            <div className="col-span-full text-center py-8 text-sm text-muted-foreground">لا توجد نتائج للبحث.</div>
          )}
        </div>
      ) : (
        // Teachers list for selected month
        <Card className="overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{selectedMonth.label}</h3>
              <Badge variant="outline" className="text-[10px]">{filteredTeachers.length} معلم</Badge>
            </div>
          </div>
          <div className="divide-y">
            {filteredTeachers.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/20">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{t.teacher_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {t.specialization || "—"} · هوية {t.teacher_civil_id || "—"}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-[11px]">
                  <span className="text-muted-foreground">حضور: <b className="text-foreground">{t.present_days}</b></span>
                  <span className="text-amber-600">تأخر: <b>{Math.round(t.late_min)}د</b></span>
                  <span className="text-blue-600">استئذان: <b>{Math.round(t.excuse_min)}د</b></span>
                  <span className="text-destructive">غياب: <b>{t.absent_days}</b></span>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => handlePrintTeacher(t)}>
                  <Printer className="w-3.5 h-3.5" /> طباعة
                </Button>
              </div>
            ))}
            {filteredTeachers.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">لا يوجد معلمون مطابقون للبحث.</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}