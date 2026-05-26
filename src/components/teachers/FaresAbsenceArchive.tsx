import { Fragment, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CalendarDays, ChevronDown, ChevronUp, FileWarning, Printer, RefreshCw, Search, Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateDailyAbsenceMeta } from "@/utils/haduriArchiveApi";
import { listTeachers, type Teacher } from "@/utils/teachersApi";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { useNavigate } from "react-router-dom";

interface DailyRow {
  id: string;
  teacher_civil_id: string;
  teacher_name: string;
  teacher_phone: string;
  greg_date: string;
  hijri_date: string;
  day_name: string;
  status: string;
  absence_type: string;
  fares_upload_status: string;
  month_label: string;
  month_key: string;
  created_at: string;
}

type FaresStatus = "تم الإدخال" | "لم يتم الإدخال";

const FARES_STATUS_OPTIONS: FaresStatus[] = ["تم الإدخال", "لم يتم الإدخال"];
const ABSENCE_TYPE_OPTIONS = [
  "بدون سند نظامي",
  "مرضي",
  "اضطراري",
  "وفاة",
  "مولود / أبوة",
  "مرافقة مريض",
  "دورة تدريبية / مهمة رسمية",
  "مشاركة وطنية / رياضية رسمية",
];

function normalizeArabicText(v: unknown): string {
  return String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeFaresStatus(raw: unknown): FaresStatus {
  const s = normalizeArabicText(raw).toLowerCase();
  if (!s) return "لم يتم الإدخال";
  if (/(لم يتم|لم يرفع|غير مدخل|غير مرفوع|ليس مدخل|ليس مرفوع|بدون رفع|not uploaded|not entered|no)/i.test(s)) return "لم يتم الإدخال";
  if (/(تم الادخال|تم الرفع|ادخال|رفع|مدخل|مرفوع|رفعت|نعم|uploaded|entered|yes)/i.test(s)) return "تم الإدخال";
  if (/^(لا|لم|غير|ليس|بدون)$/i.test(s)) return "لم يتم الإدخال";
  return "لم يتم الإدخال";
}

function normalizeAbsenceType(raw: unknown): string {
  const text = String(raw ?? "").trim();
  const s = normalizeArabicText(text);
  if (!s) return "بدون سند نظامي";
  if (/مرضي|مرض/.test(s)) return "مرضي";
  if (/اضطراري|اضطرار/.test(s)) return "اضطراري";
  if (/وفاه|وفاة/.test(text) || /وفاه/.test(s)) return "وفاة";
  if (/مولود|ابوه|ابوة/.test(s)) return "مولود / أبوة";
  if (/مرافقه|مريض/.test(s)) return "مرافقة مريض";
  if (/دوره|تدريب|مهمه|رسميه/.test(s)) return "دورة تدريبية / مهمة رسمية";
  if (/مشاركه|وطنيه|رياضيه/.test(s)) return "مشاركة وطنية / رياضية رسمية";
  return text;
}

function dateStamp(s: string): number {
  const d = new Date(`${s || "0000-01-01"}T00:00:00`);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function gregToHijri(greg: string): string {
  if (!greg) return "";
  try {
    const d = new Date(`${greg}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return "";
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = fmt.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    return y && m && day ? `${y}/${m}/${day}` : "";
  } catch { return ""; }
}

function arabicDayName(greg: string): string {
  if (!greg) return "";
  try { return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(`${greg}T00:00:00`)); }
  catch { return ""; }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "خطأ";
}

const faresPillClass = (status: string) =>
  normalizeFaresStatus(status) === "تم الإدخال"
    ? "!border-emerald-500 !bg-emerald-50 !text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-300 font-bold"
    : "!border-destructive !bg-red-50 !text-destructive dark:!bg-destructive/15 font-bold";

const absenceBadgeClass = (type: string) => {
  const n = normalizeAbsenceType(type);
  return n === "بدون سند نظامي"
    ? "border border-destructive/40 bg-destructive/10 text-destructive"
    : "border border-primary/30 bg-primary/10 text-primary";
};

interface TeacherGroup {
  civil_id: string;
  name: string;
  phone: string;
  rows: DailyRow[];
  total: number;
  uploaded: number;
  missing: number;
  latestRow: DailyRow;
}
interface MonthGroup {
  month_key: string;
  month_label: string;
  rows: DailyRow[];
  teachers: TeacherGroup[];
  total: number;
  uploaded: number;
  missing: number;
}

function decideAction(total: number, missing: number): { kind: "تنبيه" | "لفت نظر" | "مساءلة"; reason: string } {
  if (missing >= 3 || total >= 5) return { kind: "مساءلة", reason: "تكرار الغياب وعدم الرفع في نظام فارس" };
  if (missing >= 2 || total >= 3) return { kind: "لفت نظر", reason: "تكرار الغياب أو عدم رفعه في نظام فارس" };
  return { kind: "تنبيه", reason: "غياب أو تأخر في رفع الغياب على نظام فارس" };
}

export default function FaresAbsenceArchive() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPrincipal = profile?.is_principal === true;
  const canEditAbsenceType =
    isPrincipal ||
    hasPermission(profile?.user_id || "", isPrincipal, "manage_teacher_absence_type") ||
    hasPermission(profile?.user_id || "", isPrincipal, "manage_teacher_affairs");
  const canEditFares =
    isPrincipal ||
    hasPermission(profile?.user_id || "", isPrincipal, "manage_fares_upload") ||
    hasPermission(profile?.user_id || "", isPrincipal, "manage_teacher_affairs");
  const canEdit = canEditAbsenceType || canEditFares;

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [allRows, setAllRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "uploaded" | "missing">("all");
  const [activeMonth, setActiveMonth] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("haduri_daily_records")
        .select("id,teacher_civil_id,teacher_name,teacher_phone,greg_date,hijri_date,day_name,status,absence_type,fares_upload_status,month_label,month_key,created_at")
        .or("status.eq.غياب,status.ilike.%غياب%")
        .order("greg_date", { ascending: false })
        .limit(8000);
      if (error) throw error;
      const list = ((data || []) as DailyRow[])
        .filter((r) => normalizeArabicText(r.status).includes("غياب"))
        .map((r) => ({
          ...r,
          absence_type: normalizeAbsenceType(r.absence_type),
          fares_upload_status: normalizeFaresStatus(r.fares_upload_status),
          hijri_date: r.hijri_date || gregToHijri(r.greg_date),
          day_name: r.day_name || arabicDayName(r.greg_date),
          month_key: r.month_key || (r.greg_date || "").slice(0, 7) || (r.month_label || ""),
        }));
      setAllRows(list);
    } catch (e: unknown) {
      toast.error("تعذّر تحميل أرشيف الغياب: " + errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); listTeachers().then(setTeachers).catch(() => {}); }, []);

  // Sync from other views
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.id) { fetchAll(); return; }
      setAllRows((cur) => cur.map((r) => r.id === detail.id ? {
        ...r,
        absence_type: detail.absence_type ? normalizeAbsenceType(detail.absence_type) : r.absence_type,
        fares_upload_status: detail.fares_upload_status ? normalizeFaresStatus(detail.fares_upload_status) : r.fares_upload_status,
      } : r));
    };
    window.addEventListener("haduri-daily-updated", handler);
    return () => window.removeEventListener("haduri-daily-updated", handler);
  }, []);

  // Apply filters / search before grouping
  const visibleRows = useMemo(() => {
    let list = allRows;
    if (filter === "uploaded") list = list.filter((r) => normalizeFaresStatus(r.fares_upload_status) === "تم الإدخال");
    if (filter === "missing") list = list.filter((r) => normalizeFaresStatus(r.fares_upload_status) !== "تم الإدخال");
    const q = search.trim();
    if (q) {
      const qn = normalizeArabicText(q);
      list = list.filter((r) =>
        normalizeArabicText(r.teacher_name).includes(qn) ||
        (r.greg_date || "").includes(q) ||
        (r.hijri_date || "").includes(q) ||
        (r.month_label || "").includes(q) ||
        normalizeArabicText(r.absence_type).includes(qn)
      );
    }
    return list;
  }, [allRows, filter, search]);

  // Group by month, sort newest first
  const months = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, MonthGroup>();
    for (const r of visibleRows) {
      const key = r.month_key || r.month_label || "—";
      if (!map.has(key)) {
        map.set(key, { month_key: key, month_label: r.month_label || key, rows: [], teachers: [], total: 0, uploaded: 0, missing: 0 });
      }
      map.get(key)!.rows.push(r);
    }
    const list = Array.from(map.values()).map((m) => {
      m.rows.sort((a, b) => dateStamp(b.greg_date) - dateStamp(a.greg_date) || String(b.created_at).localeCompare(String(a.created_at)));
      // build teacher groups
      const tMap = new Map<string, TeacherGroup>();
      for (const r of m.rows) {
        const civ = (r.teacher_civil_id || "").trim();
        const k = civ || r.teacher_name;
        if (!tMap.has(k)) tMap.set(k, { civil_id: civ, name: r.teacher_name || "—", phone: r.teacher_phone || "", rows: [], total: 0, uploaded: 0, missing: 0, latestRow: r });
        const g = tMap.get(k)!;
        g.rows.push(r);
        g.total += 1;
        if (normalizeFaresStatus(r.fares_upload_status) === "تم الإدخال") g.uploaded += 1; else g.missing += 1;
        if (dateStamp(r.greg_date) > dateStamp(g.latestRow.greg_date)) g.latestRow = r;
      }
      m.teachers = Array.from(tMap.values()).sort((a, b) => b.missing - a.missing || b.total - a.total);
      m.total = m.rows.length;
      m.uploaded = m.rows.filter((r) => normalizeFaresStatus(r.fares_upload_status) === "تم الإدخال").length;
      m.missing = m.total - m.uploaded;
      return m;
    });
    list.sort((a, b) => String(b.month_key).localeCompare(String(a.month_key)));
    return list;
  }, [visibleRows]);

  useEffect(() => {
    if (!activeMonth && months.length) setActiveMonth(months[0].month_key);
    if (activeMonth && !months.find((m) => m.month_key === activeMonth) && months.length) setActiveMonth(months[0].month_key);
  }, [months, activeMonth]);

  const handleRowChange = async (row: DailyRow, field: "absence_type" | "fares_upload_status", value: string) => {
    if (field === "fares_upload_status" && !canEditFares) { toast.error("لا تملك صلاحية تعديل حالة الرفع في فارس — يحددها مدير المدرسة"); return; }
    if (field === "absence_type" && !canEditAbsenceType) { toast.error("لا تملك صلاحية تعديل نوع الغياب"); return; }
    const next = { ...row, [field]: field === "absence_type" ? normalizeAbsenceType(value) : normalizeFaresStatus(value) };
    setSavingId(row.id);
    setAllRows((cur) => cur.map((r) => r.id === row.id ? next : r));
    try {
      const saved = await updateDailyAbsenceMeta(row.id, next.absence_type, next.fares_upload_status);
      const canonical = { ...next, absence_type: normalizeAbsenceType(saved.absence_type), fares_upload_status: normalizeFaresStatus(saved.fares_upload_status) };
      setAllRows((cur) => cur.map((r) => r.id === row.id ? canonical : r));
      try {
        window.dispatchEvent(new CustomEvent("haduri-daily-updated", { detail: { id: row.id, teacher_civil_id: row.teacher_civil_id, field, value: (canonical as any)[field], absence_type: canonical.absence_type, fares_upload_status: canonical.fares_upload_status } }));
      } catch { /* noop */ }
      toast.success("تم الحفظ في قاعدة البيانات");
    } catch (err: unknown) {
      setAllRows((cur) => cur.map((r) => r.id === row.id ? row : r));
      toast.error("تعذّر الحفظ: " + errorMessage(err));
    } finally { setSavingId(""); }
  };

  const sendReminder = (g: TeacherGroup, monthLabel: string) => {
    const phone = (g.phone || "").replace(/\D/g, "") || "966500000000";
    const msg = [
      "السلام عليكم ورحمة الله وبركاته،",
      `الأستاذ الفاضل/ ${g.name}`,
      `تذكير ودّي بضرورة رفع غيابك على نظام (فارس) — ${monthLabel}.`,
      `عدد الأيام غير المُدخلة: ${g.missing}.`,
      "نأمل المبادرة بالإدخال حفاظًا على انتظام السجلات.",
      "شؤون المعلمين — مدرسة اليعقوبي الثانوية",
    ].join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const generateOfficialAction = (g: TeacherGroup) => {
    const t = teachers.find((x) => (x.civil_id || "").replace(/\D/g, "") === (g.civil_id || "").replace(/\D/g, ""));
    const action = decideAction(g.total, g.missing);
    const target = g.rows.find((r) => normalizeFaresStatus(r.fares_upload_status) !== "تم الإدخال") || g.latestRow;
    const kind: "gaib" | "absent" | "late" | "note" =
      action.kind === "مساءلة" ? "gaib" : action.kind === "لفت نظر" ? "note" : "absent";
    const params = new URLSearchParams({
      kind,
      civil: g.civil_id || (t?.civil_id || ""),
      name: g.name || (t?.full_name || ""),
      date: target?.greg_date || "",
      faris: g.missing > 0 ? "not" : "raised",
      total: String(g.total),
      missing: String(g.missing),
    });
    navigate(`/teacher-affairs/admin?${params.toString()}`);
  };

  const printMonth = (m: MonthGroup) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rowsHtml = m.rows.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td class="name">${r.teacher_name}</td>
      <td>${r.day_name || arabicDayName(r.greg_date) || "—"}</td>
      <td>${r.hijri_date || gregToHijri(r.greg_date) || "—"}</td>
      <td>${r.greg_date || "—"}</td>
      <td>${normalizeAbsenceType(r.absence_type)}</td>
      <td>${normalizeFaresStatus(r.fares_upload_status)}</td>
    </tr>`).join("");
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>أرشيف غياب فارس — ${m.month_label}</title>
      <style>@page{size:A4;margin:12mm}body{font-family:Arial,Tahoma,sans-serif;color:hsl(222 47% 11%)}h2{text-align:center;color:hsl(173 80% 26%)}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}th{background:hsl(173 80% 26%);color:#fff;padding:8px;border:1px solid hsl(173 80% 26%)}td{padding:7px;border:1px solid hsl(214 32% 84%);text-align:center}tr:nth-child(even) td{background:hsl(210 40% 98%)}.name{font-weight:800;color:hsl(173 80% 26%);text-align:right}</style></head><body>
      <h2>أرشيف الغياب والرفع في فارس — ${m.month_label}</h2>
      <p style="text-align:center">إجمالي: ${m.total} — مرفوع: ${m.uploaded} — لم يُرفع: ${m.missing}</p>
      <table><thead><tr><th>#</th><th>المعلم</th><th>اليوم</th><th>التاريخ الهجري</th><th>التاريخ الميلادي</th><th>نوع الغياب</th><th>الرفع في فارس</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7">لا توجد سجلات.</td></tr>`}</tbody></table>
      <script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
    w.document.close();
  };

  const currentMonth = months.find((m) => m.month_key === activeMonth) || months[0];

  return (
    <div dir="rtl" className="space-y-4">
      {/* Toolbar */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 font-extrabold text-primary">
          <FileWarning className="w-5 h-5" /> أرشيف الغياب والرفع في فارس
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث باسم المعلم أو التاريخ أو نوع الغياب..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 h-9" />
        </div>
        <Select value={filter} onValueChange={(v: "all" | "uploaded" | "missing") => setFilter(v)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">عرض الكل</SelectItem>
            <SelectItem value="uploaded">المرفوع في فارس</SelectItem>
            <SelectItem value="missing">غير المرفوع في فارس</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </Card>

      {/* Month tabs */}
      {months.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <Button
              key={m.month_key}
              size="sm"
              variant={activeMonth === m.month_key ? "default" : "outline"}
              onClick={() => setActiveMonth(m.month_key)}
              className="gap-2"
            >
              <CalendarDays className="w-4 h-4" /> {m.month_label}
              <Badge variant="secondary" className="mr-1">{m.rows.length}</Badge>
              {m.missing > 0 && <Badge className="mr-1 bg-destructive text-destructive-foreground">{m.missing} لم يُرفع</Badge>}
            </Button>
          ))}
        </div>
      )}

      {/* Empty / Loading */}
      {loading && <Card className="p-10 text-center text-muted-foreground">جارٍ تحميل أرشيف الغياب...</Card>}
      {!loading && months.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">لا توجد سجلات غياب حتى الآن.</Card>
      )}

      {/* Month panel */}
      {!loading && currentMonth && (
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-gradient-to-l from-primary/10 to-primary/5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <div className="font-extrabold text-primary text-lg">{currentMonth.month_label}</div>
              <Badge variant="outline">عدد المعلمين الغائبين: {currentMonth.teachers.length}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border px-2 py-1">إجمالي الغياب: <b className="text-foreground">{currentMonth.total}</b></span>
              <span className="rounded-md border border-emerald-500 bg-emerald-50 text-emerald-700 px-2 py-1 font-bold">مرفوع: {currentMonth.uploaded}</span>
              <span className="rounded-md border border-destructive bg-red-50 text-destructive px-2 py-1 font-bold">لم يُرفع: {currentMonth.missing}</span>
              <Button size="sm" variant="outline" onClick={() => printMonth(currentMonth)}>
                <Printer className="w-4 h-4 ml-1" /> طباعة الشهر
              </Button>
            </div>
          </div>

          {/* Flat list of absences (newest first) */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-xs">
                  <th className="p-2 w-10">#</th>
                  <th className="p-2 text-right">اسم المعلم</th>
                  <th className="p-2">نوع الغياب</th>
                  <th className="p-2">اليوم</th>
                  <th className="p-2">التاريخ الهجري</th>
                  <th className="p-2">التاريخ الميلادي</th>
                  <th className="p-2 min-w-[180px]">الرفع في فارس</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {currentMonth.rows.map((r, i) => {
                  const tKey = `${currentMonth.month_key}::${r.teacher_civil_id || r.teacher_name}`;
                  const isExpanded = !!expanded[tKey];
                  const tg = currentMonth.teachers.find((t) => (t.civil_id || t.name) === (r.teacher_civil_id || r.teacher_name));
                  return (
                    <Fragment key={r.id}>
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => setExpanded((e) => ({ ...e, [tKey]: !e[tKey] }))}
                            className="font-bold text-primary hover:underline flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            {r.teacher_name}
                          </button>
                        </td>
                        <td className="p-2 text-center">
                          <Select value={normalizeAbsenceType(r.absence_type)} onValueChange={(v) => handleRowChange(r, "absence_type", v)} disabled={!canEditAbsenceType || savingId === r.id}>
                            <SelectTrigger className={`h-8 text-xs ${absenceBadgeClass(r.absence_type)}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {!ABSENCE_TYPE_OPTIONS.includes(normalizeAbsenceType(r.absence_type)) && <SelectItem value={normalizeAbsenceType(r.absence_type)}>{normalizeAbsenceType(r.absence_type)}</SelectItem>}
                              {ABSENCE_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 text-center text-xs whitespace-nowrap">{r.day_name || arabicDayName(r.greg_date) || "—"}</td>
                        <td className="p-2 text-center font-mono text-xs whitespace-nowrap" dir="ltr">{r.hijri_date || gregToHijri(r.greg_date) || "—"}</td>
                        <td className="p-2 text-center font-mono text-xs whitespace-nowrap" dir="ltr">{r.greg_date || "—"}</td>
                        <td className="p-2">
                          <Select value={normalizeFaresStatus(r.fares_upload_status)} onValueChange={(v) => handleRowChange(r, "fares_upload_status", v)} disabled={!canEditFares || savingId === r.id}>
                            <SelectTrigger className={`h-9 ${faresPillClass(r.fares_upload_status)}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FARES_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 text-center">
                          {savingId === r.id && <RefreshCw className="w-4 h-4 animate-spin text-primary inline" />}
                        </td>
                      </tr>

                      {isExpanded && tg && (
                        <tr key={r.id + "-exp"} className="bg-muted/10">
                          <td colSpan={8} className="p-3">
                            <div className="rounded-md border bg-background p-3 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-bold text-primary flex items-center gap-2">
                                  <span>سجل غياب المعلم: {tg.name}</span>
                                  <Badge variant="outline">إجمالي: {tg.total}</Badge>
                                  <Badge className="bg-emerald-600 text-white">مرفوع: {tg.uploaded}</Badge>
                                  <Badge className="bg-destructive text-destructive-foreground">لم يُرفع: {tg.missing}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {tg.missing > 0 && (
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => sendReminder(tg, currentMonth.month_label)}>
                                      <Send className="w-4 h-4 ml-1" /> تذكير واتساب
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => generateOfficialAction(tg)}>
                                    <FileWarning className="w-4 h-4 ml-1" /> توليد الإجراء الرسمي
                                  </Button>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border">
                                  <thead className="bg-muted/40">
                                    <tr>
                                      <th className="p-2 w-8">#</th>
                                      <th className="p-2">اليوم</th>
                                      <th className="p-2">التاريخ الهجري</th>
                                      <th className="p-2">التاريخ الميلادي</th>
                                      <th className="p-2">نوع الغياب</th>
                                      <th className="p-2">الرفع في فارس</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tg.rows.map((rr, idx) => (
                                      <tr key={rr.id} className="border-t">
                                        <td className="p-1.5 text-center">{idx + 1}</td>
                                        <td className="p-1.5 text-center whitespace-nowrap">{rr.day_name || arabicDayName(rr.greg_date) || "—"}</td>
                                        <td className="p-1.5 text-center font-mono whitespace-nowrap" dir="ltr">{rr.hijri_date || gregToHijri(rr.greg_date) || "—"}</td>
                                        <td className="p-1.5 text-center font-mono whitespace-nowrap" dir="ltr">{rr.greg_date || "—"}</td>
                                        <td className="p-1.5 text-center">{normalizeAbsenceType(rr.absence_type)}</td>
                                        <td className="p-1.5 text-center">
                                          <span className={`inline-block rounded-md px-2 py-0.5 ${faresPillClass(rr.fares_upload_status)}`}>
                                            {normalizeFaresStatus(rr.fares_upload_status)}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {currentMonth.rows.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">لا توجد سجلات في هذا الشهر.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
