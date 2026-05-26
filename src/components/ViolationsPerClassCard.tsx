import { useMemo } from "react";
import { AlertOctagon, AlertTriangle, TrendingUp } from "lucide-react";
import { StudentAction } from "@/types/school";
import { VIOLATION_DEGREES } from "@/types/school";

interface Props {
  actions: StudentAction[];
}

interface ClassStat {
  grade: string;
  section: number;
  total: number;
  degree1: number;
  degree2: number;
  degree3: number;
  degree4: number;
  points: number;
}

const ALERT_THRESHOLD = 3; // عدد المخالفات للتنبيه

const ViolationsPerClassCard = ({ actions }: Props) => {
  const classStats = useMemo(() => {
    const map: Record<string, ClassStat> = {};

    actions
      .filter((a) => a.type === "violation")
      .forEach((a) => {
        const key = `${a.grade}-${a.section}`;
        if (!map[key]) {
          map[key] = { grade: a.grade, section: a.section, total: 0, degree1: 0, degree2: 0, degree3: 0, degree4: 0, points: 0 };
        }
        map[key].total++;
        const deg = a.violationDegree || 1;
        if (deg === 1) map[key].degree1++;
        else if (deg === 2) map[key].degree2++;
        else if (deg === 3) map[key].degree3++;
        else if (deg === 4) map[key].degree4++;
        map[key].points += VIOLATION_DEGREES[deg]?.points || 1;
      });

    return Object.values(map).sort((a, b) => b.points - a.points);
  }, [actions]);

  if (classStats.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border/50 p-5">
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertOctagon size={18} className="text-destructive" />
          مخالفات الفصول
        </h2>
        <p className="text-sm text-muted-foreground text-center py-4">لا توجد مخالفات مسجلة</p>
      </div>
    );
  }

  const maxPoints = classStats[0]?.points || 1;
  const alertClasses = classStats.filter((c) => c.total >= ALERT_THRESHOLD);

  return (
    <div className="bg-card rounded-xl border border-border/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <TrendingUp size={18} className="text-primary" />
          مؤشر المخالفات حسب الفصل
        </h2>
        <span className="text-xs text-muted-foreground">{classStats.reduce((s, c) => s + c.total, 0)} مخالفة</span>
      </div>

      {/* Alerts */}
      {alertClasses.length > 0 && (
        <div className="mb-4 space-y-2">
          {alertClasses.map((c) => (
            <div
              key={`${c.grade}-${c.section}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20"
            >
              <AlertTriangle size={14} className="text-destructive shrink-0" />
              <span className="text-xs text-destructive font-semibold">
                تنبيه: {c.grade} - فصل {c.section} ({c.total} مخالفة، {c.points} نقطة)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">الفصل</th>
              <th className="text-center py-2 px-1 text-muted-foreground font-medium">المجموع</th>
              <th className="text-center py-2 px-1 text-warning font-medium">د١</th>
              <th className="text-center py-2 px-1 text-warning font-medium">د٢</th>
              <th className="text-center py-2 px-1 text-destructive font-medium">د٣</th>
              <th className="text-center py-2 px-1 text-destructive font-medium">د٤</th>
              <th className="text-right py-2 px-1 text-muted-foreground font-medium">المؤشر</th>
            </tr>
          </thead>
          <tbody>
            {classStats.map((c) => {
              const pct = maxPoints > 0 ? (c.points / maxPoints) * 100 : 0;
              const isAlert = c.total >= ALERT_THRESHOLD;
              return (
                <tr key={`${c.grade}-${c.section}`} className={`border-b border-border/20 ${isAlert ? "bg-destructive/5" : ""}`}>
                  <td className="py-2 px-2 font-medium text-foreground">
                    {c.grade} - {c.section}
                  </td>
                  <td className="text-center py-2 px-1 font-bold text-foreground">{c.total}</td>
                  <td className="text-center py-2 px-1 text-warning">{c.degree1 || "-"}</td>
                  <td className="text-center py-2 px-1 text-warning">{c.degree2 || "-"}</td>
                  <td className="text-center py-2 px-1 text-destructive">{c.degree3 || "-"}</td>
                  <td className="text-center py-2 px-1 text-destructive">{c.degree4 || "-"}</td>
                  <td className="py-2 px-1 w-24">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isAlert ? "bg-destructive" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ViolationsPerClassCard;
