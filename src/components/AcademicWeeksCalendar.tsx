import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Info } from "lucide-react";
import { getCurrentSemesterWeeks, getCurrentAcademicWeek, type AcademicWeek } from "@/utils/academicWeeks";

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const formatGregorianShort = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const AcademicWeeksCalendar = () => {
  const [expanded, setExpanded] = useState(false);
  const semesterData = getCurrentSemesterWeeks();
  const currentWeek = getCurrentAcademicWeek();

  if (!semesterData) return null;

  const { semester, weeks } = semesterData;

  // Group weeks into rows of 4
  const rows: AcademicWeek[][] = [];
  for (let i = 0; i < weeks.length; i += 4) {
    rows.push(weeks.slice(i, i + 4));
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarDays size={20} />
          </div>
          <div className="text-right">
            <h3 className="text-sm font-bold text-foreground">توزيع الأسابيع الدراسية</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{semester}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentWeek && currentWeek.weekNumber > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
              <CalendarDays size={12} />
              {currentWeek.week}
            </span>
          )}
          {expanded ? <ChevronUp size={20} className="text-muted-foreground" /> : <ChevronDown size={20} className="text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30 p-4">
          <div className="space-y-3">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {row.map((week) => {
                  const isCurrent = currentWeek?.weekNumber === week.week && currentWeek?.semester === semester;
                  return (
                    <div
                      key={week.week}
                      className={`rounded-xl border p-3 transition-all ${
                        isCurrent
                          ? "bg-primary/10 border-primary/40 ring-2 ring-primary/20"
                          : "bg-muted/20 border-border/30 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold ${isCurrent ? "text-primary" : "text-foreground"}`}>
                          {week.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded-full">
                            الحالي
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {/* Generate days Sun-Thu */}
                        {(() => {
                          const start = new Date(week.startDate);
                          const end = new Date(week.endDate);
                          const days: { name: string; date: string; greg: string }[] = [];
                          const cur = new Date(start);
                          let dayIdx = 0;
                          while (cur <= end && dayIdx < 5) {
                            days.push({
                              name: dayNames[dayIdx],
                              date: cur.toISOString().split("T")[0],
                              greg: formatGregorianShort(cur.toISOString().split("T")[0]),
                            });
                            cur.setDate(cur.getDate() + 1);
                            dayIdx++;
                          }
                          return days.map((day) => {
                            const isToday = day.date === new Date().toISOString().split("T")[0];
                            return (
                              <div
                                key={day.date}
                                className={`flex items-center justify-between text-[11px] px-2 py-0.5 rounded ${
                                  isToday ? "bg-primary text-primary-foreground font-bold" : ""
                                }`}
                              >
                                <span>{day.name}</span>
                                <span className="font-mono text-[10px]">{day.greg}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      {week.note && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-warning font-semibold bg-warning/10 px-2 py-1 rounded">
                          <Info size={10} />
                          {week.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicWeeksCalendar;
