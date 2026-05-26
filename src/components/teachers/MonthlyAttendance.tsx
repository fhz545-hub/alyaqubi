import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload, FolderOpen, FileSpreadsheet, Loader2, Download, Printer, Search,
  Calendar, Users, Clock, AlertTriangle, CheckCircle2, XCircle, TrendingUp,
  Trash2, MessageCircle, User2, Save, BadgeCheck, IdCard, CalendarClock,
  ShieldAlert, CheckSquare, Square, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  parseHaduriExcel, minutesToHHMM, type TeacherStats,
} from "@/utils/teacherAttendanceParser";
import {
  listHaduriMonths, upsertHaduriMonths, monthKeyFromLabel,
  replaceHaduriDailyForDates, listDailyForTeacher, updateDailyAbsenceMeta,
  deleteArchiveMonth, deleteAllArchive,
  type HaduriMonthRow, type HaduriDailyRow,
} from "@/utils/haduriArchiveApi";
import { logAudit } from "@/utils/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import { listTeachers, type Teacher } from "@/utils/teachersApi";
import { hasPermission } from "@/store/permissionsStore";
import { supabase } from "@/integrations/supabase/client";
import { gregToHijri, arabicDayName, extractDateFromFilename, extractWorkdayOrdinalFromFilename, extractDateRangeFromFilename, type DailyRecord, type ExcuseDetail } from "@/utils/teacherAttendanceParser";
import { detectFileNamePattern, type SheetReport, type FileNamePattern } from "@/utils/teacherAttendanceParser";
import { downloadImportLogExcel, type FileImportEntry } from "@/utils/importLogExport";
import { buildMonthlyPrintHTML } from "@/utils/teacherMonthlyPrint";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const MONTH_MAP: Record<string, string> = {
  "01": "يناير","1":"يناير", jan:"يناير", january:"يناير",
  "02":"فبراير","2":"فبراير", feb:"فبراير", february:"فبراير",
  "03":"مارس","3":"مارس", mar:"مارس", march:"مارس",
  "04":"أبريل","4":"أبريل", apr:"أبريل", april:"أبريل",
  "05":"مايو","5":"مايو", may:"مايو",
  "06":"يونيو","6":"يونيو", jun:"يونيو", june:"يونيو",
  "07":"يوليو","7":"يوليو", jul:"يوليو", july:"يوليو",
  "08":"أغسطس","8":"أغسطس", aug:"أغسطس", august:"أغسطس",
  "09":"سبتمبر","9":"سبتمبر", sep:"سبتمبر", september:"سبتمبر",
  "10":"أكتوبر", oct:"أكتوبر", october:"أكتوبر",
  "11":"نوفمبر", nov:"نوفمبر", november:"نوفمبر",
  "12":"ديسمبر", dec:"ديسمبر", december:"ديسمبر",
};

function detectMonthLabel(files: File[]): string {
  for (const f of files) {
    const rel = (f as any).webkitRelativePath as string | undefined;
    if (rel && rel.includes("/")) {
      const folder = rel.split("/")[0];
      const m = matchMonth(folder);
      if (m) return m;
    }
  }
  for (const f of files) {
    const m = matchMonth(f.name);
    if (m) return m;
  }
  return "";
}

function matchMonth(text: string): string {
  const clean = String(text || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const t = clean.toLowerCase();
  const arabicMonths = [
    "يناير","فبراير","مارس","أبريل","ابريل","مايو","يونيو",
    "يوليو","أغسطس","اغسطس","سبتمبر","أكتوبر","اكتوبر","نوفمبر","ديسمبر",
  ];
  for (const m of arabicMonths) if (clean.includes(m)) {
    const yearMatch = clean.match(/(20\d{2}|14\d{2})/);
    return yearMatch ? `${m} ${yearMatch[1]}` : m;
  }
  for (const k of Object.keys(MONTH_MAP)) {
    if (/^[a-z]+$/.test(k) && t.includes(k)) {
      const yearMatch = clean.match(/(20\d{2})/);
      return yearMatch ? `${MONTH_MAP[k]} ${yearMatch[1]}` : MONTH_MAP[k];
    }
  }
  let m = clean.match(/(20\d{2})[-_/.\s]?(0?[1-9]|1[0-2])/);
  if (m) return `${MONTH_MAP[m[2]] ?? m[2]} ${m[1]}`;
  m = clean.match(/(0?[1-9]|1[0-2])[-_/.\s](20\d{2})/);
  if (m) return `${MONTH_MAP[m[1]] ?? m[1]} ${m[2]}`;
  m = clean.match(/(?:^|[^\d])(0?[1-9]|1[0-2])(?:[^\d]|$)/);
  if (m) {
    const yearMatch = clean.match(/(20\d{2})/);
    return `${MONTH_MAP[m[1]] ?? m[1]}${yearMatch ? ` ${yearMatch[1]}` : ""}`;
  }
  return "";
}

function monthPartsFromLabel(label: string, fallbackDate?: string): { year: number; month: number } | null {
  const key = monthKeyFromLabel(label, fallbackDate);
  const m = key.match(/^(20\d{2})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const normalized = String(label || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  for (const [k, name] of Object.entries(MONTH_MAP)) {
    if (/^\d+$/.test(k) && normalized.includes(name)) {
      const y = normalized.match(/(20\d{2})/);
      return { year: y ? Number(y[1]) : new Date().getFullYear(), month: Number(k.padStart(2, "0")) };
    }
  }
  const n = normalized.match(/(?:^|[^\d])(0?[1-9]|1[0-2])(?:[^\d]|$)/);
  if (n) {
    const y = normalized.match(/(20\d{2})/);
    return { year: y ? Number(y[1]) : new Date().getFullYear(), month: Number(n[1]) };
  }
  return null;
}

type Level = "ممتاز" | "جيد جداً" | "جيد" | "يحتاج متابعة";
type ImportReport = {
  totalFiles: number;
  excelFiles: number;
  readFiles: number;
  ignoredFiles: number;
  failedFiles: string[];
  unrecognizedSheets: string[];
  validAttendanceDates: string[];
  skippedAttendanceDates: string[];
  unmatchedTeachers: string[];
  attendanceRows: number;
  excuseRows: number;
  folderName: string;
  files?: FileImportEntry[];
};
const LEVEL_STYLES: Record<Level, string> = {
  "ممتاز": "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400",
  "جيد جداً": "bg-sky-500/10 text-sky-700 border-sky-300 dark:text-sky-400",
  "جيد": "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400",
  "يحتاج متابعة": "bg-red-500/10 text-red-700 border-red-300 dark:text-red-400",
};

function calcLevelFrom(absent: number, open: number, lateMin: number) {
  let score = 100;
  score -= absent * 8;
  score -= open * 4;
  score -= Math.floor(lateMin / 30) * 2;
  score = Math.max(0, Math.min(100, score));
  let level: Level;
  if (score >= 90) level = "ممتاز";
  else if (score >= 75) level = "جيد جداً";
  else if (score >= 60) level = "جيد";
  else level = "يحتاج متابعة";
  return { level, score };
}

/** يبني رسالة واتساب موجزة جداً وفق التنسيق المعتمد:
 *  السلام عليكم أ. <الاسم> — <الشهر>
 *  • نسبة الحضور: %
 *  • مؤشر الانضباط: /100
 *  • المستوى: …
 */
function buildConciseWhatsAppMessage(s: TeacherStats, monthLabel: string, level: string, score: number): string {
  const totalDays = Math.max(s.totalDays || (s.presentDays + s.absentDays + s.openDays), 1);
  const attendancePct = Math.round((s.presentDays / totalDays) * 100);
  return [
    `السلام عليكم أ. ${s.name}`,
    monthLabel ? `كشف شهر: ${monthLabel}` : "",
    `• نسبة الحضور: ${attendancePct}%`,
    `• مؤشر الانضباط: ${score}/100`,
    `• المستوى: ${level}`,
    `*الشؤون الإدارية والمتابعة*`,
  ].filter(Boolean).join("\n");
}

function normalizeTeacherName(name: string): string {
  return String(name || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\b(الاستاذ|استاذ|أستاذ|ا\.|أ\.|د\.|الدكتور|دكتور|المعلم|معلم)\b/g, "")
    .replace(/[ـ\-_.،,]/g, " ")
    // توحيد: عبد الله / عبد الرحمن … → عبدالله / عبدالرحمن (إزالة المسافة بعد "عبد")
    .replace(/(^|\s)عبد\s+/g, "$1عبد")
    // توحيد ياء مكررة في نهاية الكلمة (يحيى → يحيي → يحي) و(علي ↔ عليي)
    .replace(/يي(?=\s|$)/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

// كلمات وصلية في الأسماء العربية لا تُحتسب في المطابقة (بن، ابن، أبو، آل …)
const NAME_NOISE = new Set(["بن", "ابن", "بنت", "ابو", "أبو", "ال", "آل", "عبد"]);

function nameTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .map((p) => p.replace(/^ال/, "")) // إزالة "ال" التعريف من بداية كل كلمة للمقارنة
    .filter((p) => p.length >= 2 && !NAME_NOISE.has(p));
}

function resolveTeacherByName(registry: Teacher[], name: string): Teacher | undefined {
  const normalized = normalizeTeacherName(name);
  if (!normalized) return undefined;
  const exact = registry.find((t) => normalizeTeacherName(t.full_name) === normalized);
  if (exact) return exact;

  const fileTokens = nameTokens(normalized);
  if (!fileTokens.length) return undefined;
  const fileFirst = fileTokens[0];
  const fileLast = fileTokens[fileTokens.length - 1];

  const scored = registry
    .map((t) => {
      const tn = normalizeTeacherName(t.full_name);
      const toks = nameTokens(tn);
      if (!toks.length) return null;
      const regFirst = toks[0];
      const regLast = toks[toks.length - 1];
      // مطابقة الاسم الأول + اسم العائلة هي القرينة الأقوى للأسماء المختصرة في أسماء الملفات
      const firstLastMatch = regFirst === fileFirst && regLast === fileLast;
      const allFileTokensIn = fileTokens.every((p) => toks.includes(p));
      const overlap = fileTokens.filter((p) => toks.includes(p)).length;
      let score = 0;
      if (firstLastMatch) score += 100;
      if (allFileTokensIn) score += 50;
      score += overlap * 10;
      // عقوبة طفيفة لتفضيل الأسماء الأقصر عند تساوي القوة (لتجنّب اختيار اسم أطول بصدفة)
      score -= Math.max(0, toks.length - fileTokens.length);
      return { teacher: t, score, firstLastMatch };
    })
    .filter((x): x is { teacher: Teacher; score: number; firstLastMatch: boolean } => x !== null && x.score >= 50)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return undefined;
  // إذا الأفضل أعلى من الذي يليه بفارق واضح اعتبره مطابقًا فريدًا
  if (scored.length === 1) return scored[0].teacher;
  if (scored[0].score - scored[1].score >= 20) return scored[0].teacher;
  // عند التعادل: نُفضّل firstLastMatch فقط إن كان فريدًا
  const firstLast = scored.filter((s) => s.firstLastMatch);
  if (firstLast.length === 1) return firstLast[0].teacher;
  // التعارض النهائي: عدّة معلمين باسم أول + اسم عائلة متطابقَين تماماً (مثلاً اثنان باسم «حسن … الشهري»).
  // لا نختار أحدهم اعتباطياً — نُرجع undefined ليجبر النظام على الاعتماد على رقم الهوية فقط،
  // ولكي لا تُنسب بيانات معلم لمعلم آخر بسبب تشابه الاسم.
  return undefined;
}

function normalizeIdentity(v: string): string {
  return String(v || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
}

/**
 * قائمة المعلمين المستبعدين نهائياً من شؤون المعلمين (نُقلوا من المدرسة).
 * تُستثنى من: المطابقة، المؤشرات، الغياب، التأخر، الاستئذان، الطباعة، والأرشيف.
 * الاعتماد فقط على رقم الهوية لمنع أي خلط في حال تشابه الأسماء.
 */
const EXCLUDED_TEACHER_IDS: ReadonlySet<string> = new Set([
  "1056464405", // مبارك آل ثابت
  "1003535422", // صالح السميحي
  "1089635724", // عبدالرحمن العتيبي
]);

/** أسماء احتياطية للاستبعاد عندما لا يتوفر رقم الهوية في الصف. */
const EXCLUDED_TEACHER_NAMES: ReadonlySet<string> = new Set([
  normalizeTeacherName("مبارك آل ثابت"),
  normalizeTeacherName("صالح السميحي"),
  normalizeTeacherName("عبدالرحمن العتيبي"),
  normalizeTeacherName("عبد الرحمن العتيبي"),
]);

export function isExcludedTeacher(id?: string, name?: string): boolean {
  const cleanId = normalizeIdentity(id || "");
  if (cleanId && EXCLUDED_TEACHER_IDS.has(cleanId)) return true;
  if (name) {
    const n = normalizeTeacherName(name);
    if (n && EXCLUDED_TEACHER_NAMES.has(n)) return true;
  }
  return false;
}

function resolveTeacherByIdentityAndName(registry: Teacher[], id: string, name: string): Teacher | undefined {
  const cleanId = normalizeIdentity(id);
  if (cleanId) {
    const byCivil = registry.find((t) => normalizeIdentity(t.civil_id) === cleanId);
    if (byCivil) return byCivil;
    const byJob = registry.find((t) => normalizeIdentity(t.job_number) === cleanId);
    if (byJob) return byJob;
  }
  return resolveTeacherByName(registry, name);
}

// استخراج اسم نظيف من اسم الملف: «فهد الزهراني · 1.xlsx» → «فهد الزهراني»
function teacherNameFromFilename(fileName: string): string {
  return String(fileName || "")
    .replace(/\.(xlsx|xls|xlsm|csv)$/i, "")
    .replace(/[·•|]\s*\d+\s*$/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\d+/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveTeacherSmart(registry: Teacher[], id: string, name: string, sourceFile: string): Teacher | undefined {
  const direct = resolveTeacherByIdentityAndName(registry, id, name);
  if (direct) return direct;
  const fromFile = teacherNameFromFilename(sourceFile);
  if (fromFile && fromFile !== name) {
    return resolveTeacherByName(registry, fromFile);
  }
  return undefined;
}

function getTrustedAttendanceDates(daily: DailyRecord[], dates: string[], registry: Teacher[]) {
  const rowsByDate = new Map<string, DailyRecord[]>();
  for (const row of daily) {
    if (!row.greg_date || !dates.includes(row.greg_date)) continue;
    if (row.status === "استئذان" && !row.in_time && !row.out_time) continue;
    const list = rowsByDate.get(row.greg_date) || [];
    list.push(row);
    rowsByDate.set(row.greg_date, list);
  }
  const trusted: string[] = [];
  const skipped: string[] = [];
  for (const date of dates) {
    const rows = rowsByDate.get(date) || [];
    if (!rows.length) { skipped.push(date); continue; }
    const matched = rows.filter((r) => resolveTeacherSmart(registry, r.teacher_civil_id, r.teacher_name, r.source_file)).length;
    const ratio = matched / rows.length;
    if (matched > 0 && (rows.length < 3 || ratio >= 0.6)) trusted.push(date);
    else skipped.push(`${date} (مطابقة ضعيفة ${matched}/${rows.length})`);
  }
  return { trusted, skipped };
}

function dailyStatusRank(status: string): number {
  if (status === "غياب") return 1;
  if (status === "استئذان") return 2;
  if (status === "حضور") return 3;
  if (status === "متأخر") return 4;
  if (status === "لم يُغلق") return 5;
  return 0;
}

function mergeTeacherDay(prev: DailyRecord, next: DailyRecord): DailyRecord {
  const status = dailyStatusRank(next.status) >= dailyStatusRank(prev.status) ? next.status : prev.status;
  const periods = Array.from(new Set([prev.excuse_period, next.excuse_period].filter(Boolean))).join("، ");
  return {
    ...prev,
    teacher_civil_id: prev.teacher_civil_id || next.teacher_civil_id,
    teacher_name: prev.teacher_name || next.teacher_name,
    teacher_phone: prev.teacher_phone || next.teacher_phone,
    specialization: prev.specialization || next.specialization,
    in_time: prev.in_time || next.in_time,
    out_time: prev.out_time || next.out_time,
    work_min: Math.max(prev.work_min || 0, next.work_min || 0),
    late_min: Math.max(prev.late_min || 0, next.late_min || 0),
    // نأخذ الأكبر عند دمج نفس المعلم/اليوم حتى لا يضاعف رفع تقرير الاستئذان نفسه المؤشرات.
    excuse_min: Math.max(prev.excuse_min || 0, next.excuse_min || 0),
    excuse_period: periods,
    status,
    source_file: Array.from(new Set([prev.source_file, next.source_file].filter(Boolean))).join("، "),
  };
}

function buildRegistryBasedStats(
  importedStats: TeacherStats[],
  daily: DailyRecord[],
  dates: string[],
  registry: Teacher[],
): TeacherStats[] {
  const dateList = Array.from(new Set(dates.filter(Boolean))).sort();
  if (!registry.length || !dateList.length) return importedStats;
  const importedById = new Map(importedStats.filter((s) => s.id && s.id !== "—").map((s) => [s.id, s]));
  const importedByName = new Map(importedStats.map((s) => [normalizeTeacherName(s.name), s]));
  const dailyByTeacherDate = new Map<string, DailyRecord>();
  // تجميع المعلمين الذين يتشاركون (الاسم الأول + اسم العائلة) لاكتشاف التعارض
  const firstLastKey = (full: string): string => {
    const toks = nameTokens(normalizeTeacherName(full));
    if (toks.length < 2) return "";
    return `${toks[0]}::${toks[toks.length - 1]}`;
  };
  const groups = new Map<string, number>();
  for (const t of registry) {
    const k = firstLastKey(t.full_name);
    if (!k) continue;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  const ambiguousFirstLast = new Set(Array.from(groups.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  // لكل تاريخ، الأسماء المتشابهة التي ظهر صف باسمها بدون هوية → الغياب لا يُحتسب لأيٍّ منهم
  const ambiguousPresenceByDate = new Map<string, Set<string>>();
  for (const row of daily) {
    if (!row.greg_date) continue;
    if (row.teacher_civil_id) continue;
    const k = firstLastKey(row.teacher_name);
    if (!k || !ambiguousFirstLast.has(k)) continue;
    const set = ambiguousPresenceByDate.get(row.greg_date) || new Set<string>();
    set.add(k);
    ambiguousPresenceByDate.set(row.greg_date, set);
  }
  for (const row of daily) {
    const id = row.teacher_civil_id || resolveTeacherByName(registry, row.teacher_name)?.civil_id || importedByName.get(normalizeTeacherName(row.teacher_name))?.id || "";
    if (!id || !row.greg_date) continue;
    const key = `${id}::${row.greg_date}`;
    const prev = dailyByTeacherDate.get(key);
    dailyByTeacherDate.set(key, prev ? mergeTeacherDay(prev, { ...row, teacher_civil_id: id }) : { ...row, teacher_civil_id: id });
  }

  return registry.map((teacher) => {
    let workMin = 0, lateMin = 0, excuseMin = 0, absentDays = 0, openDays = 0, presentDays = 0;
    const attendanceDateSet = new Set(dateList);
    const tk = firstLastKey(teacher.full_name);
    for (const date of dateList) {
      const row = dailyByTeacherDate.get(`${teacher.civil_id}::${date}`);
      if (!row) {
        // لا تُحتسب يوم غياب على معلم اسمه يتشابه مع آخر إذا ظهر صفّ ذلك اليوم باسمهما
        // المشترك بدون هوية — لتعذّر التحقق أيهما الحاضر فعلاً.
        if (tk && ambiguousPresenceByDate.get(date)?.has(tk)) continue;
        absentDays++;
        continue;
      }
      workMin += row.work_min || 0;
      lateMin += row.late_min || 0;
      excuseMin += row.excuse_min || 0;
      if (row.status === "غياب") absentDays++;
      else if (row.status === "لم يُغلق") openDays++;
      else presentDays++;
    }
    for (const row of dailyByTeacherDate.values()) {
      if (row.teacher_civil_id === teacher.civil_id && row.greg_date && !attendanceDateSet.has(row.greg_date)) {
        excuseMin += row.excuse_min || 0;
      }
    }
    const imported = importedById.get(teacher.civil_id);
    return {
      name: teacher.full_name || imported?.name || "—",
      id: teacher.civil_id,
      phone: teacher.phone || imported?.phone || "",
      spec: teacher.specialization || imported?.spec || "",
      workMin,
      lateMin,
      excuseMin,
      absentDays,
      openDays,
      presentDays,
      totalDays: dateList.length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

function buildActualDailyStats(daily: DailyRecord[], registry: Teacher[]): TeacherStats[] {
  const registryById = new Map(registry.map((t) => [t.civil_id, t]));
  const map = new Map<string, TeacherStats>();
  const seenDays = new Set<string>();
  for (const row of daily) {
    const civilId = row.teacher_civil_id || resolveTeacherByName(registry, row.teacher_name)?.civil_id || "";
    if (!civilId || !row.greg_date) continue;
    const linked = registryById.get(civilId);
    const stat = map.get(civilId) || {
      name: linked?.full_name || row.teacher_name || "—",
      id: civilId,
      phone: linked?.phone || row.teacher_phone || "",
      spec: linked?.specialization || row.specialization || "",
      workMin: 0,
      lateMin: 0,
      excuseMin: 0,
      absentDays: 0,
      openDays: 0,
      presentDays: 0,
      totalDays: 0,
    };
    stat.workMin += row.work_min || 0;
    stat.lateMin += row.late_min || 0;
    stat.excuseMin += row.excuse_min || 0;
    if (row.status === "غياب") stat.absentDays += 1;
    else if (row.status === "لم يُغلق") stat.openDays += 1;
    else if (row.status !== "استئذان") stat.presentDays += 1;
    const dayKey = `${civilId}::${row.greg_date}`;
    if (!seenDays.has(dayKey)) { stat.totalDays += 1; seenDays.add(dayKey); }
    map.set(civilId, stat);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export default function MonthlyAttendance() {
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  // الاستيراد مقصور على المدير أو حساب منحه المدير صلاحية صريحة "استيراد ملفات شؤون المعلمين"
  const canImport = isPrincipal || hasPermission(profile?.user_id || "", isPrincipal, "import_teacher_files");
  // صلاحيات تعديل نوع الغياب وحالة الرفع في فارس - حصرية للمدير أو من منحه صلاحية صريحة
  const canEditAbsenceType = isPrincipal || hasPermission(profile?.user_id || "", isPrincipal, "manage_teacher_absence_type");
  const canEditFares = isPrincipal || hasPermission(profile?.user_id || "", isPrincipal, "manage_fares_upload");
  const [busy, setBusy] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyClearing, setBusyClearing] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // KPI drill-down dialog state
  const [kpiDialog, setKpiDialog] = useState<null | "all" | "excellent" | "needs" | "absent" | "late">(null);

  // Live import (current upload session) state
  const [stats, setStats] = useState<TeacherStats[]>([]);
  const [importedDates, setImportedDates] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  // تفاصيل الاستئذانات لعرضها في الكشف الشهري للمعلم وفي المؤشرات
  const [excuseDetails, setExcuseDetails] = useState<ExcuseDetail[]>([]);
  const [excusesRange, setExcusesRange] = useState<{ from: string; to: string } | null>(null);
  const [selectedDailyRows, setSelectedDailyRows] = useState<HaduriDailyRow[]>([]);
  const [loadingSelectedDaily, setLoadingSelectedDaily] = useState(false);

  // Archive (DB) state
  const [archive, setArchive] = useState<HaduriMonthRow[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [scopeMonth, setScopeMonth] = useState<string>("current"); // current | <month_key>
  const [search, setSearch] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all"); // teacher_civil_id or "all"
  const [defaultAbsenceType, setDefaultAbsenceType] = useState("بدون سند نظامي");
  const [defaultFaresStatus, setDefaultFaresStatus] = useState("لم يتم الإدخال");
  // تاريخ اليوم المعتمد لتسجيل حالات الغياب (نوع الغياب + رفع فارس)
  const [todayDate, setTodayDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const todayHijri = useMemo(() => gregToHijri(todayDate), [todayDate]);
  const todayDayName = useMemo(() => arabicDayName(todayDate), [todayDate]);

  // Map of civil_id -> Teacher record (linked from teachers table)
  const [linkedTeachers, setLinkedTeachers] = useState<Record<string, Teacher>>({});
  const [teacherRegistry, setTeacherRegistry] = useState<Teacher[]>([]);

  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const refreshArchive = async () => {
    setLoadingArchive(true);
    try {
      const [months, teachers] = await Promise.all([listHaduriMonths(), listTeachers()]);
      setArchive(months);
      setTeacherRegistry(teachers);
      setLinkedTeachers(Object.fromEntries(teachers.map((t) => [t.civil_id, t])));
    } catch (err: any) {
      toast.error("تعذّر تحميل الأرشيف: " + (err?.message ?? ""));
    } finally {
      setLoadingArchive(false);
    }
  };

  useEffect(() => { refreshArchive(); }, []);

  // الافتراضي عند فتح الصفحة: الشهر الحالي (تقويمياً) إن كان مؤرشفاً، وإلا أحدث شهر مؤرشف.
  // نطبّقه فقط إذا لم يكن المستخدم قد رفع ملفات للجلسة الحالية ولم يغيّر الاختيار يدوياً.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    if (stats.length > 0) return; // لا نتدخّل إذا كان المستخدم استورد للتو
    if (archive.length === 0) return;
    const today = new Date();
    const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const sortedKeys = Array.from(new Set(archive.map((r) => r.month_key))).sort((a, b) => b.localeCompare(a));
    const target = sortedKeys.includes(currentKey) ? currentKey : sortedKeys[0];
    if (target) {
      setScopeMonth(target);
      didAutoSelectRef.current = true;
    }
  }, [archive, stats.length]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    if (!canImport) {
      toast.error("استيراد الملفات في كشف حضوري الشهري مقصور على مدير المدرسة أو من منحه صلاحية «استيراد ملفات شؤون المعلمين»");
      e.target.value = "";
      return;
    }
    const incoming = Array.from(list);
    const accepted = incoming
      .filter((f) => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar", { numeric: true }));
    if (accepted.length === 0) {
      toast.error("لم يتم العثور على ملفات Excel/CSV");
      e.target.value = "";
      return;
    }

    setBusy(true);
    setFileNames(accepted.map((f) => f.name));
    setImportReport(null);
    const firstRel = (accepted[0] as any).webkitRelativePath as string | undefined;
    const rootFolder = firstRel && firstRel.includes("/") ? firstRel.split("/")[0] : "";
    const detected = (rootFolder ? matchMonth(rootFolder) : "") || detectMonthLabel(accepted);
    if (detected) setMonthLabel(detected);

    try {
      const merged = new Map<string, TeacherStats>();
      const attendanceDates = new Set<string>();
      const excuseOnlyDates = new Set<string>();
      const allDaily: DailyRecord[] = [];
      const allExcuses: ExcuseDetail[] = [];
      const unrecognizedSheets: string[] = [];
      let okCount = 0;
      let excuseFiles = 0;
      let attendanceRows = 0;
      let excuseRows = 0;
      const failed: string[] = [];
      const fileEntries: FileImportEntry[] = [];

      for (const f of accepted) {
        try {
          const rel = (f as any).webkitRelativePath as string | undefined;
          const folderName = rel && rel.includes("/") ? rel.split("/")[0] : rootFolder;
          const folderLabel = (folderName ? matchMonth(folderName) : "") || detected;
          const folderParts = monthPartsFromLabel(folderLabel || detected);
          const useWorkdayOrdinal = !!folderParts && /شهر/i.test(folderName || rootFolder || "") && !/20\d{2}/.test(f.name);
          const fallbackDate = folderParts
            ? (useWorkdayOrdinal
              ? (extractWorkdayOrdinalFromFilename(f.name, folderParts.year, folderParts.month) || extractDateFromFilename(f.name, folderParts.year, folderParts.month))
              : (extractDateFromFilename(f.name, folderParts.year, folderParts.month) || extractWorkdayOrdinalFromFilename(f.name, folderParts.year, folderParts.month)))
            : extractDateFromFilename(f.name);
          const r = await parseHaduriExcel(f, { fallbackDate });
          unrecognizedSheets.push(...(r.diagnostics?.unrecognizedSheets || []));
          attendanceRows += r.diagnostics?.attendanceRows || 0;
          excuseRows += r.diagnostics?.excuseRows || 0;
          const recognized = (r.diagnostics?.recognizedSheets?.length || 0) > 0;
          const sheetReports: SheetReport[] = r.diagnostics?.sheetReports || [];
          const acceptedRows = (r.diagnostics?.attendanceRows || 0) + (r.diagnostics?.excuseRows || 0);
          const detectedDate = r.fileKind === "excuses" && r.range
            ? `${r.range.from} → ${r.range.to}`
            : (r.importedDates?.[0] ? `${r.importedDates[0]}${r.importedDates.length > 1 ? ` … (${r.importedDates.length})` : ""}` : (fallbackDate || ""));
          if (!recognized && r.daily.length === 0 && r.excuses.length === 0) {
            const reasonFromSheets = sheetReports.find((s) => !s.recognized)?.reason
              || r.diagnostics?.statusReason
              || "تعذّر اكتشاف الترويسة أو لا توجد سجلات صالحة";
            fileEntries.push({
              fileName: f.name, status: "فشل",
              fileKind: r.fileKind === "excuses" ? "استئذان" : "حضور",
              pattern: r.diagnostics?.fileNamePattern || detectFileNamePattern(f.name),
              detectedDate, acceptedRows: 0,
              failureReason: reasonFromSheets, sheetReports,
            });
            failed.push(`${f.name}: لم يتم التعرف على الأعمدة أو لا توجد سجلات صالحة`);
            continue;
          }
          if (r.fileKind === "excuses") {
            excuseFiles++;
            allExcuses.push(...r.excuses);
            for (const d of r.importedDates) excuseOnlyDates.add(d);
          } else {
            const validDates = r.diagnostics?.validAttendanceDates?.length ? r.diagnostics.validAttendanceDates : r.importedDates;
            for (const d of validDates) attendanceDates.add(d);
          }
          allDaily.push(...r.daily.map((d) => ({ ...d, source_file: d.source_file || f.name })));
          for (const t of r.teachers) {
            const key = t.id && t.id !== "—" ? t.id : t.name;
            const prev = merged.get(key);
            if (!prev) merged.set(key, { ...t });
            else {
              merged.set(key, {
                name: prev.name || t.name,
                id: prev.id !== "—" ? prev.id : t.id,
                phone: prev.phone || t.phone,
                spec: prev.spec || t.spec,
                workMin: prev.workMin + t.workMin,
                lateMin: prev.lateMin + t.lateMin,
                excuseMin: prev.excuseMin + t.excuseMin,
                absentDays: prev.absentDays + t.absentDays,
                openDays: prev.openDays + t.openDays,
                presentDays: prev.presentDays + t.presentDays,
                totalDays: prev.totalDays + t.totalDays,
              });
            }
          }
          okCount++;
          const partial = sheetReports.some((s) => !s.recognized) || acceptedRows === 0;
          fileEntries.push({
            fileName: f.name,
            status: partial ? "نجح جزئيًا" : "نجح",
            fileKind: r.fileKind === "excuses" ? "استئذان" : "حضور",
            pattern: r.diagnostics?.fileNamePattern || detectFileNamePattern(f.name),
            detectedDate, acceptedRows,
            failureReason: partial ? (r.diagnostics?.statusReason || "بعض الأوراق لم تُقرأ.") : undefined,
            sheetReports,
          });
        } catch (err: any) {
          failed.push(`${f.name}: ${err?.message ?? "خطأ"}`);
          fileEntries.push({
            fileName: f.name, status: "فشل",
            fileKind: "—", pattern: detectFileNamePattern(f.name),
            detectedDate: "", acceptedRows: 0,
            failureReason: err?.message || "خطأ غير معروف أثناء قراءة الملف",
          });
        }
      }

      let finalStats = Array.from(merged.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "ar"),
      );
      const finalAttendanceDates = Array.from(attendanceDates).sort();
      const finalAllDates = Array.from(new Set([...attendanceDates, ...excuseOnlyDates])).sort();

      if (finalStats.length === 0) {
        toast.error("لم يتم العثور على بيانات صالحة");
        return;
      }

      setStats(finalStats);
      setImportedDates(finalAllDates);
      setScopeMonth("current");
      setSelectedTeacher("all");
      setExcuseDetails(allExcuses);
      // نطاق فترة الاستئذانات: نأخذ أوسع نطاق تم استخراجه من أسماء الملفات
      let rangeFrom = "", rangeTo = "";
      for (const f of accepted) {
        const r = extractDateRangeFromFilename(f.name);
        if (!r) continue;
        if (!rangeFrom || r.from < rangeFrom) rangeFrom = r.from;
        if (!rangeTo || r.to > rangeTo) rangeTo = r.to;
      }
      setExcusesRange(rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo } : null);

      if (failed.length) {
        console.warn("Haduri import failures:", failed);
        toast.warning(`تم تحليل ${okCount} ملف، فشل ${failed.length}`);
      } else {
        const exMsg = excuseFiles ? ` · ${excuseFiles} تقرير استئذانات` : "";
        toast.success(`تم تحليل ${okCount} ملف${exMsg} · ${finalStats.length} معلم · ${finalAllDates.length} يوم`);
      }
      if (excuseFiles) {
        toast.info(`تمت إضافة ${allExcuses.length} طلب استئذان مقبول للمعلمين`);
      }

      const registry = await listTeachers();
      const filteredRegistry = registry.filter((t) => !isExcludedTeacher(t.civil_id, t.full_name));
      const registryMap = Object.fromEntries(filteredRegistry.map((t) => [t.civil_id, t]));
      setTeacherRegistry(registry);
      setLinkedTeachers(registryMap);
      const resolvedDaily = allDaily
        .filter((d) => !isExcludedTeacher(d.teacher_civil_id, d.teacher_name))
        .map((d) => {
          const linked = resolveTeacherSmart(filteredRegistry, d.teacher_civil_id, d.teacher_name, d.source_file);
          return linked ? {
            ...d,
            teacher_civil_id: linked.civil_id,
            teacher_name: linked.full_name || d.teacher_name,
            teacher_phone: linked.phone || d.teacher_phone,
            specialization: linked.specialization || d.specialization,
          } : d;
        })
        .filter((d) => !isExcludedTeacher(d.teacher_civil_id, d.teacher_name));
      const resolvedExcuses = allExcuses
        .filter((e) => !isExcludedTeacher(e.teacher_civil_id, e.teacher_name))
        .map((e) => {
          const linked = resolveTeacherSmart(filteredRegistry, e.teacher_civil_id, e.teacher_name, e.source_file);
          if (linked) {
            return { ...e, teacher_civil_id: linked.civil_id, teacher_name: linked.full_name || e.teacher_name };
          }
          // لم تتم المطابقة في السجل: نحتفظ بالسجل الأصلي مع تسمية مؤقتة بالاسم
          // حتى لا يضيع طلب الاستئذان من بيانات وتقارير المعلم.
          return { ...e, teacher_civil_id: e.teacher_civil_id || `name:${e.teacher_name || "غير معروف"}` };
        })
        .filter((e) => !isExcludedTeacher(e.teacher_civil_id, e.teacher_name));
      setExcuseDetails(resolvedExcuses);
      const trustedDatesResult = registry.length
        ? getTrustedAttendanceDates(resolvedDaily, finalAttendanceDates, filteredRegistry)
        : { trusted: finalAttendanceDates, skipped: [] as string[] };
      const trustedAttendanceDates = trustedDatesResult.trusted;
      const finalTrustedAllDates = Array.from(new Set([...trustedAttendanceDates, ...excuseOnlyDates])).sort();
      const unmatchedTeachers = Array.from(new Set(
        resolvedDaily
          .filter((d) => d.greg_date && !resolveTeacherSmart(filteredRegistry, d.teacher_civil_id, d.teacher_name, d.source_file))
          .map((d) => `${d.teacher_name || "بلا اسم"}${d.teacher_civil_id ? ` · ${d.teacher_civil_id}` : ""} · ${d.source_file}`),
      )).slice(0, 80);
      // مهم: مؤشر الغياب يُبنى فقط على أيام الحضور الحقيقية (لا أيام استئذانات).
      // لو كانت كل الملفات استئذانات نتجنّب إعادة بناء الإحصاءات لمنع غياب وهمي.
      if (trustedAttendanceDates.length > 0) {
        finalStats = buildRegistryBasedStats(finalStats, resolvedDaily, trustedAttendanceDates, filteredRegistry);
      } else {
        finalStats = buildActualDailyStats(resolvedDaily, filteredRegistry);
      }
      // طبقة أمان نهائية: استبعاد أي معلم منقول من النتائج
      finalStats = finalStats.filter((s) => !isExcludedTeacher(s.id, s.name));
      setStats(finalStats);
      setImportedDates(finalTrustedAllDates);
      setImportReport({
        totalFiles: incoming.length,
        excelFiles: accepted.length,
        readFiles: okCount,
        ignoredFiles: incoming.length - accepted.length,
        failedFiles: failed,
        unrecognizedSheets: Array.from(new Set(unrecognizedSheets)),
        validAttendanceDates: trustedAttendanceDates,
        skippedAttendanceDates: trustedDatesResult.skipped,
        unmatchedTeachers,
        attendanceRows,
        excuseRows,
        folderName: rootFolder,
        files: fileEntries,
      });
      toast.info(`تمت المطابقة مع سجل المعلمين: ${registry.length} معلم مرجعي`);

      // Auto-archive to DB
      await persistToArchive(finalStats, finalTrustedAllDates, detected, accepted.map(f => f.name));
      // عند تمرير "الأيام الفعلية للحضور" فقط لمولد الغياب، نمنع تسجيل غياب وهمي
      // عن أيام لم تُرفع فيها ملفات حضور (مثلاً مَن رفع تقرير استئذانات لفترة فقط).
      await persistDailyToArchive(
        resolvedDaily,
        finalStats,
        detected,
        finalTrustedAllDates[0],
        registry,
        defaultAbsenceType,
        defaultFaresStatus,
        trustedAttendanceDates,
      );

      logAudit(
        {
          action: "import",
          section: "teacher_affairs",
          entity_type: "monthly_attendance",
          entity_id: detected || finalAllDates[0] || "report",
          details: {
            files: accepted.length,
            excuse_files: excuseFiles,
            teachers: finalStats.length,
            attendance_days: trustedAttendanceDates.length,
            total_days: finalTrustedAllDates.length,
            month: detected,
            excuses: allExcuses.length,
            skipped_attendance_days: trustedDatesResult.skipped,
            unmatched_teachers: unmatchedTeachers.length,
          },
        },
        { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title },
      );
    } catch (err: any) {
      toast.error("تعذّر تحليل الملفات: " + (err?.message ?? "خطأ غير متوقع"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const persistToArchive = async (
    list: TeacherStats[],
    dates: string[],
    label: string,
    files: string[],
  ) => {
    try {
      setBusySave(true);
      const month_key = monthKeyFromLabel(label, dates[0]);
      const month_label = label || month_key;
      const payload = list.map((s) => ({
        month_key,
        month_label,
        teacher_key: (s.id && s.id !== "—") ? s.id : s.name,
        teacher_name: s.name,
        teacher_civil_id: s.id !== "—" ? s.id : "",
        teacher_phone: s.phone || "",
        specialization: s.spec || "",
        work_min: s.workMin,
        late_min: s.lateMin,
        excuse_min: s.excuseMin,
        absent_days: s.absentDays,
        open_days: s.openDays,
        present_days: s.presentDays,
        total_days: s.totalDays,
        imported_dates: dates,
        source_files: files,
        created_by: profile?.user_id || null,
        created_by_name: profile?.full_name || "",
      }));
      const n = await upsertHaduriMonths(payload);
      toast.success(`تم حفظ وأرشفة ${n} سجل في قاعدة البيانات (${month_label})`);
      await refreshArchive();
    } catch (err: any) {
      toast.error("تعذّر الحفظ في قاعدة البيانات: " + (err?.message ?? ""));
    } finally {
      setBusySave(false);
    }
  };

  const persistDailyToArchive = async (
    daily: DailyRecord[],
    list: TeacherStats[],
    label: string,
    fallbackDate?: string,
    registryOverride?: Teacher[],
    absenceType = defaultAbsenceType,
    faresStatus = defaultFaresStatus,
    importedDateOverride?: string[],
  ) => {
    if (!daily.length && !importedDateOverride?.length) return;
    const month_key = monthKeyFromLabel(label, fallbackDate);
    const month_label = label || month_key;
    const registry = registryOverride?.length ? registryOverride : teacherRegistry;
    const registryById = Object.fromEntries(registry.map((t) => [t.civil_id, t]));
    const byId = new Map(list.filter((s) => s.id && s.id !== "—").map((s) => [s.id, s]));
    // أيام الغياب الافتراضي تُفعَّل فقط للأيام التي رُفع فيها ملف حضور.
    // عند تمرير override نستخدمه فقط، حتى لا تتسبب ملفات الاستئذانات بإضافة غياب وهمي.
    const dates = importedDateOverride && importedDateOverride.length
      ? Array.from(new Set(importedDateOverride.filter(Boolean))).sort()
      : Array.from(new Set(daily.map((d) => d.greg_date).filter(Boolean))).sort();
    const rows = daily
      .filter((d) => d.greg_date)
      .map((d) => {
        const directCivilId = d.teacher_civil_id && registryById[d.teacher_civil_id] ? d.teacher_civil_id : "";
        const fromName = directCivilId ? undefined : resolveTeacherByName(registry, d.teacher_name);
        const civilId = directCivilId || fromName?.civil_id || "";
        if (!civilId) return null;
        const linked = registryById[civilId] || linkedTeachers[civilId];
        const stat = byId.get(civilId);
        return {
          month_key,
          month_label,
          teacher_civil_id: civilId,
          teacher_name: linked?.full_name || stat?.name || d.teacher_name,
          teacher_phone: linked?.phone || stat?.phone || d.teacher_phone || "",
          specialization: linked?.specialization || stat?.spec || d.specialization || "",
          greg_date: d.greg_date,
          hijri_date: gregToHijri(d.greg_date),
          day_name: arabicDayName(d.greg_date),
          in_time: d.in_time || "",
          out_time: d.out_time || "",
          work_min: d.work_min || 0,
          late_min: d.late_min || 0,
          excuse_min: d.excuse_min || 0,
          status: d.status || "حضور",
          absence_type: d.status === "غياب" ? (d.absence_type || absenceType) : "",
          fares_upload_status: d.status === "غياب" ? (d.fares_upload_status || faresStatus) : "",
          excuse_period: d.excuse_period || "",
          source_file: d.source_file || "",
          created_by: profile?.user_id || null,
          created_by_name: profile?.full_name || "",
        };
      })
      .filter(Boolean) as any[];
    const existingKeys = new Set(rows.map((r) => `${r.teacher_civil_id}::${r.greg_date}`));
    // معلمون يتشاركون نفس (الاسم الأول + اسم العائلة) — لا يمكن مطابقتهم بالاسم وحده.
    const firstLastKey = (full: string): string => {
      const toks = nameTokens(normalizeTeacherName(full));
      if (toks.length < 2) return "";
      return `${toks[0]}::${toks[toks.length - 1]}`;
    };
    const ambiguousFirstLast = new Set<string>();
    const groups = new Map<string, string[]>();
    for (const t of registry) {
      const k = firstLastKey(t.full_name);
      if (!k) continue;
      const arr = groups.get(k) || [];
      arr.push(t.civil_id);
      groups.set(k, arr);
    }
    for (const [k, ids] of groups.entries()) {
      if (ids.length > 1) ambiguousFirstLast.add(k);
    }
    // لكل (تاريخ × مفتاح اسم متشابه) نسجّل ما إذا كان الملف يحتوي صفوفاً بدون هوية مطابقة
    // لاسم متشابه. في هذه الحالة لا يجوز اعتبار أيٍّ من المعلمَين غائباً، لأن أحدهما حضر فعلاً.
    const ambiguousPresenceByDate = new Map<string, Set<string>>();
    for (const d of daily) {
      if (!d.greg_date) continue;
      const directCivilId = d.teacher_civil_id && registryById[d.teacher_civil_id] ? d.teacher_civil_id : "";
      if (directCivilId) continue; // الهوية موجودة → لا غموض
      const k = firstLastKey(d.teacher_name);
      if (!k || !ambiguousFirstLast.has(k)) continue;
      const set = ambiguousPresenceByDate.get(d.greg_date) || new Set<string>();
      set.add(k);
      ambiguousPresenceByDate.set(d.greg_date, set);
    }
    for (const t of registry) {
      for (const date of dates) {
        const key = `${t.civil_id}::${date}`;
        if (existingKeys.has(key)) continue;
        // تخطّي توليد الغياب للمعلمين ذوي الأسماء المتشابهة في الأيام التي ظهر فيها صف
        // باسمهم بدون هوية — حتى لا يُحتسب غياب لمعلم فعلياً حاضر بسبب عجز المطابقة بالاسم.
        const tk = firstLastKey(t.full_name);
        if (tk && ambiguousPresenceByDate.get(date)?.has(tk)) continue;
        rows.push({
          month_key,
          month_label,
          teacher_civil_id: t.civil_id,
          teacher_name: t.full_name,
          teacher_phone: t.phone || "",
          specialization: t.specialization || "",
          greg_date: date,
          hijri_date: gregToHijri(date),
          day_name: arabicDayName(date),
          in_time: "",
          out_time: "",
          work_min: 0,
          late_min: 0,
          excuse_min: 0,
          status: "غياب",
          absence_type: absenceType,
          fares_upload_status: faresStatus,
          excuse_period: "",
          source_file: "لم يظهر في ملف اليوم",
          created_by: profile?.user_id || null,
          created_by_name: profile?.full_name || "",
        });
      }
    }
    try {
      const n = await replaceHaduriDailyForDates(month_key, dates, rows);
      if (n > 0) toast.success(`تم أرشفة ${n} سجل يومي وربطه بهوية المعلم`);
    } catch (err: any) {
      toast.error("تعذّرت أرشفة السجل اليومي: " + (err?.message ?? ""));
    }
  };

  // Build the active "view" stats: from current import OR from a selected archived month
  const viewStats: TeacherStats[] = useMemo(() => {
    const applyLinked = (s: TeacherStats): TeacherStats => {
      const linked = s.id && s.id !== "—" ? linkedTeachers[s.id] : null;
      return linked ? {
        ...s,
        name: linked.full_name || s.name,
        phone: linked.phone || s.phone,
        spec: linked.specialization || s.spec,
      } : s;
    };
    if (scopeMonth === "current") {
      return stats
        .filter((s) => !isExcludedTeacher(s.id, s.name))
        .map(applyLinked);
    }
    const filtered = archive
      .filter((r) => r.month_key === scopeMonth)
      .filter((r) => !isExcludedTeacher(r.teacher_civil_id, r.teacher_name));
    return filtered.map((r) => ({
      name: linkedTeachers[r.teacher_civil_id]?.full_name || r.teacher_name,
      id: r.teacher_civil_id || "—",
      phone: linkedTeachers[r.teacher_civil_id]?.phone || r.teacher_phone,
      spec: linkedTeachers[r.teacher_civil_id]?.specialization || r.specialization,
      workMin: r.work_min,
      lateMin: r.late_min,
      excuseMin: r.excuse_min,
      absentDays: r.absent_days,
      openDays: r.open_days,
      presentDays: r.present_days,
      totalDays: r.total_days,
    }));
  }, [scopeMonth, stats, archive, linkedTeachers]);

  const viewMonthLabel = useMemo(() => {
    if (scopeMonth === "current") return monthLabel;
    const r = archive.find((x) => x.month_key === scopeMonth);
    return r?.month_label || scopeMonth;
  }, [scopeMonth, monthLabel, archive]);

  const archivedMonths = useMemo(() => {
    const m = new Map<string, string>();
    archive.forEach((r) => m.set(r.month_key, r.month_label || r.month_key));
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [archive]);

  const teacherOptions = useMemo(() => {
    const source = teacherRegistry.length
      ? teacherRegistry
          .filter((t) => !isExcludedTeacher(t.civil_id, t.full_name))
          .map((t) => ({ value: t.civil_id, label: t.full_name, sub: t.specialization || t.civil_id }))
      : viewStats.map((s) => ({ value: s.id !== "—" ? s.id : s.name, label: s.name, sub: s.id !== "—" ? s.id : "" }));
    return source
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [teacherRegistry, viewStats]);

  const filtered = useMemo(() => {
    let list = viewStats;
    if (selectedTeacher !== "all") {
      list = list.filter((s) => (s.id !== "—" ? s.id : s.name) === selectedTeacher);
    }
    const q = search.trim();
    if (q) list = list.filter((s) => s.name.includes(q) || s.id.includes(q) || s.spec.includes(q));
    return list;
  }, [viewStats, selectedTeacher, search]);

  const totals = useMemo(() => {
    let workMin = 0, lateMin = 0, excuseMin = 0, absent = 0, open = 0, excellent = 0, needs = 0;
    for (const s of viewStats) {
      workMin += s.workMin; lateMin += s.lateMin; excuseMin += s.excuseMin;
      absent += s.absentDays; open += s.openDays;
      const { level } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
      if (level === "ممتاز") excellent++;
      if (level === "يحتاج متابعة") needs++;
    }
    return { workMin, lateMin, excuseMin, absent, open, excellent, needs };
  }, [viewStats]);

  const identitySummary = useMemo(() => {
    const withId = viewStats.filter((s) => s.id && s.id !== "—").length;
    const linked = viewStats.filter((s) => s.id && s.id !== "—" && linkedTeachers[s.id]).length;
    return { withId, linked };
  }, [viewStats, linkedTeachers]);

  const exportCSV = () => {
    if (!viewStats.length) return;
    const header = [
      "م","الاسم","الهوية","التخصص","أيام التواجد","لم يُغلق الانصراف",
      "الغياب","عمل (س:د)","تأخر (س:د)","استئذان (س:د)","التقييم","النسبة",
    ];
    const rows = viewStats.map((s, i) => {
      const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
      return [
        String(i + 1), s.name, s.id, s.spec,
        String(s.presentDays), String(s.openDays), String(s.absentDays),
        minutesToHHMM(s.workMin), minutesToHHMM(s.lateMin), minutesToHHMM(s.excuseMin),
        level, `${score}%`,
      ];
    });
    const csv = "\uFEFF" + [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `كشف_حضوري_${viewMonthLabel || "شهري"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearCurrent = () => {
    setStats([]); setImportedDates([]); setFileNames([]); setMonthLabel(""); setSearch("");
    setSelectedTeacher("all");
    setExcuseDetails([]);
    setExcusesRange(null);
    setImportReport(null);
    if (archivedMonths.length) setScopeMonth(archivedMonths[0][0]);
  };

  // Print a single teacher card from current view
  const archivePrintAction = async (entry: {
    teacher_name: string;
    teacher_civil_id: string;
    teacher_phone?: string;
    month_label: string;
    summary: string;
    payload: Record<string, any>;
  }) => {
    // ⚠️ الطباعة ليست إجراءً إدارياً ولا تُؤرشف.
    // أرشيف الإجراءات مخصص حصراً للإجراءات الفعلية (تنبيه، مساءلة، لفت نظر...).
    void entry;
  };

  const printSingleTeacher = async (s: TeacherStats) => {
    const civilId = s.id !== "—" ? s.id : "";
    const monthKey = scopeMonth === "current" ? monthKeyFromLabel(viewMonthLabel, importedDates[0]) : scopeMonth;
    let daily: Awaited<ReturnType<typeof listDailyForTeacher>> = [];
    if (civilId) {
      try {
        daily = await listDailyForTeacher(civilId, monthKey);
        daily = [...daily].sort((a, b) => (a.greg_date || "").localeCompare(b.greg_date || ""));
      } catch (err: any) {
        toast.error("تعذّر تحميل السجل اليومي للطباعة: " + (err?.message ?? ""));
      }
    }
    const linked = civilId ? linkedTeachers[civilId] : null;
    const html = buildMonthlyPrintHTML({
      teacher: {
        name: linked?.full_name || s.name,
        civil_id: civilId || s.id,
        phone: linked?.phone || s.phone,
        specialization: linked?.specialization || s.spec,
        rank: linked?.rank_title || "",
        job: linked?.current_job || "معلم",
      },
      monthLabel: viewMonthLabel || monthKey,
      totals: {
        work_min: s.workMin,
        late_min: s.lateMin,
        excuse_min: s.excuseMin,
        absent_days: s.absentDays,
        open_days: s.openDays,
        present_days: s.presentDays,
        total_days: s.totalDays,
      },
      daily,
      excuses: civilId
        ? excuseDetails
            .filter((e) => e.teacher_civil_id === civilId)
            .map((e) => ({
              greg_date: e.greg_date,
              from_time: e.from_time,
              to_time: e.to_time,
              duration_min: e.duration_min,
              kind: e.kind,
              period: e.period,
              status_request: e.status_request,
              request_id: e.request_id,
            }))
        : [],
      excusesRange: excusesRange || undefined,
    });
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("تعذّر فتح نافذة الطباعة"); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
    // أرشفة تلقائية لطباعة الكشف (لا يحذفها إلا مدير المدرسة)
    archivePrintAction({
      teacher_name: linked?.full_name || s.name,
      teacher_civil_id: civilId,
      teacher_phone: linked?.phone || s.phone || "",
      month_label: viewMonthLabel || monthKey,
      summary: `طباعة كشف حضوري شهري — ${linked?.full_name || s.name} — ${viewMonthLabel || monthKey}`,
      payload: {
        action: "print_monthly_kashf",
        month_key: monthKey,
        totals: {
          work_min: s.workMin,
          late_min: s.lateMin,
          excuse_min: s.excuseMin,
          absent_days: s.absentDays,
          open_days: s.openDays,
          present_days: s.presentDays,
          total_days: s.totalDays,
        },
      },
    });
  };

  const sendWhatsApp = (s: TeacherStats) => {
    const phone = (s.phone || "").replace(/\D/g, "");
    if (!phone) { toast.error("لا يوجد رقم جوال للمعلم"); return; }
    const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
    const msg = buildConciseWhatsAppMessage(s, viewMonthLabel, level, score);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ===== Bulk operations =====
  const toggleRowSelected = (key: string) => {
    setSelectedRows((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };
  const selectAllVisible = () => {
    setSelectedRows(new Set(filtered.map((s) => s.id !== "—" ? s.id : s.name)));
  };
  const clearSelection = () => setSelectedRows(new Set());

  const getSelectedTeachers = (): TeacherStats[] => {
    if (selectedRows.size === 0) return filtered;
    return filtered.filter((s) => selectedRows.has(s.id !== "—" ? s.id : s.name));
  };

  /** طباعة دفعية: يبني وثيقة HTML واحدة تحوي كشف كل معلم في صفحة منفصلة. */
  const printBulkTeachers = async () => {
    const list = getSelectedTeachers();
    if (!list.length) { toast.error("لا يوجد معلمون للطباعة"); return; }
    const monthKey = scopeMonth === "current" ? monthKeyFromLabel(viewMonthLabel, importedDates[0]) : scopeMonth;
    toast.info(`جارٍ تجهيز ${list.length} كشف للطباعة...`);
    const sections: string[] = [];
    for (const s of list) {
      const civilId = s.id !== "—" ? s.id : "";
      let daily: Awaited<ReturnType<typeof listDailyForTeacher>> = [];
      if (civilId) {
        try {
          daily = await listDailyForTeacher(civilId, monthKey);
          daily = [...daily].sort((a, b) => (a.greg_date || "").localeCompare(b.greg_date || ""));
        } catch { /* تجاهل، نطبع المتاح */ }
      }
      const linked = civilId ? linkedTeachers[civilId] : null;
      const html = buildMonthlyPrintHTML({
        teacher: {
          name: linked?.full_name || s.name,
          civil_id: civilId || s.id,
          phone: linked?.phone || s.phone,
          specialization: linked?.specialization || s.spec,
          rank: linked?.rank_title || "",
          job: linked?.current_job || "معلم",
        },
        monthLabel: viewMonthLabel || monthKey,
        totals: {
          work_min: s.workMin,
          late_min: s.lateMin,
          excuse_min: s.excuseMin,
          absent_days: s.absentDays,
          open_days: s.openDays,
          present_days: s.presentDays,
          total_days: s.totalDays,
        },
        daily,
        excuses: civilId
          ? excuseDetails.filter((e) => e.teacher_civil_id === civilId).map((e) => ({
              greg_date: e.greg_date, from_time: e.from_time, to_time: e.to_time,
              duration_min: e.duration_min, kind: e.kind, period: e.period,
              status_request: e.status_request, request_id: e.request_id,
            }))
          : [],
        excusesRange: excusesRange || undefined,
      });
      // نستخرج فقط محتوى <body> لكل كشف ثم نلصقه في صفحة واحدة مع فاصل صفحات.
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const inner = bodyMatch ? bodyMatch[1] : html;
      sections.push(`<section class="teacher-page">${inner}</section>`);
    }
    // نأخذ <head> من أول كشف للحفاظ على الأنماط، ثم ندمج الأقسام.
    const headTemplate = (sections.length ? null : "");
    const sampleHTML = list.length ? buildMonthlyPrintHTML({
      teacher: { name: "_", civil_id: "", phone: "", specialization: "" },
      monthLabel: viewMonthLabel, totals: { work_min: 0, late_min: 0, excuse_min: 0, absent_days: 0, open_days: 0, present_days: 0, total_days: 0 },
      daily: [],
    }) : "";
    const headMatch = sampleHTML.match(/<head[\s\S]*?<\/head>/i);
    const headHTML = headMatch ? headMatch[0] : "<head><meta charset='utf-8'></head>";
    const fullHTML = `<!doctype html><html lang="ar" dir="rtl">${headHTML}
<style>.teacher-page{page-break-after:always}.teacher-page:last-child{page-break-after:auto}</style>
<body>${sections.join("\n")}</body></html>`;
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) { toast.error("تعذّر فتح نافذة الطباعة"); return; }
    w.document.write(fullHTML);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 500);
    // أرشفة جماعية لإجراء الطباعة (عنصر واحد ملخّص + عناصر فردية لكل معلم)
    archivePrintAction({
      teacher_name: "",
      teacher_civil_id: "",
      month_label: viewMonthLabel || monthKey,
      summary: `طباعة كشوف شهرية (${list.length} معلم) — ${viewMonthLabel || monthKey}`,
      payload: {
        action: "print_monthly_kashf_bulk",
        month_key: monthKey,
        count: list.length,
        teachers: list.map((s) => ({ name: s.name, civil_id: s.id !== "—" ? s.id : "" })),
      },
    });
    for (const s of list) {
      const civilId = s.id !== "—" ? s.id : "";
      const linked = civilId ? linkedTeachers[civilId] : null;
      archivePrintAction({
        teacher_name: linked?.full_name || s.name,
        teacher_civil_id: civilId,
        teacher_phone: linked?.phone || s.phone || "",
        month_label: viewMonthLabel || monthKey,
        summary: `طباعة كشف حضوري شهري — ${linked?.full_name || s.name} — ${viewMonthLabel || monthKey}`,
        payload: {
          action: "print_monthly_kashf",
          month_key: monthKey,
          totals: {
            work_min: s.workMin,
            late_min: s.lateMin,
            excuse_min: s.excuseMin,
            absent_days: s.absentDays,
            open_days: s.openDays,
            present_days: s.presentDays,
            total_days: s.totalDays,
          },
        },
      });
    }
  };

  /** إرسال جماعي عبر واتساب: يفتح نافذة لكل معلم تباعًا. */
  const sendBulkWhatsApp = () => {
    const list = getSelectedTeachers().filter((s) => (s.phone || "").replace(/\D/g, ""));
    if (!list.length) { toast.error("لا يوجد معلمون لديهم أرقام جوال للإرسال"); return; }
    if (list.length > 1 && !confirm(`سيتم فتح ${list.length} نافذة واتساب تباعًا. هل تريد المتابعة؟`)) return;
    list.forEach((s, idx) => {
      const phone = (s.phone || "").replace(/\D/g, "");
      const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
      const msg = buildConciseWhatsAppMessage(s, viewMonthLabel, level, score);
      setTimeout(() => {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
      }, idx * 600); // تباعد لتفادي حظر المتصفح للنوافذ المنبثقة
    });
    toast.success(`جارٍ فتح نوافذ الإرسال (${list.length} معلم)`);
  };

  // ===== Archive deletion (Principal only) =====
  const handleClearArchiveMonth = async (key: string, label: string) => {
    if (!isPrincipal) { toast.error("هذه الصلاحية حصرية لمدير المدرسة"); return; }
    setBusyClearing(true);
    try {
      await deleteArchiveMonth(key);
      toast.success(`تم حذف أرشيف شهر ${label}`);
      try { await logAudit({ section: "teachers", entity_type: "haduri_month", entity_id: key, action: "delete", details: { label } } as any); } catch {}
      if (scopeMonth === key) setScopeMonth("current");
      await refreshArchive();
    } catch (err: any) {
      toast.error("تعذّر حذف الأرشيف: " + (err?.message ?? ""));
    } finally {
      setBusyClearing(false);
    }
  };

  const handleClearAllArchive = async () => {
    if (!isPrincipal) { toast.error("هذه الصلاحية حصرية لمدير المدرسة"); return; }
    setBusyClearing(true);
    try {
      await deleteAllArchive();
      toast.success("تم تصفير الأرشيف بالكامل — جاهز لسنة دراسية جديدة");
      try { await logAudit({ section: "teachers", entity_type: "haduri_archive", entity_id: "ALL", action: "reset" } as any); } catch {}
      setScopeMonth("current");
      setStats([]); setImportedDates([]); setFileNames([]); setMonthLabel("");
      setExcuseDetails([]); setExcusesRange(null); setImportReport(null);
      await refreshArchive();
    } catch (err: any) {
      toast.error("تعذّر تصفير الأرشيف: " + (err?.message ?? ""));
    } finally {
      setBusyClearing(false);
    }
  };

  const isSingleTeacher = selectedTeacher !== "all" && filtered.length === 1;
  const activeMonthKey = useMemo(
    () => scopeMonth === "current" ? monthKeyFromLabel(viewMonthLabel, importedDates[0]) : scopeMonth,
    [scopeMonth, viewMonthLabel, importedDates],
  );

  useEffect(() => {
    if (selectedTeacher === "all" || !activeMonthKey) {
      setSelectedDailyRows([]);
      return;
    }
    let alive = true;
    setLoadingSelectedDaily(true);
    listDailyForTeacher(selectedTeacher, activeMonthKey)
      .then((rows) => {
        if (alive) setSelectedDailyRows([...rows].sort((a, b) => (a.greg_date || "").localeCompare(b.greg_date || "")));
      })
      .catch((err: any) => toast.error("تعذّر تحميل تفاصيل الأيام: " + (err?.message ?? "")))
      .finally(() => { if (alive) setLoadingSelectedDaily(false); });
    return () => { alive = false; };
  }, [selectedTeacher, activeMonthKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.id) return;
      setSelectedDailyRows((rows) => rows.map((r) => {
        if (r.id !== detail.id) return r;
        if (detail.field === "fares_upload_status") return { ...r, fares_upload_status: detail.value };
        if (detail.field === "absence_type") return { ...r, absence_type: detail.value };
        return r;
      }));
    };
    window.addEventListener("haduri-daily-updated", handler);
    return () => window.removeEventListener("haduri-daily-updated", handler);
  }, []);

  const handleAbsenceMetaChange = async (
    row: HaduriDailyRow,
    field: "absence_type" | "fares_upload_status",
    value: string,
  ) => {
    const canEditField = field === "fares_upload_status" ? canEditFares : canEditAbsenceType;
    if (!canEditField) {
      toast.error(field === "fares_upload_status" ? "لا تملك صلاحية تعديل حالة الرفع في فارس — يرجى مراجعة مدير المدرسة" : "لا تملك صلاحية تعديل نوع الغياب — يرجى مراجعة مدير المدرسة");
      return;
    }
    const next = {
      absence_type: field === "absence_type" ? value : (row.absence_type || defaultAbsenceType),
      fares_upload_status: field === "fares_upload_status" ? value : (row.fares_upload_status || defaultFaresStatus),
    };
    setSelectedDailyRows((rows) => rows.map((r) => r.id === row.id ? { ...r, ...next } : r));
    try {
      const saved = await updateDailyAbsenceMeta(row.id, next.absence_type, next.fares_upload_status);
      const canonical = {
        absence_type: saved.absence_type || next.absence_type,
        fares_upload_status: saved.fares_upload_status || next.fares_upload_status,
      };
      setSelectedDailyRows((rows) => rows.map((r) => r.id === row.id ? { ...r, ...canonical } : r));
      try {
        window.dispatchEvent(new CustomEvent("haduri-daily-updated", {
          detail: { id: row.id, teacher_civil_id: row.teacher_civil_id, field, value: (canonical as any)[field], ...canonical },
        }));
      } catch { /* noop */ }
      toast.success("تم تحديث بيانات الغياب لهذا اليوم");
    } catch (err: any) {
      toast.error("تعذّر تحديث بيانات الغياب: " + (err?.message ?? ""));
      setSelectedDailyRows((rows) => rows.map((r) => r.id === row.id ? row : r));
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Hero / upload card */}
      <Card className="overflow-hidden border-2 shadow-sm">
        <div className="bg-gradient-to-l from-primary/15 via-primary/5 to-card p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground grid place-items-center shrink-0 shadow-md">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-foreground">كشف حضوري الشهري للمعلمين</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-7">
                  ارفع ملفًا أو مجلد شهر من منصة حضوري؛ يتم ربط رقم الهوية باسم المعلم وبياناته من سجل المعلمين، ثم حفظ الكشف الشهري واليومي في قاعدة البيانات.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={filesRef} type="file" multiple accept=".xlsx,.xlsm,.xlsb,.xls,.csv"
                onChange={handleFiles} className="hidden" disabled={busy || !canImport} />
              <input ref={folderRef} type="file" multiple onChange={handleFiles} className="hidden"
                disabled={busy || !canImport}
                accept=".xlsx,.xlsm,.xlsb,.xls,.csv"
                // @ts-expect-error non-standard
                webkitdirectory="" directory="" />
              <Button size="lg" disabled={busy || !canImport} onClick={() => {
                if (!canImport) { toast.error("الاستيراد مقصور على المدير أو من منحه صلاحية «استيراد ملفات شؤون المعلمين»"); return; }
                filesRef.current?.click();
              }} title={!canImport ? "الاستيراد مقصور على المدير أو من يملك صلاحية استيراد ملفات شؤون المعلمين" : "استيراد ملف Excel"}>
                {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Upload className="w-4 h-4 ml-2" />}
                {busy ? "جارٍ التحليل..." : "استيراد Excel"}
              </Button>
              <Button size="lg" variant="outline" disabled={busy || !canImport} onClick={() => {
                if (!canImport) { toast.error("الاستيراد مقصور على المدير أو من منحه صلاحية «استيراد ملفات شؤون المعلمين»"); return; }
                folderRef.current?.click();
              }} title={!canImport ? "الاستيراد مقصور على المدير أو من يملك صلاحية استيراد ملفات شؤون المعلمين" : "استيراد مجلد الشهر"}>
                <FolderOpen className="w-4 h-4 ml-2" />
                استيراد مجلد الشهر
              </Button>
              {!canImport && (
                <Badge variant="outline" className="border-destructive/40 text-destructive gap-1 self-center">
                  <ShieldAlert className="w-3 h-3" /> الاستيراد للمدير أو من يملك صلاحية استيراد ملفات شؤون المعلمين
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 items-center text-xs">
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
              <Clock className="w-3 h-3" /> الدوام الصيفي: 06:45 صباحًا — 01:45 ظهرًا
            </Badge>
            {viewMonthLabel && (
              <Badge className="bg-primary text-primary-foreground gap-1">
                <Calendar className="w-3 h-3" /> {viewMonthLabel}
              </Badge>
            )}
            {scopeMonth === "current" && importedDates.length > 0 && (
              <>
                <Badge variant="outline">{importedDates.length} يوم عمل</Badge>
                <Badge variant="outline">{importedDates[0]} ← {importedDates[importedDates.length - 1]}</Badge>
              </>
            )}
            {scopeMonth === "current" && fileNames.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                <FileSpreadsheet className="w-3 h-3" /> {fileNames.length} ملف
              </Badge>
            )}
            {busySave && <Badge variant="outline" className="gap-1"><Save className="w-3 h-3 animate-pulse" /> جارٍ الحفظ...</Badge>}
            {viewStats.length > 0 && (
              <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                <BadgeCheck className="w-3 h-3" /> مرتبط بالهوية: {identitySummary.linked}/{identitySummary.withId}
              </Badge>
            )}
            {scopeMonth === "current" && stats.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCurrent} className="h-7 mr-auto text-destructive">
                <Trash2 className="w-3.5 h-3.5 ml-1" /> مسح الحالي
              </Button>
            )}
          </div>
        </div>
      </Card>

      {scopeMonth === "current" && importReport && (
        <ImportReportCard report={importReport} />
      )}

      {/* Month + teacher selectors */}
      <Card className="p-4 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-[260px]">
          <span className="text-xs font-bold text-muted-foreground">الشهر:</span>
          <Select value={scopeMonth} onValueChange={(v) => { setScopeMonth(v); setSelectedTeacher("all"); }}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="اختر شهرًا" />
            </SelectTrigger>
            <SelectContent>
              {stats.length > 0 && (
                <SelectItem value="current">
                  📥 الرفع الحالي {monthLabel ? `(${monthLabel})` : ""}
                </SelectItem>
              )}
              {archivedMonths.length === 0 && stats.length === 0 && (
                <SelectItem value="current" disabled>لا يوجد شهر</SelectItem>
              )}
              {archivedMonths.map(([k, lbl]) => (
                <SelectItem key={k} value={k}>📂 {lbl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loadingArchive && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-center gap-2 min-w-[300px]">
          <span className="text-xs font-bold text-muted-foreground">المعلم:</span>
          <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
            <SelectTrigger className="w-[260px] h-9">
              <SelectValue placeholder="اختر معلمًا" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">📋 عرض جميع المعلمين</SelectItem>
              {teacherOptions.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label} {t.sub ? `· ${t.sub}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الهوية أو التخصص..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pr-9 h-9" />
        </div>

        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!viewStats.length}>
          <Download className="w-4 h-4 ml-1" /> تصدير CSV
        </Button>

        {/* أزرار الطباعة والإرسال الجماعي */}
        <Button variant="outline" size="sm" onClick={printBulkTeachers} disabled={!filtered.length}>
          <Printer className="w-4 h-4 ml-1" />
          {selectedRows.size > 0 ? `طباعة المحدد (${selectedRows.size})` : "طباعة الكل"}
        </Button>
        <Button variant="outline" size="sm" onClick={sendBulkWhatsApp} disabled={!filtered.length}
          className="border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/10">
          <MessageCircle className="w-4 h-4 ml-1" />
          {selectedRows.size > 0 ? `إرسال للمحدد (${selectedRows.size})` : "إرسال للكل"}
        </Button>

        {/* زر تصفير/حذف الأرشيف — حصري للمدير */}
        {isPrincipal && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={busyClearing}
                className="border-destructive/40 text-destructive hover:bg-destructive/10">
                <ShieldAlert className="w-4 h-4 ml-1" />
                {busyClearing ? "جارٍ الحذف..." : "تصفير/حذف الأرشيف"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" /> صلاحية المدير: حذف الأرشيف
                </AlertDialogTitle>
                <AlertDialogDescription className="text-foreground/80 leading-7">
                  اختر العملية المطلوبة. هذا الإجراء <strong className="text-destructive">نهائي ولا يمكن التراجع عنه</strong>.
                  يُستخدم عادةً عند بدء سنة دراسية جديدة أو حذف بيانات شهر معين.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 my-2">
                {scopeMonth !== "current" && (
                  <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-bold">حذف الشهر المعروض حالياً</div>
                      <div className="text-xs text-muted-foreground">{viewMonthLabel}</div>
                    </div>
                    <AlertDialogAction
                      onClick={() => handleClearArchiveMonth(scopeMonth, viewMonthLabel)}
                      className="bg-destructive hover:bg-destructive/90">
                      حذف هذا الشهر
                    </AlertDialogAction>
                  </div>
                )}
                <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-bold text-destructive">تصفير الأرشيف بالكامل</div>
                    <div className="text-xs text-muted-foreground">حذف جميع الأشهر والسجلات اليومية — لبدء سنة دراسية جديدة</div>
                  </div>
                  <AlertDialogAction
                    onClick={handleClearAllArchive}
                    className="bg-destructive hover:bg-destructive/90">
                    تصفير الكل
                  </AlertDialogAction>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </Card>

      {viewStats.length > 0 && (
        <>
          {/* KPI cards (only for whole month, not single teacher) */}
          {!isSingleTeacher && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KpiCard icon={<Users className="w-4 h-4" />} label="معلمون" value={String(viewStats.length)} tone="primary" onClick={() => setKpiDialog("all")} />
              <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="ممتاز" value={String(totals.excellent)} tone="success" onClick={() => setKpiDialog("excellent")} />
              <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="يحتاج متابعة" value={String(totals.needs)} tone="warning" onClick={() => setKpiDialog("needs")} />
              <KpiCard icon={<XCircle className="w-4 h-4" />} label="إجمالي الغياب" value={String(totals.absent)} tone="danger" onClick={() => setKpiDialog("absent")} />
              <KpiCard icon={<Clock className="w-4 h-4" />} label="إجمالي التأخر" value={minutesToHHMM(totals.lateMin)} tone="warning" onClick={() => setKpiDialog("late")} />
              <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="ساعات العمل" value={minutesToHHMM(totals.workMin)} tone="primary" />
            </div>
          )}

          {/* Single-teacher detailed card */}
          {isSingleTeacher && (
            <SingleTeacherCard
              s={filtered[0]}
              monthLabel={viewMonthLabel}
              dailyRows={selectedDailyRows}
              loadingDaily={loadingSelectedDaily}
              onAbsenceMetaChange={handleAbsenceMetaChange}
              canEditAbsenceType={canEditAbsenceType}
              canEditFares={canEditFares}
              onPrint={() => printSingleTeacher(filtered[0])}
              onSend={() => sendWhatsApp(filtered[0])}
            />
          )}

          {/* Detailed table — only when not single-teacher view */}
          {!isSingleTeacher && (
            <Card className="overflow-hidden border-2 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-primary/10 border-b-2 border-primary/20">
                    <tr className="text-foreground">
                      <th className="p-3 text-center font-bold w-10">
                        <button
                          type="button"
                          title={selectedRows.size === filtered.length && filtered.length > 0 ? "إلغاء التحديد" : "تحديد الكل"}
                          onClick={() => {
                            if (selectedRows.size === filtered.length && filtered.length > 0) clearSelection();
                            else selectAllVisible();
                          }}
                          className="text-primary hover:opacity-80"
                        >
                          {selectedRows.size === filtered.length && filtered.length > 0
                            ? <CheckSquare className="w-4 h-4 mx-auto" />
                            : <Square className="w-4 h-4 mx-auto" />}
                        </button>
                      </th>
                      <th className="p-3 text-right font-bold w-10">#</th>
                      <th className="p-3 text-right font-bold">المعلم</th>
                      <th className="p-3 text-right font-bold">الهوية</th>
                      <th className="p-3 text-center font-bold">الربط</th>
                      <th className="p-3 text-center font-bold">الحضور</th>
                      <th className="p-3 text-center font-bold">لم يُغلق</th>
                      <th className="p-3 text-center font-bold">الغياب</th>
                      <th className="p-3 text-center font-bold">عمل</th>
                      <th className="p-3 text-center font-bold">تأخر</th>
                      <th className="p-3 text-center font-bold">استئذان</th>
                      <th className="p-3 text-center font-bold">التقييم</th>
                      <th className="p-3 text-center font-bold w-28">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => {
                      const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
                      const linked = s.id && s.id !== "—" ? linkedTeachers[s.id] : null;
                      const rowKey = s.id !== "—" ? s.id : s.name;
                      const isSelected = selectedRows.has(rowKey);
                      return (
                        <tr key={s.id + i} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRowSelected(rowKey)}
                              aria-label="تحديد المعلم"
                            />
                          </td>
                          <td className="p-3 text-muted-foreground">{i + 1}</td>
                          <td className="p-3">
                            <div className="font-semibold text-foreground">{s.name}</div>
                            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                              {s.spec && <span>{s.spec}</span>}
                              {s.phone && <span className="font-mono">{s.phone}</span>}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-xs"><span dir="ltr">{s.id}</span></td>
                          <td className="p-3 text-center">
                            {linked ? (
                              <Badge variant="outline" className="gap-1 border-primary/30 text-primary"><BadgeCheck className="w-3 h-3" /> مؤكد</Badge>
                            ) : s.id !== "—" ? (
                              <Badge variant="outline" className="gap-1"><IdCard className="w-3 h-3" /> من حضوري</Badge>
                            ) : (
                              <Badge variant="destructive">بلا هوية</Badge>
                            )}
                          </td>
                          <td className="p-3 text-center font-semibold">{s.presentDays}</td>
                          <td className="p-3 text-center">
                            {s.openDays > 0 ? <span className="text-amber-600 font-bold">{s.openDays}</span> : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className="p-3 text-center">
                            {s.absentDays > 0 ? <span className="text-destructive font-bold">{s.absentDays}</span> : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className="p-3 text-center font-mono text-xs">{minutesToHHMM(s.workMin)}</td>
                          <td className="p-3 text-center font-mono text-xs">
                            {s.lateMin > 0 ? <span className="text-amber-600 font-bold">{minutesToHHMM(s.lateMin)}</span> : "00:00"}
                          </td>
                          <td className="p-3 text-center font-mono text-xs">{minutesToHHMM(s.excuseMin)}</td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge variant="outline" className={`text-[11px] ${LEVEL_STYLES[level]}`}>{level}</Badge>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${score}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <Button size="icon" variant="ghost" title="عرض كشف هذا المعلم"
                                onClick={() => setSelectedTeacher(s.id !== "—" ? s.id : s.name)}>
                                <User2 className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" title="طباعة كشف المعلم"
                                onClick={() => printSingleTeacher(s)}>
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" title="إرسال للمعلم عبر واتساب"
                                onClick={() => sendWhatsApp(s)}>
                                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-muted-foreground">
                          لا توجد نتائج مطابقة للبحث
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {viewStats.length === 0 && !busy && !loadingArchive && (
        <Card className="p-10 text-center text-muted-foreground border-dashed">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-foreground">لا توجد بيانات لعرضها</p>
          <p className="text-sm mt-1">اختر <strong>رفع ملف</strong> لاستيراد ملف واحد، أو <strong>رفع مجلد شهر</strong> لاستيراد جميع ملفات الشهر دفعة واحدة.</p>
        </Card>
      )}

      <KpiDetailsDialog
        kind={kpiDialog}
        onClose={() => setKpiDialog(null)}
        stats={viewStats}
        monthLabel={viewMonthLabel}
      />
    </div>
  );
}

function KpiCard({
  icon, label, value, tone, onClick,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: "primary" | "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    primary: "from-primary/10 to-primary/5 text-primary",
    success: "from-emerald-500/10 to-emerald-500/5 text-emerald-600",
    warning: "from-amber-500/10 to-amber-500/5 text-amber-600",
    danger: "from-red-500/10 to-red-500/5 text-red-600",
  };
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`p-3 bg-gradient-to-bl ${tones[tone]} border ${onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold opacity-80">{icon}<span>{label}</span></div>
      <div className="mt-1 text-xl font-bold text-foreground font-mono">{value}</div>
    </Card>
  );
}

function ImportReportCard({ report }: { report: ImportReport }) {
  const limited = (items: string[]) => items.slice(0, 8);
  const [open, setOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(true);
  const issues =
    (report.failedFiles?.length || 0) +
    (report.skippedAttendanceDates?.length || 0) +
    (report.unmatchedTeachers?.length || 0);

  const handleExport = () => {
    downloadImportLogExcel({
      folderName: report.folderName,
      totalFiles: report.totalFiles,
      excelFiles: report.excelFiles,
      readFiles: report.readFiles,
      attendanceRows: report.attendanceRows,
      excuseRows: report.excuseRows,
      validAttendanceDates: report.validAttendanceDates,
      skippedAttendanceDates: report.skippedAttendanceDates,
      unmatchedTeachers: report.unmatchedTeachers,
      files: report.files || [],
    }, `سجل_الاستيراد_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const statusColor = (s: FileImportEntry["status"]) =>
    s === "نجح" ? "bg-emerald-500/10 text-emerald-700 border-emerald-300"
    : s === "نجح جزئيًا" ? "bg-amber-500/10 text-amber-700 border-amber-300"
    : s === "فشل" ? "bg-red-500/10 text-red-700 border-red-300"
    : "bg-muted text-muted-foreground";

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-3 flex flex-wrap items-center gap-2 text-right hover:bg-primary/10 transition-colors rounded-md"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
        <Badge className="bg-primary text-primary-foreground">تقرير تشخيص الاستيراد</Badge>
        <Badge variant="outline">Excel: {report.excelFiles}/{report.totalFiles}</Badge>
        <Badge variant="outline">المقروءة: {report.readFiles}</Badge>
        <Badge variant="outline">أيام معتمدة: {report.validAttendanceDates.length}</Badge>
        {issues > 0 && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700">
            ملاحظات: {issues}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground mr-auto">
          {open ? "إخفاء التفاصيل" : "إظهار التفاصيل"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {report.folderName && <Badge variant="outline">مجلد: {report.folderName}</Badge>}
            <Badge variant="outline">سجلات حضور: {report.attendanceRows}</Badge>
            <Badge variant="outline">سجلات استئذان: {report.excuseRows}</Badge>
            <Button size="sm" variant="outline" className="mr-auto" onClick={handleExport}>
              <Download className="w-4 h-4 ml-1" /> تنزيل سجل الاستيراد (Excel)
            </Button>
          </div>

          {report.files && report.files.length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setFilesOpen((v) => !v)}
                className="w-full p-2 px-3 flex items-center gap-2 text-right border-b bg-muted/40"
              >
                {filesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span className="font-extrabold text-foreground">حالة كل ملف ({report.files.length})</span>
                <span className="text-xs text-muted-foreground mr-auto">شفافية كاملة بسبب نجاح أو فشل كل ملف</span>
              </button>
              {filesOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-xs">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <th className="p-2 text-right font-bold">الملف</th>
                        <th className="p-2 text-center font-bold">الحالة</th>
                        <th className="p-2 text-center font-bold">النوع</th>
                        <th className="p-2 text-center font-bold">نمط الاسم</th>
                        <th className="p-2 text-center font-bold">التاريخ المكتشف</th>
                        <th className="p-2 text-center font-bold">صفوف</th>
                        <th className="p-2 text-right font-bold">السبب / الملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.files.map((f, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-2 font-medium" dir="ltr">{f.fileName}</td>
                          <td className="p-2 text-center">
                            <Badge variant="outline" className={statusColor(f.status)}>{f.status}</Badge>
                          </td>
                          <td className="p-2 text-center">{f.fileKind}</td>
                          <td className="p-2 text-center text-muted-foreground">
                            {f.pattern === "full_date" ? "تاريخ كامل"
                              : f.pattern === "day_ordinal" ? "رقم يوم"
                              : f.pattern === "date_range" ? "فترة"
                              : "غير محدد"}
                          </td>
                          <td className="p-2 text-center font-mono">{f.detectedDate || "—"}</td>
                          <td className="p-2 text-center">{f.acceptedRows}</td>
                          <td className="p-2 text-muted-foreground">{f.failureReason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs leading-6">
            <ReportList title="الأيام المعتمدة للغياب" items={report.validAttendanceDates} empty="لا توجد أيام حضور معتمدة" />
            <ReportList title="أيام لم تُعتمد" items={report.skippedAttendanceDates} empty="لا توجد أيام مستبعدة" />
            <ReportList title="شيتات غير معروفة" items={limited(report.unrecognizedSheets)} empty="كل الشيتات معروفة" />
            <ReportList title="معلمون غير مطابقين" items={limited(report.unmatchedTeachers)} empty="لا توجد سجلات غير مطابقة" />
          </div>
          {(report.failedFiles.length > 0 || report.ignoredFiles > 0) && (
            <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
              {report.ignoredFiles > 0 && <div>ملفات متجاهلة لعدم كونها Excel/CSV: {report.ignoredFiles}</div>}
              {report.failedFiles.length > 0 && <ReportList title="ملفات لم تُقرأ" items={limited(report.failedFiles)} empty="" />}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ReportList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 min-h-[96px]">
      <div className="font-extrabold text-foreground mb-1">{title}</div>
      {items.length ? (
        <ul className="space-y-1 text-muted-foreground">
          {items.map((item, index) => <li key={`${title}-${index}`}>• {item}</li>)}
        </ul>
      ) : (
        <div className="text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function SingleTeacherCard({
  s, monthLabel, dailyRows, loadingDaily, onAbsenceMetaChange, canEditAbsenceType, canEditFares, onPrint, onSend,
}: {
  s: TeacherStats; monthLabel: string;
  dailyRows: HaduriDailyRow[];
  loadingDaily: boolean;
  onAbsenceMetaChange: (row: HaduriDailyRow, field: "absence_type" | "fares_upload_status", value: string) => void;
  canEditAbsenceType: boolean;
  canEditFares: boolean;
  onPrint: () => void; onSend: () => void;
}) {
  const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
  const absenceRows = dailyRows.filter((r) => r.status === "غياب");
  const openRows = dailyRows.filter((r) => r.status === "لم يُغلق");
  const excuseRows = dailyRows.filter((r) => (r.excuse_min || 0) > 0 || r.status === "استئذان");
  return (
    <Card className="overflow-hidden border-2">
      <div className="bg-gradient-to-l from-primary/15 via-primary/5 to-transparent p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center text-xl font-bold">
            {s.name.charAt(0)}
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{s.name}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {s.id !== "—" && <span>هوية: {s.id}</span>}
              {s.spec && <span className="mr-2">· {s.spec}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {monthLabel && (
            <Badge className="bg-primary text-primary-foreground gap-1">
              <Calendar className="w-3 h-3" /> {monthLabel}
            </Badge>
          )}
          <Badge variant="outline" className={LEVEL_STYLES[level]}>{level} · {score}%</Badge>
          <Button size="sm" variant="outline" onClick={onPrint}>
            <Printer className="w-4 h-4 ml-1" /> طباعة الكشف
          </Button>
          <Button size="sm" className="bg-[#25D366] hover:bg-[#1aae53]" onClick={onSend}>
            <MessageCircle className="w-4 h-4 ml-1" /> إرسال للمعلم
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="الحضور" value={String(s.presentDays)} tone="primary" />
          <Stat label="لم يُغلق الانصراف" value={`${s.openDays} · ${minutesToHHMM(s.openDays * 210)}`} tone="warning" />
          <Stat label="الغياب" value={String(s.absentDays)} tone="danger" />
          <Stat label="ساعات العمل" value={minutesToHHMM(s.workMin)} tone="primary" />
          <Stat label="إجمالي التأخر" value={minutesToHHMM(s.lateMin)} tone="warning" />
          <Stat label="الاستئذان" value={minutesToHHMM(s.excuseMin)} tone="success" />
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2">
            <div>
              <div className="font-extrabold text-foreground">أيام الغياب التفصيلية</div>
              <div className="text-xs text-muted-foreground">اليوم والتاريخ وحالة الغياب مع نوعه وحالة الإدخال في فارس لكل يوم مستقل.</div>
            </div>
            <Badge variant="outline" className="border-destructive/30 text-destructive">{absenceRows.length} يوم</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-destructive/10 border-b">
                <tr>
                  <th className="p-3 text-right font-bold">اليوم</th>
                  <th className="p-3 text-right font-bold">التاريخ</th>
                  <th className="p-3 text-center font-bold">نوع الغياب</th>
                  <th className="p-3 text-center font-bold">فارس</th>
                </tr>
              </thead>
              <tbody>
                {loadingDaily ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline ml-2" /> جارٍ تحميل أيام الغياب...</td></tr>
                ) : absenceRows.length ? absenceRows.map((row) => {
                  const absType = row.absence_type || "بدون سند نظامي";
                  const isUnaccepted = absType === "بدون سند نظامي";
                  return (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-bold text-foreground whitespace-nowrap">{row.day_name || arabicDayName(row.greg_date)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-mono text-xs" dir="ltr">{row.greg_date}</div>
                      <div className="text-xs text-muted-foreground">{row.hijri_date || gregToHijri(row.greg_date)} هـ</div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {isUnaccepted ? (
                        <Badge variant="destructive" className="whitespace-nowrap">غياب غير مقبول</Badge>
                      ) : (
                        <Badge className="whitespace-nowrap bg-emerald-600 hover:bg-emerald-600 text-white">غياب مقبول</Badge>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <Select value={absType} onValueChange={(v) => onAbsenceMetaChange(row, "absence_type", v)} disabled={!canEditAbsenceType}>
                        <SelectTrigger className="h-9 w-[230px] mx-auto whitespace-nowrap" title={!canEditAbsenceType ? "لا تملك صلاحية تعديل نوع الغياب" : undefined}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="بدون سند نظامي">بدون سند نظامي</SelectItem>
                          <SelectItem value="مرضي">مرضي</SelectItem>
                          <SelectItem value="اضطراري">اضطراري</SelectItem>
                          <SelectItem value="وفاة">وفاة</SelectItem>
                          <SelectItem value="مولود / أبوة">مولود / أبوة</SelectItem>
                          <SelectItem value="مرافقة مريض">مرافقة مريض</SelectItem>
                          <SelectItem value="دورة تدريبية / مهمة رسمية">دورة تدريبية / مهمة رسمية</SelectItem>
                          <SelectItem value="مشاركة وطنية / رياضية رسمية">مشاركة وطنية / رياضية رسمية</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {(() => {
                        const fares = row.fares_upload_status === "تم الإدخال" ? "تم الإدخال" : "لم يتم الإدخال";
                        const faresClass = fares === "تم الإدخال"
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold"
                          : "border-destructive/50 bg-destructive/10 text-destructive font-bold";
                        return (
                      <Select value={fares} onValueChange={(v) => onAbsenceMetaChange(row, "fares_upload_status", v)} disabled={!canEditFares}>
                        <SelectTrigger className={`h-9 w-[170px] mx-auto whitespace-nowrap border ${faresClass}`} title={!canEditFares ? "لا تملك صلاحية تعديل حالة الرفع في فارس" : undefined}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="تم الإدخال">تم الإدخال</SelectItem>
                          <SelectItem value="لم يتم الإدخال">لم يتم الإدخال</SelectItem>
                        </SelectContent>
                      </Select>
                        );
                      })()}
                    </td>
                  </tr>
                ); }) : (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد أيام غياب مسجلة لهذا المعلم في الشهر المحدد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2">
            <div>
              <div className="font-extrabold text-foreground">أيام عدم تسجيل الانصراف</div>
              <div className="text-xs text-muted-foreground">يُحتسب كل يوم بدون انصراف تلقائيًا نصف يوم: 3 ساعات و30 دقيقة ضمن ساعات العمل الشهرية.</div>
            </div>
            <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400">{openRows.length} يوم</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-amber-500/10 border-b">
                <tr>
                  <th className="p-3 text-right font-bold">اليوم</th>
                  <th className="p-3 text-right font-bold">التاريخ</th>
                  <th className="p-3 text-center font-bold">الحضور</th>
                  <th className="p-3 text-center font-bold">الانصراف</th>
                  <th className="p-3 text-center font-bold">المدة المحتسبة</th>
                </tr>
              </thead>
              <tbody>
                {loadingDaily ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
                ) : openRows.length ? openRows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-bold text-foreground">{row.day_name || arabicDayName(row.greg_date)}</td>
                    <td className="p-3"><div className="font-mono text-xs" dir="ltr">{row.greg_date}</div><div className="text-xs text-muted-foreground">{row.hijri_date || gregToHijri(row.greg_date)} هـ</div></td>
                    <td className="p-3 text-center font-mono text-xs">{row.in_time || "—"}</td>
                    <td className="p-3 text-center"><Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400">لم يُسجل</Badge></td>
                    <td className="p-3 text-center font-mono font-bold">{minutesToHHMM(row.work_min || 210)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد أيام بدون تسجيل انصراف لهذا المعلم في الشهر المحدد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2">
            <div className="font-extrabold text-foreground">سجل الاستئذانات وربطها بالمعلم</div>
            <Badge variant="outline" className="border-primary/30 text-primary">{excuseRows.length} سجل</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-primary/10 border-b">
                <tr>
                  <th className="p-3 text-right font-bold">اليوم والتاريخ</th>
                  <th className="p-3 text-center font-bold">الحالة</th>
                  <th className="p-3 text-center font-bold">موقع الاستئذان</th>
                  <th className="p-3 text-center font-bold">المدة</th>
                  <th className="p-3 text-center font-bold">المصدر</th>
                </tr>
              </thead>
              <tbody>
                {loadingDaily ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">جارٍ التحميل...</td></tr>
                ) : excuseRows.length ? excuseRows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    <td className="p-3"><div className="font-bold">{row.day_name || arabicDayName(row.greg_date)}</div><div className="text-xs text-muted-foreground font-mono" dir="ltr">{row.greg_date}</div></td>
                    <td className="p-3 text-center"><Badge variant="outline" className="border-primary/30 text-primary">{row.status}</Badge></td>
                    <td className="p-3 text-center font-bold text-primary">{row.excuse_period || "وسط الدوام"}</td>
                    <td className="p-3 text-center font-mono text-xs">{minutesToHHMM(row.excuse_min || 0)}</td>
                    <td className="p-3 text-center text-xs text-muted-foreground">{row.source_file || "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد استئذانات مسجلة لهذا المعلم في الشهر المحدد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "warning" | "danger" | "success" }) {
  const tones: Record<string, string> = {
    primary: "from-primary/10 to-primary/5 text-primary border-primary/30",
    warning: "from-amber-500/10 to-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-300",
    danger: "from-red-500/10 to-red-500/5 text-red-700 dark:text-red-400 border-red-300",
    success: "from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-300",
  };
  return (
    <Card className={`p-3 bg-gradient-to-bl ${tones[tone]} border`}>
      <div className="text-xs font-bold opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold text-foreground font-mono">{value}</div>
    </Card>
  );
}

function buildTeacherPrintHTML(s: TeacherStats, monthLabel: string, level: string, score: number): string {
  const safe = (v: string) => String(v ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كشف حضوري - ${safe(s.name)}</title>
<style>
@page { size: A4; margin: 12mm; }
body { font-family: 'Tajawal', system-ui, -apple-system, sans-serif; color: #111; padding: 0; margin: 0; }
.hdr { background: linear-gradient(90deg,#0b7e88,#0ea5e9); color:#fff; padding:14px 16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; }
.hdr img { height: 56px; }
.title { font-weight: 900; font-size: 22px; }
.sub { font-size: 12px; opacity:.9; margin-top:4px; }
h2 { color:#064b50; margin:18px 0 8px; }
.meta { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin: 10px 0; }
.meta div { background:#f6fafb; border:1px solid #e6eeee; border-radius:8px; padding:8px 10px; font-weight:700; }
.grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-top:10px; }
.cell { border:1px solid #dbe9e9; border-radius:10px; padding:10px 12px; background:#fbfeff; }
.cell .l { font-size:11px; color:#60727a; font-weight:800; }
.cell .v { font-size:22px; color:#064b50; font-weight:900; margin-top:4px; }
.eval { margin-top:14px; padding:10px 12px; border-radius:10px; background:#ecfdf5; border:1px solid #bbf7d0; color:#166534; font-weight:900; }
.foot { margin-top:18px; font-size:11px; color:#666; text-align:center; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="hdr">
  <div>
    <div class="title">كشف حضوري شهري</div>
    <div class="sub">المملكة العربية السعودية - وزارة التعليم</div>
  </div>
  <img src="/legacy/shree.png" alt="moe" onerror="this.style.display='none'">
</div>

<h2>بيانات المعلم</h2>
<div class="meta">
  <div>الاسم: ${safe(s.name)}</div>
  <div>الهوية: ${safe(s.id)}</div>
  <div>التخصص: ${safe(s.spec || "—")}</div>
  <div>الجوال: ${safe(s.phone || "—")}</div>
  <div>الشهر: ${safe(monthLabel || "—")}</div>
  <div>عدد أيام الكشف: ${s.totalDays}</div>
</div>

<h2>إحصائيات الحضور</h2>
<div class="grid">
  <div class="cell"><div class="l">أيام الحضور</div><div class="v">${s.presentDays}</div></div>
  <div class="cell"><div class="l">لم يُغلق الانصراف</div><div class="v">${s.openDays}</div></div>
  <div class="cell"><div class="l">أيام الغياب</div><div class="v">${s.absentDays}</div></div>
  <div class="cell"><div class="l">إجمالي ساعات العمل</div><div class="v">${minutesToHHMM(s.workMin)}</div></div>
  <div class="cell"><div class="l">إجمالي التأخر</div><div class="v">${minutesToHHMM(s.lateMin)}</div></div>
  <div class="cell"><div class="l">إجمالي الاستئذان</div><div class="v">${minutesToHHMM(s.excuseMin)}</div></div>
</div>

<div class="eval">التقييم العام: ${safe(level)} · النسبة: ${score}%</div>

<div class="foot">صدر تلقائيًا من نظام شؤون المعلمين — ${new Date().toLocaleString("ar-SA")}</div>
</body></html>`;
}

/**
 * نافذة منبثقة قابلة للطباعة لاستعراض تفاصيل أحد مؤشرات الكشف الشهري:
 * (معلمون / ممتاز / يحتاج متابعة / إجمالي الغياب / إجمالي التأخر).
 */
function KpiDetailsDialog({
  kind, onClose, stats, monthLabel,
}: {
  kind: null | "all" | "excellent" | "needs" | "absent" | "late";
  onClose: () => void;
  stats: TeacherStats[];
  monthLabel: string;
}) {
  const meta = useMemo(() => {
    if (!kind) return null;
    if (kind === "all") return { title: "قائمة المعلمين", subtitle: "جميع المعلمين في الكشف الشهري", color: "primary" };
    if (kind === "excellent") return { title: "المعلمون الممتازون", subtitle: "أصحاب الانضباط الكامل في الحضور", color: "success" };
    if (kind === "needs") return { title: "معلمون يحتاجون متابعة", subtitle: "بحاجة إلى تنبيه أو متابعة إدارية", color: "warning" };
    if (kind === "absent") return { title: "تفاصيل الغياب الكلي", subtitle: "ترتيب المعلمين حسب أيام الغياب", color: "danger" };
    return { title: "تفاصيل التأخر الكلي", subtitle: "ترتيب المعلمين حسب دقائق التأخر", color: "warning" };
  }, [kind]);

  const rows = useMemo(() => {
    if (!kind) return [] as TeacherStats[];
    let list = [...stats];
    if (kind === "excellent") {
      list = list.filter((s) => calcLevelFrom(s.absentDays, s.openDays, s.lateMin).level === "ممتاز");
    } else if (kind === "needs") {
      list = list.filter((s) => calcLevelFrom(s.absentDays, s.openDays, s.lateMin).level === "يحتاج متابعة");
    } else if (kind === "absent") {
      list = list.filter((s) => s.absentDays > 0).sort((a, b) => b.absentDays - a.absentDays);
    } else if (kind === "late") {
      list = list.filter((s) => s.lateMin > 0).sort((a, b) => b.lateMin - a.lateMin);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    }
    return list;
  }, [kind, stats]);

  const handlePrint = () => {
    if (!meta) return;
    const headerColors: Record<string, string> = {
      primary: "#1e40af", success: "#047857", warning: "#b45309", danger: "#b91c1c",
    };
    const hc = headerColors[meta.color] || "#1f2937";
    const tableRows = rows.map((s, i) => {
      const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
      return `<tr>
        <td>${i + 1}</td>
        <td class="name">${s.name || "—"}</td>
        <td class="mono">${s.id || "—"}</td>
        <td>${s.spec || "—"}</td>
        <td>${s.presentDays}</td>
        <td class="bad">${s.absentDays}</td>
        <td>${minutesToHHMM(s.lateMin)}</td>
        <td>${minutesToHHMM(s.excuseMin)}</td>
        <td><b>${level}</b> · ${score}%</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>${meta.title} - ${monthLabel || ""}</title>
<style>
  *{box-sizing:border-box;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;}
  body{margin:0;padding:24px;color:#111827;background:#fff;}
  .head{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${hc};padding-bottom:10px;margin-bottom:14px;}
  .head h1{margin:0;font-size:20px;color:${hc};}
  .head .sub{font-size:12px;color:#6b7280;margin-top:4px;}
  .badge{background:${hc};color:#fff;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{background:${hc};color:#fff;padding:8px 6px;text-align:center;font-weight:700;border:1px solid ${hc};}
  td{padding:7px 6px;border:1px solid #e5e7eb;text-align:center;}
  tr:nth-child(even) td{background:#f9fafb;}
  td.name{text-align:right;font-weight:700;}
  td.mono{font-family:monospace;font-size:11px;color:#374151;}
  td.bad{color:#b91c1c;font-weight:700;}
  .empty{text-align:center;padding:24px;color:#6b7280;}
  .foot{margin-top:16px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px dashed #d1d5db;padding-top:8px;}
  @media print{ body{padding:10mm;} .no-print{display:none;} }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>${meta.title}</h1>
      <div class="sub">${meta.subtitle}${monthLabel ? " · " + monthLabel : ""}</div>
    </div>
    <div class="badge">${rows.length} معلم</div>
  </div>
  ${rows.length ? `<table>
    <thead><tr>
      <th>م</th><th>الاسم</th><th>الهوية</th><th>التخصص</th>
      <th>أيام التواجد</th><th>الغياب</th><th>التأخر</th><th>الاستئذان</th><th>التقييم</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>` : `<div class="empty">لا توجد بيانات لعرضها.</div>`}
  <div class="foot">طُبع من نظام شؤون المعلمين — ${new Date().toLocaleString("ar-SA")}</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("تعذّر فتح نافذة الطباعة"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 350);
  };

  const toneClasses: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary border-primary/30",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 border-emerald-300",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-700 border-amber-300",
    danger: "from-red-500/15 to-red-500/5 text-red-700 border-red-300",
  };

  return (
    <Dialog open={!!kind} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col p-0" dir="rtl">
        {meta && (
          <>
            <DialogHeader className={`p-5 bg-gradient-to-bl ${toneClasses[meta.color]} border-b`}>
              <DialogTitle className="text-xl font-extrabold text-right">{meta.title}</DialogTitle>
              <DialogDescription className="text-right text-xs opacity-80">
                {meta.subtitle}{monthLabel ? ` · ${monthLabel}` : ""} · {rows.length} معلم
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-3 pt-2 flex items-center gap-2 border-b bg-muted/20">
              <Button size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="w-4 h-4" /> طباعة الجدول
              </Button>
              <Badge variant="outline" className="text-[11px]">إجمالي: {rows.length}</Badge>
            </div>
            <div className="overflow-auto flex-1">
              {rows.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">لا توجد بيانات لعرضها لهذا المؤشر.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0 z-10">
                    <tr className="border-b">
                      <th className="p-2 text-center font-bold w-10">م</th>
                      <th className="p-2 text-right font-bold">الاسم</th>
                      <th className="p-2 text-center font-bold">الهوية</th>
                      <th className="p-2 text-right font-bold">التخصص</th>
                      <th className="p-2 text-center font-bold">أيام التواجد</th>
                      <th className="p-2 text-center font-bold text-destructive">الغياب</th>
                      <th className="p-2 text-center font-bold text-amber-700">التأخر</th>
                      <th className="p-2 text-center font-bold text-blue-700">الاستئذان</th>
                      <th className="p-2 text-center font-bold">التقييم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => {
                      const { level, score } = calcLevelFrom(s.absentDays, s.openDays, s.lateMin);
                      return (
                        <tr key={(s.id || s.name) + i} className="border-b hover:bg-muted/30">
                          <td className="p-2 text-center font-mono text-xs">{i + 1}</td>
                          <td className="p-2 font-bold text-foreground">{s.name}</td>
                          <td className="p-2 text-center font-mono text-xs">{s.id || "—"}</td>
                          <td className="p-2 text-xs text-muted-foreground">{s.spec || "—"}</td>
                          <td className="p-2 text-center">{s.presentDays}</td>
                          <td className="p-2 text-center text-destructive font-bold">{s.absentDays}</td>
                          <td className="p-2 text-center font-mono">{minutesToHHMM(s.lateMin)}</td>
                          <td className="p-2 text-center font-mono">{minutesToHHMM(s.excuseMin)}</td>
                          <td className="p-2 text-center">
                            <Badge variant="outline" className={LEVEL_STYLES[level as Level] || ""}>{level} · {score}%</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
