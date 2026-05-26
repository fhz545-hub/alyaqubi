import { HeartPulse } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHealthRecordsForStudent } from "@/store/healthRecordsStore";
import { SEVERITY_LABELS, HealthSeverity } from "@/utils/healthRecords";
import { cn } from "@/lib/utils";

interface Props {
  studentId?: string | null;
  studentNumber?: string | null;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

const sevRank: Record<HealthSeverity, number> = { low: 1, medium: 2, high: 3 };

const sevToColor = (s: HealthSeverity) =>
  s === "high"
    ? "bg-destructive text-destructive-foreground border-destructive/50 animate-pulse"
    : s === "medium"
      ? "bg-warning text-warning-foreground border-warning/50"
      : "bg-rose-500 text-white border-rose-500/50";

export default function HealthBadge({ studentId, studentNumber, size = "sm", showLabel, className }: Props) {
  const records = useHealthRecordsForStudent(studentId, studentNumber);
  if (!records || records.length === 0) return null;

  const top = [...records].sort((a, b) => sevRank[b.severity] - sevRank[a.severity])[0];
  const dim = size === "xs" ? "h-4 px-1 text-[9px]" : size === "md" ? "h-6 px-2 text-[11px]" : "h-5 px-1.5 text-[10px]";
  const iconSize = size === "xs" ? 9 : size === "md" ? 13 : 11;

  const label = records.length === 1 ? top.condition_type : `${top.condition_type} +${records.length - 1}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border font-bold shrink-0 leading-none",
              sevToColor(top.severity),
              dim,
              className,
            )}
            aria-label="حالة صحية"
          >
            <HeartPulse size={iconSize} />
            {showLabel && <span className="truncate max-w-[120px]">{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-right" dir="rtl">
          <div className="space-y-1.5">
            <div className="font-bold text-[13px] flex items-center gap-1">
              <HeartPulse size={13} /> الحالة الصحية
            </div>
            <ul className="space-y-1">
              {records.map((r) => (
                <li key={r.id} className="text-[11px] leading-5">
                  <span className="font-semibold">{r.condition_type}</span>
                  <span className="text-muted-foreground"> — {SEVERITY_LABELS[r.severity]}</span>
                  {r.description && <div className="text-muted-foreground">{r.description}</div>}
                  {r.medications && <div className="text-muted-foreground">دواء: {r.medications}</div>}
                  {r.emergency_contact && <div className="text-muted-foreground">طوارئ: {r.emergency_contact}</div>}
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
