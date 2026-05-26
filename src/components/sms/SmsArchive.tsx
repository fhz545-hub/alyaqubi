import { useState } from "react";
import { format } from "date-fns";
import { Archive, Printer, Trash2, User, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, ActionType } from "@/types/school";
import { SCHOOL_INFO } from "@/types/school";
import { cn } from "@/lib/utils";

export interface SmsArchiveEntry {
  id: string;
  studentName: string;
  phone: string;
  type: ActionType;
  message: string;
  sentAt: string;
  success: boolean;
  sentByName?: string;
  sentByRole?: string;
}

interface Props {
  entries: SmsArchiveEntry[];
  onClear: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  late: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  absent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  violation: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  permission: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const SmsArchive = ({ entries, onClear }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? entries : entries.slice(0, 15);

  const successCount = entries.filter(e => e.success).length;
  const failCount = entries.filter(e => !e.success).length;

  const handlePrint = () => {
    const printContent = `
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>أرشيف الرسائل النصية</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; }
          .header h1 { font-size: 16px; color: #1a1a2e; margin-bottom: 4px; }
          .header p { font-size: 11px; color: #666; }
          .stats { display: flex; justify-content: center; gap: 30px; margin: 10px 0; }
          .stat { text-align: center; }
          .stat-num { font-size: 18px; font-weight: bold; }
          .stat-label { font-size: 9px; color: #888; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #1a1a2e; color: #fff; padding: 8px 6px; font-size: 11px; text-align: right; }
          td { padding: 6px; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: right; vertical-align: top; }
          tr:nth-child(even) { background: #f8f9fa; }
          .ok { color: #16a34a; font-weight: bold; }
          .fail { color: #dc2626; font-weight: bold; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 8px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>أرشيف الرسائل النصية - ${SCHOOL_INFO.schoolShort}</h1>
          <p>تاريخ التصدير: ${format(new Date(), "yyyy/MM/dd HH:mm")}</p>
          <div class="stats">
            <div class="stat"><div class="stat-num">${entries.length}</div><div class="stat-label">إجمالي</div></div>
            <div class="stat"><div class="stat-num ok">${successCount}</div><div class="stat-label">ناجحة</div></div>
            <div class="stat"><div class="stat-num fail">${failCount}</div><div class="stat-label">فاشلة</div></div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>اسم الطالب</th>
              <th>النوع</th>
              <th>رقم ولي الأمر</th>
              <th>نص الرسالة</th>
              <th>المُرسِل</th>
              <th>الوقت</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((e, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${e.studentName}</td>
                <td>${ACTION_LABELS[e.type] || e.type}</td>
                <td dir="ltr" style="text-align:left">+${e.phone}</td>
                <td style="max-width:220px;white-space:pre-wrap;font-size:10px">${e.message}</td>
                <td>${e.sentByName || "—"}${e.sentByRole ? ` (${e.sentByRole})` : ""}</td>
                <td>${format(new Date(e.sentAt), "HH:mm")}</td>
                <td class="${e.success ? 'ok' : 'fail'}">${e.success ? '✓ نجح' : '✗ فشل'}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="footer">${SCHOOL_INFO.school} — ${SCHOOL_INFO.generalAdmin}</div>
      </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  };

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">أرشيف الإرسال</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span className="font-bold text-emerald-600">{successCount}</span>
            </span>
            {failCount > 0 && (
              <span className="flex items-center gap-1">
                <XCircle size={12} className="text-red-500" />
                <span className="font-bold text-red-600">{failCount}</span>
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1 text-xs">
            <Printer size={12} /> طباعة
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1 text-xs text-destructive hover:text-destructive">
            <Trash2 size={12} /> مسح
          </Button>
        </div>
      </div>

      {/* Entries */}
      <div className="divide-y divide-border max-h-[350px] overflow-y-auto">
        {displayed.map((entry, idx) => (
          <div key={entry.id} className={cn(
            "px-4 py-2.5 flex items-start gap-3 text-xs transition-colors",
            !entry.success && "bg-red-50/50 dark:bg-red-950/10"
          )}>
            <span className="text-muted-foreground w-5 shrink-0 pt-0.5 font-mono">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground">{entry.studentName}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", TYPE_COLORS[entry.type] || "bg-muted text-muted-foreground")}>
                  {ACTION_LABELS[entry.type] || entry.type}
                </span>
              </div>
              {entry.sentByName && (
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                  <User size={9} />
                  <span>{entry.sentByName}</span>
                  {entry.sentByRole && <span className="text-primary/70">({entry.sentByRole})</span>}
                </div>
              )}
            </div>
            <span className="text-muted-foreground font-mono text-[10px] shrink-0" dir="ltr">+{entry.phone}</span>
            <span className="text-muted-foreground text-[10px] shrink-0">{format(new Date(entry.sentAt), "HH:mm")}</span>
            <span className={cn("shrink-0 font-bold", entry.success ? "text-emerald-600" : "text-red-500")}>
              {entry.success ? "✓" : "✗"}
            </span>
          </div>
        ))}
      </div>

      {entries.length > 15 && !showAll && (
        <div className="px-4 py-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)} className="text-xs w-full">
            عرض الكل ({entries.length})
          </Button>
        </div>
      )}
    </div>
  );
};

export default SmsArchive;
