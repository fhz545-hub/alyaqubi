import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentAcademicWeek, getAcademicDayName } from "@/utils/academicWeeks";
import { getHijriDate } from "@/utils/hijri";
import { CalendarDays, GraduationCap, Sun, BookOpenCheck, Clock, X } from "lucide-react";

const DISMISS_KEY_PREFIX = "school_day_info_dismissed_";

// Anchor dates (Gregorian) for Term 2 1447/1448H
// Final exams week (الاختبارات التحريرية النهائية) starts:
const FINAL_EXAMS_START = "2026-06-21";
// Summer vacation begins after final exams week ends (Thursday June 25, 2026)
const SUMMER_VACATION_START = "2026-06-26";

const daysBetween = (from: Date, toIso: string): number => {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.max(0, Math.ceil((b - a) / (1000 * 60 * 60 * 24)));
};

const SchoolDayInfoDialog = () => {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  const today = useMemo(() => new Date(), []);
  const dayKey = today.toISOString().split("T")[0];
  const dismissKey = `${DISMISS_KEY_PREFIX}${dayKey}`;

  useEffect(() => {
    if (!profile) return;
    const dismissed = sessionStorage.getItem(dismissKey);
    if (dismissed) return;
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [profile, dismissKey]);

  const handleClose = () => {
    sessionStorage.setItem(dismissKey, "1");
    setOpen(false);
  };

  const academicWeek = getCurrentAcademicWeek(today);
  const dayName = getAcademicDayName(today);
  const hijri = getHijriDate(today);
  const gregorian = today.toLocaleDateString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const daysToExams = daysBetween(today, FINAL_EXAMS_START);
  const daysToSummer = daysBetween(today, SUMMER_VACATION_START);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden border-0 [&>button]:hidden"
        dir="rtl"
      >
        {/* Custom Close Button (X) */}
        <button
          onClick={handleClose}
          aria-label="إغلاق"
          className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-background/90 backdrop-blur border border-border shadow-md flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <X size={16} />
        </button>

        {/* Header gradient */}
        <div className="relative bg-gradient-to-bl from-primary via-primary/90 to-primary/70 text-primary-foreground p-5 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <GraduationCap size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold leading-tight">مدرسة اليعقوبي الثانوية</h2>
              <p className="text-[11px] opacity-90 mt-0.5">يومك الدراسي — لمحة سريعة</p>
            </div>
          </div>

          {/* Day pill */}
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 backdrop-blur px-3 py-1.5 rounded-full border border-white/25">
            <Sun size={13} />
            <span className="text-xs font-bold">{dayName}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3 bg-background">
          {/* Dates row */}
          <div className="grid grid-cols-2 gap-2.5">
            <InfoCard
              icon={<CalendarDays size={14} />}
              label="هجري"
              value={hijri}
              tone="primary"
            />
            <InfoCard
              icon={<CalendarDays size={14} />}
              label="ميلادي"
              value={gregorian}
              tone="muted"
            />
          </div>

          {/* Academic week */}
          <div className="rounded-xl border border-primary/20 bg-gradient-to-l from-primary/8 to-transparent p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <BookOpenCheck size={15} className="text-primary" />
              <span className="text-[11px] font-semibold text-muted-foreground">الأسبوع الدراسي الحالي</span>
            </div>
            {academicWeek ? (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base font-bold text-foreground">{academicWeek.week}</span>
                <span className="text-[11px] text-muted-foreground">— {academicWeek.semester}</span>
              </div>
            ) : (
              <p className="text-sm font-bold text-muted-foreground">إجازة بين الفصول الدراسية</p>
            )}
          </div>

          {/* Countdown row */}
          <div className="grid grid-cols-2 gap-2.5">
            <CountdownCard
              icon={<Clock size={14} />}
              label="المتبقي على الاختبارات النهائية"
              days={daysToExams}
              tone="warn"
            />
            <CountdownCard
              icon={<Sun size={14} />}
              label="المتبقي على الإجازة الصيفية"
              days={daysToSummer}
              tone="success"
            />
          </div>

          {/* Footer */}
          <div className="pt-2 text-center">
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              نسأل الله لكم التوفيق والسداد — تظهر هذه النافذة مرة واحدة في اليوم.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const InfoCard = ({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "muted";
}) => (
  <div
    className={`rounded-xl border p-3 ${
      tone === "primary"
        ? "bg-primary/5 border-primary/20"
        : "bg-muted/30 border-border/50"
    }`}
  >
    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className="text-[12px] font-bold text-foreground leading-snug break-words">{value}</p>
  </div>
);

const CountdownCard = ({
  icon,
  label,
  days,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  days: number;
  tone: "warn" | "success";
}) => {
  const palette =
    tone === "warn"
      ? "bg-warning/10 border-warning/30 text-warning"
      : "bg-success/10 border-success/30 text-success";
  return (
    <div className={`rounded-xl border p-3 ${palette.split(" ").slice(0, 2).join(" ")}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-1.5">
        {icon}
        <span className="leading-tight">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-extrabold ${palette.split(" ")[2]}`}>{days}</span>
        <span className="text-[10px] text-muted-foreground font-semibold">يوم</span>
      </div>
    </div>
  );
};

export default SchoolDayInfoDialog;
