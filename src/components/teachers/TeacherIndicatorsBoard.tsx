import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, XCircle, AlertTriangle, FileWarning, Loader2, Database, Users, FileText, Folder, Printer, Sparkles, BarChart3, Calendar } from "lucide-react";
import { listHaduriMonths, type HaduriMonthRow } from "@/utils/haduriArchiveApi";
import { minutesToHHMM } from "@/utils/teacherAttendanceParser";
import { supabase } from "@/integrations/supabase/client";
import { isExcludedTeacher } from "./MonthlyAttendance";
import { printPerformanceReport, type MonthlySlice } from "@/utils/teacherPerformanceReport";

type Aggregate = {
  teacher_name: string;
  teacher_civil_id: string;
  teacher_phone?: string;
  specialization?: string;
  late_min: number;
  absent_days: number;
  open_days: number;
  excuse_min: number;
  excuse_periods: Record<string, number>;
  months: number;
};

type DailyIndicatorRow = {
  month_key: string;
  month_label: string;
  teacher_name: string;
  teacher_civil_id: string;
  work_min: number;
  late_min: number;
  excuse_min: number;
  excuse_period: string;
  status: string;
};

export default function TeacherIndicatorsBoard() {
  const [rows, setRows] = useState<HaduriMonthRow[]>([]);
  const [dailyRows, setDailyRows] = useState<DailyIndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  // الافتراضي: آخر شهر مستورد. يضبط بعد التحميل عبر useEffect.
  const [scope, setScope] = useState<string>("");
  // وضع التحليل: month = شهر محدد، comprehensive = جميع الأشهر
  const [mode, setMode] = useState<"month" | "comprehensive">("month");
  const [teacherCount, setTeacherCount] = useState<number>(0);
  const [noticesCount, setNoticesCount] = useState<number>(0);
  const [legacyCount, setLegacyCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [haduri, daily, tCount, nCount, lCount] = await Promise.all([
          listHaduriMonths(),
          supabase
            .from("haduri_daily_records")
            .select("month_key,month_label,teacher_name,teacher_civil_id,work_min,late_min,excuse_min,excuse_period,status")
            .range(0, 9999),
          supabase.from("teachers").select("*", { count: "exact", head: true }).eq("active", true),
          supabase.from("teacher_notices").select("*", { count: "exact", head: true }),
          supabase.from("teacher_legacy_archive").select("*", { count: "exact", head: true }),
        ]);
        // استبعاد المعلمين المنقولين من جميع البيانات
        const haduriClean = haduri.filter((h) => !isExcludedTeacher(h.teacher_civil_id, h.teacher_name));
        setRows(haduriClean);
        if (daily.error) throw daily.error;
        const dailyClean = ((daily.data || []) as any[]).filter(
          (d) => !isExcludedTeacher(d.teacher_civil_id, d.teacher_name),
        );
        setDailyRows(dailyClean as any);
        setTeacherCount(tCount.count || 0);
        setNoticesCount(nCount.count || 0);
        setLegacyCount(lCount.count || 0);
        // الافتراضي: الشهر الحالي تقويمياً إن كان مؤرشفاً، وإلا أحدث شهر مستورد.
        const monthKeys = Array.from(new Set([
          ...haduriClean.map((r) => r.month_key),
          ...dailyClean.map((r: any) => r.month_key),
        ])).filter(Boolean).sort((a, b) => b.localeCompare(a));
        if (monthKeys.length) {
          const today = new Date();
          const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
          setScope(monthKeys.includes(currentKey) ? currentKey : monthKeys[0]);
        }
      } catch {
        // silently
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const months = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.month_key, r.month_label || r.month_key));
    dailyRows.forEach((r) => set.set(r.month_key, r.month_label || r.month_key));
    return Array.from(set.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows, dailyRows]);

  // عند الوضع الشامل نعتمد كل الأشهر، وإلا الشهر المحدد فقط.
  const effectiveScope = mode === "comprehensive" ? "all" : scope;
  const filtered = useMemo(() => {
    if (effectiveScope === "all" || !effectiveScope) return rows;
    return rows.filter((r) => r.month_key === effectiveScope);
  }, [rows, effectiveScope]);

  const aggregates = useMemo<Aggregate[]>(() => {
    const map = new Map<string, Aggregate>();
    const dailyFiltered = (effectiveScope === "all" || !effectiveScope)
      ? dailyRows
      : dailyRows.filter((r) => r.month_key === effectiveScope);
    const monthSetByTeacher = new Map<string, Set<string>>();
    for (const r of dailyFiltered) {
      const key = r.teacher_civil_id || r.teacher_name;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          teacher_name: r.teacher_name,
          teacher_civil_id: r.teacher_civil_id || "",
          teacher_phone: "",
          specialization: "",
          late_min: 0,
          absent_days: 0,
          open_days: 0,
          excuse_min: 0,
          excuse_periods: {},
          months: 0,
        });
      }
      const prev = map.get(key)!;
      if ((r.late_min || 0) > 0) prev.late_min += r.late_min || 0;
      if ((r.excuse_min || 0) > 0) prev.excuse_min += r.excuse_min || 0;
      if ((r.excuse_min || 0) > 0) {
        const period = r.excuse_period || "وسط الدوام";
        prev.excuse_periods[period] = (prev.excuse_periods[period] || 0) + (r.excuse_min || 0);
      }
      if (r.status === "غياب") prev.absent_days += 1;
      if (r.status === "لم يُغلق" && (r.work_min || 0) > 0) prev.open_days += 1;
      const set = monthSetByTeacher.get(key) || new Set<string>();
      set.add(r.month_key);
      monthSetByTeacher.set(key, set);
    }
    map.forEach((a, key) => { a.months = monthSetByTeacher.get(key)?.size || 0; });
    // أشهر تمت تغطيتها بالسجلات اليومية (لتجنب الازدواجية مع الملخّص الشهري)
    const dailyMonthsByTeacher = new Map<string, Set<string>>();
    monthSetByTeacher.forEach((s, k) => dailyMonthsByTeacher.set(k, new Set(s)));

    // ندمج دائمًا الملخّصات الشهرية المؤرشفة للأشهر التي لا تملك سجلات يومية،
    // وذلك لضمان أن «التحليل الشامل» يشمل جميع الأشهر المؤرشفة فعليًا.
    for (const r of filtered) {
      const key = r.teacher_civil_id || r.teacher_name;
      if (!key) continue;
      const covered = dailyMonthsByTeacher.get(key);
      if (covered && covered.has(r.month_key)) continue; // محسوبة عبر اليومي
      if (!map.has(key)) {
        map.set(key, {
          teacher_name: r.teacher_name,
          teacher_civil_id: r.teacher_civil_id || "",
          teacher_phone: r.teacher_phone || "",
          specialization: r.specialization || "",
          late_min: 0,
          absent_days: 0,
          open_days: 0,
          excuse_min: 0,
          excuse_periods: {},
          months: 0,
        });
      }
      const prev = map.get(key)!;
      prev.late_min += r.late_min || 0;
      prev.absent_days += r.absent_days || 0;
      prev.open_days += r.open_days || 0;
      prev.excuse_min += r.excuse_min || 0;
      const set = monthSetByTeacher.get(key) || new Set<string>();
      set.add(r.month_key);
      monthSetByTeacher.set(key, set);
    }
    map.forEach((a, key) => { a.months = monthSetByTeacher.get(key)?.size || 0; });
    return Array.from(map.values());
  }, [filtered, dailyRows, effectiveScope]);

  const topLate = useMemo(
    () => [...aggregates].filter((a) => a.late_min > 0).sort((a, b) => b.late_min - a.late_min).slice(0, 5),
    [aggregates],
  );
  const topAbsent = useMemo(
    () => [...aggregates].filter((a) => a.absent_days > 0).sort((a, b) => b.absent_days - a.absent_days).slice(0, 5),
    [aggregates],
  );
  const topOpen = useMemo(
    () => [...aggregates].filter((a) => a.open_days > 0).sort((a, b) => b.open_days - a.open_days).slice(0, 5),
    [aggregates],
  );
  const topExcuse = useMemo(
    () => [...aggregates].filter((a) => a.excuse_min > 0).sort((a, b) => b.excuse_min - a.excuse_min).slice(0, 5),
    [aggregates],
  );

  // قائمة المعلمين المتاحين للتقرير الشامل (بحسب الأرشيف)
  const allTeachersForReport = useMemo(() => {
    const map = new Map<string, { name: string; civil_id: string; phone?: string; specialization?: string }>();
    rows.forEach((r) => {
      const key = r.teacher_civil_id || r.teacher_name;
      if (!key) return;
      if (!map.has(key)) map.set(key, { name: r.teacher_name, civil_id: r.teacher_civil_id, phone: r.teacher_phone, specialization: r.specialization });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [rows]);

  /** يطبع تقرير الأداء التراكمي لمعلم محدد عبر جميع الأشهر. */
  function handlePrintTeacher(civil_id: string, name: string) {
    const teacherMonths: MonthlySlice[] = rows
      .filter((r) => (r.teacher_civil_id || r.teacher_name) === (civil_id || name))
      .map((r) => ({
        month_key: r.month_key,
        month_label: r.month_label,
        late_min: r.late_min || 0,
        excuse_min: r.excuse_min || 0,
        absent_days: r.absent_days || 0,
        open_days: r.open_days || 0,
        present_days: r.present_days || 0,
        total_days: r.total_days || 0,
      }));
    const teacherInfo = rows.find((r) => (r.teacher_civil_id || r.teacher_name) === (civil_id || name));
    printPerformanceReport({
      teacher: {
        name: teacherInfo?.teacher_name || name,
        civil_id: teacherInfo?.teacher_civil_id || civil_id,
        phone: teacherInfo?.teacher_phone,
        specialization: teacherInfo?.specialization,
      },
      schoolName: "ثانوية اليعقوبي - مسارات",
      months: teacherMonths,
    });
  }

  if (loading) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline ml-2" />
        جارٍ تحميل المؤشرات...
      </Card>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* بطاقات إحصائية شاملة من قاعدة البيانات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          title="إجمالي المعلمين"
          value={teacherCount}
          icon={<Users className="w-5 h-5" />}
          tone="primary"
          hint="مسجلون في القاعدة"
        />
        <SummaryCard
          title="الخطابات الرسمية"
          value={noticesCount}
          icon={<FileText className="w-5 h-5" />}
          tone="warning"
          hint="مؤرشفة بالكامل"
        />
        <SummaryCard
          title="الإجراءات الإدارية"
          value={legacyCount}
          icon={<Folder className="w-5 h-5" />}
          tone="success"
          hint="من الشؤون الإدارية"
        />
        <SummaryCard
          title="أشهر حضوري"
          value={months.length}
          icon={<Database className="w-5 h-5" />}
          tone="danger"
          hint={`${rows.length} سجل مؤرشف`}
        />
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="font-semibold text-foreground">لا توجد بيانات حضوري مؤرشفة بعد.</p>
          <p className="text-sm text-muted-foreground mt-1">
            ارفع ملفات أو مجلد شهر في تبويب «كشف حضوري شهري» وستظهر مؤشرات الأداء تلقائيًا.
          </p>
        </Card>
      ) : (
      <>
      {/* شريط التحكم: وضع التحليل + اختيار الشهر */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-1">
          <Database className="w-3.5 h-3.5" /> {rows.length} سجل · {months.length} شهر مؤرشف
        </Badge>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setMode("month")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${
              mode === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> حسب الشهر
          </button>
          <button
            onClick={() => setMode("comprehensive")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${
              mode === "comprehensive"
                ? "bg-gradient-to-bl from-purple-500 to-indigo-600 shadow text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> تحليل شامل
          </button>
        </div>
        {mode === "month" && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">الشهر:</span>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="اختر شهراً" />
              </SelectTrigger>
              <SelectContent>
                {months.map(([k, lbl], idx) => (
                  <SelectItem key={k} value={k}>
                    {lbl} {idx === 0 && <span className="text-[10px] text-emerald-600 mr-1">(الأحدث)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {mode === "comprehensive" && (
          <div className="mr-auto flex items-center gap-2 text-xs">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-indigo-700 dark:text-indigo-400">
              تحليل تراكمي عبر {months.length} شهر مؤرشف
            </span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <IndicatorCard
          title="الأكثر تأخرًا"
          icon={<Clock className="w-4 h-4" />}
          tone="warning"
          unit="دقيقة"
          rows={topLate.map((a) => ({
            name: a.teacher_name,
            sub: a.teacher_civil_id,
            value: minutesToHHMM(a.late_min),
            badge: `${a.months} شهر`,
          }))}
        />
        <IndicatorCard
          title="الأكثر غيابًا"
          icon={<XCircle className="w-4 h-4" />}
          tone="danger"
          unit="يوم"
          rows={topAbsent.map((a) => ({
            name: a.teacher_name,
            sub: a.teacher_civil_id,
            value: `${a.absent_days} يوم`,
            badge: `${a.months} شهر`,
          }))}
        />
        <IndicatorCard
          title="الأكثر عدمًا لتسجيل الانصراف"
          icon={<FileWarning className="w-4 h-4" />}
          tone="primary"
          unit="يوم"
          rows={topOpen.map((a) => ({
            name: a.teacher_name,
            sub: a.teacher_civil_id,
            value: `${a.open_days} يوم`,
            badge: `${a.months} شهر`,
          }))}
        />
        <IndicatorCard
          title="الأكثر استئذانًا"
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="success"
          unit="دقيقة"
          rows={topExcuse.map((a) => ({
            name: a.teacher_name,
            sub: a.teacher_civil_id,
            value: minutesToHHMM(a.excuse_min),
            badge: Object.keys(a.excuse_periods).length
              ? Object.entries(a.excuse_periods).sort((x, y) => y[1] - x[1])[0][0]
              : `${a.months} شهر`,
          }))}
        />
      </div>

      {/* قسم التقارير التربوية الفردية - يظهر دائماً عند توفر بيانات مؤرشفة */}
      {allTeachersForReport.length > 0 && (
        <Card className="p-4 bg-gradient-to-bl from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-200">
                  تقارير الأداء التربوية الفردية
                </h3>
                <p className="text-[11px] text-indigo-700/70 dark:text-indigo-400/70">
                  تقرير احترافي A4 لكل معلم يحلل أرشيفه كاملاً ويصنّف مستوى الأداء مع توصيات تربوية
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-white/70">
              {allTeachersForReport.length} معلم
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto pr-1">
            {allTeachersForReport.map((t) => {
              const tAgg = aggregates.find((a) => a.teacher_civil_id === t.civil_id);
              const flagged = tAgg && (
                tAgg.late_min > 180 || tAgg.absent_days >= 3 || tAgg.open_days >= 3
              );
              return (
                <button
                  key={t.civil_id || t.name}
                  onClick={() => handlePrintTeacher(t.civil_id, t.name)}
                  className={`group flex items-center gap-2 p-2 rounded-lg border bg-background hover:shadow-md hover:border-indigo-400 transition-all text-right ${
                    flagged ? "border-rose-300 bg-rose-50/50 dark:bg-rose-950/20" : "border-border"
                  }`}
                  title="طباعة تقرير الأداء"
                >
                  <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-900 grid place-items-center text-indigo-700 dark:text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white transition">
                    <Printer className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{t.name}</div>
                    <div className="text-[9px] text-muted-foreground font-mono truncate">{t.civil_id || "—"}</div>
                  </div>
                  {flagged && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="بحاجة متابعة" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> يحتاج دعم ومتابعة
            </span>
            <span className="mr-auto">انقر على اسم المعلم لفتح التقرير الجاهز للطباعة</span>
          </div>
        </Card>
      )}
      </>
      )}
    </div>
  );
}

function SummaryCard({
  title, value, icon, tone, hint,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: "primary" | "warning" | "danger" | "success";
  hint?: string;
}) {
  const tones = {
    primary: "from-primary/15 to-primary/5 text-primary border-primary/30",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-300",
    danger: "from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-400 border-rose-300",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-300",
  };
  return (
    <Card className={`p-4 bg-gradient-to-bl ${tones[tone]} border`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold opacity-80">{title}</div>
          <div className="text-2xl font-bold mt-1">{value.toLocaleString("ar-SA")}</div>
          {hint && <div className="text-[10px] mt-1 opacity-70">{hint}</div>}
        </div>
        <div className="opacity-80">{icon}</div>
      </div>
    </Card>
  );
}

function IndicatorCard({
  title, icon, tone, rows,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "primary" | "warning" | "danger" | "success";
  unit: string;
  rows: { name: string; sub: string; value: string; badge?: string }[];
}) {
  const tones = {
    primary: "from-primary/15 to-primary/5 text-primary border-primary/30",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-300",
    danger: "from-red-500/15 to-red-500/5 text-red-700 dark:text-red-400 border-red-300",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-300",
  };
  return (
    <Card className={`p-4 bg-gradient-to-bl ${tones[tone]} border`}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm flex items-center gap-2">{icon}{title}</div>
        <Badge variant="outline" className="text-[10px]">أعلى 5</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">لا توجد بيانات</div>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.sub + i} className="flex items-center gap-2 bg-background/60 rounded-md px-2 py-1.5">
              <span className="w-5 h-5 grid place-items-center text-[11px] font-bold rounded-full bg-foreground/10 text-foreground">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-foreground truncate">{r.name}</div>
                {r.sub && <div className="text-[10px] text-muted-foreground font-mono truncate">{r.sub}</div>}
              </div>
              <span className="text-xs font-mono font-bold text-foreground">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
