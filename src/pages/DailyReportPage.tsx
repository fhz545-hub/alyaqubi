import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { loadStudents, getStudentsFromDB } from "@/store/studentsStore";
import { getTodaySummary, getTodayActions, loadActions, getFrequentStudents, getActions, getActionsByDateRange } from "@/store/actionsStore";
import { filterRegularStudents } from "@/utils/distanceLearning";
import { printDailyAttendanceList } from "@/utils/print";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getFullHijriDate } from "@/utils/hijri";
import { getCurrentAcademicWeek } from "@/utils/academicWeeks";
import { Progress } from "@/components/ui/progress";
import ViolationsPerClassCard from "@/components/ViolationsPerClassCard";
import { DailyReportTopIndicators } from "@/components/DailyReportTopIndicators";
import { Button } from "@/components/ui/button";
import { Printer, Send, TrendingUp, Users, Clock, XCircle, LogOut, AlertTriangle, CheckCircle, DoorOpen, DoorClosed, UserCheck, CalendarDays, BarChart3, History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateRangeFilter, { DateRange, FilterMode } from "@/components/DateRangeFilter";
import { format } from "date-fns";

const DailyReportPage = () => {
  const { profile } = useAuth();
  const [totalStudents, setTotalStudents] = useState(0);
  const [summary, setSummary] = useState(getTodaySummary());
  const [recentActions, setRecentActions] = useState(getTodayActions());
  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month">("today");
  const refreshingRef = useRef(false);
  const [dateRange, setDateRange] = useState<DateRange>({ from: new Date(), to: new Date() });
  const [filterMode, setFilterMode] = useState<FilterMode>("day");

  const refreshData = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const [students] = await Promise.all([loadStudents(), loadActions()]);
      // استبعاد طلاب التعليم الإلكتروني (انتساب) من إجمالي الطلاب المنتظمين
      setTotalStudents(filterRegularStudents(students).length);
      setSummary(getTodaySummary());
      setRecentActions(getTodayActions());
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  useEffect(() => {
    const channel = supabase
      .channel('daily-report-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_actions' }, () => refreshData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  const hijriDate = getFullHijriDate();
  const academicWeek = getCurrentAcademicWeek();
  const presentCount = totalStudents - summary.absent - summary.permission;

  const pct = (val: number) => totalStudents > 0 ? ((val / totalStudents) * 100) : 0;
  const presentPct = pct(presentCount);
  const absentPct = pct(summary.absent);
  const latePct = pct(summary.late);
  const permissionPct = pct(summary.permission);
  const violationPct = pct(summary.violation);

  const frequentLate = getFrequentStudents("late", 3);
  const frequentAbsent = getFrequentStudents("absent", 3);

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>التقرير اليومي - ${hijriDate}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', sans-serif; padding: 15mm; font-size: 12px; }
          @page { size: A4; margin: 12mm; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #333; padding-bottom: 10px; margin-bottom: 15px; }
          .header .side { text-align: center; font-size: 11px; font-weight: 700; line-height: 1.8; }
          .header .center img { height: 60px; }
          .title { text-align: center; font-size: 20px; font-weight: 800; margin: 10px 0; padding: 10px; background: linear-gradient(135deg, #1e3a5f, #2d5a8e); color: #fff; border-radius: 8px; }
          .date-info { text-align: center; font-size: 13px; margin: 10px 0; color: #555; }
          .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 15px 0; }
          .stat-box { text-align: center; padding: 12px; border: 2px solid #ddd; border-radius: 8px; }
          .stat-box .num { font-size: 28px; font-weight: 800; }
          .stat-box .lbl { font-size: 11px; color: #666; margin-top: 4px; }
          .pct-section { margin: 15px 0; }
          .pct-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dotted #ddd; }
          .pct-label { width: 80px; font-size: 12px; font-weight: 600; }
          .pct-bar { flex: 1; height: 14px; background: #eee; border-radius: 7px; overflow: hidden; }
          .pct-fill { height: 100%; border-radius: 7px; }
          .pct-val { width: 50px; text-align: left; font-size: 12px; font-weight: 700; }
          .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; }
          .footer .sig { text-align: center; min-width: 120px; }
          .footer .sig p:first-child { font-weight: 800; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="side"><p>المملكة العربية السعودية</p><p>وزارة التعليم</p><p>الإدارة العامة للتعليم</p><p>قطاع التعليم بالخبر</p><p>ثانوية اليعقوبي بالخبر - مسارات</p></div>
          <div class="center"><img src="/images/moe-education-logo.png" alt="شعار وزارة التعليم" onerror="this.style.display='none'" /></div>
          <div class="side"><p>اليوم: ${new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date())}</p><p>التاريخ: ${hijriDate}</p>${academicWeek ? `<p>${academicWeek.semester} - ${academicWeek.week}</p>` : ""}</div>
        </div>

        <div class="title">التقرير اليومي للحضور والانضباط</div>
        <div class="date-info">إجمالي الطلاب المسجلين: ${totalStudents} طالب</div>

        <div class="stats-grid">
          <div class="stat-box"><div class="num" style="color:#22c55e">${presentCount}</div><div class="lbl">الحاضرون</div></div>
          <div class="stat-box"><div class="num" style="color:#dc2626">${summary.absent}</div><div class="lbl">الغائبون</div></div>
          <div class="stat-box"><div class="num" style="color:#f59e0b">${summary.late}</div><div class="lbl">المتأخرون</div></div>
          <div class="stat-box"><div class="num" style="color:#0d9488">${summary.permission}</div><div class="lbl">المستأذنون</div></div>
          <div class="stat-box"><div class="num" style="color:#d97706">${summary.violation}</div><div class="lbl">المخالفات</div></div>
        </div>

        <div class="pct-section">
          <div class="pct-row"><span class="pct-label">الحضور</span><div class="pct-bar"><div class="pct-fill" style="width:${presentPct}%;background:#22c55e"></div></div><span class="pct-val">${presentPct.toFixed(1)}%</span></div>
          <div class="pct-row"><span class="pct-label">الغياب</span><div class="pct-bar"><div class="pct-fill" style="width:${absentPct}%;background:#dc2626"></div></div><span class="pct-val">${absentPct.toFixed(1)}%</span></div>
          <div class="pct-row"><span class="pct-label">التأخر</span><div class="pct-bar"><div class="pct-fill" style="width:${latePct}%;background:#f59e0b"></div></div><span class="pct-val">${latePct.toFixed(1)}%</span></div>
          <div class="pct-row"><span class="pct-label">الاستئذان</span><div class="pct-bar"><div class="pct-fill" style="width:${permissionPct}%;background:#0d9488"></div></div><span class="pct-val">${permissionPct.toFixed(1)}%</span></div>
          <div class="pct-row"><span class="pct-label">المخالفات</span><div class="pct-bar"><div class="pct-fill" style="width:${violationPct}%;background:#d97706"></div></div><span class="pct-val">${violationPct.toFixed(1)}%</span></div>
        </div>

        <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-top: 15px;">
          <div class="stat-box"><div class="num" style="color:#1e3a5f">${summary.entry}</div><div class="lbl">دخول فصل</div></div>
          <div class="stat-box"><div class="num" style="color:#1e3a5f">${summary.exit}</div><div class="lbl">خروج من فصل</div></div>
          <div class="stat-box"><div class="num" style="color:#1e3a5f">${summary.summon}</div><div class="lbl">استدعاء</div></div>
        </div>

        <div class="footer">
          <div class="sig"><p>وكيل شؤون الطلاب</p><p>عدنان علي الزريق</p></div>
          <div class="sig"><p>مدير المدرسة</p><p>فهد حامد الزهراني</p></div>
        </div>

        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const statItems = [
    { label: "الحاضرون", value: presentCount, pct: presentPct, icon: CheckCircle, colorClass: "text-success", bgClass: "bg-success/10", barClass: "" },
    { label: "الغائبون", value: summary.absent, pct: absentPct, icon: XCircle, colorClass: "text-destructive", bgClass: "bg-destructive/10", barClass: "[&>div]:bg-destructive" },
    { label: "المتأخرون", value: summary.late, pct: latePct, icon: Clock, colorClass: "text-warning", bgClass: "bg-warning/10", barClass: "[&>div]:bg-warning" },
    { label: "المستأذنون", value: summary.permission, pct: permissionPct, icon: LogOut, colorClass: "text-accent", bgClass: "bg-accent/10", barClass: "[&>div]:bg-accent" },
    { label: "المخالفات", value: summary.violation, pct: violationPct, icon: AlertTriangle, colorClass: "text-secondary", bgClass: "bg-secondary/10", barClass: "[&>div]:bg-secondary" },
  ];

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={24} className="text-primary" />
            التقرير اليومي
          </h1>
          <p className="text-muted-foreground mt-1">{hijriDate}</p>
          {academicWeek && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-primary">
              <CalendarDays size={14} />
              <span>{academicWeek.semester} - {academicWeek.week}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handlePrintReport}>
            <Printer size={16} />
            طباعة التقرير
          </Button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-card rounded-xl border border-border/50 p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <History size={16} className="text-primary" />
          <span className="text-sm font-bold text-foreground">تصفية حسب الفترة</span>
        </div>
        <DateRangeFilter onRangeChange={(r, m) => { setDateRange(r); setFilterMode(m); }} />
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {statItems.map((item) => (
          <div key={item.label} className={`rounded-xl border border-border/50 p-4 ${item.bgClass} transition-all hover:shadow-md hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between mb-2">
              <item.icon size={20} className={item.colorClass} />
              <span className={`text-2xl font-bold ${item.colorClass}`}>{item.value}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
            <div className="mt-2">
              <Progress value={item.pct} className={`h-2 bg-muted/50 ${item.barClass}`} />
              <p className={`text-[10px] mt-1 font-bold ${item.colorClass}`}>{item.pct.toFixed(1)}%</p>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "دخول فصل", value: summary.entry, icon: DoorOpen, colorClass: "text-success" },
          { label: "خروج من فصل", value: summary.exit, icon: DoorClosed, colorClass: "text-primary" },
          { label: "استدعاء", value: summary.summon, icon: UserCheck, colorClass: "text-secondary" },
        ].map((item) => (
          <div key={item.label} className="bg-card rounded-xl border border-border/50 p-4 text-center">
            <item.icon size={20} className={`${item.colorClass} mx-auto mb-1`} />
            <p className={`text-xl font-bold ${item.colorClass}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* إجمالي الطلاب */}
      <div className="bg-card rounded-xl border border-border/50 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الطلاب المسجلين</p>
              <p className="text-3xl font-bold text-primary">{totalStudents}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-success" />
            <span className="text-sm font-bold text-success">{presentPct.toFixed(1)}% حضور</span>
          </div>
        </div>
      </div>

      {/* Daily Late Students List */}
      {(() => {
        const fromStr = format(dateRange.from, "yyyy-MM-dd");
        const toStr = format(dateRange.to, "yyyy-MM-dd");
        const rangeActions = getActionsByDateRange(fromStr, toStr);
        const lateStudents = rangeActions.filter(a => a.type === "late");
        const absentStudents = rangeActions.filter(a => a.type === "absent");
        const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(dateRange.from);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Late List */}
            <div className="bg-card rounded-xl border border-warning/30 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-warning/10 border-b border-warning/20">
                <h3 className="font-bold text-warning flex items-center gap-2">
                  <Clock size={18} />
                  المتأخرون اليوم ({lateStudents.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-warning hover:text-warning hover:bg-warning/10"
                  onClick={() => printDailyAttendanceList("late", lateStudents.map(s => ({
                    name: s.studentName, grade: s.grade, section: s.section,
                    time: s.time, studentNumber: s.studentNumber
                  })), hijriDate, dayName)}
                  disabled={lateStudents.length === 0}
                >
                  <Printer size={14} />
                  طباعة
                </Button>
              </div>
              <div className="divide-y divide-border/30 max-h-80 overflow-y-auto">
                {lateStudents.length > 0 ? lateStudents.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/20">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.studentName}</p>
                        <p className="text-xs text-muted-foreground">{s.grade} — فصل {s.section}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-warning bg-warning/10 px-2 py-1 rounded">{s.time}</span>
                  </div>
                )) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">لا يوجد متأخرون اليوم</div>
                )}
              </div>
            </div>

            {/* Absent List */}
            <div className="bg-card rounded-xl border border-destructive/30 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-destructive/10 border-b border-destructive/20">
                <h3 className="font-bold text-destructive flex items-center gap-2">
                  <XCircle size={18} />
                  الغائبون اليوم ({absentStudents.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => printDailyAttendanceList("absent", absentStudents.map(s => ({
                    name: s.studentName, grade: s.grade, section: s.section,
                    time: s.time, studentNumber: s.studentNumber
                  })), hijriDate, dayName)}
                  disabled={absentStudents.length === 0}
                >
                  <Printer size={14} />
                  طباعة
                </Button>
              </div>
              <div className="divide-y divide-border/30 max-h-80 overflow-y-auto">
                {absentStudents.length > 0 ? absentStudents.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/20">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.studentName}</p>
                        <p className="text-xs text-muted-foreground">{s.grade} — فصل {s.section}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">لا يوجد غائبون اليوم</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Violations per class */}
      <div className="mb-6">
        <ViolationsPerClassCard actions={getActions()} />
      </div>

      {/* Top interactive indicators — live from DB */}
      <div className="mb-6">
        <DailyReportTopIndicators actions={getActions()} />
      </div>

      {/* Frequent students alerts */}
      {(frequentLate.length > 0 || frequentAbsent.length > 0) && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-warning" />
            تنبيهات تربوية
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {frequentLate.length > 0 && (
              <div className="bg-card rounded-xl border border-warning/30 p-4">
                <h3 className="text-sm font-bold text-warning flex items-center gap-1 mb-3">
                  <Clock size={16} /> الأكثر تأخرًا ({frequentLate.length})
                </h3>
                {frequentLate.slice(0, 5).map((s) => (
                  <div key={s.studentId} className="flex justify-between items-center py-1.5 border-b border-border/20 last:border-0">
                    <div>
                      <span className="text-xs text-foreground font-medium">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground mr-2">{s.grade} - فصل {s.section}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-bold">{s.count} مرة</span>
                  </div>
                ))}
              </div>
            )}
            {frequentAbsent.length > 0 && (
              <div className="bg-card rounded-xl border border-destructive/30 p-4">
                <h3 className="text-sm font-bold text-destructive flex items-center gap-1 mb-3">
                  <XCircle size={16} /> الأكثر غيابًا ({frequentAbsent.length})
                </h3>
                {frequentAbsent.slice(0, 5).map((s) => (
                  <div key={s.studentId} className="flex justify-between items-center py-1.5 border-b border-border/20 last:border-0">
                    <div>
                      <span className="text-xs text-foreground font-medium">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground mr-2">{s.grade} - فصل {s.section}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-bold">{s.count} مرة</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default DailyReportPage;
