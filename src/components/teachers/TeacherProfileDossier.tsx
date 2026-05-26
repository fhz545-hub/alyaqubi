import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, FileText, ClipboardList, CalendarDays, BarChart3,
  IdCard, Printer, Save, BookOpen, Users2, CalendarRange, Phone, GraduationCap, Briefcase,
  Upload, Plus, Trash2, ListChecks, FileSpreadsheet, FileType, CheckCircle2, AlertCircle, XCircle,
} from "lucide-react";
import {
  parseExcelFile, parseDocxFile, parseSingleScheduleText, matchTeacher,
  settingsKeyFor, mergeIntoExtras,
  type ParsedTeacherSchedule, type ScheduleGrid, type TeacherCandidate,
} from "@/utils/scheduleImport";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import LoadingScreen from "@/components/LoadingScreen";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateDailyAbsenceMeta } from "@/utils/haduriArchiveApi";
import TeacherDeductionDialog from "./TeacherDeductionDialog";
import { Gavel } from "lucide-react";

// ترجمة أنواع الإجراءات الإنجليزية إلى العربية
const ACTION_TYPE_AR: Record<string, string> = {
  deduct: "حسم",
  send_sms: "إرسال رسالة",
  print: "طباعة",
  whatsapp: "واتساب",
};
function translateActionType(t?: string): string {
  const k = (t || "").trim();
  if (!k) return "—";
  return ACTION_TYPE_AR[k.toLowerCase()] || k;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teacherName: string;
  teacherCivilId?: string;
  /** عند true: نعرض المحتوى مباشرة بدون نافذة Dialog (مناسب للتضمين داخل صفحة) */
  embedded?: boolean;
  /** عند true: إخفاء تبويبات «المواد والشعب» و«الجدول الدراسي» (لمن لا يدرّس مواد) */
  hideTeachingSections?: boolean;
}

interface Bucket {
  monthly: any[];
  daily: any[];
  notices: any[];
  archive: any[];
  messages: any[];
}

const empty: Bucket = { monthly: [], daily: [], notices: [], archive: [], messages: [] };

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"] as const;
const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

interface TeacherExtras {
  subjects: string[];
  sections: string[];
  notes: string;
  schedule: Record<string, Record<string, { subject: string; section: string }>>;
}

const defaultExtras: TeacherExtras = {
  subjects: [],
  sections: [],
  notes: "",
  schedule: {},
};

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

function normalizeTeacherText(v: unknown): string {
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

function normalizeTeacherFaresStatus(raw: unknown): "تم الإدخال" | "لم يتم الإدخال" {
  const s = normalizeTeacherText(raw).toLowerCase();
  const hasUploadTerm = /(ادخال|مدخل|رفع|مرفوع|فارس|uploaded|entered|yes|نعم)/i.test(s);
  const isNegative = /(لم|غير|لا|ليس|بدون|not|no)/i.test(s);
  if (hasUploadTerm && !isNegative) return "تم الإدخال";
  if (/(تم الادخال|تم الرفع|مدخل|مرفوع|رفعت|نعم|uploaded|entered|yes)/i.test(s)) return "تم الإدخال";
  return "لم يتم الإدخال";
}

function normalizeTeacherAbsenceType(raw: unknown): string {
  const text = String(raw ?? "").trim();
  const s = normalizeTeacherText(text);
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

function settingsKey(name: string, cid?: string): string {
  const id = (cid || "").trim();
  return `teacher_profile:${id || `name:${name.trim()}`}`;
}

export default function TeacherProfileDossier({ open, onOpenChange, teacherName, teacherCivilId, embedded = false, hideTeachingSections = false }: Props) {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const userId = profile?.user_id || "";
  const canEdit = isPrincipal || hasPermission(userId, isPrincipal, "manage_teacher_affairs");
  const canEditAbsenceMeta = canEdit || hasPermission(userId, isPrincipal, "manage_teacher_absence_type");
  const canEditFares = canEdit || hasPermission(userId, isPrincipal, "manage_fares_upload");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Bucket>(empty);
  const [teacherInfo, setTeacherInfo] = useState<any | null>(null);
  const [extras, setExtras] = useState<TeacherExtras>(defaultExtras);
  const [savingExtras, setSavingExtras] = useState(false);
  const [savingDailyId, setSavingDailyId] = useState("");
  const [subjectsInput, setSubjectsInput] = useState("");
  const [sectionsInput, setSectionsInput] = useState("");
  const [deductOpen, setDeductOpen] = useState(false);

  useEffect(() => {
    // نسمح بالتحميل تلقائياً في وضع التضمين (embedded) حتى لو لم تكن نافذة Dialog مفتوحة.
    if ((!open && !embedded) || !teacherName) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const nameFilter = teacherName.trim();
        const cidFilter = (teacherCivilId || "").trim();

        const applyTeacherFilter = (q: any, civilCol = "teacher_civil_id", nameCol = "teacher_name") => (
          cidFilter ? q.eq(civilCol, cidFilter) : q.eq(nameCol, nameFilter)
        );

        const monthlyQuery = applyTeacherFilter(
          supabase
            .from("haduri_monthly_attendance")
            .select("month_label,month_key,present_days,absent_days,late_min,excuse_min,work_min,open_days,total_days,teacher_civil_id,teacher_name")
        ).order("month_key", { ascending: false }).limit(60);

        const dailyQuery = applyTeacherFilter(
          supabase
            .from("haduri_daily_records")
            .select("id,greg_date,hijri_date,day_name,status,in_time,out_time,late_min,excuse_min,work_min,month_label,teacher_civil_id,teacher_name,absence_type,fares_upload_status")
        ).order("greg_date", { ascending: false }).limit(500);

        const noticesQuery = applyTeacherFilter(
          supabase
            .from("teacher_notices")
            .select("id,notice_kind,greg_date,hijri_date,day_name,note_reason,created_by_name,created_at,serial_number,teacher_civil_id,teacher_name,late_total_min,abs_total_min")
        ).order("created_at", { ascending: false }).limit(300);

        const archiveQuery = applyTeacherFilter(
          supabase
            .from("teacher_legacy_archive")
            .select("id,source,report_type,action_type,greg_date,hijri_date,month_label,summary,created_by_name,created_at,teacher_civil_id,teacher_name")
        ).order("created_at", { ascending: false }).limit(300);

        const [monthly, daily, notices, archive] = await Promise.all([
          monthlyQuery,
          dailyQuery,
          noticesQuery,
          archiveQuery,
        ]);

        // 5) Teacher master record
        let teacherRow: any = null;
        if (cidFilter) {
          const { data: t } = await supabase
            .from("teachers").select("*").eq("civil_id", cidFilter).maybeSingle();
          teacherRow = t;
        }
        if (!teacherRow) {
          const { data: t } = await supabase
            .from("teachers").select("*").eq("full_name", nameFilter).maybeSingle();
          teacherRow = t;
        }

        // 6) Teacher extras (subjects/sections/schedule)
        const key = settingsKey(nameFilter, cidFilter);
        const { data: setting } = await supabase
          .from("teacher_settings").select("value").eq("key", key).maybeSingle();
        const fetched: TeacherExtras = setting?.value
          ? { ...defaultExtras, ...(setting.value as any) }
          : defaultExtras;

        if (cancelled) return;
        setData({
          monthly: monthly.data ?? [],
          daily: daily.data ?? [],
          notices: notices.data ?? [],
          archive: archive.data ?? [],
          messages: [],
        });
        setTeacherInfo(teacherRow);
        setExtras(fetched);
        setSubjectsInput((fetched.subjects || []).join("، "));
        setSectionsInput((fetched.sections || []).join("، "));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, teacherName, teacherCivilId, embedded]);

  // الاستماع لتحديثات حالة الرفع في فارس / نوع الغياب من أرشيف الغياب
  useEffect(() => {
    function onUpdated(e: any) {
      const d = e?.detail || {};
      if (!d.id) return;
      setData((prev) => ({
        ...prev,
        daily: prev.daily.map((r: any) =>
          r.id === d.id ? {
            ...r,
            absence_type: normalizeTeacherAbsenceType(d.absence_type ?? (d.field === "absence_type" ? d.value : r.absence_type)),
            fares_upload_status: normalizeTeacherFaresStatus(d.fares_upload_status ?? (d.field === "fares_upload_status" ? d.value : r.fares_upload_status)),
          } : r,
        ),
      }));
    }
    window.addEventListener("haduri-daily-updated", onUpdated as any);
    return () => window.removeEventListener("haduri-daily-updated", onUpdated as any);
  }, []);

  async function updateDailyMeta(row: any, field: "absence_type" | "fares_upload_status", value: string) {
    const canEditField = field === "fares_upload_status" ? canEditFares : canEditAbsenceMeta;
    if (!canEditField) { toast.error(field === "fares_upload_status" ? "لا تملك صلاحية تعديل حالة الرفع في فارس" : "لا تملك صلاحية تعديل بيانات الغياب في فارس"); return; }
    const prev = data.daily;
    const next_abs = normalizeTeacherAbsenceType(field === "absence_type" ? value : (row.absence_type || ""));
    const next_fares = normalizeTeacherFaresStatus(field === "fares_upload_status" ? value : (row.fares_upload_status || ""));
    setSavingDailyId(row.id);
    setData((p) => ({ ...p, daily: p.daily.map((r: any) => r.id === row.id ? { ...r, absence_type: next_abs, fares_upload_status: next_fares } : r) }));
    try {
      const saved = await updateDailyAbsenceMeta(row.id, next_abs, next_fares);
      const canonical = {
        absence_type: normalizeTeacherAbsenceType(saved.absence_type),
        fares_upload_status: normalizeTeacherFaresStatus(saved.fares_upload_status),
      };
      setData((p) => ({ ...p, daily: p.daily.map((r: any) => r.id === row.id ? { ...r, ...canonical } : r) }));
      try {
        window.dispatchEvent(new CustomEvent("haduri-daily-updated", {
          detail: { id: row.id, teacher_civil_id: row.teacher_civil_id, field, value: (canonical as any)[field], ...canonical },
        }));
      } catch {}
      toast.success("تم الحفظ في قاعدة البيانات");
    } catch (err: any) {
      setData((p) => ({ ...p, daily: prev }));
      toast.error("تعذّر الحفظ: " + (err?.message || "خطأ"));
    } finally {
      setSavingDailyId("");
    }
  }

  // Derived KPIs — تجميع شامل من (1) السجل اليومي (2) الملخصات الشهرية (3) الإشعارات الرسمية
  // الهدف: عرض إجمالي دقيق للمعلم حتى لو كان مصدر البيانات شهرياً فقط.
  const kpis = useMemo(() => {
    // (1) من السجل اليومي: الأيام الفعلية أدق مصدر لعدد أيام الحضور/التأخر/الاستئذان.
    let presentD = 0, absentD = 0, lateD = 0, excuseD = 0, lateMinD = 0, excuseMinD = 0;
    const uniqueDaily = new Map<string, any>();
    for (const r of data.daily) {
      const key = String(r.greg_date || r.hijri_date || `${r.month_label}-${uniqueDaily.size}`);
      const prev = uniqueDaily.get(key);
      if (!prev || Number(r.late_min || 0) + Number(r.excuse_min || 0) > Number(prev.late_min || 0) + Number(prev.excuse_min || 0)) {
        uniqueDaily.set(key, r);
      }
    }
    for (const r of uniqueDaily.values()) {
      const s = String(r.status || "").trim();
      const absent = s.includes("غياب");
      if (absent) absentD++;
      else if (s || r.in_time || r.out_time) presentD++;
      if (Number(r.late_min || 0) > 0 || s.includes("تأخر") || s.includes("متأخر")) lateD++;
      if (Number(r.excuse_min || 0) > 0 || s.includes("استئذان")) excuseD++;
      lateMinD += Number(r.late_min || 0);
      excuseMinD += Number(r.excuse_min || 0);
    }

    // (2) من الملخصات الشهرية (إجمالي أيام/دقائق عبر كل الأشهر)
    let presentM = 0, absentM = 0, lateMinM = 0, excuseMinM = 0, totalM = 0;
    for (const m of data.monthly) {
      presentM += Number(m.present_days || 0);
      absentM += Number(m.absent_days || 0);
      lateMinM += Number(m.late_min || 0);
      excuseMinM += Number(m.excuse_min || 0);
      totalM += Number(m.total_days || 0);
    }

    // (3) من الإشعارات الرسمية للبيان فقط، ولا تُضاف إلى عدد الأيام حتى لا تتكرر مع السجل اليومي.
    let lateN = 0, absentN = 0, noteN = 0;
    for (const n of data.notices) {
      const k = String(n.notice_kind || "");
      if (k === "late") lateN++;
      else if (k === "absent" || k === "gaib") absentN++;
      else if (k === "note") noteN++;
    }

    // المعتمد للعرض: نعرض عدد الأيام من السجل اليومي عند توفره، ونستخدم الملخص الشهري كاحتياط للحضور/الغياب.
    const hasDaily = uniqueDaily.size > 0;
    const present = hasDaily ? presentD : presentM;
    const absent = hasDaily ? absentD : absentM;
    const late = hasDaily ? lateD : (lateMinM > 0 ? Math.ceil(lateMinM / 30) : 0);
    const excuse = hasDaily ? excuseD : (excuseMinM > 0 ? Math.ceil(excuseMinM / 60) : 0);
    const total = hasDaily ? uniqueDaily.size : totalM;
    return {
      present, absent, late, excuse, total,
      lateMin: hasDaily ? lateMinD : lateMinM,
      excuseMin: hasDaily ? excuseMinD : excuseMinM,
      noticesLate: lateN, noticesAbsent: absentN, noticesNote: noteN,
    };
  }, [data]);

  const absenceDailyRows = useMemo(() => {
    return [...data.daily]
      .filter((d: any) => String(d.status || "").includes("غياب"))
      .sort((a: any, b: any) => String(b.greg_date || "").localeCompare(String(a.greg_date || "")))
      .slice(0, 300);
  }, [data.daily]);

  const absenceFaresSummary = useMemo(() => {
    const uploaded = absenceDailyRows.filter((d: any) => normalizeTeacherFaresStatus(d.fares_upload_status) === "تم الإدخال").length;
    return { total: absenceDailyRows.length, uploaded, missing: Math.max(0, absenceDailyRows.length - uploaded) };
  }, [absenceDailyRows]);

  const splitList = (raw: string): string[] =>
    raw.split(/[،,\n]+/).map((s) => s.trim()).filter(Boolean);

  async function saveExtras() {
    if (!canEdit) {
      toast.error("حفظ بيانات المعلم متاح للمدير أو لمن يملك صلاحية شؤون المعلمين");
      return;
    }
    setSavingExtras(true);
    try {
      const next: TeacherExtras = {
        ...extras,
        subjects: splitList(subjectsInput),
        sections: splitList(sectionsInput),
      };
      const key = settingsKey(teacherName, teacherCivilId);
      const { error } = await supabase
        .from("teacher_settings")
        .upsert({ key, value: next as any, updated_by: profile?.user_id ?? null }, { onConflict: "key" });
      if (error) throw error;
      setExtras(next);
      toast.success("تم حفظ بيانات المعلم");
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحفظ");
    } finally {
      setSavingExtras(false);
    }
  }

  function setCell(day: string, period: number, field: "subject" | "section", value: string) {
    setExtras((prev) => {
      const sched = { ...(prev.schedule || {}) };
      const dayMap = { ...(sched[day] || {}) };
      const cell = { ...(dayMap[period] || { subject: "", section: "" }) };
      cell[field] = value;
      dayMap[period] = cell;
      sched[day] = dayMap;
      return { ...prev, schedule: sched };
    });
  }

  function printDossier() {
    const html = buildTeacherDossierHTML({
      teacher: {
        name: teacherName,
        civil_id: teacherCivilId || teacherInfo?.civil_id || "",
        phone: teacherInfo?.phone || "",
        specialization: teacherInfo?.specialization || "",
        rank_title: teacherInfo?.rank_title || "",
        job_number: teacherInfo?.job_number || "",
        current_job: teacherInfo?.current_job || "معلم",
      },
      extras,
      kpis,
      monthly: data.monthly.slice(0, 12),
      archiveCount: data.archive.length,
      noticesCount: data.notices.length,
    });
    const w = window.open("", "_blank");
    if (!w) return toast.error("النوافذ المنبثقة محظورة في المتصفح");
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 600);
  }

  // Determine which tabs to show:
  // - إن مرّر المستدعي القيمة بصراحة فاعتمدها.
  // - وإلا: استنتجها من current_job للمعلم (الأدوار الإدارية لا تدرّس مواد ولا شعب).
  const autoHide = isNonTeachingJob(teacherInfo?.current_job);
  const showTeaching = !(hideTeachingSections || autoHide);

  const headerNode = (
    <div className="relative bg-gradient-to-l from-primary/15 via-primary/5 to-transparent border-b">
          <div className="p-3 sm:p-5 md:p-6 flex flex-wrap items-start gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-primary/20 grid place-items-center shrink-0 border border-primary/30">
              <IdCard className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div className="flex-1 min-w-[180px] sm:min-w-[260px]">
          {embedded ? (
            <div className="text-right space-y-1">
              <h2 className="text-base sm:text-xl md:text-2xl font-black tracking-tight break-words">
                ملف المعلم · {teacherName}
              </h2>
              <ProfileMetaBadges teacherCivilId={teacherCivilId} teacherInfo={teacherInfo} />
            </div>
          ) : (
            <DialogHeader className="text-right space-y-1">
              <DialogTitle className="text-base sm:text-xl md:text-2xl font-black tracking-tight break-words">
                  ملف المعلم · {teacherName}
              </DialogTitle>
              <ProfileMetaBadges teacherCivilId={teacherCivilId} teacherInfo={teacherInfo} />
            </DialogHeader>
          )}
            </div>
            <Button onClick={printDossier} size="sm" className="gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm">
              <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> طباعة
            </Button>
            {canEdit && (
              <Button
                onClick={() => setDeductOpen(true)}
                size="sm"
                variant="outline"
                title="قرار حسم مجموع ساعات تأخر"
                className="gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Gavel className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> قرار حسم
              </Button>
            )}
          </div>
    </div>
  );

  const bodyNode = (
    <div className="p-3 sm:p-4 md:p-6">

        {loading ? (
          <LoadingScreen message="جارٍ تحميل بيانات المعلم" hint="نسترجع المؤشرات والسجلات من قاعدة البيانات" />
        ) : (
          <div className="space-y-5">
            {/* KPIs — مؤشرات شاملة من قاعدة البيانات (شهري + يومي + إشعارات) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
              <KpiCard label="أيام الدوام" value={kpis.total} tone="neutral" />
              <KpiCard label="أيام الحضور" value={kpis.present} tone="emerald" subtitle="من السجل اليومي" />
              <KpiCard
                label="أيام الغياب"
                value={kpis.absent}
                tone="rose"
                subtitle={kpis.noticesAbsent > 0 ? `منها ${kpis.noticesAbsent} موثق` : undefined}
              />
              <KpiCard
                label="أيام التأخر"
                value={kpis.late}
                tone="amber"
                subtitle={kpis.lateMin > 0 ? `${kpis.lateMin} دقيقة` : (kpis.noticesLate > 0 ? `${kpis.noticesLate} إشعار` : undefined)}
              />
              <KpiCard
                label="أيام الاستئذان"
                value={kpis.excuse}
                tone="sky"
                subtitle={kpis.excuseMin > 0 ? `${kpis.excuseMin} دقيقة` : undefined}
              />
            </div>

            <Tabs defaultValue="monthly">
              <div className="-mx-1 sm:mx-0 overflow-x-auto sidebar-scroll">
                <TabsList className={`inline-flex md:grid w-max md:w-full ${showTeaching ? "md:grid-cols-6" : "md:grid-cols-4"} gap-1 px-1 sm:px-0`}>
                  <TabsTrigger value="monthly" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap"><BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> شهرياً</TabsTrigger>
                  <TabsTrigger value="archive" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap"><ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> الإجراءات</TabsTrigger>
                  <TabsTrigger value="notices" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap"><FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> المتابعة</TabsTrigger>
                  <TabsTrigger value="daily" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap"><CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> أيام مؤرشفة</TabsTrigger>
                  {showTeaching && (
                    <TabsTrigger value="info" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap"><BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> المواد</TabsTrigger>
                  )}
                  {showTeaching && (
                    <TabsTrigger value="schedule" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap"><CalendarRange className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> الجدول</TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="monthly" className="mt-3">
                <Table
                  headers={["الشهر", "حضور", "غياب", "تأخر (د)", "استئذان (د)", "أيام مفتوحة", "إجمالي الأيام"]}
                  widths={["22%", "11%", "11%", "13%", "14%", "14%", "15%"]}
                >
                  {data.monthly.map((m, i) => (
                    <tr key={i}>
                      <td className="font-bold">{m.month_label || m.month_key}</td>
                      <td className="font-mono">{m.present_days ?? 0}</td>
                      <td className="font-mono">{m.absent_days ?? 0}</td>
                      <td className="font-mono">{m.late_min ?? 0}</td>
                      <td className="font-mono">{m.excuse_min ?? 0}</td>
                      <td className="font-mono">{m.open_days ?? 0}</td>
                      <td className="font-mono font-bold">{m.total_days ?? 0}</td>
                    </tr>
                  ))}
                  {data.monthly.length === 0 && <Empty colSpan={7} />}
                </Table>
              </TabsContent>

              <TabsContent value="archive" className="mt-3">
                <Table
                  headers={["التاريخ", "نوع التقرير", "نوع الإجراء", "ملخص", "المنفذ"]}
                  widths={["120px", "20%", "18%", "auto", "18%"]}
                >
                  {data.archive.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs whitespace-nowrap" dir="ltr">
                        {a.greg_date || new Date(a.created_at).toLocaleDateString("ar-SA")}
                      </td>
                      <td>{a.report_type || "—"}</td>
                      <td><Badge variant="secondary" className="font-bold">{translateActionType(a.action_type)}</Badge></td>
                      <td className="text-muted-foreground text-right">{a.summary || "—"}</td>
                      <td className="text-xs text-muted-foreground">{a.created_by_name || "—"}</td>
                    </tr>
                  ))}
                  {data.archive.length === 0 && <Empty colSpan={5} />}
                </Table>
              </TabsContent>

              <TabsContent value="notices" className="mt-3">
                <FollowUpTab
                  teacherName={teacherName}
                  teacherCivilId={teacherCivilId}
                  notices={data.notices}
                  archive={data.archive}
                  canEdit={canEdit}
                  onChanged={() => { /* lightweight: rely on next open */ }}
                />
              </TabsContent>

              <TabsContent value="daily" className="mt-3">
                <Card className="overflow-hidden border print:shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3 print:bg-background">
                    <div>
                      <h3 className="text-lg font-black text-foreground">أيام الغياب التفصيلية</h3>
                      <p className="text-xs text-muted-foreground mt-1">مرتبة من الأحدث إلى الأقدم، وكل يوم مستقل في نوع الغياب وحالة الإدخال في فارس.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">الإجمالي: {absenceFaresSummary.total} يوم</Badge>
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">تم الإدخال: {absenceFaresSummary.uploaded}</Badge>
                      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">لم يتم الإدخال: {absenceFaresSummary.missing}</Badge>
                    </div>
                  </div>
                  <div className="overflow-auto max-h-[58vh]">
                    <table className="teacher-table teacher-absence-detail-table">
                      <colgroup>
                        <col style={{ width: 56 }} />
                        <col style={{ width: 118 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 260 }} />
                        <col style={{ width: 220 }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th className="text-center">#</th>
                          <th>اليوم</th>
                          <th>التاريخ الهجري</th>
                          <th>التاريخ الميلادي</th>
                          <th>حالة الغياب</th>
                          <th>نوع الغياب</th>
                          <th>الرفع في فارس</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenceDailyRows.map((d: any, i: number) => {
                          const absType = normalizeTeacherAbsenceType(d.absence_type);
                          const fares = normalizeTeacherFaresStatus(d.fares_upload_status);
                          const faresClass = fares === "تم الإدخال"
                            ? "border-success/50 bg-success/10 text-success font-bold"
                            : "border-destructive/50 bg-destructive/10 text-destructive font-bold";
                          return (
                            <tr key={d.id || i}>
                              <td className="col-num">{i + 1}</td>
                              <td className="font-bold whitespace-nowrap">{d.day_name || "—"}</td>
                              <td className="font-mono text-xs whitespace-nowrap" dir="ltr">{d.hijri_date || "—"}</td>
                              <td className="font-mono text-xs whitespace-nowrap" dir="ltr">{d.greg_date || "—"}</td>
                              <td><Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-destructive font-bold">غياب مقبول</Badge></td>
                              <td>
                                <Select value={absType} onValueChange={(v) => updateDailyMeta(d, "absence_type", v)} disabled={!canEditAbsenceMeta || savingDailyId === d.id}>
                                  <SelectTrigger className="h-10 min-w-[220px] bg-background"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {!ABSENCE_TYPE_OPTIONS.includes(absType) && <SelectItem value={absType}>{absType}</SelectItem>}
                                    {ABSENCE_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td>
                                <Select value={fares} onValueChange={(v) => updateDailyMeta(d, "fares_upload_status", v)} disabled={!canEditFares || savingDailyId === d.id}>
                                  <SelectTrigger className={`h-10 min-w-[180px] border ${faresClass}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="تم الإدخال">تم الإدخال</SelectItem>
                                    <SelectItem value="لم يتم الإدخال">لم يتم الإدخال</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          );
                        })}
                        {absenceDailyRows.length === 0 && <Empty colSpan={7} />}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>كعب الجدول</td>
                          <td colSpan={2}>إجمالي الغياب: {absenceFaresSummary.total} يوم</td>
                          <td>مرفوع: {absenceFaresSummary.uploaded}</td>
                          <td colSpan={2}>غير مرفوع: {absenceFaresSummary.missing}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              </TabsContent>

              {showTeaching && (
              <TabsContent value="info" className="mt-3">
                <Card className="p-4 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold flex items-center gap-1.5">
                        <BookOpen className="h-4 w-4 text-primary" /> المواد التي يدرّسها
                      </Label>
                      <Input
                        value={subjectsInput}
                        onChange={(e) => setSubjectsInput(e.target.value)}
                        disabled={!canEdit}
                        placeholder="مثال: رياضيات، علم البيئة، إحصاء"
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">افصل بين المواد بفاصلة عربية (،) أو إنجليزية (,)</p>
                      {extras.subjects.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {extras.subjects.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold flex items-center gap-1.5">
                        <Users2 className="h-4 w-4 text-primary" /> الشعب التي يدرّسها
                      </Label>
                      <Input
                        value={sectionsInput}
                        onChange={(e) => setSectionsInput(e.target.value)}
                        disabled={!canEdit}
                        placeholder="مثال: 1/1، 2/3، 3/2"
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">اكتب الشعب مفصولة بفواصل</p>
                      {extras.sections.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {extras.sections.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">ملاحظات إدارية على المعلم</Label>
                    <Textarea
                      value={extras.notes}
                      onChange={(e) => setExtras((p) => ({ ...p, notes: e.target.value }))}
                      disabled={!canEdit}
                      placeholder="ملاحظات حول الالتزام، اللجان، التكليفات الإضافية..."
                      className="text-sm min-h-[90px]"
                    />
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button onClick={saveExtras} disabled={!canEdit || savingExtras} className="gap-2">
                      {savingExtras ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      حفظ بيانات الملف
                    </Button>
                  </div>
                </Card>
              </TabsContent>
              )}

              {showTeaching && (
              <TabsContent value="schedule" className="mt-3">
                <Card className="p-3 md:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold flex items-center gap-1.5">
                      <CalendarRange className="h-4 w-4 text-primary" />
                      الجدول الدراسي الأسبوعي
                    </div>
                    <div className="flex items-center gap-2">
                      <ScheduleImportButton
                        canEdit={canEdit}
                        onImported={(grid) => setExtras((p) => ({ ...p, schedule: grid }))}
                      />
                      <Button onClick={saveExtras} disabled={!canEdit || savingExtras} size="sm" className="gap-2">
                        {savingExtras ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        حفظ الجدول
                      </Button>
                    </div>
                  </div>
                  <div className="teacher-table-wrap overflow-auto">
                    <table className="teacher-table" style={{ tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: 96 }} />
                        {PERIODS.map((p) => (
                          <col key={p} style={{ width: `calc((100% - 96px) / ${PERIODS.length})` }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="text-center">اليوم</th>
                          {PERIODS.map((p) => (
                            <th key={p} className="text-center">الحصة {p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map((d) => (
                          <tr key={d}>
                            <td className="text-center font-extrabold text-primary whitespace-nowrap" style={{ background: "hsl(var(--primary) / 0.08)" }}>{d}</td>
                            {PERIODS.map((p) => {
                              const cell = extras.schedule?.[d]?.[p] || { subject: "", section: "" };
                              return (
                                <td key={p} className="align-top" style={{ padding: 4 }}>
                                  <input
                                    value={cell.subject}
                                    onChange={(e) => setCell(d, p, "subject", e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="المادة"
                                    className="w-full text-[11px] px-1.5 py-1 rounded-md border border-border bg-background mb-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                  <input
                                    value={cell.section}
                                    onChange={(e) => setCell(d, p, "section", e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="الشعبة"
                                    className="w-full text-[11px] px-1.5 py-1 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    اكتب اسم المادة ورقم الشعبة في كل حصة. سيظهر الجدول داخل ملف الطباعة الرسمي.
                  </p>
                </Card>
              </TabsContent>
              )}
            </Tabs>
          </div>
        )}
    </div>
  );

  if (embedded) {
    return (
      <div dir="rtl">
        {headerNode}
        {bodyNode}
        <TeacherDeductionDialog
          open={deductOpen}
          onOpenChange={setDeductOpen}
          teacherName={teacherName}
          teacherCivilId={teacherCivilId}
          teacherInfo={teacherInfo}
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-6xl max-h-[92vh] overflow-auto p-0">
        {headerNode}
        {bodyNode}
      </DialogContent>
      <TeacherDeductionDialog
        open={deductOpen}
        onOpenChange={setDeductOpen}
        teacherName={teacherName}
        teacherCivilId={teacherCivilId}
        teacherInfo={teacherInfo}
      />
    </Dialog>
  );
}

function ProfileMetaBadges({ teacherCivilId, teacherInfo }: { teacherCivilId?: string; teacherInfo: any }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {teacherCivilId && (
        <Badge variant="outline" className="font-mono text-[11px]">
          هوية: {teacherCivilId}
        </Badge>
      )}
      {teacherInfo?.specialization && (
        <Badge variant="secondary" className="gap-1">
          <GraduationCap className="h-3 w-3" /> {teacherInfo.specialization}
        </Badge>
      )}
      {teacherInfo?.rank_title && (
        <Badge variant="secondary" className="gap-1">
          <Briefcase className="h-3 w-3" /> {teacherInfo.rank_title}
        </Badge>
      )}
      {teacherInfo?.phone && (
        <Badge variant="secondary" className="gap-1 font-mono">
          <Phone className="h-3 w-3" /> {teacherInfo.phone}
        </Badge>
      )}
    </div>
  );
}

function isNonTeachingJob(job?: string): boolean {
  const j = (job || "").trim();
  if (!j) return false;
  const NON_TEACHING = [
    "مدير المدرسة", "مدير",
    "وكيل", "وكيل شؤون المعلمين", "وكيل الشؤون التعليمية", "وكيل الشؤون المدرسية",
    "موجه طلابي", "موجه",
    "محضر مختبر", "محضر",
    "إداري", "اداري", "سكرتير", "مدخل بيانات",
  ];
  return NON_TEACHING.some((n) => j === n || j.includes(n));
}

function Table({ headers, widths, children }: { headers: string[]; widths?: string[]; children: React.ReactNode }) {
  return (
    <div className="teacher-table-wrap overflow-auto max-h-[55vh]">
      <table className="teacher-table">
        {widths && widths.length === headers.length && (
          <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
        )}
        <thead className="sticky top-0 z-10">
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="p-6 text-center text-muted-foreground">لا توجد سجلات</td></tr>;
}

/* ============== Schedule Import Button ==============
   Three modes:
   1) "current": paste/upload a single grid for THIS teacher.
   2) "excel"  : upload a school-wide Excel workbook. Each sheet (or each
                 detected grid) is matched to a teacher in the registry by
                 civil id / job number / smart name match, then bulk saved.
   3) "word"   : same as (2) but for a school-wide Word (.docx) file.
   Smart matching avoids confusing similar names (see scheduleImport.ts). */

type MatchRow = {
  parsed: ParsedTeacherSchedule;
  matched: TeacherCandidate | null;
  confidence: "id" | "high" | "low" | "none";
  alternatives: TeacherCandidate[];
  /** user override → teacher id (or "skip"). */
  override?: string;
};

function ScheduleImportButton({
  canEdit, onImported,
}: {
  canEdit: boolean;
  onImported: (grid: ScheduleGrid) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"current" | "excel" | "word">("current");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [teachers, setTeachers] = useState<TeacherCandidate[]>([]);
  const [rows, setRows] = useState<MatchRow[]>([]);

  // Lazy-load teachers when a bulk mode is selected.
  useEffect(() => {
    if (!open) return;
    if (mode === "current") return;
    if (teachers.length) return;
    (async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, full_name, civil_id, job_number")
        .eq("active", true);
      if (error) { toast.error("تعذّر تحميل قائمة المعلمين"); return; }
      setTeachers((data || []) as TeacherCandidate[]);
    })();
  }, [open, mode, teachers.length]);

  function reset() {
    setText("");
    setRows([]);
  }

  async function handleSingleFile(f: File) {
    setBusy(true);
    try {
      const ext = f.name.toLowerCase().split(".").pop();
      if (ext === "xlsx" || ext === "xls") {
        const parsed = await parseExcelFile(f);
        if (parsed[0]) { onImported(parsed[0].grid); setOpen(false); reset(); toast.success("تم استيراد الجدول. لا تنسَ الحفظ."); return; }
      } else if (ext === "docx") {
        const parsed = await parseDocxFile(f);
        if (parsed[0]) { onImported(parsed[0].grid); setOpen(false); reset(); toast.success("تم استيراد الجدول. لا تنسَ الحفظ."); return; }
      } else {
        const txt = await f.text(); setText(txt); return;
      }
      toast.error("لم يتم العثور على جدول صالح في الملف");
    } catch (e: any) { toast.error(e.message || "تعذّر قراءة الملف"); }
    finally { setBusy(false); }
  }

  function applyPasted() {
    const grid = parseSingleScheduleText(text);
    if (!grid) { toast.error("لا يوجد محتوى صالح للاستيراد"); return; }
    onImported(grid);
    setOpen(false); reset();
    toast.success("تم استيراد الجدول. لا تنسَ الحفظ.");
  }

  async function handleBulkFile(f: File, kind: "excel" | "word") {
    if (teachers.length === 0) { toast.error("لم يتم تحميل قائمة المعلمين بعد"); return; }
    setBusy(true);
    try {
      const parsed = kind === "excel" ? await parseExcelFile(f) : await parseDocxFile(f);
      if (parsed.length === 0) { toast.error("لم يتم العثور على جداول صالحة في الملف"); return; }
      const matched: MatchRow[] = parsed.map((p) => {
        const m = matchTeacher(p, teachers);
        return { parsed: p, matched: m.teacher, confidence: m.confidence, alternatives: m.alternatives };
      });
      setRows(matched);
      const ok = matched.filter((r) => r.matched).length;
      toast.success(`تم استخراج ${parsed.length} جدول · مُطابقة تلقائية: ${ok}`);
    } catch (e: any) { toast.error(e.message || "تعذّر قراءة الملف"); }
    finally { setBusy(false); }
  }

  async function commitBulk() {
    const toSave = rows
      .map((r) => {
        const overrideId = r.override && r.override !== "skip" ? r.override : null;
        const teacher = overrideId ? teachers.find((t) => t.id === overrideId) || null : r.matched;
        if (!teacher) return null;
        if (r.override === "skip") return null;
        return { teacher, grid: r.parsed.grid };
      })
      .filter(Boolean) as { teacher: TeacherCandidate; grid: ScheduleGrid }[];
    if (toSave.length === 0) { toast.error("لا يوجد جداول مطابقة للحفظ"); return; }
    setBusy(true);
    try {
      // Read existing extras, merge schedule, upsert per teacher.
      const keys = toSave.map((s) => settingsKeyFor(s.teacher.full_name, s.teacher.civil_id));
      const { data: existing } = await supabase
        .from("teacher_settings").select("key, value").in("key", keys);
      const existingMap = new Map((existing || []).map((r: any) => [r.key, r.value]));
      const upserts = toSave.map((s) => {
        const key = settingsKeyFor(s.teacher.full_name, s.teacher.civil_id);
        const value = mergeIntoExtras(existingMap.get(key), s.grid);
        return { key, value };
      });
      const { error } = await supabase
        .from("teacher_settings")
        .upsert(upserts, { onConflict: "key" });
      if (error) throw error;
      toast.success(`تم حفظ ${upserts.length} جدول معلم في قاعدة البيانات`);
      setOpen(false); reset();
    } catch (e: any) { toast.error(e.message || "تعذّر حفظ الجداول"); }
    finally { setBusy(false); }
  }

  const stats = useMemo(() => {
    const id = rows.filter((r) => r.confidence === "id").length;
    const high = rows.filter((r) => r.confidence === "high").length;
    const low = rows.filter((r) => r.confidence === "low").length;
    const none = rows.filter((r) => r.confidence === "none").length;
    return { id, high, low, none };
  }, [rows]);

  return (
    <>
      <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setOpen(true)} className="gap-2">
        <Upload className="h-4 w-4" /> استيراد جدول
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>استيراد الجدول الدراسي</DialogTitle>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => { setMode(v as any); reset(); }} className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="current" className="gap-1.5"><CalendarRange className="h-4 w-4" /> هذا المعلم فقط</TabsTrigger>
              <TabsTrigger value="excel" className="gap-1.5"><FileSpreadsheet className="h-4 w-4" /> Excel شامل</TabsTrigger>
              <TabsTrigger value="word" className="gap-1.5"><FileType className="h-4 w-4" /> Word شامل</TabsTrigger>
            </TabsList>

            {/* ====== current teacher mode ====== */}
            <TabsContent value="current" className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                ألصق جدول هذا المعلم من Excel/Word مباشرة، أو ارفع ملف <b>.xlsx</b> / <b>.docx</b> / CSV. كل صف يمثّل يوماً (الأحد..الخميس) وكل عمود يمثّل حصة من 1 إلى 7. صيغة الخلية: <b>"المادة - الشعبة"</b>.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.docx,.doc,.htm,.html,.mht,.mhtml,.csv,.tsv,.txt"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSingleFile(f); }}
                className="text-xs"
              />
              <Textarea
                dir="ltr"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"الأحد\tرياضيات-1/1\tعلم البيئة-2/2\t...\nالإثنين\t...\t...\t..."}
                className="font-mono text-xs min-h-[160px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
                <Button onClick={applyPasted} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  استيراد
                </Button>
              </div>
            </TabsContent>

            {/* ====== bulk modes ====== */}
            {(["excel", "word"] as const).map((kind) => (
              <TabsContent key={kind} value={kind} className="mt-3 space-y-3">
                <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed space-y-1">
                  <div className="font-bold text-foreground">
                    {kind === "excel" ? "استيراد ملف Excel شامل لجميع المعلمين" : "استيراد ملف Word (docx) شامل لجميع المعلمين"}
                  </div>
                  <div>
                    سيتم استخراج جدول كل معلم على حدة وحفظه في ملفه. المطابقة تتم وفق:
                    <span className="mx-1 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> رقم الهوية / الرقم الوظيفي</span>
                    ثم
                    <span className="mx-1 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-blue-600" /> مطابقة الاسم الكامل مع المختصر</span>.
                    الحالات الملتبسة تظهر باللون البرتقالي ويمكن اختيار المعلم الصحيح يدوياً قبل الحفظ.
                  </div>
                </div>
                <input
                  type="file"
                  accept={kind === "excel" ? ".xlsx,.xls" : ".docx,.doc,.htm,.html,.mht,.mhtml"}
                  disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkFile(f, kind); }}
                  className="text-xs"
                />

                {rows.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> مطابقة برقم الهوية: {stats.id}</Badge>
                      <Badge variant="outline" className="gap-1 border-blue-500/40 text-blue-700"><CheckCircle2 className="h-3 w-3" /> مطابقة عالية الثقة: {stats.high}</Badge>
                      <Badge variant="outline" className="gap-1 border-orange-500/40 text-orange-700"><AlertCircle className="h-3 w-3" /> ملتبسة: {stats.low}</Badge>
                      <Badge variant="outline" className="gap-1 border-rose-500/40 text-rose-700"><XCircle className="h-3 w-3" /> غير مطابقة: {stats.none}</Badge>
                    </div>
                    <div className="rounded-md border max-h-[45vh] overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="p-2 text-right">الاسم في الملف</th>
                            <th className="p-2 text-right">المطابقة</th>
                            <th className="p-2 text-right">المعلم في النظام</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const tone =
                              r.confidence === "id" ? "bg-emerald-50/50" :
                              r.confidence === "high" ? "bg-blue-50/40" :
                              r.confidence === "low" ? "bg-orange-50/60" :
                              "bg-rose-50/40";
                            const currentSelected = r.override ?? (r.matched?.id || "skip");
                            return (
                              <tr key={i} className={`border-t ${tone}`}>
                                <td className="p-2 align-top">
                                  <div className="font-bold">{r.parsed.rawName}</div>
                                  {r.parsed.civilId && <div className="font-mono text-[10px] text-muted-foreground">هوية: {r.parsed.civilId}</div>}
                                  {r.parsed.jobNumber && <div className="text-[10px] text-muted-foreground">وظيفي: {r.parsed.jobNumber}</div>}
                                </td>
                                <td className="p-2 align-top whitespace-nowrap">
                                  {r.confidence === "id" && <Badge className="bg-emerald-600">هوية</Badge>}
                                  {r.confidence === "high" && <Badge className="bg-blue-600">عالية</Badge>}
                                  {r.confidence === "low" && <Badge className="bg-orange-500">ملتبسة</Badge>}
                                  {r.confidence === "none" && <Badge variant="destructive">غير مطابق</Badge>}
                                </td>
                                <td className="p-2 align-top">
                                  <select
                                    value={currentSelected}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, override: val } : x));
                                    }}
                                    className="w-full h-8 rounded border border-input bg-background px-2 text-xs"
                                  >
                                    <option value="skip">— تجاهل —</option>
                                    {(r.matched ? [r.matched, ...r.alternatives.filter((a) => a.id !== r.matched!.id)] : r.alternatives).map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.full_name}{t.civil_id ? ` (${t.civil_id})` : ""}
                                      </option>
                                    ))}
                                    {/* fallback: full list when nothing matched */}
                                    {r.alternatives.length === 0 && !r.matched &&
                                      teachers.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name,"ar")).map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.full_name}{t.civil_id ? ` (${t.civil_id})` : ""}
                                        </option>
                                      ))
                                    }
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
                      <Button onClick={commitBulk} disabled={busy} className="gap-2">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        حفظ جداول جميع المعلمين
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============== Follow-up Tab ==============
   Replaces the old "letters" tab with an actionable follow-up timeline:
   - Lists existing official notices (read-only) AND the latest admin
     archive entries for this teacher.
   - Allows adding quick follow-up notes, saved to teacher_legacy_archive
     so they live alongside other administrative entries and benefit from
     the "most-action" indicators in the LegacyArchive page. */
function FollowUpTab({
  teacherName, teacherCivilId, notices, archive, canEdit, onChanged,
}: {
  teacherName: string;
  teacherCivilId?: string;
  notices: any[];
  archive: any[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const [kind, setKind] = useState("متابعة");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const followUps = useMemo(
    () => archive.filter((a) => a.report_type === "متابعة معلم"),
    [archive]
  );

  useEffect(() => { setItems(followUps); }, [followUps]);

  async function addEntry() {
    if (!summary.trim()) { toast.error("اكتب نص المتابعة"); return; }
    setSaving(true);
    try {
      const today = new Date();
      const greg = today.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("teacher_legacy_archive")
        .insert({
          source: "admin_affairs",
          report_type: "متابعة معلم",
          action_type: kind,
          teacher_name: teacherName,
          teacher_civil_id: teacherCivilId || "",
          teacher_phone: "",
          greg_date: greg,
          hijri_date: "",
          month_label: "",
          summary: summary.trim(),
          payload: { kind, source: "follow_up_tab" },
          created_by: profile?.user_id ?? null,
          created_by_name: profile?.full_name || "",
        })
        .select()
        .single();
      if (error) throw error;
      setItems((p) => [data, ...p]);
      setSummary("");
      toast.success("تمت إضافة المتابعة");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    if (!confirm("حذف هذه المتابعة؟")) return;
    const { error } = await supabase.from("teacher_legacy_archive").delete().eq("id", id);
    if (error) return toast.error("تعذّر الحذف (المدير فقط)");
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success("تم الحذف");
  }

  return (
    <div className="space-y-4">
      {/* Add new follow-up */}
      <Card className="p-4 space-y-3 border-primary/20">
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <ListChecks className="h-4 w-4" /> إضافة متابعة جديدة على المعلم
        </div>
        <div className="grid md:grid-cols-[160px,1fr,auto] gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={!canEdit}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="متابعة">متابعة</option>
            <option value="ملاحظة">ملاحظة</option>
            <option value="تنبيه شفهي">تنبيه شفهي</option>
            <option value="توجيه">توجيه</option>
            <option value="شكر وتقدير">شكر وتقدير</option>
          </select>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={!canEdit}
            placeholder="نص المتابعة (مثال: تم توجيهه بشأن الالتزام بمواعيد الحصص)"
          />
          <Button onClick={addEntry} disabled={!canEdit || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إضافة
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          تُحفظ المتابعات في أرشيف الإجراءات وتظهر في مؤشر "الأكثر إجراءً" تلقائياً.
        </p>
      </Card>

      {/* Timeline of follow-ups */}
      <div>
        <div className="text-sm font-bold mb-2 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" /> سجل المتابعات ({items.length})
        </div>
        <Table
          headers={["التاريخ", "النوع", "نص المتابعة", "المنفذ", ""]}
          widths={["120px", "130px", "auto", "18%", "60px"]}
        >
          {items.length === 0 && <Empty colSpan={5} />}
          {items.map((it) => (
            <tr key={it.id}>
              <td className="font-mono text-xs whitespace-nowrap" dir="ltr">{it.greg_date}</td>
              <td><Badge variant="secondary" className="font-bold">{translateActionType(it.action_type)}</Badge></td>
              <td className="text-right">{it.summary}</td>
              <td className="text-xs text-muted-foreground">{it.created_by_name || "—"}</td>
              <td>
                <Button size="icon" variant="ghost" onClick={() => removeEntry(it.id)} title="حذف">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      {/* Reference: existing official notices (read-only) */}
      {notices.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2 flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" /> خطابات رسمية صادرة سابقاً ({notices.length}) — للاطلاع
          </div>
          <Table
            headers={["التاريخ", "نوع الخطاب", "اليوم", "السبب", "صادر من"]}
            widths={["120px", "16%", "100px", "auto", "18%"]}
          >
            {notices.map((n) => (
              <tr key={n.id}>
                <td className="font-mono text-xs whitespace-nowrap" dir="ltr">
                  {n.greg_date || new Date(n.created_at).toLocaleDateString("ar-SA")}
                </td>
                <td><Badge variant="outline">{n.notice_kind || "—"}</Badge></td>
                <td>{n.day_name || "—"}</td>
                <td className="text-right text-muted-foreground">{n.note_reason || "—"}</td>
                <td className="text-xs text-muted-foreground">{n.created_by_name || "—"}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, tone, subtitle }: { label: string; value: number; tone: "neutral" | "emerald" | "rose" | "amber" | "sky"; subtitle?: string }) {
  const palettes: Record<string, string> = {
    neutral: "bg-muted/30 text-foreground",
    emerald: "bg-success/10 text-success border-success/25",
    rose: "bg-destructive/10 text-destructive border-destructive/25",
    amber: "bg-warning/10 text-warning border-warning/25",
    sky: "bg-primary/10 text-primary border-primary/25",
  };
  return (
    <Card className={`p-3 text-center border ${palettes[tone]}`}>
      <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
      {subtitle ? <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">{subtitle}</div> : null}
    </Card>
  );
}

/* ============== HTML Print Builder ============== */

function buildTeacherDossierHTML(input: {
  teacher: {
    name: string; civil_id: string; phone: string; specialization: string;
    rank_title: string; job_number: string; current_job: string;
  };
  extras: TeacherExtras;
  kpis: { total: number; present: number; absent: number; late: number; excuse: number };
  monthly: any[];
  archiveCount: number;
  noticesCount: number;
}): string {
  const { teacher, extras, kpis, monthly, archiveCount, noticesCount } = input;
  const safe = (s: any) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);

  const subjectsHtml = (extras.subjects || []).map((s) => `<span class="chip chip-primary">${safe(s)}</span>`).join("") || `<span class="muted">—</span>`;
  const sectionsHtml = (extras.sections || []).map((s) => `<span class="chip chip-amber">${safe(s)}</span>`).join("") || `<span class="muted">—</span>`;

  const monthlyRows = monthly.map((m) => `
    <tr>
      <td>${safe(m.month_label || m.month_key)}</td>
      <td class="num">${m.present_days ?? 0}</td>
      <td class="num">${m.absent_days ?? 0}</td>
      <td class="num">${m.late_min ?? 0}</td>
      <td class="num">${m.excuse_min ?? 0}</td>
      <td class="num">${m.open_days ?? 0}</td>
      <td class="num">${m.total_days ?? 0}</td>
    </tr>`).join("") || `<tr><td colspan="7" class="empty">لا توجد ملخصات شهرية مؤرشفة</td></tr>`;

  const sched = extras.schedule || {};
  const scheduleRows = DAYS.map((d) => {
    const cells = PERIODS.map((p) => {
      const c = sched?.[d]?.[p];
      const subject = c?.subject?.trim() || "";
      const section = c?.section?.trim() || "";
      if (!subject && !section) return `<td class="sched-cell empty-cell">—</td>`;
      return `<td class="sched-cell">
        <div class="sched-subject">${safe(subject || "—")}</div>
        ${section ? `<div class="sched-section">${safe(section)}</div>` : ""}
      </td>`;
    }).join("");
    return `<tr><th class="day-th">${d}</th>${cells}</tr>`;
  }).join("");

  const today = new Date().toLocaleDateString("ar-SA");

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>ملف المعلم — ${safe(teacher.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 12mm 10mm; }
* { box-sizing: border-box; }
body { font-family:'Tajawal','Segoe UI',system-ui,sans-serif; color:#0f172a; margin:0; padding:0; background:#fff; font-size:12px; line-height:1.5; }
.banner-wrap { width:100%; margin-bottom:8px; }
.banner-wrap img { width:100%; max-height:110px; object-fit:contain; display:block; }
.title-bar { text-align:center; color:#0b7e88; font-weight:900; font-size:18px; margin:6px 0 12px; letter-spacing:0.3px; }
.title-bar .subtitle { display:block; font-size:11px; color:#64748b; font-weight:600; margin-top:2px; letter-spacing:0; }
/* Identity card */
.id-card {
  border:1.5px solid #0b7e88;
  border-radius:10px;
  padding:10px 14px;
  background:linear-gradient(180deg,#ecfeff 0%,#fff 100%);
  margin-bottom:12px;
}
.id-card h2 { margin:0 0 6px; font-size:16px; color:#0b7e88; font-weight:900; }
.id-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px 14px; font-size:11.5px; }
.id-grid .field { padding:3px 0; border-bottom:1px dashed #cbd5e1; }
.id-grid .field b { color:#475569; font-weight:700; margin-left:4px; }
/* Section title */
.section-title {
  color:#0b7e88; font-weight:900; font-size:14px;
  margin:14px 0 6px; padding:5px 10px; border-radius:6px;
  background:linear-gradient(90deg, rgba(11,126,136,0.10), transparent);
  border-right:4px solid #0b7e88;
}
/* KPI tiles */
.kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin-bottom:6px; }
.kpi-tile { border:1px solid #e2e8f0; border-radius:8px; padding:8px 6px; text-align:center; background:#f8fafc; }
.kpi-tile .v { font-size:18px; font-weight:900; color:#0f172a; }
.kpi-tile .l { font-size:10.5px; color:#64748b; font-weight:700; margin-top:2px; }
.kpi-tile.green { background:#ecfdf5; border-color:#a7f3d0; }
.kpi-tile.green .v { color:#166534; }
.kpi-tile.red { background:#fef2f2; border-color:#fecaca; }
.kpi-tile.red .v { color:#b91c1c; }
.kpi-tile.amber { background:#fff7ed; border-color:#fed7aa; }
.kpi-tile.amber .v { color:#9a3412; }
.kpi-tile.sky { background:#eff6ff; border-color:#bfdbfe; }
.kpi-tile.sky .v { color:#1e40af; }
/* Tables — modern, balanced, print-safe */
table { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; }
table.std {
  border-radius:8px; overflow:hidden; box-shadow:0 1px 0 rgba(15,23,42,0.04);
  margin-top:4px;
}
table.std th, table.std td {
  border-bottom:1px solid #cbd5e1; border-left:1px solid #e2e8f0;
  padding:8px 10px; vertical-align:middle; word-wrap:break-word; overflow-wrap:break-word;
}
table.std th:first-child, table.std td:first-child { border-left:none; }
table.std tbody tr:last-child td { border-bottom:none; }
table.std th {
  background:linear-gradient(180deg,#0b7e88 0%,#0a6e78 100%);
  color:#fff; font-weight:800; text-align:center; font-size:12px;
  letter-spacing:0.25px; text-shadow:0 1px 0 rgba(0,0,0,0.08);
  border-bottom:1.5px solid #064e55;
}
table.std td { text-align:center; font-size:12px; }
table.std td.num { font-family:ui-monospace,monospace; font-weight:700; }
table.std tbody tr:nth-child(even) td { background:#f6f9fb; }
table.std tbody tr:nth-child(odd) td { background:#ffffff; }
table.std .empty { text-align:center; color:#64748b; padding:14px; background:#f8fafc !important; }
/* Chips for subjects/sections */
.chip { display:inline-block; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:800; margin:2px 2px 2px 0; border:1px solid; }
.chip-primary { background:#ecfeff; color:#0b7e88; border-color:#a5f3fc; }
.chip-amber { background:#fff7ed; color:#9a3412; border-color:#fed7aa; }
.muted { color:#94a3b8; font-size:11px; }
/* Schedule — fixed equal columns to keep cells balanced */
table.schedule {
  border-radius:8px; overflow:hidden; box-shadow:0 1px 0 rgba(15,23,42,0.04); table-layout:fixed;
}
table.schedule th, table.schedule td {
  border-bottom:1px solid #cbd5e1; border-left:1px solid #e2e8f0;
  padding:7px 6px; vertical-align:middle; text-align:center;
  word-wrap:break-word; overflow-wrap:break-word;
}
table.schedule th:first-child, table.schedule td:first-child { border-left:none; }
table.schedule tbody tr:last-child td { border-bottom:none; }
table.schedule thead th {
  background:linear-gradient(180deg,#0b7e88 0%,#0a6e78 100%);
  color:#fff; font-weight:800; font-size:11.5px;
  border-bottom:1.5px solid #064e55;
}
table.schedule .day-th { background:#ecfeff !important; color:#0b7e88; font-weight:900; width:90px; }
table.schedule .sched-cell { font-size:11px; line-height:1.4; }
table.schedule .sched-subject { font-weight:800; color:#0f172a; }
table.schedule .sched-section { font-size:10.5px; color:#0369a1; font-weight:700; margin-top:2px; }
table.schedule .empty-cell { color:#cbd5e1; font-weight:700; }
table.schedule tbody tr:nth-child(even) td { background:#f6f9fb; }
/* Notes */
.notes-box { border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; min-height:50px; font-size:12px; line-height:1.7; white-space:pre-wrap; }
/* Footer */
.foot { margin-top:14px; text-align:center; font-size:10px; color:#64748b; border-top:1px dashed #cbd5e1; padding-top:6px; }
@media print {
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table.std thead th, table.schedule thead th { background:#0b7e88 !important; color:#fff !important; -webkit-print-color-adjust:exact; }
  table.std, table.schedule { box-shadow:none !important; border-radius:0 !important; border:1px solid #94a3b8 !important; }
  table.std td, table.schedule td { border-color:#94a3b8 !important; }
  table.std tbody tr:nth-child(even) td, table.schedule tbody tr:nth-child(even) td { background:#f1f5f9 !important; }
  table.std tr, table.schedule tr { page-break-inside:avoid; break-inside:avoid; }
  thead { display: table-header-group; }
  .section-title, .id-card, .kpi-grid, .notes-box { page-break-inside:avoid; break-inside:avoid; }
}
</style></head><body>

<div class="banner-wrap">
  <img src="${window.location.origin}/legacy/shree.png" alt="بنر وزارة التعليم" onerror="this.style.display='none'">
</div>

<div class="title-bar">
  ملف المعلم الشامل
  <span class="subtitle">سجل متكامل · مدرسة اليعقوبي الثانوية · ${safe(today)}</span>
</div>

<div class="id-card">
  <h2>${safe(teacher.name)}</h2>
  <div class="id-grid">
    <div class="field"><b>رقم الهوية:</b> ${safe(teacher.civil_id || "—")}</div>
    <div class="field"><b>الرقم الوظيفي:</b> ${safe(teacher.job_number || "—")}</div>
    <div class="field"><b>الجوال:</b> ${safe(teacher.phone || "—")}</div>
    <div class="field"><b>التخصص:</b> ${safe(teacher.specialization || "—")}</div>
    <div class="field"><b>المرتبة:</b> ${safe(teacher.rank_title || "—")}</div>
    <div class="field"><b>المهمة الحالية:</b> ${safe(teacher.current_job || "معلم")}</div>
  </div>
</div>

<div class="section-title">مؤشرات المواظبة (مجمّعة من الأرشيف)</div>
<div class="kpi-grid">
  <div class="kpi-tile"><div class="v">${kpis.total}</div><div class="l">إجمالي الأيام</div></div>
  <div class="kpi-tile green"><div class="v">${kpis.present}</div><div class="l">حضور</div></div>
  <div class="kpi-tile red"><div class="v">${kpis.absent}</div><div class="l">غياب</div></div>
  <div class="kpi-tile amber"><div class="v">${kpis.late}</div><div class="l">أيام تأخر</div></div>
  <div class="kpi-tile sky"><div class="v">${kpis.excuse}</div><div class="l">استئذان</div></div>
</div>
<div style="display:flex; gap:10px; font-size:11px; color:#475569; margin-top:4px;">
  <span>📁 إجراءات إدارية مؤرشفة: <b>${archiveCount}</b></span>
  <span>✉️ خطابات رسمية صادرة: <b>${noticesCount}</b></span>
</div>

<div class="section-title">المواد والشعب</div>
<table class="std">
  <colgroup><col style="width:26%"><col style="width:74%"></colgroup>
  <thead><tr><th>البند</th><th>التفاصيل</th></tr></thead>
  <tbody>
    <tr><td style="font-weight:800; color:#0b7e88;">المواد التي يدرّسها</td><td>${subjectsHtml}</td></tr>
    <tr><td style="font-weight:800; color:#0b7e88;">الشعب التي يدرّسها</td><td>${sectionsHtml}</td></tr>
  </tbody>
</table>

<div class="section-title">الجدول الدراسي الأسبوعي</div>
<table class="schedule">
  <colgroup>
    <col style="width:90px">
    ${PERIODS.map(() => `<col style="width:calc((100% - 90px) / ${PERIODS.length})">`).join("")}
  </colgroup>
  <thead>
    <tr>
      <th>اليوم \\ الحصة</th>
      ${PERIODS.map((p) => `<th>الحصة ${p}</th>`).join("")}
    </tr>
  </thead>
  <tbody>${scheduleRows}</tbody>
</table>

<div class="section-title">ملخص شهري للمواظبة (آخر ${monthly.length || 0} شهر)</div>
<table class="std">
  <colgroup>
    <col style="width:22%">
    <col style="width:11%"><col style="width:11%"><col style="width:13%"><col style="width:14%"><col style="width:14%"><col style="width:15%">
  </colgroup>
  <thead><tr>
    <th>الشهر</th><th>حضور</th><th>غياب</th><th>تأخر (د)</th><th>استئذان (د)</th><th>أيام مفتوحة</th><th>إجمالي الأيام</th>
  </tr></thead>
  <tbody>${monthlyRows}</tbody>
</table>

${extras.notes?.trim() ? `
<div class="section-title">ملاحظات إدارية</div>
<div class="notes-box">${safe(extras.notes)}</div>` : ""}

<div class="foot">
  ملف المعلم الشامل — مدرسة اليعقوبي الثانوية · تنفيذ وتطوير: فهد حامد الزهراني
</div>

</body></html>`;
}
