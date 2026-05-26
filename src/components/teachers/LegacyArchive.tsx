import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Search, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import TeacherProfileDossier from "./TeacherProfileDossier";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ترجمة أنواع الإجراءات الإنجليزية إلى العربية
const ACTION_TYPE_LABELS: Record<string, string> = {
  deduct: "حسم",
  send_sms: "إرسال رسالة",
  print: "طباعة",
  whatsapp: "واتساب",
};
const actionTypeLabel = (t?: string) => {
  const k = (t || "").trim();
  if (!k) return "—";
  return ACTION_TYPE_LABELS[k.toLowerCase()] || k;
};

interface Row {
  id: string;
  source: string;
  report_type: string;
  action_type: string;
  teacher_name: string;
  teacher_civil_id?: string;
  greg_date: string;
  hijri_date: string;
  summary: string;
  created_at: string;
  created_by_name: string;
  payload: any;
}

// تعريفات أنواع الإجراءات الإدارية (يستثنى من ذلك أي طباعة)
const ACTION_DEFINITIONS: Record<string, string> = {
  "تنبيه تأخر": "إشعار رسمي عند التأخر عن الدوام أو الحصة الأولى.",
  "تنبيه عدم تواجد": "إشعار عند عدم وجود المعلم في الحصة المسندة إليه.",
  "مساءلة غياب": "إجراء رسمي عند الغياب الكامل عن الدوام.",
  "لفت نظر": "ملاحظة إدارية على سلوك مهني أو تنظيمي يحتاج تحسيناً.",
  "إجراء إداري": "إجراء عام موثّق في الشؤون الإدارية والمتابعة.",
};

// تصنيف مستوى المعلم بناءً على عدد الإجراءات
function classifyLevel(count: number): { label: string; color: string } {
  if (count === 0) return { label: "ممتاز", color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (count <= 2) return { label: "جيد", color: "bg-sky-100 text-sky-800 border-sky-200" };
  if (count <= 5) return { label: "متابعة", color: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "حرج", color: "bg-rose-100 text-rose-800 border-rose-200" };
}

export default function LegacyArchive() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<string>("all");
  const [act, setAct] = useState<string>("all");
  const [dossier, setDossier] = useState<{ open: boolean; name: string; cid: string }>({
    open: false, name: "", cid: "",
  });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("teacher_legacy_archive")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("تعذر تحميل الأرشيف");
    setRows((data as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // === تنقية الأرشيف: إجراءات إدارية فعلية فقط ===
  // نستبعد سجلات الطباعة، الواتساب، وأي نشاط غير إجرائي،
  // ونقصُر الأرشيف على مصدر «الشؤون الإدارية والمتابعة».
  const NON_ACTION_PATTERNS = [/طباعة/i, /واتساب/i, /whatsapp/i, /شريط/i, /إرسال/i];
  const isRealAction = (r: Row) => {
    if (r.source !== "admin_affairs") return false;
    const t = (r.action_type || "").trim();
    if (!t) return false;
    return !NON_ACTION_PATTERNS.some((re) => re.test(t));
  };

  const cleanRows = useMemo(() => rows.filter(isRealAction), [rows]);

  const actionTypes = useMemo(
    () => Array.from(new Set(cleanRows.map((r) => r.action_type).filter(Boolean))),
    [cleanRows]
  );

  // الإجراءات المرتبطة فقط بالمعلمين
  const teacherActions = useMemo(
    () => cleanRows.filter((r) => r.teacher_name),
    [cleanRows]
  );

  // إحصائيات: الأكثر تكراراً من حيث نوع الإجراء
  const topActionTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    teacherActions.forEach((r) => {
      const k = r.action_type || "إجراء إداري";
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [teacherActions]);

  // قياس مستوى المعلمين بناء على عدد الإجراءات المطبقة
  const teacherLevels = useMemo(() => {
    const map: Record<string, { count: number; cid: string; types: Set<string> }> = {};
    teacherActions.forEach((r) => {
      const key = r.teacher_name;
      if (!map[key]) map[key] = { count: 0, cid: r.teacher_civil_id || "", types: new Set() };
      map[key].count += 1;
      if (r.action_type) map[key].types.add(r.action_type);
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, count: v.count, cid: v.cid, types: Array.from(v.types), level: classifyLevel(v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [teacherActions]);

  const filtered = cleanRows.filter((r) => {
    if (src !== "all" && r.source !== src) return false;
    if (act !== "all" && r.action_type !== act) return false;
    if (q) {
      const t = q.trim().toLowerCase();
      const hay = [
        r.teacher_name, r.report_type, r.action_type,
        r.summary, r.greg_date, r.hijri_date,
      ].join(" ").toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });

  async function remove(id: string) {
    if (!confirm("هل تريد حذف هذا السجل من الأرشيف؟")) return;
    const { error } = await supabase.from("teacher_legacy_archive").delete().eq("id", id);
    if (error) return toast.error("تعذر الحذف (المدير فقط يستطيع الحذف)");
    toast.success("تم الحذف");
    setRows((r) => r.filter((x) => x.id !== id));
  }

  const sourceLabel = (s: string) =>
    s === "monthly_attendance" ? "كشف حضوري شهري" :
    s === "admin_affairs" ? "الشؤون الإدارية والمتابعة" : s;

  return (
    <div className="space-y-4" dir="rtl">
      {/* لوحة المؤشرات: الأكثر إجراء + قياس المستويات + تعريفات الأنواع */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-primary">
              <TrendingUp className="h-4 w-4" /> الأكثر إجراءً
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {topActionTypes.length === 0 && (
              <div className="text-muted-foreground text-xs">لا توجد بيانات بعد</div>
            )}
            {topActionTypes.map(([type, n]) => (
              <div key={type} className="flex items-center justify-between gap-2">
                <span className="truncate">{type}</span>
                <Badge variant="secondary">{n}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" /> قياس مستويات المعلمين
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm max-h-[180px] overflow-auto">
            {teacherLevels.length === 0 && (
              <div className="text-muted-foreground text-xs">لا توجد إجراءات مسجلة</div>
            )}
            {teacherLevels.map((t) => (
              <button
                key={t.name}
                onClick={() => setDossier({ open: true, name: t.name, cid: t.cid })}
                className="w-full flex items-center justify-between gap-2 hover:bg-muted/40 rounded px-1.5 py-1 transition"
              >
                <span className="truncate text-right flex-1">{t.name}</span>
                <span className={`text-[10px] border rounded px-1.5 py-0.5 ${t.level.color}`}>{t.level.label}</span>
                <Badge variant="outline" className="min-w-[28px] justify-center">{t.count}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-sky-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-sky-700">
              <Info className="h-4 w-4" /> تعريف أنواع الإجراءات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {Object.entries(ACTION_DEFINITIONS).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">{k}</Badge>
                <span className="text-muted-foreground leading-relaxed">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث: التاريخ، اسم المعلم، نوع الإجراء، نوع التقرير..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={src} onValueChange={setSrc}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="نوع التقرير" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الإجراءات الإدارية</SelectItem>
            <SelectItem value="admin_affairs">الشؤون الإدارية والمتابعة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={act} onValueChange={setAct}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="نوع الإجراء" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الإجراءات</SelectItem>
            {actionTypes.map((a) => (
              <SelectItem key={a} value={a}>{actionTypeLabel(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      <div className="teacher-table-wrap">
        <div className="overflow-x-auto">
          <table className="teacher-table">
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المعلم</th>
                <th>نوع التقرير</th>
                <th style={{ direction: "rtl", unicodeBidi: "plaintext" }}>نوع الإجراء</th>
                <th>المصدر</th>
                <th>المنفذ</th>
                <th className="text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {loading ? "جاري التحميل..." : "لا توجد سجلات"}
                </td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-mono text-xs" dir="ltr">
                    {r.greg_date || new Date(r.created_at).toLocaleDateString("ar-SA")}
                  </td>
                  <td className="font-bold">{r.teacher_name || "—"}</td>
                  <td>{r.report_type || "—"}</td>
                  <td style={{ direction: "rtl", unicodeBidi: "plaintext" }}>
                    <Badge variant="secondary" className="font-bold">{actionTypeLabel(r.action_type)}</Badge>
                  </td>
                  <td><Badge variant="outline">{sourceLabel(r.source)}</Badge></td>
                  <td className="text-muted-foreground text-xs">{r.created_by_name || "—"}</td>
                  <td className="col-actions">
                    <div className="flex gap-1 justify-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="عرض ملف المعلم المتكامل"
                        onClick={() => setDossier({ open: true, name: r.teacher_name || "", cid: r.teacher_civil_id || "" })}
                        disabled={!r.teacher_name}
                      >
                        <FolderOpen className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TeacherProfileDossier
        open={dossier.open}
        onOpenChange={(v) => setDossier((s) => ({ ...s, open: v }))}
        teacherName={dossier.name}
        teacherCivilId={dossier.cid}
      />
    </div>
  );
}