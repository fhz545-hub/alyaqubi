import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Coffee, Sun, BookOpen, Users, RefreshCw, MoonStar, AlertCircle, Maximize2, Minimize2, Hourglass, Upload } from "lucide-react";
import { parseExcelFile, matchTeacher, settingsKeyFor, type TeacherCandidate } from "@/utils/scheduleImport";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { toast } from "sonner";

/* ===== Timetable definition (per request) ===== */
type SlotKind = "assembly" | "period" | "break" | "prayer" | "off";
interface Slot {
  kind: SlotKind;
  label: string;
  period?: number; // 1..7
  startMin: number;
  endMin: number;
}

const HM = (h: number, m: number) => h * 60 + m;
const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Saturday-based day names matching DB schedule keys (Sun..Thu). */
const DAY_KEYS: Record<number, string | null> = {
  0: "الأحد",
  1: "الإثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: null, // Friday
  6: null, // Saturday
};
const DAY_LABELS: Record<number, string> = {
  0: "الأحد", 1: "الإثنين", 2: "الثلاثاء", 3: "الأربعاء", 4: "الخميس", 5: "الجمعة", 6: "السبت",
};

/** Build the schedule for a given weekday. Periods 1–3 = 50 min, 4–6 = 45 min, recess 25, prayer 15, P7 only Sun/Mon. */
function buildDaySchedule(weekday: number): Slot[] {
  if (weekday === 5 || weekday === 6) return []; // Friday & Saturday off
  const slots: Slot[] = [];
  // Assembly 06:45 -> 07:00
  slots.push({ kind: "assembly", label: "الطابور الصباحي", startMin: HM(6, 45), endMin: HM(7, 0) });
  // P1: 07:00 -> 07:50
  slots.push({ kind: "period", period: 1, label: "الحصة الأولى", startMin: HM(7, 0), endMin: HM(7, 50) });
  // P2: 07:50 -> 08:40
  slots.push({ kind: "period", period: 2, label: "الحصة الثانية", startMin: HM(7, 50), endMin: HM(8, 40) });
  // P3: 08:40 -> 09:30
  slots.push({ kind: "period", period: 3, label: "الحصة الثالثة", startMin: HM(8, 40), endMin: HM(9, 30) });
  // Recess 25: 09:30 -> 09:55
  slots.push({ kind: "break", label: "الفسحة", startMin: HM(9, 30), endMin: HM(9, 55) });
  // P4: 09:55 -> 10:40
  slots.push({ kind: "period", period: 4, label: "الحصة الرابعة", startMin: HM(9, 55), endMin: HM(10, 40) });
  // P5: 10:40 -> 11:25
  slots.push({ kind: "period", period: 5, label: "الحصة الخامسة", startMin: HM(10, 40), endMin: HM(11, 25) });
  // P6: 11:25 -> 12:10
  slots.push({ kind: "period", period: 6, label: "الحصة السادسة", startMin: HM(11, 25), endMin: HM(12, 10) });
  // Prayer 15: 12:10 -> 12:25
  slots.push({ kind: "prayer", label: "الصلاة", startMin: HM(12, 10), endMin: HM(12, 25) });
  // P7 only Sun (0) & Mon (1): 12:25 -> 13:10? request says day ends 1:15.
  if (weekday === 0 || weekday === 1) {
    slots.push({ kind: "period", period: 7, label: "الحصة السابعة", startMin: HM(12, 25), endMin: HM(13, 15) });
  }
  return slots;
}

function getCurrentSlot(weekday: number, nowMin: number): { current: Slot | null; next: Slot | null; before: boolean; after: boolean } {
  const slots = buildDaySchedule(weekday);
  if (!slots.length) return { current: null, next: null, before: false, after: false };
  const last = slots[slots.length - 1];
  if (nowMin < slots[0].startMin) return { current: null, next: slots[0], before: true, after: false };
  if (nowMin >= last.endMin) return { current: null, next: null, before: false, after: true };
  for (let i = 0; i < slots.length; i++) {
    if (nowMin >= slots[i].startMin && nowMin < slots[i].endMin) {
      return { current: slots[i], next: slots[i + 1] ?? null, before: false, after: false };
    }
  }
  return { current: null, next: null, before: false, after: false };
}

/* ===== Sections (17 total) ===== */
const SECTIONS: { grade: "اول" | "ثاني" | "ثالث"; gradeLabel: string; secNum: number; secWord: string; key: string }[] = [];
const SEC_WORDS = ["", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع"];
const GRADE_INFO: { g: "اول" | "ثاني" | "ثالث"; label: string; count: number }[] = [
  { g: "اول", label: "أول ثانوي", count: 7 },
  { g: "ثاني", label: "ثاني ثانوي", count: 5 },
  { g: "ثالث", label: "ثالث ثانوي", count: 5 },
];
for (const gi of GRADE_INFO) {
  for (let i = 1; i <= gi.count; i++) {
    SECTIONS.push({
      grade: gi.g,
      gradeLabel: gi.label,
      secNum: i,
      secWord: SEC_WORDS[i],
      key: `${gi.g} ${SEC_WORDS[i]}`,
    });
  }
}

/** Normalize Arabic text for tolerant section matching (alif variants, ya, ta marbuta, spaces). */
function norm(s: string): string {
  return String(s || "")
    .replace(/[\u064B-\u0652\u0670]/g, "") // tashkeel
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalSectionKey(s: string): string {
  const words = norm(s)
    .replace(/[\/\-–—|،,]+/g, " ")
    .replace(/\b(الصف|صف|الثانوي|ثانوي|شعبه|شعبة|الفصل|فصل)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const normalizeWord = (w: string) =>
    w.replace(/^ال/, "").replace(/^الاولي$/, "اول").replace(/^اولي$/, "اول").replace(/^الثانيه$/, "ثاني").replace(/^ثانيه$/, "ثاني").replace(/^الثالثه$/, "ثالث").replace(/^ثالثه$/, "ثالث");
  const known = new Set(["اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع"]);
  const picked = words.map(normalizeWord).filter((w) => known.has(w));
  return picked.length >= 2 ? `${picked[0]} ${picked[1]}` : picked.join(" ");
}

function sectionMatches(cellSection: string, target: string): boolean {
  const a = canonicalSectionKey(cellSection);
  const b = canonicalSectionKey(target);
  if (!a || !b) return false;
  // Exact only: "ثاني اول" must never match "اول اول" just because both contain "اول".
  return a === b;
}

/* ===== Page ===== */
interface TeacherSchedule {
  teacherName: string;
  schedule: Record<string, Record<string, { subject: string; section: string }>>;
}

interface ActiveCell {
  teacherName: string;
  subject: string;
  rawSection: string;
}

export default function LivePeriodsPage() {
  const [now, setNow] = useState(() => new Date());
  const [schedules, setSchedules] = useState<TeacherSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timelineFs, setTimelineFs] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();
  const canImport =
    !!profile && (profile.is_principal || hasPermission(profile.user_id, false, "import_schedule"));

  // Tick every second for smooth countdown
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadAll() {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("teacher_settings")
        .select("key, value, updated_at")
        .limit(1000);
      if (error) throw error;
      const allSchedules: TeacherSchedule[] = [];
      const officialRows: Array<TeacherSchedule & { batchId: string; updatedAt: string }> = [];
      for (const row of data || []) {
        const v: any = row.value || {};
        if (!v.schedule) continue;
        // key format used elsewhere: "name|civilId" — derive a name fallback from key
        const teacherName: string =
          v.teacherName ||
          v.fullName ||
          (typeof row.key === "string" ? String(row.key).split("|")[0] : "") ||
          "—";
        const item = { teacherName, schedule: v.schedule };
        allSchedules.push(item);
        if (v.scheduleSource === "official_section_teacher_only") {
          officialRows.push({ ...item, batchId: String(v.scheduleBatchId || row.key), updatedAt: String((row as any).updated_at || "") });
        }
      }
      const latestBatch = officialRows
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.batchId.localeCompare(a.batchId))[0]?.batchId;
      setSchedules(latestBatch ? officialRows.filter((r) => r.batchId === latestBatch) : allSchedules);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleImportFile(file: File) {
    if (!canImport) {
      toast.error("لا تملك صلاحية استيراد الجدول الدراسي");
      return;
    }
    setImporting(true);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        toast.error("لم يتم العثور على جداول صالحة في الملف");
        return;
      }

      // Load active teachers to match raw names against the registry.
      const { data: teachersData, error: tErr } = await supabase
        .from("teachers")
        .select("id, full_name, civil_id, job_number")
        .eq("active", true);
      if (tErr) throw tErr;
      const teachers = (teachersData || []) as TeacherCandidate[];

      type Resolved = { name: string; civilId?: string; grid: any };
      const resolved: Resolved[] = [];
      let unmatched = 0;
      for (const p of parsed) {
        const m = p.exactTeacherNames
          ? { teacher: null as TeacherCandidate | null }
          : matchTeacher(p, teachers);
        if (m.teacher) {
          resolved.push({ name: m.teacher.full_name, civilId: m.teacher.civil_id, grid: p.grid });
        } else {
          // Section-major Excel files are authoritative: use the teacher name exactly as written
          // to avoid assigning a section to a different registered teacher with a similar name.
          resolved.push({ name: p.rawName, civilId: p.civilId, grid: p.grid });
          if (!p.exactTeacherNames) unmatched++;
        }
      }

      // Replace strategy: clear schedule field on every existing teacher_settings row,
      // then write the new schedule for the imported teachers (preserving other extras).
      const { data: allRows, error: rErr } = await supabase
        .from("teacher_settings")
        .select("key, value");
      if (rErr) throw rErr;

      const existingMap = new Map<string, any>((allRows || []).map((r: any) => [r.key, r.value || {}]));

      // 1) Strip schedule from every existing row that had one.
      const stripUpserts: { key: string; value: any }[] = [];
      for (const [key, val] of existingMap.entries()) {
        if (val && val.schedule) {
          const { schedule, ...rest } = val;
          stripUpserts.push({ key, value: rest });
        }
      }
      if (stripUpserts.length) {
        const { error: stripErr } = await supabase
          .from("teacher_settings")
          .upsert(stripUpserts, { onConflict: "key" });
        if (stripErr) throw stripErr;
      }

      // 2) Write schedule for each imported teacher (merge into existing extras).
      const scheduleBatchId = `schedule_${Date.now()}`;
      const newUpserts = resolved.map((r) => {
        const key = settingsKeyFor(r.name, r.civilId);
        const prev = existingMap.get(key) || {};
        const { schedule: _, ...rest } = prev;
        return {
          key,
          value: { ...rest, teacherName: r.name, schedule: r.grid, scheduleSource: "official_section_teacher_only", scheduleBatchId },
        };
      });

      if (newUpserts.length) {
        const { error: insErr } = await supabase
          .from("teacher_settings")
          .upsert(newUpserts, { onConflict: "key" });
        if (insErr) throw insErr;
      }

      toast.success(
        `تم اعتماد الجدول الجديد · معلمين: ${newUpserts.length}` +
          (unmatched ? ` · غير مطابق تلقائياً: ${unmatched}` : ""),
      );
      await loadAll();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذّر استيراد الجدول");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const weekday = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayKey = DAY_KEYS[weekday];
  const { current, next, before, after } = useMemo(() => getCurrentSlot(weekday, nowMin), [weekday, nowMin]);

  /* ===== Live countdown computation ===== */
  const liveCountdown = useMemo(() => {
    const sec = now.getSeconds();
    const totalSecNow = nowMin * 60 + sec;
    const todaySlots = buildDaySchedule(weekday);
    const firstSlot = todaySlots[0];
    const lastSlot = todaySlots[todaySlots.length - 1];

    // Find next school day's assembly start (in seconds from now)
    const nextAssemblyDelta = (): number => {
      for (let i = 1; i <= 7; i++) {
        const wd = (weekday + i) % 7;
        const s = buildDaySchedule(wd);
        if (s.length) {
          // s[0] is assembly at 06:45
          return i * 24 * 3600 - totalSecNow + s[0].startMin * 60;
        }
      }
      return 0;
    };

    let phase: "before-assembly" | "assembly" | "period" | "break" | "prayer" | "after-day" | "weekend" = "weekend";
    let label = "";
    let icon: SlotKind = "off";
    let endsAt = 0; // seconds remaining
    let totalSpan = 1; // total seconds of current phase (for progress)
    let nextLabel = "";
    let color = "from-muted to-muted";

    if (!todaySlots.length) {
      phase = "weekend";
      label = "عطلة نهاية الأسبوع";
      endsAt = nextAssemblyDelta();
      totalSpan = Math.max(endsAt, 1);
      nextLabel = "بداية طابور اليوم الدراسي القادم";
      color = "from-muted-foreground/40 to-muted-foreground/20";
    } else if (totalSecNow < firstSlot.startMin * 60) {
      phase = "before-assembly";
      label = "قبل بداية الدوام";
      icon = "assembly";
      endsAt = firstSlot.startMin * 60 - totalSecNow;
      // span from midnight start of "early morning" — use 60 minutes window for nice progress
      totalSpan = 60 * 60;
      nextLabel = "بداية الطابور الصباحي";
      color = "from-amber-400 to-orange-500";
    } else if (totalSecNow >= lastSlot.endMin * 60) {
      phase = "after-day";
      label = "انتهى اليوم الدراسي";
      endsAt = nextAssemblyDelta();
      totalSpan = Math.max(endsAt, 1);
      nextLabel = "بداية طابور اليوم الدراسي القادم";
      color = "from-indigo-500 to-purple-500";
    } else if (current) {
      label =
        current.kind === "assembly" ? "الطابور الصباحي" :
        current.kind === "break" ? "الفسحة" :
        current.kind === "prayer" ? "الصلاة" :
        current.label;
      icon = current.kind;
      const startSec = current.startMin * 60;
      const endSec = current.endMin * 60;
      endsAt = endSec - totalSecNow;
      totalSpan = endSec - startSec;
      phase =
        current.kind === "assembly" ? "assembly" :
        current.kind === "break" ? "break" :
        current.kind === "prayer" ? "prayer" : "period";
      nextLabel = next ? `التالي: ${next.label}` : "نهاية اليوم الدراسي";
      color =
        current.kind === "assembly" ? "from-amber-400 to-orange-500" :
        current.kind === "break" ? "from-emerald-400 to-teal-500" :
        current.kind === "prayer" ? "from-violet-500 to-fuchsia-500" :
        "from-sky-500 to-primary";
    }

    const elapsed = Math.max(0, totalSpan - endsAt);
    const pct = Math.max(0, Math.min(100, (elapsed / totalSpan) * 100));
    const h = Math.floor(endsAt / 3600);
    const m = Math.floor((endsAt % 3600) / 60);
    const s = Math.floor(endsAt % 60);
    const remainingText =
      h > 0
        ? `${h}س ${String(m).padStart(2, "0")}د ${String(s).padStart(2, "0")}ث`
        : `${String(m).padStart(2, "0")} : ${String(s).padStart(2, "0")}`;

    return { phase, label, icon, pct, remainingText, nextLabel, color, endsAt };
  }, [now, nowMin, weekday, current, next]);

  const tlIcon =
    liveCountdown.icon === "assembly" ? <Sun className="w-5 h-5" /> :
    liveCountdown.icon === "period" ? <BookOpen className="w-5 h-5" /> :
    liveCountdown.icon === "break" ? <Coffee className="w-5 h-5" /> :
    liveCountdown.icon === "prayer" ? <MoonStar className="w-5 h-5" /> :
    <Hourglass className="w-5 h-5" />;

  /** Slim horizontal timeline that fills the empty trailing cells next to "أول/سابع". */
  const SlimTimeline = () => (
    <div className={`relative overflow-hidden rounded-xl border-2 shadow-md bg-gradient-to-l ${liveCountdown.color} text-white h-full w-full`}>
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_left,white,transparent_60%)]" />
      <div className="absolute -top-8 -left-8 w-24 h-24 rounded-full bg-white/15 blur-2xl pointer-events-none" />
      <div className="relative h-full w-full flex items-center gap-3 px-3 py-2">
        {/* icon + status */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative w-8 h-8 rounded-lg bg-white/20 grid place-items-center backdrop-blur">
            {tlIcon}
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white/70 animate-pulse" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] opacity-80">المؤشر اللحظي</div>
            <div className="text-[12px] font-black truncate max-w-[140px]">{liveCountdown.label}</div>
          </div>
        </div>

        {/* horizontal bar — extends to table edge */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="relative h-2 w-full rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-white via-white/90 to-white/70 transition-[width] duration-700 ease-out"
              style={{ width: `${liveCountdown.pct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] transition-[right] duration-700 ease-out"
              style={{ right: `calc(${liveCountdown.pct}% - 6px)` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] opacity-90 font-semibold">
            <span className="truncate">{liveCountdown.nextLabel}</span>
            <span className="font-mono">{Math.round(liveCountdown.pct)}٪</span>
          </div>
        </div>

        {/* remaining time */}
        <div className="shrink-0 text-left">
          <div className="text-[10px] opacity-80">المتبقي</div>
          <div className="font-black tabular-nums tracking-tight text-xl leading-none drop-shadow">
            {liveCountdown.remainingText}
          </div>
        </div>
      </div>
    </div>
  );

  /** For a given section, find what's happening right now. */
  function lookupForSection(target: string): ActiveCell[] {
    if (!current || current.kind !== "period" || !dayKey) return [];
    const period = String(current.period);
    const out: ActiveCell[] = [];
    for (const t of schedules) {
      const cell = t.schedule?.[dayKey]?.[period];
      if (!cell) continue;
      if (cell.section && sectionMatches(cell.section, target)) {
        out.push({ teacherName: t.teacherName, subject: cell.subject || "—", rawSection: cell.section });
      }
    }
    return out;
  }

  const slotIcon = (k?: SlotKind) => {
    switch (k) {
      case "assembly": return <Sun className="w-5 h-5" />;
      case "period": return <BookOpen className="w-5 h-5" />;
      case "break": return <Coffee className="w-5 h-5" />;
      case "prayer": return <MoonStar className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  return (
    <AppLayout>
      <div dir="rtl" className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl border bg-gradient-to-l from-primary/15 via-primary/5 to-transparent p-5 md:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-md">
                <Clock className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-foreground">متابعة الحصص اللحظي لجميع الشعب</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  يعرض لكل شعبة المعلم والمادة الحالية بحسب اليوم والوقت والجدول الدراسي.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canImport && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportFile(f);
                    }}
                  />
                  <Button
                    variant="default"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                    className="gap-2"
                  >
                    <Upload className={`h-4 w-4 ${importing ? "animate-pulse" : ""}`} />
                    {importing ? "جارٍ الاستيراد..." : "استيراد جدول Excel"}
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={loadAll} disabled={refreshing}>
                <RefreshCw className={`ml-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                تحديث
              </Button>
              <Button asChild variant="outline">
                <Link to="/"><ArrowRight className="ml-2 h-4 w-4" /> الرئيسية</Link>
              </Button>
            </div>
          </div>

          {/* Live status */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4 border-2">
              <div className="text-xs text-muted-foreground">اليوم</div>
              <div className="text-lg font-black text-foreground mt-1">{DAY_LABELS[weekday]}</div>
            </Card>
            <Card className="p-4 border-2">
              <div className="text-xs text-muted-foreground">الوقت الحالي</div>
              <div className="text-lg font-black text-foreground mt-1 font-mono">{fmt(nowMin)}</div>
            </Card>
            <Card className="p-4 border-2 bg-primary/5">
              <div className="text-xs text-muted-foreground">الفترة الحالية</div>
              <div className="text-lg font-black text-foreground mt-1 flex items-center gap-2">
                {slotIcon(current?.kind)}
                {current ? `${current.label} (${fmt(current.startMin)} – ${fmt(current.endMin)})` :
                  before ? "قبل بداية الدوام" :
                  after ? "انتهى اليوم الدراسي" :
                  (weekday === 5 || weekday === 6) ? "إجازة" : "—"}
              </div>
              {next && current && (
                <div className="text-[11px] text-muted-foreground mt-1">التالي: {next.label} {fmt(next.startMin)}</div>
              )}
            </Card>
          </div>
        </div>

        {/* No school today */}
        {(weekday === 5 || weekday === 6) && (
          <Card className="p-8 text-center border-warning/40 bg-warning/5">
            <AlertCircle className="w-10 h-10 mx-auto text-warning mb-2" />
            <div className="text-lg font-black text-foreground">لا يوجد دوام مدرسي اليوم</div>
            <div className="text-sm text-muted-foreground mt-1">عطلة نهاية الأسبوع — يستأنف الدوام يوم الأحد.</div>
          </Card>
        )}

        {/* Outside hours */}
        {dayKey && (before || after) && (
          <Card className="p-6 text-center border-muted">
            <div className="text-base font-bold text-foreground">
              {before ? "لم يبدأ الدوام بعد" : "انتهى اليوم الدراسي"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {before && next ? `يبدأ ${next.label} الساعة ${fmt(next.startMin)}` : "نراكم في يوم دراسي قادم بإذن الله."}
            </div>
          </Card>
        )}

        {/* Break/Prayer/Assembly: show notice but still render section grid (no class right now) */}
        {dayKey && current && current.kind !== "period" && (
          <Card className="p-5 border-2 bg-accent/10 flex items-center gap-3">
            {slotIcon(current.kind)}
            <div>
              <div className="font-black text-foreground">{current.label}</div>
              <div className="text-xs text-muted-foreground">
                لا توجد حصة جارية حاليًا — تنتهي الساعة {fmt(current.endMin)}.
              </div>
            </div>
          </Card>
        )}

        {/* Sections grid (with optional fullscreen for the whole table) */}
        {dayKey && (
          <div
            className={
              timelineFs
                ? "fixed inset-0 z-50 bg-background overflow-auto p-4 md:p-6 space-y-5"
                : "space-y-5"
            }
          >
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTimelineFs((v) => !v)}
                className="gap-2"
              >
                {timelineFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {timelineFs ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              </Button>
            </div>
            {GRADE_INFO.map((gi) => {
              const isFirst = gi.g === "اول";
              const grid = (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 auto-rows-[88px]">
                  {SECTIONS.filter((s) => s.grade === gi.g).map((s) => {
                    const cells = lookupForSection(s.key);
                    const isPeriod = current?.kind === "period";
                    const empty = isPeriod && cells.length === 0;
                    return (
                      <Card
                        key={s.key}
                        className={`p-2 border-2 transition-all hover:shadow-md h-full overflow-hidden flex flex-col ${
                          isPeriod
                            ? cells.length > 0
                              ? "border-primary/40 bg-primary/5"
                              : "border-destructive/30 bg-destructive/5"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 shrink-0">
                          <div className="text-sm font-black text-foreground">
                            {gi.label.replace(" ثانوي", "")} / {s.secWord}
                          </div>
                          {isPeriod && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${cells.length > 0 ? "bg-primary text-primary-foreground" : "bg-destructive/15 text-destructive border-destructive/30"}`} variant={cells.length > 0 ? "default" : "outline"}>
                              {cells.length > 0 ? "حصة جارية" : "بدون حصة"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex-1 min-h-0 overflow-hidden">
                        {!isPeriod && (
                          <div className="text-[11px] text-muted-foreground text-center">
                            {current ? current.label : "خارج وقت الحصص"}
                          </div>
                        )}
                        {isPeriod && cells.length > 0 && (
                          <div className="space-y-1">
                            {cells.map((c, idx) => (
                              <div key={idx} className="rounded-md border bg-card px-1.5 py-0.5">
                                <div className="text-[11px] font-bold text-foreground leading-tight truncate">{c.teacherName}</div>
                                {c.subject && c.subject !== "—" && (
                                  <div className="text-[10px] text-muted-foreground truncate">{c.subject}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {empty && (
                          <div className="text-[10px] text-destructive font-semibold text-center leading-tight">
                            لا يوجد معلم مسند للحصة الحالية
                          </div>
                        )}
                        </div>
                      </Card>
                    );
                  })}
                  {isFirst && (
                    <div className="col-span-2 md:col-span-1 lg:col-span-1 xl:col-span-3 h-full">
                      <SlimTimeline />
                    </div>
                  )}
                </div>
              );
              return (
              <section key={gi.g}>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-primary" />
                  <h2 className="text-base font-black text-foreground">{gi.label}</h2>
                  <Badge variant="secondary" className="font-bold">{gi.count} شعب</Badge>
                </div>
                {grid}
              </section>
            );
            })}
          </div>
        )}

        {loading && (
          <Card className="p-6 text-center text-sm text-muted-foreground">جارٍ تحميل الجداول الدراسية...</Card>
        )}
        {!loading && schedules.length === 0 && (
          <Card className="p-6 text-center border-warning/40 bg-warning/5">
            <div className="font-bold text-foreground">لا توجد جداول دراسية محفوظة بعد</div>
            <div className="text-xs text-muted-foreground mt-1">
              يمكنك استيراد الجدول الشامل من «شؤون المعلمين ← ملف المعلم ← الجدول الدراسي».
            </div>
          </Card>
        )}
       </div>
    </AppLayout>
  );
}
