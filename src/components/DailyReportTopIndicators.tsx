import { useMemo, useState, useEffect, useCallback } from "react";
import { StudentAction } from "@/types/school";
import { isDistanceLearning } from "@/utils/distanceLearning";
import { GRADE_CODE_MAP, formatGradeSection, formatGradeSectionShort } from "@/utils/gradeNames";
import { supabase } from "@/integrations/supabase/client";
import { getStudentsFromDB, loadStudents } from "@/store/studentsStore";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, XCircle, Clock, NotebookPen, Trophy, Crown, Printer, Award, Medal,
  CalendarRange, CalendarDays, Calendar as CalendarIcon, Sparkles, Loader2,
  TrendingUp, TrendingDown, Users, FileText, X, CheckCircle2, AlertOctagon, Lightbulb, BarChart3
} from "lucide-react";

type Variant = "violation" | "absent" | "late" | "classnote";

interface RankedStudent {
  studentId: string;
  name: string;
  grade: string;
  section: number;
  count: number;
}

interface IndicatorConfig {
  key: Variant;
  title: string;
  icon: any;
  tone: string; // tailwind classes
  border: string;
  text: string;
  bg: string;
  filter: (a: StudentAction) => boolean;
}

const CLASSROOM_TYPES = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];

const CONFIGS: IndicatorConfig[] = [
  {
    key: "violation",
    title: "أكثر المخالفات",
    icon: AlertTriangle,
    tone: "from-secondary/15 to-secondary/5",
    border: "border-secondary/30",
    text: "text-secondary",
    bg: "bg-secondary/10",
    filter: (a) => a.type === "violation",
  },
  {
    key: "absent",
    title: "أعلى حالات الغياب",
    icon: XCircle,
    tone: "from-destructive/15 to-destructive/5",
    border: "border-destructive/30",
    text: "text-destructive",
    bg: "bg-destructive/10",
    filter: (a) => a.type === "absent",
  },
  {
    key: "late",
    title: "أعلى حالات التأخر",
    icon: Clock,
    tone: "from-warning/15 to-warning/5",
    border: "border-warning/30",
    text: "text-warning",
    bg: "bg-warning/10",
    filter: (a) => a.type === "late",
  },
  {
    key: "classnote",
    title: "أكثر الملاحظات الصفية",
    icon: NotebookPen,
    tone: "from-primary/15 to-primary/5",
    border: "border-primary/30",
    text: "text-primary",
    bg: "bg-primary/10",
    filter: (a) => CLASSROOM_TYPES.includes(a.type),
  },
];

const rankStudents = (actions: StudentAction[], filter: (a: StudentAction) => boolean): RankedStudent[] => {
  const map: Record<string, RankedStudent> = {};
  for (const a of actions) {
    // استبعاد طلاب التعليم الإلكتروني (انتساب) من الترتيب
    if (isDistanceLearning(a.grade, a.section)) continue;
    if (!filter(a)) continue;
    const k = a.studentId;
    if (!map[k]) {
      map[k] = { studentId: k, name: a.studentName, grade: a.grade, section: a.section, count: 0 };
    }
    map[k].count++;
  }
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
};

export const DailyReportTopIndicators = ({ actions }: { actions: StudentAction[] }) => {
  const ranked = useMemo(() => {
    const out: Record<Variant, RankedStudent[]> = { violation: [], absent: [], late: [], classnote: [] };
    for (const cfg of CONFIGS) {
      out[cfg.key] = rankStudents(actions, cfg.filter);
    }
    return out;
  }, [actions]);

  return (
    <div>
      <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
        <Trophy size={18} className="text-primary" />
        المؤشرات الأكثر تكراراً
        <span className="text-[11px] font-normal text-muted-foreground">— مرتبطة لحظياً بقاعدة البيانات</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CONFIGS.map((cfg) => {
          const list = ranked[cfg.key];
          const Icon = cfg.icon;
          const total = list.reduce((s, r) => s + r.count, 0);
          return (
            <div
              key={cfg.key}
              className={`relative overflow-hidden rounded-2xl border ${cfg.border} bg-gradient-to-bl ${cfg.tone} p-4 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center ${cfg.text}`}>
                  <Icon size={18} />
                </div>
                <span className={`text-[10px] font-bold ${cfg.text} bg-background/70 backdrop-blur-sm rounded-full px-2 py-0.5 border ${cfg.border}`}>
                  {total} حالة
                </span>
              </div>
              <h3 className={`text-sm font-extrabold ${cfg.text} mb-2.5`}>{cfg.title}</h3>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-3 text-center">لا توجد بيانات</p>
              ) : (
                <ol className="space-y-1.5">
                  {list.map((r, i) => (
                    <li key={r.studentId} className="flex items-center justify-between gap-2 text-xs bg-background/50 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-border/40">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${i === 0 ? `${cfg.text} ${cfg.bg}` : "text-muted-foreground bg-muted"}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate leading-tight">{r.name}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{formatGradeSectionShort(r.grade, r.section)}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-[10px] font-extrabold ${cfg.text} tabular-nums`}>{r.count}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =========================================================
// Outstanding Class — smart nomination + printable certificate
// =========================================================

interface ClassScore {
  grade: string;
  section: number;
  classSize: number;
  totalActions: number;
  violations: number;
  absences: number;
  lates: number;
  classNotes: number;
  positives: number;
  negativeTotal: number;
  previousScore: number | null;
  improvement: number;
  dataPoints: number;
  sufficientData: boolean;
  nominationReason: string;
  score: number; // أعلى = أفضل
}

interface OutstandingClassProps {
  actions: StudentAction[];
  positiveStudentsByClass?: Record<string, number>; // مفتاح "grade-section"
  hijriDate: string;
  schoolName?: string;
  principalName?: string;
  viceName?: string;
}

const buildClassScores = (
  actions: StudentAction[],
  positives: Record<string, number>,
  classSizes: Record<string, number> = {},
  previousScores: Record<string, number> = {}
): ClassScore[] => {
  const map: Record<string, ClassScore> = {};

  const ensureClass = (grade: string, section: number) => {
    const key = `${grade}-${section}`;
    if (!map[key]) {
      map[key] = {
        grade: normalizeGradeCode(grade),
        section,
        classSize: classSizes[key] || 0,
        totalActions: 0,
        violations: 0,
        absences: 0,
        lates: 0,
        classNotes: 0,
        positives: positives[key] || 0,
        negativeTotal: 0,
        previousScore: previousScores[key] ?? null,
        improvement: 0,
        dataPoints: 0,
        sufficientData: false,
        nominationReason: "",
        score: 0,
      };
    }
    return map[key];
  };

  for (const key of Object.keys(classSizes)) {
    const [grade, sectionStr] = key.split("-");
    const section = Number(sectionStr);
    if (!isDistanceLearning(grade, section)) ensureClass(grade, section);
  }

  for (const a of actions) {
    if (isDistanceLearning(a.grade, a.section)) continue; // استثناء شعب الانتساب
    const normalizedKey = buildClassKey(a.grade, a.section);
    if (!normalizedKey) continue;
    const [gradeCode, sectionStr] = normalizedKey.split("-");
    const c = ensureClass(gradeCode, Number(sectionStr));
    c.totalActions++;
    if (a.type === "violation") c.violations++;
    else if (a.type === "absent") c.absences++;
    else if (a.type === "late") c.lates++;
    else if (CLASSROOM_TYPES.includes(a.type)) c.classNotes++;
  }

  // أضف فصول لها سلوك إيجابي ولكن بلا إجراءات سلبية مسجلة
  for (const key of Object.keys(positives)) {
    if (!map[key]) {
      const [grade, sectionStr] = key.split("-");
      const section = Number(sectionStr);
      if (isDistanceLearning(grade, section)) continue;
      ensureClass(grade, section);
    }
  }

  // معادلة التقييم: الأقل في المؤشرات السلبية + السلوك الإيجابي الفعلي + التحسن مقارنة بالفترة السابقة.
  for (const c of Object.values(map)) {
    const size = Math.max(c.classSize, 1);
    c.negativeTotal = c.violations + c.absences + c.lates + c.classNotes;
    const positiveRate = c.positives / size;
    const penalty =
      (c.violations / size) * 35 +
      (c.absences / size) * 25 +
      (c.classNotes / size) * 20 +
      (c.lates / size) * 15;
    const currentBase = 100 - penalty + positiveRate * 20;
    const normalizedKey = buildClassKey(c.grade, c.section);
    c.previousScore = previousScores[normalizedKey] ?? null;
    c.improvement = c.previousScore === null ? 0 : currentBase - c.previousScore;
    c.dataPoints = c.totalActions;
    c.sufficientData = c.classSize > 0;
    c.score = currentBase + Math.max(-12, Math.min(12, c.improvement));
    const bestZero = [
      c.violations === 0 ? "خلو المخالفات" : "",
      c.absences === 0 ? "خلو الغياب" : "",
      c.lates === 0 ? "قلة التأخر" : "",
      c.classNotes === 0 ? "خلو الملاحظات الصفية" : "",
      c.improvement > 0 ? `تحسن عام بمقدار ${Math.round(c.improvement)} نقطة` : "",
    ].filter(Boolean);
    c.nominationReason = bestZero.slice(0, 3).join("، ") || `أقل إجمالي سلبيات (${c.negativeTotal}) وفق البيانات المسجلة`;
  }

  return Object.values(map).sort(
    (a, b) =>
      b.score - a.score ||
      a.violations - b.violations ||
      a.lates - b.lates ||
      a.absences - b.absences ||
      a.classNotes - b.classNotes ||
      b.improvement - a.improvement ||
      String(a.grade).localeCompare(String(b.grade), "ar") ||
      a.section - b.section
  );
};

type Rank = 1 | 2 | 3;

interface RankTheme {
  title: string;
  subtitle: string;
  ribbon: string; // gradient
  accent: string; // hex
  accentSoft: string;
  medalLabel: string;
  medalIcon: string; // emoji
  pedagogical: string;
}

const certificateReason = (classInfo: ClassScore) =>
  classInfo.sufficientData
    ? `نظير تميز الشعبة في ${classInfo.nominationReason}، وبمؤشر تميز بلغ ${Math.round(classInfo.score)} نقطة وفق البيانات الفعلية المسجلة في النظام.`
    : "تظهر هذه الشهادة بعد اكتمال بيانات الترشيح للفترة المحددة.";

const RANK_THEMES: Record<Rank, RankTheme> = {
  1: {
    title: "شهادة الفصل المتميز",
    subtitle: "المركز الأول على مستوى المدرسة",
    ribbon: "linear-gradient(135deg, #b8860b 0%, #f4c542 50%, #b8860b 100%)",
    accent: "#b8860b",
    accentSoft: "rgba(184,134,11,0.10)",
    medalLabel: "المركز الأول",
    medalIcon: "🥇",
    pedagogical:
      "تتقدم إدارة المدرسة بأسمى آيات الفخر والتقدير لطلاب هذا الفصل، الذين جسّدوا أرقى صور <strong>الانضباط والالتزام</strong>، وكانوا أنموذجاً مشرّفاً في <strong>السلوك الإيجابي</strong> و<strong>المواظبة الصحيحة</strong>، فاستحقوا بجدارةٍ صدارة المراكز على مستوى المدرسة. نسأل الله لهم دوام التوفيق، وأن يكونوا منارةً يُقتدى بها في الجد والاجتهاد، وعنواناً للنجاح والتميز.",
  },
  2: {
    title: "شهادة المركز الثاني",
    subtitle: "تقديراً للتميز والمنافسة الشريفة",
    ribbon: "linear-gradient(135deg, #6b7280 0%, #cbd5e1 50%, #6b7280 100%)",
    accent: "#475569",
    accentSoft: "rgba(71,85,105,0.10)",
    medalLabel: "المركز الثاني",
    medalIcon: "🥈",
    pedagogical:
      "تُعرب إدارة المدرسة عن خالص اعتزازها بطلاب هذا الفصل لما حققوه من <strong>تميز لافت</strong> ومنافسة شريفة، تجلّت في <strong>التزامهم</strong> و<strong>سلوكهم الإيجابي</strong>. إن حصولكم على المركز الثاني هو شهادة جدارة وحافزٌ قوي لمواصلة الصعود نحو الصدارة. سدّد الله خطاكم، وزادكم همّةً وعزماً.",
  },
  3: {
    title: "شهادة المركز الثالث",
    subtitle: "إشادةً بالاجتهاد والمثابرة",
    ribbon: "linear-gradient(135deg, #92400e 0%, #d97706 50%, #92400e 100%)",
    accent: "#92400e",
    accentSoft: "rgba(146,64,14,0.10)",
    medalLabel: "المركز الثالث",
    medalIcon: "🥉",
    pedagogical:
      "تتشرف إدارة المدرسة بتكريم طلاب هذا الفصل تقديراً لما أبدوه من <strong>اجتهاد ومثابرة</strong>، والتزامٍ صادقٍ بقيم المدرسة وسلوكياتها الراقية. إن حصولكم على المركز الثالث ثمرة جهدٍ يستحق الإشادة، ودافعٌ لمزيد من العطاء والتقدّم. وفّقكم الله، وجعل خطواتكم القادمة أعلى وأرفع.",
  },
};

const buildCertificateHtml = (
  classInfo: ClassScore,
  rank: Rank,
  hijriDate: string,
  schoolName: string,
  principalName: string,
  viceName: string
): string => {
  const t = RANK_THEMES[rank];
  const gradeFull = formatGradeSectionShort(classInfo.grade, classInfo.section);
  const today = new Date().toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${t.title} — ${gradeFull}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;600;700&family=Cairo:wght@400;600;700;800;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4 landscape; margin: 0; }
    html, body { background: #f1f5f9; }
    body { font-family: 'Cairo', sans-serif; color: #0f172a; }

    .cert {
      width: 297mm; height: 210mm; padding: 14mm 18mm 18mm; position: relative; overflow: hidden;
      background:
        radial-gradient(circle at 12% 14%, ${t.accentSoft}, transparent 38%),
        radial-gradient(circle at 88% 86%, ${t.accentSoft}, transparent 42%),
        linear-gradient(180deg, #ffffff 0%, #fbfaf6 100%);
      margin: 0 auto;
    }

    /* Decorative borders — three nested frames, no seal */
    .frame-outer { position: absolute; inset: 6mm; border: 2.5px solid ${t.accent}; border-radius: 6mm; pointer-events: none; }
    .frame-mid   { position: absolute; inset: 9mm; border: 1px solid ${t.accent}; opacity: 0.55; border-radius: 5mm; pointer-events: none; }
    .frame-inner { position: absolute; inset: 11mm; border: 1px dashed ${t.accent}; opacity: 0.35; border-radius: 4mm; pointer-events: none; }

    /* Corner ornaments (geometric) */
    .corner { position: absolute; width: 24mm; height: 24mm; pointer-events: none; }
    .corner svg { width: 100%; height: 100%; display: block; }
    .c-tl { top: 9mm; right: 9mm; }
    .c-tr { top: 9mm; left: 9mm; transform: scaleX(-1); }
    .c-bl { bottom: 9mm; right: 9mm; transform: scaleY(-1); }
    .c-br { bottom: 9mm; left: 9mm; transform: scale(-1, -1); }

    /* Header */
    header { text-align: center; margin-top: 4mm; position: relative; z-index: 2; }
    header .moe { font-family: 'Reem Kufi', sans-serif; font-size: 10.5pt; font-weight: 600; color: #334155; line-height: 1.55; }
    header .school {
      font-family: 'Reem Kufi', sans-serif; font-size: 13pt; font-weight: 700;
      color: ${t.accent}; margin-top: 2mm; letter-spacing: 0.3mm;
    }
    .divider { display: flex; align-items: center; justify-content: center; gap: 4mm; margin-top: 4mm; }
    .divider .line { height: 1px; width: 60mm; background: linear-gradient(90deg, transparent, ${t.accent}, transparent); }
    .divider .dot { width: 2.4mm; height: 2.4mm; background: ${t.accent}; transform: rotate(45deg); }

    /* Title ribbon */
    .ribbon-wrap { text-align: center; margin-top: 7mm; position: relative; z-index: 2; }
    .medal {
      display: inline-block; font-size: 26pt; line-height: 1;
      filter: drop-shadow(0 2mm 3mm rgba(0,0,0,0.18));
      margin-bottom: 2mm;
    }
    .ribbon {
      display: inline-block; padding: 5.5mm 18mm; position: relative;
      background: ${t.ribbon}; color: #ffffff;
      box-shadow: 0 3mm 6mm rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.25);
    }
    .ribbon::before, .ribbon::after {
      content: ""; position: absolute; top: 0; bottom: 0; width: 8mm;
      background: ${t.ribbon};
    }
    .ribbon::before { right: -4mm; clip-path: polygon(0 0, 100% 50%, 0 100%); }
    .ribbon::after  { left: -4mm;  clip-path: polygon(100% 0, 0 50%, 100% 100%); }
    .ribbon h1 { font-family: 'Amiri', serif; font-size: 30pt; font-weight: 700; letter-spacing: 1mm; }
    .subtitle {
      margin-top: 4mm; font-family: 'Reem Kufi', sans-serif; font-size: 11pt; font-weight: 600;
      color: ${t.accent}; letter-spacing: 0.6mm;
    }

    /* Body */
    .body { text-align: center; margin-top: 8mm; padding: 0 12mm; position: relative; z-index: 2; }
    .intro { font-size: 12.5pt; color: #475569; font-weight: 600; }
    .class-block {
      display: inline-block; margin: 6mm auto 5mm;
      padding: 4mm 14mm; position: relative;
    }
    .class-block::before, .class-block::after {
      content: ""; position: absolute; top: 50%; width: 14mm; height: 1px;
      background: ${t.accent}; opacity: 0.6;
    }
    .class-block::before { right: -2mm; }
    .class-block::after  { left:  -2mm; }
    .class-name {
      font-family: 'Amiri', serif; font-size: 28pt; font-weight: 700;
      color: ${t.accent}; letter-spacing: 1mm;
    }
    .reason {
      font-size: 11.5pt; color: #334155; max-width: 215mm; margin: 0 auto;
      line-height: 2.1; font-weight: 500;
    }
    .reason strong { color: ${t.accent}; font-weight: 800; }

    /* Stats */
    .stats-row { display: flex; justify-content: center; gap: 5mm; margin-top: 7mm; flex-wrap: nowrap; }
    .stat-pill {
      background: #ffffff; border: 1px solid ${t.accent}; border-radius: 3mm;
      padding: 2.5mm 5mm; min-width: 28mm; text-align: center;
      box-shadow: 0 1mm 2mm rgba(0,0,0,0.05);
    }
    .stat-pill .num { font-family: 'Cairo', sans-serif; font-size: 14pt; font-weight: 900; color: ${t.accent}; line-height: 1.2; }
    .stat-pill .lbl { font-family: 'Reem Kufi', sans-serif; font-size: 8.5pt; color: #64748b; margin-top: 0.5mm; font-weight: 600; }

    /* Footer signatures */
    footer {
      position: absolute; bottom: 16mm; left: 24mm; right: 24mm;
      display: flex; justify-content: space-between; align-items: flex-end; z-index: 2;
    }
    .sig { text-align: center; min-width: 70mm; }
    .sig .role {
      font-family: 'Reem Kufi', sans-serif; font-size: 10pt; font-weight: 600;
      color: #64748b; margin-bottom: 12mm;
    }
    .sig .name {
      font-family: 'Reem Kufi', sans-serif; font-size: 11pt; font-weight: 700;
      color: ${t.accent}; border-top: 1.5px solid ${t.accent}; padding-top: 2mm;
    }

    /* Meta info */
    .meta {
      position: absolute; top: 11mm; left: 22mm; font-size: 8.5pt; color: #64748b;
      font-family: 'Reem Kufi', sans-serif; font-weight: 500; z-index: 2;
    }
    .meta-rank {
      position: absolute; top: 11mm; right: 22mm;
      background: ${t.accent}; color: #fff; padding: 1.5mm 5mm; border-radius: 2mm;
      font-family: 'Reem Kufi', sans-serif; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.4mm;
      z-index: 2;
    }

    @media print {
      html, body { background: #fff; }
      .cert { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="cert">
    <div class="frame-outer"></div>
    <div class="frame-mid"></div>
    <div class="frame-inner"></div>

    <div class="corner c-tl"><svg viewBox="0 0 100 100" fill="none">
      <path d="M10 10 L 90 10 M10 10 L 10 90" stroke="${t.accent}" stroke-width="2"/>
      <circle cx="10" cy="10" r="4" fill="${t.accent}"/>
      <path d="M20 20 Q 40 20 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
      <path d="M20 20 Q 20 40 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
    </svg></div>
    <div class="corner c-tr"><svg viewBox="0 0 100 100" fill="none">
      <path d="M10 10 L 90 10 M10 10 L 10 90" stroke="${t.accent}" stroke-width="2"/>
      <circle cx="10" cy="10" r="4" fill="${t.accent}"/>
      <path d="M20 20 Q 40 20 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
      <path d="M20 20 Q 20 40 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
    </svg></div>
    <div class="corner c-bl"><svg viewBox="0 0 100 100" fill="none">
      <path d="M10 10 L 90 10 M10 10 L 10 90" stroke="${t.accent}" stroke-width="2"/>
      <circle cx="10" cy="10" r="4" fill="${t.accent}"/>
      <path d="M20 20 Q 40 20 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
      <path d="M20 20 Q 20 40 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
    </svg></div>
    <div class="corner c-br"><svg viewBox="0 0 100 100" fill="none">
      <path d="M10 10 L 90 10 M10 10 L 10 90" stroke="${t.accent}" stroke-width="2"/>
      <circle cx="10" cy="10" r="4" fill="${t.accent}"/>
      <path d="M20 20 Q 40 20 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
      <path d="M20 20 Q 20 40 40 40" stroke="${t.accent}" stroke-width="1.5" opacity="0.6"/>
    </svg></div>

    <div class="meta">${hijriDate} — ${today}</div>
    <div class="meta-rank">${t.medalLabel}</div>

    <header>
      <div class="moe">المملكة العربية السعودية &nbsp;•&nbsp; وزارة التعليم</div>
      <div class="moe">الإدارة العامة للتعليم بالمنطقة الشرقية</div>
      <div class="school">${schoolName}</div>
      <div class="divider"><span class="line"></span><span class="dot"></span><span class="line"></span></div>
    </header>

    <div class="ribbon-wrap">
      <div class="medal">${t.medalIcon}</div>
      <div class="ribbon"><h1>${t.title}</h1></div>
      <div class="subtitle">${t.subtitle}</div>
    </div>

    <div class="body">
      <p class="intro">يسرّ إدارة المدرسة أن تمنح هذه الشهادة إلى فصل</p>
      <div class="class-block"><span class="class-name">${gradeFull}</span></div>
      <p class="reason"><strong>${certificateReason(classInfo)}</strong><br>${t.pedagogical}</p>

      <div class="stats-row">
        <div class="stat-pill"><div class="num">${classInfo.negativeTotal}</div><div class="lbl">إجمالي السلبيات</div></div>
        <div class="stat-pill"><div class="num">${classInfo.violations}</div><div class="lbl">مخالفات</div></div>
        <div class="stat-pill"><div class="num">${classInfo.absences}</div><div class="lbl">غياب</div></div>
        <div class="stat-pill"><div class="num">${classInfo.lates}</div><div class="lbl">تأخر</div></div>
        <div class="stat-pill"><div class="num">${Math.round(classInfo.improvement)}</div><div class="lbl">تحسن عام</div></div>
      </div>
    </div>

    <footer>
      <div class="sig"><div class="role">وكيل شؤون الطلاب</div><div class="name">${viceName}</div></div>
      <div class="sig"><div class="role">مدير المدرسة</div><div class="name">${principalName}</div></div>
    </footer>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); }<\/script>
</body>
</html>`;
};

const printCertificate = (
  classInfo: ClassScore,
  rank: Rank,
  hijriDate: string,
  schoolName: string,
  principalName: string,
  viceName: string
) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildCertificateHtml(classInfo, rank, hijriDate, schoolName, principalName, viceName));
  w.document.close();
};

export const OutstandingClassCard = ({
  actions,
  positiveStudentsByClass = {},
  hijriDate,
  schoolName = "ثانوية اليعقوبي بالخبر — مسارات",
  principalName = "فهد حامد الزهراني",
  viceName = "عدنان علي الزريق",
}: OutstandingClassProps) => {
  const scores = useMemo(
    () => buildClassScores(actions, positiveStudentsByClass),
    [actions, positiveStudentsByClass]
  );

  const top = scores[0];
  const runners = scores.slice(1, 4);

  if (!top) {
    return (
      <div className="bg-card rounded-2xl border border-border/50 p-6 text-center">
        <Crown size={28} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">سيظهر الفصل المتميز فور تسجيل بيانات كافية في النظام.</p>
      </div>
    );
  }

  const handlePrint = (cls: ClassScore, rank: Rank) => {
    printCertificate(cls, rank, hijriDate, schoolName, principalName, viceName);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-bl from-primary/15 via-primary/5 to-transparent p-5 shadow-md">
      <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-40 h-40 rounded-full bg-warning/10 blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-bl from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-lg ring-2 ring-primary/20">
              <Crown size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-foreground leading-tight">الفصل المتميز اليوم</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">ترشيح ذكي بناءً على الانضباط والسلوك الإيجابي</p>
            </div>
          </div>
          <button
            onClick={() => handlePrint(top, 1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-xs font-bold shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <Trophy size={14} />
            طباعة شهادة التميز
          </button>
        </div>

        <div className="bg-background/80 backdrop-blur-sm rounded-xl border border-primary/30 p-4 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] text-muted-foreground font-bold mb-1">الترشيح الأول</p>
              <p className="text-xl sm:text-2xl font-black text-primary">
                {formatGradeSectionShort(top.grade, top.section)}
              </p>
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground font-bold">مؤشر التميز</p>
              <p className="text-2xl font-black text-success tabular-nums">{Math.max(0, Math.round(top.score))}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <Stat label="إيجابي" value={top.positives} tone="success" />
            <Stat label="مخالفات" value={top.violations} tone="warn" invert />
            <Stat label="غياب" value={top.absences} tone="danger" invert />
            <Stat label="تأخر" value={top.lates} tone="warn" invert />
          </div>
        </div>

        {runners.length > 0 && (
          <div className="bg-background/60 backdrop-blur-sm rounded-xl border border-border/40 p-3">
            <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Award size={12} className="text-primary" />
              المراكز التالية — جاهزة للطباعة
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {runners.slice(0, 2).map((c, i) => {
                const rank = (i + 2) as Rank;
                const palette = rank === 2
                  ? "bg-muted/40 border-muted-foreground/30 text-muted-foreground"
                  : "bg-warning/10 border-warning/30 text-warning";
                const labelText = rank === 2 ? "المركز الثاني 🥈" : "المركز الثالث 🥉";
                return (
                  <div key={`${c.grade}-${c.section}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${palette}`}>
                    <Medal size={16} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold opacity-80">{labelText}</p>
                      <p className="text-xs font-extrabold text-foreground truncate">{formatGradeSectionShort(c.grade, c.section)}</p>
                      <p className="text-[9px] text-muted-foreground">مؤشر: {Math.max(0, Math.round(c.score))}</p>
                    </div>
                    <button
                      onClick={() => handlePrint(c, rank)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-background border border-border px-2 py-1 text-[10px] font-bold text-foreground hover:bg-accent transition-colors"
                      title={`طباعة شهادة ${labelText}`}
                    >
                      <Printer size={11} />
                      طباعة
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone, invert = false }: { label: string; value: number; tone: "success" | "warn" | "danger"; invert?: boolean }) => {
  const palette = tone === "success"
    ? "text-success bg-success/10"
    : tone === "danger"
    ? "text-destructive bg-destructive/10"
    : "text-warning bg-warning/10";
  // إن كانت "سلبية" والقيمة 0 نعرضها بالأخضر تشجيعاً
  const finalPalette = invert && value === 0 ? "text-success bg-success/10" : palette;
  return (
    <div className={`text-center rounded-lg ${finalPalette} py-1.5 border border-border/30`}>
      <p className="text-base font-extrabold tabular-nums leading-none">{value}</p>
      <p className="text-[9px] font-bold opacity-90 mt-0.5">{label}</p>
    </div>
  );
};

// =========================================================
// OutstandingClassesSection — Term / Month / Week leaderboard
// connected directly to Supabase (positive behavior page)
// =========================================================

type Period = "term" | "month" | "week";

const TERM_START = "2026-01-18"; // الفصل الدراسي الثاني 1447/1448هـ
const TERM_END = "2026-06-25";

const NEGATIVE_TYPES = ["absent", "late", "violation", "class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];

type OfficialClassRef = {
  gradeCode: string;
  section: number;
};

const normalizeGradeCode = (gradeOrCode: string | undefined | null): string => {
  const value = String(gradeOrCode || "").trim();
  if (!value) return "";
  if (GRADE_CODE_MAP[value]) return value;
  if (value.includes("1314") || value.includes("الأول") || value.includes("أول")) return "1314";
  if (value.includes("1416") || value.includes("الثاني") || value.includes("ثاني")) return "1416";
  if (value.includes("1516") || value.includes("الثالث") || value.includes("ثالث")) return "1516";
  return value;
};

const buildClassKey = (gradeOrCode: string | undefined | null, section: number | string | undefined | null) => {
  const gradeCode = normalizeGradeCode(gradeOrCode);
  const sectionNumber = Number(section);
  if (!gradeCode || !Number.isFinite(sectionNumber)) return "";
  return `${gradeCode}-${sectionNumber}`;
};

const resolveOfficialClass = (
  row: any,
  studentsById: Record<string, OfficialClassRef>,
  studentsByNumber: Record<string, OfficialClassRef>
): OfficialClassRef => {
  const byId = row.student_id ? studentsById[row.student_id] : undefined;
  const byNumber = row.student_number ? studentsByNumber[row.student_number] : undefined;
  if (byId) return byId;
  if (byNumber) return byNumber;
  return {
    gradeCode: normalizeGradeCode(row.grade_code || row.grade),
    section: Number(row.section) || 0,
  };
};

// =========================================================
// Analytics helpers — strengths, weaknesses, top contributors
// =========================================================

interface NegativeContributor {
  studentId: string;
  name: string;
  studentNumber: string;
  guardianPhone: string;
  violations: number;
  absences: number;
  lates: number;
  classNotes: number;
  total: number;
}

interface ClassReport {
  cls: ClassScore;
  rank: number;
  totalClasses: number;
  averageScore: number;
  scoreVsAvg: number; // positive = above avg
  studentsInClass: number;
  positivePct: number;
  strengths: string[];
  weaknesses: string[];
  topNegativeContributors: NegativeContributor[];
  improvementPlan: string[];
  drivers: { label: string; value: number; impact: number; tone: "good" | "bad" }[];
  dataWarning: string | null;
  movementSummary: string;
  recommendations: string[];
}

const buildClassReport = (
  cls: ClassScore,
  allScores: ClassScore[],
  allActions: StudentAction[],
  studentsByClass: Record<string, { id: string; name: string; studentNumber: string; guardianPhone: string }[]>
): ClassReport => {
  const rank = allScores.findIndex(c => c.grade === cls.grade && c.section === cls.section) + 1;
  const totalClasses = allScores.length;
  const averageScore = allScores.length
    ? allScores.reduce((s, c) => s + c.score, 0) / allScores.length
    : 0;
  const studentsInClass = (studentsByClass[`${cls.grade}-${cls.section}`] || []).length;
  const totalNeg = cls.violations + cls.absences + cls.lates + cls.classNotes;

  // per-student aggregation inside class
  const perStudent: Record<string, NegativeContributor> = {};
  for (const a of allActions) {
    if (a.grade !== cls.grade || a.section !== cls.section) continue;
    const isNeg = NEGATIVE_TYPES.includes(a.type);
    if (!isNeg) continue;
    if (!perStudent[a.studentId]) {
      const meta = (studentsByClass[`${cls.grade}-${cls.section}`] || []).find(s => s.id === a.studentId);
      perStudent[a.studentId] = {
        studentId: a.studentId,
        name: a.studentName,
        studentNumber: meta?.studentNumber || a.studentNumber || "",
        guardianPhone: meta?.guardianPhone || "",
        violations: 0, absences: 0, lates: 0, classNotes: 0, total: 0,
      };
    }
    const s = perStudent[a.studentId];
    if (a.type === "violation") s.violations++;
    else if (a.type === "absent") s.absences++;
    else if (a.type === "late") s.lates++;
    else if (CLASSROOM_TYPES.includes(a.type)) s.classNotes++;
    s.total = s.violations + s.absences + s.lates + s.classNotes;
  }
  const topNegativeContributors = Object.values(perStudent)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // drivers (impact components)
  const drivers = [
    { label: "الأقل في المخالفات السلوكية", value: cls.violations, impact: -(cls.violations * 35), tone: "bad" as const },
    { label: "الأقل في الغياب", value: cls.absences, impact: -(cls.absences * 25), tone: "bad" as const },
    { label: "الأقل في الملاحظات الصفية", value: cls.classNotes, impact: -(cls.classNotes * 20), tone: "bad" as const },
    { label: "الأقل في التأخر الصباحي", value: cls.lates, impact: -(cls.lates * 15), tone: "bad" as const },
    { label: "التحسن العام عن الفترة السابقة", value: Math.round(cls.improvement), impact: Math.round(cls.improvement), tone: cls.improvement >= 0 ? "good" as const : "bad" as const },
    { label: "السلوك الإيجابي المسجل", value: cls.positives, impact: Math.round((cls.positives / Math.max(studentsInClass, 1)) * 20), tone: "good" as const },
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // strengths
  const strengths: string[] = [];
  if (cls.positives > 0) strengths.push(`${cls.positives} طالب/طلاب بلا إجراءات سلبية خلال الفترة المحددة`);
  if (cls.violations === 0) strengths.push("خلوّ الشعبة من المخالفات السلوكية خلال الفترة");
  if (cls.absences === 0) strengths.push("التزام كامل بالحضور (لا توجد حالات غياب)");
  if (cls.lates === 0) strengths.push("انضباط في المواعيد دون أي تأخر مسجّل");
  if (cls.classNotes === 0) strengths.push("لا توجد ملاحظات صفية مسجلة على الشعبة");
  if (cls.improvement > 0) strengths.push(`تحسن عام عن الفترة السابقة بمقدار ${Math.round(cls.improvement)} نقطة`);
  if (cls.score > averageScore) strengths.push("مؤشر التميز أعلى من متوسط فصول المدرسة");
  if (strengths.length === 0) strengths.push("لا توجد جوانب قوة بارزة بعد — يلزم تكثيف برامج التعزيز.");

  // weaknesses
  const weaknesses: string[] = [];
  if (cls.violations > 0) weaknesses.push(`تسجيل ${cls.violations} مخالفة سلوكية`);
  if (cls.absences > 0) weaknesses.push(`${cls.absences} حالة غياب تستوجب المتابعة`);
  if (cls.lates > 0) weaknesses.push(`${cls.lates} حالة تأخر عن الحضور`);
  if (cls.classNotes > 0) weaknesses.push(`${cls.classNotes} ملاحظة صفية مرصودة من المعلمين`);
  if (cls.positives === 0) weaknesses.push("لا يوجد أي طالب مدرج في قائمة السلوك الإيجابي بعد");
  if (cls.improvement < 0) weaknesses.push(`تراجع عام عن الفترة السابقة بمقدار ${Math.abs(Math.round(cls.improvement))} نقطة`);
  if (cls.score < averageScore) weaknesses.push(`مؤشر التميز أدنى من متوسط فصول المدرسة بفارق ${Math.round(averageScore - cls.score)} نقطة`);
  if (weaknesses.length === 0) weaknesses.push("لا توجد جوانب ضعف ملحوظة — استمرار التميز وتعزيز السلوك الإيجابي.");

  // improvement plan (pedagogical, actionable)
  const plan: string[] = [];
  if (cls.violations > 0) plan.push("جلسة توجيه جماعية مع الموجه الطلابي لمراجعة لائحة السلوك والمواظبة 1447هـ.");
  if (cls.absences > 0) plan.push("تواصل فوري مع أولياء أمور الطلاب الأكثر غياباً وإشعارهم بالحالة كتابياً.");
  if (cls.lates > 0) plan.push("اعتماد سجل تأخر أسبوعي وتفعيل برنامج تحفيزي للحضور المبكر.");
  if (cls.classNotes > 0) plan.push("اجتماع رائد الفصل مع المعلمين لمناقشة الملاحظات الصفية ووضع خطة ضبط صفي.");
  if (cls.positives < 5) plan.push("ترشيح طلاب جدد لقائمة السلوك الإيجابي وتعزيز نظام النقاط داخل الشعبة.");
  plan.push("متابعة أسبوعية من رائد الفصل، ورفع تقرير تطوّر إلى وكيل شؤون الطلاب.");
  if (rank === 1) plan.push("الحفاظ على المركز الأول عبر برامج تحفيزية مستمرة وشهادات شكر شهرية.");

  const movementSummary = cls.improvement > 0
    ? `تقدمت الشعبة لأن مؤشرها تحسن عن الفترة السابقة بمقدار ${Math.round(cls.improvement)} نقطة مع ${totalNeg} إجراء سلبي فقط.`
    : cls.improvement < 0
    ? `انخفض مستوى الشعبة بسبب تراجع المؤشر عن الفترة السابقة بمقدار ${Math.abs(Math.round(cls.improvement))} نقطة ووجود ${totalNeg} إجراء سلبي.`
    : `حافظت الشعبة على مستوى مستقر؛ ويستند ترتيبها الحالي إلى إجمالي ${totalNeg} إجراء سلبي و${cls.positives} طالب بلا إجراءات سلبية.`;
  const recommendations = [
    totalNeg === 0 ? "تكريم الشعبة علنياً لتعزيز المنافسة الإيجابية." : "تحويل أكثر مؤشر مؤثر إلى هدف أسبوعي معلن داخل الشعبة.",
    cls.positives > studentsInClass / 2 ? "توسيع أثر الطلاب المنضبطين ليكونوا قدوات لزملائهم." : "رفع نسبة الطلاب المنضبطين عبر متابعة قصيرة ومنتظمة مع رائد الفصل.",
    "التركيز على التحفيز والمتابعة التربوية دون وصم أو عقوبة جماعية.",
  ];

  return {
    cls,
    rank,
    totalClasses,
    averageScore,
    scoreVsAvg: cls.score - averageScore,
    studentsInClass,
    positivePct: studentsInClass > 0 ? Math.round((cls.positives / studentsInClass) * 100) : 0,
    strengths,
    weaknesses,
    topNegativeContributors,
    improvementPlan: plan,
    drivers,
    dataWarning: cls.sufficientData ? null : "الترشيح غير مكتمل: لا توجد بيانات كافية مسجلة لهذه الشعبة ضمن الفترة المحددة.",
    movementSummary,
    recommendations,
  };
};

// HTML for printable per-class report (A4)
const buildClassReportHtml = (
  report: ClassReport,
  hijriDate: string,
  rangeLabel: string,
  schoolName: string,
  principalName: string,
  viceName: string
): string => {
  const c = report.cls;
  const gradeFull = formatGradeSection(c.grade, c.section);
  const today = new Date().toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "long", day: "numeric" });
  const contributorsRows = report.topNegativeContributors.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#15803d;padding:8px;font-weight:700">لا يوجد طلاب مؤثرون سلباً — أداء جماعي مميز.</td></tr>`
    : report.topNegativeContributors.map((s, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="text-align:right;font-weight:700">${s.name}</td>
        <td style="text-align:center;color:#b91c1c;font-weight:700">${s.violations}</td>
        <td style="text-align:center;color:#b91c1c;font-weight:700">${s.absences}</td>
        <td style="text-align:center;color:#a16207;font-weight:700">${s.lates + s.classNotes}</td>
      </tr>`).join("");

  const driversRows = report.drivers.map(d => `
    <tr>
      <td style="text-align:right;font-weight:700">${d.label}</td>
      <td style="text-align:center">${d.value}</td>
      <td style="text-align:center;color:${d.impact >= 0 ? "#15803d" : "#b91c1c"};font-weight:700">${d.impact > 0 ? "+" : ""}${d.impact}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الشعبة — ${gradeFull}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Reem+Kufi:wght@500;700&display=swap');
@page { size: A4; margin: 8mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Cairo', sans-serif; color: #0f172a; margin: 0; }
.page { min-height: 281mm; border: 2px solid #1e3a8a; border-radius: 10px; padding: 8px 10px; overflow: hidden; }
.header { text-align:center; border-bottom: 3px double #1e3a8a; padding-bottom: 5px; margin-bottom: 8px; }
.header .moe { font-size: 8.5pt; color:#475569; font-weight: 600; }
.header h1 { font-family:'Reem Kufi'; color:#1e3a8a; font-size: 14pt; margin: 3px 0 1px; }
.header .meta { font-size: 7.8pt; color:#64748b; }
.title-bar { background: linear-gradient(135deg,#1e3a8a,#3b82f6); color:#fff; padding: 7px 10px; border-radius: 8px; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center; }
.title-bar .grade { font-size: 13pt; font-weight: 800; font-family:'Reem Kufi'; }
.title-bar .rank { background: rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.4); border-radius: 999px; padding: 4px 14px; font-size:10pt; font-weight:700; }
.kpis { display:grid; grid-template-columns: repeat(5,1fr); gap: 5px; margin-bottom: 8px; }
.kpi { border:1px solid #e2e8f0; border-radius: 8px; padding: 6px; text-align:center; background:#f8fafc; }
.kpi .num { font-size: 13pt; font-weight: 900; color:#1e3a8a; line-height:1.1; }
.kpi .lbl { font-size: 7.5pt; color:#64748b; margin-top:2px; font-weight:700; }
.cols { display:grid; grid-template-columns: 1fr 1fr; gap: 7px; }
section { margin-bottom: 7px; page-break-inside: avoid; }
section h2 { font-family:'Reem Kufi'; font-size: 9.5pt; color:#1e3a8a; border-right: 4px solid #1e3a8a; padding-right: 6px; margin-bottom: 4px; }
ul, ol { margin: 0; padding-right: 16px; font-size: 8.2pt; line-height: 1.45; }
ul li, ol li { margin-bottom: 1px; }
.good li { color:#166534; }
.bad  li { color:#991b1b; }
.plan li { color:#1e3a8a; }
table { width:100%; border-collapse: collapse; font-size: 7.8pt; }
th { background:#1e3a8a; color:#fff; padding: 3px 5px; font-weight:700; }
td { border:1px solid #e2e8f0; padding: 3px 5px; }
.note { background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; border-radius:8px; padding:6px 8px; font-size:8pt; font-weight:700; margin-bottom:7px; }
.summary { background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:6px 8px; color:#1e3a8a; font-size:8.2pt; font-weight:700; line-height:1.5; margin-bottom:7px; }
.footer-sigs { display:flex; justify-content:space-between; gap:22px; margin-top: 8px; padding-top: 8px; border-top:1px solid #e2e8f0; }
.sig { flex:1; text-align:center; }
.sig .role { font-size:8pt; color:#64748b; font-weight:700; }
.sig .name { font-size:9pt; color:#1e3a8a; font-weight:800; margin-top: 10px; padding-top: 3px; border-top:1px solid #94a3b8; }
</style></head><body>
<main class="page">
<div class="header">
  <div class="moe">المملكة العربية السعودية &nbsp;•&nbsp; وزارة التعليم</div>
  <h1>${schoolName}</h1>
  <div class="meta">${hijriDate} — ${today}</div>
</div>

<div class="title-bar">
  <div>
    <div style="font-size:9pt;opacity:0.85">تقرير تربوي تحليلي للشعبة</div>
    <div class="grade">${gradeFull}</div>
  </div>
  <div style="text-align:left">
    <div class="rank">الترتيب ${report.rank} من ${report.totalClasses}</div>
    <div style="margin-top:6px;font-size:9pt;opacity:0.9">${rangeLabel}</div>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><div class="num">${Math.max(0, Math.round(c.score))}</div><div class="lbl">مؤشر التميز</div></div>
  <div class="kpi"><div class="num">${c.negativeTotal}</div><div class="lbl">إجمالي السلبيات</div></div>
  <div class="kpi"><div class="num">${c.violations + c.absences + c.lates + c.classNotes}</div><div class="lbl">إجراءات سلبية</div></div>
  <div class="kpi"><div class="num">${report.positivePct}%</div><div class="lbl">نسبة الإيجابية</div></div>
  <div class="kpi"><div class="num">${Math.round(c.improvement)}</div><div class="lbl">التحسن العام</div></div>
</div>

${report.dataWarning ? `<div class="note">${report.dataWarning}</div>` : ""}
<div class="summary">${report.movementSummary} سبب الترشيح: ${c.nominationReason}.</div>

<section>
  <h2>تحليل المؤشرات (أسباب التقدم والتراجع)</h2>
  <table>
    <thead><tr><th style="text-align:right">المؤشر</th><th>العدد</th><th>الأثر على المؤشر</th></tr></thead>
    <tbody>${driversRows}</tbody>
  </table>
</section>

<div class="cols"><section><h2>جوانب القوة</h2><ul class="good">${report.strengths.slice(0, 4).map(s => `<li>${s}</li>`).join("")}</ul></section><section><h2>جوانب الضعف</h2><ul class="bad">${report.weaknesses.slice(0, 4).map(s => `<li>${s}</li>`).join("")}</ul></section></div>

<section>
  <h2>الطلاب الأكثر تأثيراً سلباً على مستوى الشعبة</h2>
  <table>
    <thead><tr><th>م</th><th style="text-align:right">اسم الطالب</th><th>مخالفات</th><th>غياب</th><th>تأخر/ملاحظات</th></tr></thead>
    <tbody>${contributorsRows}</tbody>
  </table>
</section>

<section>
  <h2>خطة التحسين المقترحة</h2>
  <ol class="plan">${report.improvementPlan.slice(0, 4).map(s => `<li>${s}</li>`).join("")}</ol>
</section>

<section>
  <h2>توصيات تحفيزية</h2>
  <ul class="good">${report.recommendations.map(s => `<li>${s}</li>`).join("")}</ul>
</section>

<div class="footer-sigs">
  <div class="sig"><div class="role">رائد الفصل</div><div class="name">&nbsp;</div></div>
  <div class="sig"><div class="role">وكيل شؤون الطلاب</div><div class="name">${viceName}</div></div>
  <div class="sig"><div class="role">مدير المدرسة</div><div class="name">${principalName}</div></div>
</div>

</main>
<script>window.onload = () => { setTimeout(() => window.print(), 300); }<\/script>
</body></html>`;
};

const printClassReport = (
  report: ClassReport,
  hijriDate: string,
  rangeLabel: string,
  schoolName: string,
  principalName: string,
  viceName: string
) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildClassReportHtml(report, hijriDate, rangeLabel, schoolName, principalName, viceName));
  w.document.close();
};

const getPeriodRange = (period: Period): { from: string; to: string; label: string; isToDate: boolean } => {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayIso = iso(today);

  if (period === "term") {
    return { from: TERM_START, to: todayIso < TERM_END ? todayIso : TERM_END, label: "الفصل الدراسي الثاني 1447/1448هـ — حتى تاريخه", isToDate: true };
  }
  if (period === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthName = new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(today);
    return { from: iso(first), to: todayIso, label: `شهر ${monthName} — حتى تاريخه`, isToDate: true };
  }
  // week — Sun..Thu (Saudi school week)
  const day = today.getDay(); // 0=Sun
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - day);
  const thursday = new Date(sunday);
  thursday.setDate(sunday.getDate() + 4);
  return { from: iso(sunday), to: todayIso < iso(thursday) ? todayIso : iso(thursday), label: "الأسبوع الحالي — حتى تاريخه", isToDate: true };
};

const getPreviousRange = (range: { from: string; to: string }) => {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from);
  prevTo.setDate(from.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevTo.getDate() - days + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(prevFrom), to: iso(prevTo) };
};

const calculatePreviousScores = (
  actions: StudentAction[],
  classSizes: Record<string, number>
): Record<string, number> => {
  const counts: Record<string, { violations: number; absences: number; lates: number; classNotes: number; negStudents: Set<string> }> = {};
  for (const a of actions) {
    if (isDistanceLearning(a.grade, a.section)) continue;
    const key = buildClassKey(a.grade, a.section);
    if (!key) continue;
    if (!counts[key]) counts[key] = { violations: 0, absences: 0, lates: 0, classNotes: 0, negStudents: new Set<string>() };
    if (!NEGATIVE_TYPES.includes(a.type)) continue;
    counts[key].negStudents.add(a.studentId);
    if (a.type === "violation") counts[key].violations++;
    else if (a.type === "absent") counts[key].absences++;
    else if (a.type === "late") counts[key].lates++;
    else if (CLASSROOM_TYPES.includes(a.type)) counts[key].classNotes++;
  }
  const out: Record<string, number> = {};
  for (const [key, c] of Object.entries(counts)) {
    const size = Math.max(classSizes[key] || 1, 1);
    const positives = Math.max(0, size - c.negStudents.size);
    out[key] = 100 - ((c.violations / size) * 35 + (c.absences / size) * 25 + (c.classNotes / size) * 20 + (c.lates / size) * 15) + (positives / size) * 20;
  }
  return out;
};

interface OutstandingSectionProps {
  hijriDate: string;
  schoolName?: string;
  principalName?: string;
  viceName?: string;
}

export const OutstandingClassesSection = ({
  hijriDate,
  schoolName = "ثانوية اليعقوبي بالخبر — مسارات",
  principalName = "فهد حامد الزهراني",
  viceName = "عدنان علي الزريق",
}: OutstandingSectionProps) => {
  const { profile } = useAuth();
  const canPrintAndSend = !!(profile?.is_principal || (profile?.role_title || "").includes("وكيل"));
  const [period, setPeriod] = useState<Period>("term");
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<StudentAction[]>([]);
  const [positivesByClass, setPositivesByClass] = useState<Record<string, number>>({});
  const [classSizes, setClassSizes] = useState<Record<string, number>>({});
  const [previousScores, setPreviousScores] = useState<Record<string, number>>({});
  const [reportClass, setReportClass] = useState<ClassScore | null>(null);
  const [dataAt, setDataAt] = useState<Date | null>(null);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, { id: string; name: string; studentNumber: string; guardianPhone: string }[]>>({});
  const [coveragePct, setCoveragePct] = useState(0);

  const range = useMemo(() => getPeriodRange(period), [period]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 1) load actions in range (paginate over 1000 limit)
      await loadStudents(true);
      const students = getStudentsFromDB();
      const studentsById: Record<string, OfficialClassRef> = {};
      const studentsByNumber: Record<string, OfficialClassRef> = {};
      const officialClassKeys = new Set<string>();
      for (const s of students) {
        const classKey = buildClassKey(s.gradeCode || s.grade, s.section);
        if (!classKey) continue;
        const [gradeCode, sectionStr] = classKey.split("-");
        const official = { gradeCode, section: Number(sectionStr) };
        studentsById[s.id] = official;
        studentsByNumber[s.studentNumber] = official;
        if (!isDistanceLearning(official.gradeCode, official.section)) officialClassKeys.add(classKey);
      }

      const all: StudentAction[] = [];
      const previousActions: StudentAction[] = [];
      const pageSize = 1000;
      const mapAction = (r: any): StudentAction => ({
        ...(() => {
          const official = resolveOfficialClass(r, studentsById, studentsByNumber);
          return {
            grade: official.gradeCode,
            section: official.section,
          };
        })(),
        id: r.id,
        studentId: r.student_id,
        studentName: r.student_name,
        studentNumber: r.student_number || "",
        type: r.type,
        date: r.date,
        time: "",
        description: "",
        guardianPhone: "",
      } as StudentAction);
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("student_actions")
          .select("id,student_id,student_name,grade,grade_code,section,type,date,student_number")
          .gte("date", range.from)
          .lte("date", range.to)
          .range(from, from + pageSize - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        for (const r of data as any[]) all.push(mapAction(r));
        if (data.length < pageSize) break;
      }
      const prevRange = getPreviousRange(range);
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("student_actions")
          .select("id,student_id,student_name,grade,grade_code,section,type,date,student_number")
          .gte("date", prevRange.from)
          .lte("date", prevRange.to)
          .range(from, from + pageSize - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        for (const r of data as any[]) previousActions.push(mapAction(r));
        if (data.length < pageSize) break;
      }
      setActions(all);

      // 2) compute positives per class:
      // student is positive if NO negative action in range; group by class
      const negByStudent: Record<string, true> = {};
      for (const a of all) {
        if (NEGATIVE_TYPES.includes(a.type)) negByStudent[a.studentId] = true;
      }
      const map: Record<string, number> = {};
      const sizes: Record<string, number> = {};
      const byClass: Record<string, { id: string; name: string; studentNumber: string; guardianPhone: string }[]> = {};
      for (const s of students) {
        if (isDistanceLearning(s.gradeCode || s.grade, s.section)) continue;
        const key = buildClassKey(s.gradeCode || s.grade, s.section);
        if (!key) continue;
        sizes[key] = (sizes[key] || 0) + 1;
        if (!byClass[key]) byClass[key] = [];
        byClass[key].push({ id: s.id, name: s.name, studentNumber: s.studentNumber, guardianPhone: s.guardianPhone });
        if (negByStudent[s.id]) continue;
        map[key] = (map[key] || 0) + 1;
      }
      setPositivesByClass(map);
      setClassSizes(sizes);
      setPreviousScores(calculatePreviousScores(previousActions, sizes));
      setStudentsByClass(byClass);
      const coveredClasses = Object.keys(sizes).length;
      setCoveragePct(officialClassKeys.size > 0 ? Math.round((coveredClasses / officialClassKeys.size) * 100) : 0);
    } finally {
      setLoading(false);
      setDataAt(new Date());
    }
  }, [range.from, range.to]);

  useEffect(() => { refresh(); }, [refresh]);

  // realtime: refresh on any change
  useEffect(() => {
    const ch = supabase
      .channel(`outstanding-${period}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [period, refresh]);

  const scores = useMemo(
    () => buildClassScores(actions, positivesByClass, classSizes, previousScores),
    [actions, positivesByClass, classSizes, previousScores]
  );

  const expectedClasses = 17;
  const uniqueClassCount = new Set(scores.map((c) => buildClassKey(c.grade, c.section)).filter(Boolean)).size;
  const hasIncompleteData = uniqueClassCount < expectedClasses;
  const completeScores = useMemo(
    () => scores.filter((c) => c.sufficientData).slice(0, expectedClasses),
    [scores]
  );
  const topThree = completeScores.slice(0, 3);

  const handlePrint = (cls: ClassScore, rank: Rank) => {
    const periodHijri = `${hijriDate} — ${range.label}`;
    printCertificate(cls, rank, periodHijri, schoolName, principalName, viceName);
  };

  const openReport = (cls: ClassScore) => setReportClass(cls);

  const handlePrintReport = (cls: ClassScore) => {
    const r = buildClassReport(cls, completeScores, actions, studentsByClass);
    printClassReport(r, hijriDate, range.label, schoolName, principalName, viceName);
  };

  const periodTabs: { key: Period; label: string; icon: typeof CalendarRange }[] = [
    { key: "term", label: "الفصل كاملاً", icon: CalendarRange },
    { key: "month", label: "شهري", icon: CalendarIcon },
    { key: "week", label: "أسبوعي", icon: CalendarDays },
  ];

  const rankPalette = (rank: Rank) =>
    rank === 1
      ? { ring: "ring-warning/40", grad: "from-warning/20 via-warning/10 to-transparent", text: "text-warning", border: "border-warning/40", icon: "🥇" }
      : rank === 2
      ? { ring: "ring-muted-foreground/30", grad: "from-muted/40 via-muted/20 to-transparent", text: "text-muted-foreground", border: "border-muted-foreground/30", icon: "🥈" }
      : { ring: "ring-warning/30", grad: "from-warning/15 via-warning/5 to-transparent", text: "text-warning", border: "border-warning/30", icon: "🥉" };

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-sm">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-bl from-warning to-warning/60 text-warning-foreground flex items-center justify-center shadow-lg ring-2 ring-warning/20">
            <Crown size={22} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-foreground leading-tight flex items-center gap-2">
              ترشيح الفصول المتميزة
              <Sparkles size={14} className="text-warning" />
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              ترتيب آلي مرتبط بقاعدة البيانات بناءً على السلوك الإيجابي والانضباط لكل شعبة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5 border border-border/40">
            {range.label} · {range.from} → {range.to}
          </div>
          {dataAt && (
            <div className="text-[10px] text-success bg-success/10 border border-success/30 rounded-lg px-2 py-1 font-bold flex items-center gap-1">
              <CheckCircle2 size={11} /> بيانات محدّثة {dataAt.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </div>

      {/* period tabs */}
      <div className="flex items-center gap-1 mb-4 bg-muted/30 rounded-xl p-1 border border-border/40 w-fit">
        {periodTabs.map((t) => {
          const Icon = t.icon;
          const active = period === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setPeriod(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                active
                  ? "bg-card text-warning shadow-sm border border-warning/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {!loading && hasIncompleteData && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs font-bold text-warning leading-relaxed">
          تم احتساب الترتيب حتى تاريخه اعتمادًا على البيانات المتاحة فعليًا من قاعدة البيانات. الشعب المرصودة: {uniqueClassCount} من أصل {expectedClasses} شعبة، ونسبة الاكتمال التقريبية {coveragePct}%، وعدد السجلات في الفترة {actions.length}. يظهر التنبيه لبيان نقص بعض البيانات دون إيقاف الترشيح.
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-warning" />
          <span className="text-sm text-muted-foreground mr-2">جارٍ احتساب الترشيحات من قاعدة البيانات...</span>
        </div>
      ) : completeScores.length === 0 ? (
        <div className="py-10 text-center">
          <Crown size={28} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">لا توجد بيانات كافية لترشيح الفصول في هذه الفترة.</p>
          <p className="text-xs text-warning font-bold mt-2">الترشيح غير مكتمل بسبب نقص البيانات المسجلة في قاعدة البيانات للفترة المحددة.</p>
        </div>
      ) : (
        <>
          {/* Podium — top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {topThree.map((cls, i) => {
              const rank = (i + 1) as Rank;
              const p = rankPalette(rank);
              return (
                <div
                  key={`${cls.grade}-${cls.section}`}
                  className={`relative overflow-hidden rounded-2xl border-2 ${p.border} bg-gradient-to-bl ${p.grad} p-4 shadow-sm hover:shadow-md transition-all ring-1 ${p.ring} ${rank === 1 ? "md:order-2 md:-translate-y-2" : rank === 2 ? "md:order-1" : "md:order-3"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-3xl leading-none">{p.icon}</div>
                    <span className={`text-[10px] font-extrabold ${p.text} bg-background/70 backdrop-blur-sm rounded-full px-2 py-0.5 border ${p.border}`}>
                      المركز {rank === 1 ? "الأول" : rank === 2 ? "الثاني" : "الثالث"}
                    </span>
                  </div>
                  <p className={`text-lg font-black ${p.text} mb-2 leading-tight`}>
                    {formatGradeSectionShort(cls.grade, cls.section)}
                  </p>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    <Stat label="سلبيات" value={cls.negativeTotal} tone="danger" invert />
                    <Stat label="مخالفات" value={cls.violations} tone="warn" invert />
                    <Stat label="غياب" value={cls.absences} tone="danger" invert />
                    <Stat label="تأخر" value={cls.lates} tone="warn" invert />
                  </div>
                  <div className="bg-background/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-border/40 space-y-1">
                    <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground">مؤشر التميز</span>
                    <span className={`text-base font-black tabular-nums ${p.text}`}>
                      {Math.max(0, Math.round(cls.score))}
                    </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{cls.nominationReason}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {canPrintAndSend && (
                      <button
                        onClick={() => handlePrint(cls, rank)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-card border-2 ${p.border} ${p.text} px-2 py-2 text-[11px] font-extrabold hover:shadow-md hover:-translate-y-0.5 transition-all`}
                      >
                        <Award size={12} />
                        شهادة
                      </button>
                    )}
                    <button
                      onClick={() => openReport(cls)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-card border ${p.border} text-foreground px-2 py-2 text-[11px] font-extrabold hover:shadow-md hover:-translate-y-0.5 transition-all ${canPrintAndSend ? "" : "col-span-2"}`}
                    >
                      <FileText size={12} />
                      تقرير الشعبة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* complete ranking */}
          {completeScores.length > 0 && (
            <div className="bg-muted/20 rounded-xl border border-border/30 p-3">
              <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Award size={12} className="text-warning" />
                الترتيب الكامل — {Math.min(completeScores.length, expectedClasses)} من {expectedClasses} شعبة
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                {completeScores.map((c, i) => (
                  <div key={`${c.grade}-${c.section}`} className="flex items-center justify-between gap-2 bg-background/60 rounded-lg px-2.5 py-1.5 border border-border/30">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-bold text-foreground truncate">
                        {formatGradeSectionShort(c.grade, c.section)}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold text-warning tabular-nums shrink-0">
                      {Math.max(0, Math.round(c.score))}
                    </span>
                    <button
                      onClick={() => openReport(c)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary border border-primary/30 px-2 py-1 text-[10px] font-extrabold hover:bg-primary/20"
                      title="عرض تقرير الشعبة"
                    >
                      <FileText size={10} /> تقرير
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {reportClass && (
        <ClassReportDialog
          report={buildClassReport(reportClass, completeScores, actions, studentsByClass)}
          rangeLabel={range.label}
          hijriDate={hijriDate}
          schoolName={schoolName}
          principalName={principalName}
          viceName={viceName}
          canPrintAndSend={canPrintAndSend}
          onClose={() => setReportClass(null)}
          onPrint={() => handlePrintReport(reportClass)}
        />
      )}
    </div>
  );
};

// =========================================================
// Class report dialog (in-app, before printing)
// =========================================================

interface ClassReportDialogProps {
  report: ClassReport;
  rangeLabel: string;
  hijriDate: string;
  schoolName: string;
  principalName: string;
  viceName: string;
  canPrintAndSend: boolean;
  onClose: () => void;
  onPrint: () => void;
}

const ClassReportDialog = ({
  report, rangeLabel, hijriDate, canPrintAndSend, onClose, onPrint,
}: ClassReportDialogProps) => {
  const c = report.cls;
  const gradeFull = formatGradeSection(c.grade, c.section);
  const totalNeg = c.violations + c.absences + c.lates + c.classNotes;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="bg-gradient-to-bl from-primary to-primary/70 text-primary-foreground p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] opacity-85 font-bold flex items-center gap-1.5">
              <BarChart3 size={12} /> تقرير تربوي تحليلي للشعبة — {rangeLabel}
            </p>
            <h3 className="text-lg sm:text-xl font-black mt-1 leading-tight">{gradeFull}</h3>
            <p className="text-[10px] opacity-80 mt-0.5">{hijriDate}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-extrabold bg-white/15 border border-white/30 rounded-full px-3 py-1">
              الترتيب {report.rank} من {report.totalClasses}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
              aria-label="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="overflow-y-auto p-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-center">
              <p className="text-2xl font-black text-primary tabular-nums">{Math.max(0, Math.round(c.score))}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5">مؤشر التميز</p>
            </div>
            <div className="rounded-xl bg-success/10 border border-success/30 p-3 text-center">
              <p className="text-2xl font-black text-success tabular-nums">{c.positives}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5">سلوك إيجابي</p>
            </div>
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-center">
              <p className="text-2xl font-black text-destructive tabular-nums">{totalNeg}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5">إجراءات سلبية</p>
            </div>
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-center">
              <p className="text-2xl font-black text-warning tabular-nums">{report.positivePct}%</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5">نسبة الإيجابية</p>
            </div>
          </div>

          {/* drivers */}
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-xs font-extrabold text-foreground mb-2 flex items-center gap-1.5">
              <BarChart3 size={13} className="text-primary" />
              أسباب التقدم والتراجع — أثر كل مؤشر
            </p>
            <div className="space-y-1.5">
              {report.drivers.map((d) => (
                <div key={d.label} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 font-bold text-foreground">{d.label}</span>
                  <span className="text-muted-foreground tabular-nums">×{d.value}</span>
                  <span className={`tabular-nums font-extrabold w-16 text-left ${d.impact >= 0 ? "text-success" : "text-destructive"}`}>
                    {d.impact > 0 ? "+" : ""}{d.impact}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* strengths + weaknesses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-success/30 bg-success/5 p-3">
              <p className="text-xs font-extrabold text-success mb-2 flex items-center gap-1.5">
                <TrendingUp size={13} /> جوانب القوة
              </p>
              <ul className="space-y-1 text-xs text-foreground">
                {report.strengths.map((s, i) => (
                  <li key={i} className="flex gap-1.5"><CheckCircle2 size={12} className="text-success mt-0.5 shrink-0" /><span>{s}</span></li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-extrabold text-destructive mb-2 flex items-center gap-1.5">
                <TrendingDown size={13} /> جوانب الضعف
              </p>
              <ul className="space-y-1 text-xs text-foreground">
                {report.weaknesses.map((s, i) => (
                  <li key={i} className="flex gap-1.5"><AlertOctagon size={12} className="text-destructive mt-0.5 shrink-0" /><span>{s}</span></li>
                ))}
              </ul>
            </div>
          </div>

          {/* contributors */}
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                <Users size={13} className="text-warning" />
                الطلاب الأكثر تأثيراً سلباً على مستوى الشعبة
              </p>
            </div>
            {report.topNegativeContributors.length === 0 ? (
              <p className="text-xs text-success bg-success/10 border border-success/30 rounded-lg p-2 text-center font-bold">
                لا يوجد طلاب مؤثرون سلباً — أداء جماعي مميز.
              </p>
            ) : (
              <div className="space-y-1.5">
                {report.topNegativeContributors.map((s, i) => (
                  <div key={s.studentId} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 border border-border/40">
                    <span className="w-6 h-6 rounded-full bg-warning/20 text-warning text-[10px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                        {s.violations > 0 && <span className="text-destructive font-bold">{s.violations} مخالفة</span>}
                        {s.absences > 0 && <span className="text-destructive font-bold">{s.absences} غياب</span>}
                        {s.lates > 0 && <span className="text-warning font-bold">{s.lates} تأخر</span>}
                        {s.classNotes > 0 && <span className="text-warning font-bold">{s.classNotes} ملاحظة</span>}
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold text-destructive tabular-nums shrink-0 px-2 py-0.5 bg-destructive/10 rounded-full border border-destructive/30">
                      {s.total}×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* improvement plan */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-extrabold text-primary mb-2 flex items-center gap-1.5">
              <Lightbulb size={13} /> خطة تحسين مقترحة للشعبة
            </p>
            <ol className="space-y-1.5 text-xs text-foreground list-decimal pr-5">
              {report.improvementPlan.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
          </div>
        </div>

        {/* footer */}
        <div className="border-t border-border bg-muted/30 p-3 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[10px] text-muted-foreground">
            تقرير مولّد آلياً من بيانات النظام — يعتمد على {report.studentsInClass} طالب/طلاب في الشعبة.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
            >
              إغلاق
            </button>
            {canPrintAndSend && (
              <button
                onClick={onPrint}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-extrabold inline-flex items-center gap-1.5 hover:shadow-md"
              >
                <Printer size={12} /> طباعة التقرير (A4)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
