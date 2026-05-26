import { useState, useMemo } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, isWithinInterval, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getFullHijriDate, getHijriDateShort } from "@/utils/hijri";

export type FilterMode = "day" | "week" | "month";

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  onRangeChange: (range: DateRange, mode: FilterMode) => void;
  className?: string;
}

const DateRangeFilter = ({ onRangeChange, className }: DateRangeFilterProps) => {
  const [mode, setMode] = useState<FilterMode>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const currentRange = useMemo((): DateRange => {
    if (mode === "day") {
      return { from: selectedDate, to: selectedDate };
    }
    if (mode === "week") {
      const base = subWeeks(new Date(), weekOffset);
      return {
        from: startOfWeek(base, { weekStartsOn: 0 }),
        to: endOfWeek(base, { weekStartsOn: 0 }),
      };
    }
    // month
    const base = subMonths(new Date(), monthOffset);
    return {
      from: startOfMonth(base),
      to: endOfMonth(base),
    };
  }, [mode, selectedDate, weekOffset, monthOffset]);

  const rangeLabel = useMemo(() => {
    if (mode === "day") {
      const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
      const hijri = getHijriDateShort(selectedDate);
      const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(selectedDate);
      return isToday ? `اليوم - ${dayName} ${hijri}` : `${dayName} ${hijri}`;
    }
    if (mode === "week") {
      const fromHijri = getHijriDateShort(currentRange.from);
      const toHijri = getHijriDateShort(currentRange.to);
      return weekOffset === 0 ? `الأسبوع الحالي: ${fromHijri} - ${toHijri}` : `${fromHijri} - ${toHijri}`;
    }
    const monthName = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long", year: "numeric" }).format(currentRange.from);
    return monthOffset === 0 ? `الشهر الحالي: ${monthName}` : monthName;
  }, [mode, selectedDate, currentRange, weekOffset, monthOffset]);

  const handleModeChange = (newMode: FilterMode) => {
    setMode(newMode);
    if (newMode === "day") {
      setSelectedDate(new Date());
      onRangeChange({ from: new Date(), to: new Date() }, newMode);
    } else if (newMode === "week") {
      setWeekOffset(0);
      const now = new Date();
      onRangeChange({ from: startOfWeek(now, { weekStartsOn: 0 }), to: endOfWeek(now, { weekStartsOn: 0 }) }, newMode);
    } else {
      setMonthOffset(0);
      const now = new Date();
      onRangeChange({ from: startOfMonth(now), to: endOfMonth(now) }, newMode);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    onRangeChange({ from: date, to: date }, "day");
  };

  const navigate = (dir: -1 | 1) => {
    if (mode === "day") {
      const newDate = subDays(selectedDate, dir);
      setSelectedDate(newDate);
      onRangeChange({ from: newDate, to: newDate }, "day");
    } else if (mode === "week") {
      const newOffset = weekOffset + dir;
      if (newOffset < 0) return;
      setWeekOffset(newOffset);
      const base = subWeeks(new Date(), newOffset);
      onRangeChange({ from: startOfWeek(base, { weekStartsOn: 0 }), to: endOfWeek(base, { weekStartsOn: 0 }) }, "week");
    } else {
      const newOffset = monthOffset + dir;
      if (newOffset < 0) return;
      setMonthOffset(newOffset);
      const base = subMonths(new Date(), newOffset);
      onRangeChange({ from: startOfMonth(base), to: endOfMonth(base) }, "month");
    }
  };

  const modes: { key: FilterMode; label: string; icon: typeof CalendarIcon }[] = [
    { key: "day", label: "يوم", icon: CalendarIcon },
    { key: "week", label: "أسبوع", icon: CalendarDays },
    { key: "month", label: "شهر", icon: CalendarRange },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Mode Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-muted/50 rounded-xl p-1 border border-border/50">
          {modes.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleModeChange(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                mode === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Navigation & Date Display */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {mode === "day" ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 text-xs sm:text-sm font-medium flex-1 min-w-0 justify-center gap-1.5 border-border/50"
                >
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{rangeLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex-1 min-w-0 text-center">
              <span className="text-xs sm:text-sm font-medium text-foreground truncate block px-2">
                {rangeLabel}
              </span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(-1)}
            disabled={
              (mode === "week" && weekOffset === 0) ||
              (mode === "month" && monthOffset === 0) ||
              (mode === "day" && format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Helper: filter actions array by date range */
export const filterActionsByRange = <T extends { date: string }>(
  actions: T[],
  range: DateRange
): T[] => {
  const fromStr = format(range.from, "yyyy-MM-dd");
  const toStr = format(range.to, "yyyy-MM-dd");
  return actions.filter((a) => a.date >= fromStr && a.date <= toStr);
};

export default DateRangeFilter;
