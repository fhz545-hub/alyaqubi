/**
 * تقرير الأداء التراكمي لمعلم عبر جميع الأشهر المؤرشفة.
 * يبني صفحة A4 احترافية تربوية تتضمن:
 * - بطاقة بيانات المعلم
 * - مستوى الأداء العام (ممتاز / جيد / مقبول / ضعيف)
 * - مؤشرات الانضباط الإجمالية
 * - جدول موجز شهرياً
 * - أبرز الملاحظات وملخص تربوي تلقائي
 */
import { minutesToHHMM } from "./teacherAttendanceParser";

export interface MonthlySlice {
  month_key: string;
  month_label: string;
  late_min: number;
  excuse_min: number;
  absent_days: number;
  open_days: number;
  present_days: number;
  total_days: number;
}

export interface PerformanceReportInput {
  teacher: {
    name: string;
    civil_id: string;
    phone?: string;
    specialization?: string;
  };
  schoolName?: string;
  months: MonthlySlice[];
}

/**
 * يحسب درجة أداء واقعية (0..100) مبنية على نسبة أيام الانضباط الفعلية:
 *  - يبدأ من نسبة الحضور (present/total) كأساس.
 *  - يخصم بدقة لكل مؤشر بحسب وزنه التربوي وعدد أيام الدوام الفعلية.
 * النتيجة دقيقة وغير عشوائية وتتغير وفق البيانات الحقيقية.
 */
function performanceScore(
  totalLate: number,
  totalAbsent: number,
  totalOpen: number,
  totalExcuse: number,
  totalPresent: number,
  totalDays: number,
): number {
  if (!totalDays || totalDays <= 0) return 0;
  // الأساس: نسبة الحضور الفعلية
  const attendanceRate = (totalPresent / totalDays) * 100;
  // الخصومات النسبية (لكل يوم دوام):
  const latePenalty = Math.min(20, (totalLate / 60) * (100 / totalDays) * 0.6); // ساعة تأخر = خصم نسبي يومي
  const openPenalty = Math.min(15, (totalOpen / totalDays) * 100 * 0.35);
  const excusePenalty = Math.min(8, (totalExcuse / 60) * (100 / totalDays) * 0.2);
  const score = attendanceRate - latePenalty - openPenalty - excusePenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function performanceLevel(score: number): { label: string; tone: string; note: string } {
  if (score >= 90) return { label: "ممتاز", tone: "excellent", note: "أداء انضباطي متميّز يستحق الإشادة والتعزيز." };
  if (score >= 75) return { label: "جيد جداً", tone: "good", note: "أداء جيد بشكل عام مع وجود مجال محدود للتحسين." };
  if (score >= 60) return { label: "مقبول", tone: "fair", note: "هناك ملاحظات انضباطية تستوجب المتابعة والتنبيه." };
  if (score >= 40) return { label: "بحاجة دعم", tone: "weak", note: "يوصى بفتح حوار تربوي ومتابعة ميدانية مستمرة." };
  return { label: "ضعيف – تدخل عاجل", tone: "critical", note: "يستلزم تدخلاً إدارياً عاجلاً ووضع خطة معالجة مكتوبة." };
}

/** يولّد ملاحظات تربوية ذكية مبنية على البيانات الفعلية. */
function buildObservations(months: MonthlySlice[], label: string): string[] {
  const obs: string[] = [];
  if (!months.length) return [`لا توجد بيانات مؤرشفة لـ${label} حتى تاريخه.`];
  const totalLate = months.reduce((s, m) => s + (m.late_min || 0), 0);
  const totalAbsent = months.reduce((s, m) => s + (m.absent_days || 0), 0);
  const totalOpen = months.reduce((s, m) => s + (m.open_days || 0), 0);
  const totalExcuse = months.reduce((s, m) => s + (m.excuse_min || 0), 0);
  const totalPresent = months.reduce((s, m) => s + (m.present_days || 0), 0);
  const totalDays = months.reduce((s, m) => s + (m.total_days || 0), 0);
  const attendanceRate = totalDays ? Math.round((totalPresent / totalDays) * 1000) / 10 : 0;

  obs.push(`نسبة الحضور الفعلية في ${label}: <b>${attendanceRate}%</b> (${totalPresent} من ${totalDays} يوم دوام).`);

  if (totalAbsent === 0 && totalLate === 0 && totalOpen === 0) {
    obs.push(`خلال ${label} لم تُسجَّل أي حالة تأخر أو غياب أو عدم انصراف — انضباط مثالي يستحق التعزيز الكتابي.`);
  }
  if (totalLate > 0) {
    const avgLate = Math.round(totalLate / months.length);
    obs.push(
      totalLate >= 180
        ? `تراكم تأخر مرتفع بلغ ${minutesToHHMM(totalLate)} بمتوسط ${minutesToHHMM(avgLate)} شهرياً — يُوصى بالمتابعة الأسبوعية وتوثيق التنبيه.`
        : `تأخر محدود مجموعه ${minutesToHHMM(totalLate)} (متوسط ${minutesToHHMM(avgLate)}/شهر) ضمن الحد القابل للمعالجة بالتنبيه الودي.`,
    );
  }
  if (totalAbsent > 0) {
    obs.push(
      totalAbsent >= 3
        ? `تكرر الغياب (${totalAbsent} يوم) — يلزم التحقق من الأسباب وتطبيق اللائحة عند انعدام العذر.`
        : `غياب محدود (${totalAbsent} يوم) لم يتجاوز الحد النظامي.`,
    );
  }
  if (totalOpen > 0) {
    obs.push(
      totalOpen >= 3
        ? `(${totalOpen}) أيام لم يُغلق فيها الانصراف — يُذكَّر المعلم بإلزامية البصمة في وقتها.`
        : `حالات عدم انصراف محدودة (${totalOpen}) يُكتفى فيها بالتذكير.`,
    );
  }
  if (totalExcuse > 0) {
    obs.push(
      totalExcuse >= 240
        ? `استئذان تراكمي مرتفع (${minutesToHHMM(totalExcuse)}) — يُستحسن تقنين الاستئذان وتوثيق المسوّغ.`
        : `استئذان معتدل (${minutesToHHMM(totalExcuse)}) ضمن الحد التربوي المقبول.`,
    );
  }
  const worstLate = [...months].filter((m) => m.late_min > 0).sort((a, b) => b.late_min - a.late_min)[0];
  if (worstLate) obs.push(`أعلى شهر تأخراً في ${label}: «${worstLate.month_label}» بـ ${minutesToHHMM(worstLate.late_min)}.`);
  const bestMonth = [...months].sort((a, b) => (b.present_days / Math.max(1, b.total_days)) - (a.present_days / Math.max(1, a.total_days)))[0];
  if (bestMonth && bestMonth.total_days) {
    obs.push(`أفضل شهر انضباطاً في ${label}: «${bestMonth.month_label}» بنسبة حضور ${Math.round((bestMonth.present_days / bestMonth.total_days) * 100)}%.`);
  }
  return obs;
}

function levelBadge(level: ReturnType<typeof performanceLevel>): string {
  const colors: Record<string, string> = {
    excellent: "background:#dcfce7;color:#166534;border-color:#86efac;",
    good: "background:#dbeafe;color:#1e40af;border-color:#93c5fd;",
    fair: "background:#fef9c3;color:#854d0e;border-color:#fde047;",
    weak: "background:#ffedd5;color:#9a3412;border-color:#fdba74;",
    critical: "background:#fee2e2;color:#991b1b;border-color:#fca5a5;",
  };
  return `<span class="level" style="${colors[level.tone] || ''}">${level.label}</span>`;
}

/** يحدد الفصل الدراسي اعتماداً على شهر الميلادي وفق تقويم 1447هـ.
 *  الفصل الأول: 2025-08 .. 2025-12
 *  الفصل الثاني: 2026-01 .. 2026-06
 */
function termOfMonth(monthKey: string): "t1" | "t2" {
  const k = monthKey.slice(0, 7);
  if (k >= "2025-08" && k <= "2025-12") return "t1";
  return "t2";
}

/** يبني قسم فصل دراسي كامل (شريط أشهر + جدول + بطاقة مستوى + ملاحظات). */
function buildTermSection(title: string, subtitle: string, color: string, months: MonthlySlice[]): string {
  const sortedMonths = [...months].sort((a, b) => a.month_key.localeCompare(b.month_key));
  const totalLate = months.reduce((s, m) => s + (m.late_min || 0), 0);
  const totalAbsent = months.reduce((s, m) => s + (m.absent_days || 0), 0);
  const totalOpen = months.reduce((s, m) => s + (m.open_days || 0), 0);
  const totalExcuse = months.reduce((s, m) => s + (m.excuse_min || 0), 0);
  const totalPresent = months.reduce((s, m) => s + (m.present_days || 0), 0);
  const totalDays = months.reduce((s, m) => s + (m.total_days || 0), 0);
  const score = performanceScore(totalLate, totalAbsent, totalOpen, totalExcuse, totalPresent, totalDays);
  const level = performanceLevel(score);
  const observations = buildObservations(months, title);

  const monthChips = sortedMonths.map((m) => {
    const rate = m.total_days ? Math.round((m.present_days / m.total_days) * 100) : 0;
    return `<div class="month-chip">
      <div class="m-name">${m.month_label}</div>
      <div class="m-rate">${rate}%</div>
      <div class="m-meta">حضور ${m.present_days}/${m.total_days}</div>
    </div>`;
  }).join("");

  const monthRows = sortedMonths.map((m) => {
    const ms = performanceScore(m.late_min, m.absent_days, m.open_days, m.excuse_min, m.present_days, m.total_days);
    const ml = performanceLevel(ms);
    return `<tr>
      <td class="month-name">${m.month_label}</td>
      <td>${m.present_days || 0} / ${m.total_days || 0}</td>
      <td>${m.late_min ? minutesToHHMM(m.late_min) : "—"}</td>
      <td>${m.absent_days || "—"}</td>
      <td>${m.open_days || "—"}</td>
      <td>${m.excuse_min ? minutesToHHMM(m.excuse_min) : "—"}</td>
      <td><b>${ms}%</b></td>
      <td>${levelBadge(ml)}</td>
    </tr>`;
  }).join("");

  const empty = !months.length;

  return `
  <section class="term" style="--accent:${color}">
    <div class="term-header">
      <div class="term-badge">${title}</div>
      <div class="term-sub">${subtitle}</div>
      <div class="term-score">
        <span>${empty ? "—" : score + "%"}</span>
        <small>${empty ? "لا توجد بيانات" : level.label}</small>
      </div>
    </div>

    ${empty ? `<div class="empty">لم يتم استيراد بيانات حضوري لهذا الفصل بعد.</div>` : `
    <div class="months-strip">${monthChips}</div>

    <div class="kpi-row">
      <div class="kpi present"><div class="k-label">أيام الحضور</div><div class="k-value">${totalPresent}/${totalDays}</div></div>
      <div class="kpi late"><div class="k-label">إجمالي التأخر</div><div class="k-value">${totalLate ? minutesToHHMM(totalLate) : "00:00"}</div></div>
      <div class="kpi absent"><div class="k-label">أيام الغياب</div><div class="k-value">${totalAbsent}</div></div>
      <div class="kpi open"><div class="k-label">عدم الانصراف</div><div class="k-value">${totalOpen}</div></div>
      <div class="kpi excuse"><div class="k-label">الاستئذان</div><div class="k-value">${totalExcuse ? minutesToHHMM(totalExcuse) : "00:00"}</div></div>
    </div>

    <table class="months">
      <thead>
        <tr>
          <th style="width:18%">الشهر</th>
          <th>أيام الحضور</th>
          <th>التأخر</th>
          <th>الغياب</th>
          <th>لم يُغلق</th>
          <th>الاستئذان</th>
          <th>الدرجة</th>
          <th style="width:14%">المستوى</th>
        </tr>
      </thead>
      <tbody>${monthRows}</tbody>
    </table>

    <div class="observations">
      <div class="obs-title">📝 أبرز ملاحظات ${title}</div>
      <ul>${observations.map((o) => `<li>${o}</li>`).join("")}</ul>
    </div>
    `}
  </section>`;
}

export function buildPerformanceReportHTML(input: PerformanceReportInput): string {
  const { teacher, months, schoolName } = input;
  const totalLate = months.reduce((s, m) => s + (m.late_min || 0), 0);
  const totalAbsent = months.reduce((s, m) => s + (m.absent_days || 0), 0);
  const totalOpen = months.reduce((s, m) => s + (m.open_days || 0), 0);
  const totalExcuse = months.reduce((s, m) => s + (m.excuse_min || 0), 0);
  const totalPresent = months.reduce((s, m) => s + (m.present_days || 0), 0);
  const totalDays = months.reduce((s, m) => s + (m.total_days || 0), 0);

  const score = performanceScore(totalLate, totalAbsent, totalOpen, totalExcuse, totalPresent, totalDays);
  const level = performanceLevel(score);

  const term1Months = months.filter((m) => termOfMonth(m.month_key) === "t1");
  const term2Months = months.filter((m) => termOfMonth(m.month_key) === "t2");
  const attendanceRate = totalDays ? Math.round((totalPresent / totalDays) * 1000) / 10 : 0;

  // أشهر الفترة كاملة في شريط علوي
  const allMonthsStrip = [...months].sort((a, b) => a.month_key.localeCompare(b.month_key)).map((m) => {
    const rate = m.total_days ? Math.round((m.present_days / m.total_days) * 100) : 0;
    const term = termOfMonth(m.month_key);
    return `<div class="hero-chip ${term}">
      <span class="hc-term">${term === "t1" ? "ف١" : "ف٢"}</span>
      <span class="hc-name">${m.month_label}</span>
      <span class="hc-rate">${rate}%</span>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>تقرير أداء المعلم - ${teacher.name}</title>
<style>
@page { size: A4; margin: 10mm 9mm; }
* { box-sizing: border-box; }
body {
  font-family: 'Cairo', 'Tahoma', Arial, sans-serif;
  font-size: 11.5px; color: #0f172a; margin: 0; padding: 0; background: #fff;
}
.report { padding: 0; }

/* ========== HEADER رسمي وجذاب ========== */
.header {
  position: relative;
  background: linear-gradient(135deg, #0f3057 0%, #1e3a8a 50%, #1e40af 100%);
  color: #fff; border-radius: 12px; padding: 12px 16px; margin-bottom: 10px;
  display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; gap: 8px;
  box-shadow: 0 4px 12px rgba(15, 48, 87, 0.18);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.header::before {
  content: ''; position: absolute; inset: 0; border-radius: 12px;
  background: radial-gradient(circle at 100% 0%, rgba(255,255,255,0.12), transparent 60%);
  pointer-events: none;
}
.header .school, .header .year { font-size: 10.5px; font-weight: 700; line-height: 1.5; opacity: 0.95; }
.header .year { text-align: left; }
.header .title { text-align: center; }
.header h1 { margin: 0; font-size: 19px; font-weight: 900; letter-spacing: 0.5px; }
.header .sub { font-size: 10.5px; margin-top: 3px; opacity: 0.92; font-weight: 600; }
.header .crest {
  display: inline-block; padding: 2px 10px; border: 1.5px solid rgba(255,255,255,0.45);
  border-radius: 999px; font-size: 9.5px; margin-top: 4px; letter-spacing: 0.5px;
}

/* ========== بطاقة المعلم ========== */
.teacher-card {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  background: linear-gradient(135deg,#f8fafc,#eef2ff);
  border: 1px solid #c7d2fe; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
}
.teacher-card .field { display: flex; flex-direction: column; }
.teacher-card .label { font-size: 9.5px; color: #4338ca; font-weight: 800; margin-bottom: 2px; }
.teacher-card .value { font-size: 12.5px; color: #1e1b4b; font-weight: 900; }

/* ========== شريط الأشهر العلوي الإبداعي ========== */
.hero-strip {
  display: flex; gap: 6px; overflow: hidden; padding: 8px;
  background: linear-gradient(135deg, #fafaf9, #f5f3ff);
  border: 1.5px dashed #a78bfa; border-radius: 10px; margin-bottom: 10px;
  flex-wrap: wrap;
}
.hero-strip .label-tag {
  font-size: 9.5px; font-weight: 800; color: #6d28d9;
  padding: 4px 8px; align-self: stretch; display: grid; place-items: center;
}
.hero-chip {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 10.5px; font-weight: 700; color: #0f172a;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.hero-chip.t1 { border-right: 3px solid #0ea5e9; }
.hero-chip.t2 { border-right: 3px solid #f59e0b; }
.hero-chip .hc-term { font-size: 9px; padding: 1px 6px; border-radius: 999px; background: #f1f5f9; color: #475569; }
.hero-chip .hc-rate { color: #1e40af; font-weight: 900; }

/* ========== KPIs المجمّعة ========== */
.kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 8px; }
.kpi {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 5px; text-align: center; background: #fff;
}
.kpi .k-label { font-size: 9px; color: #64748b; font-weight: 700; margin-bottom: 2px; }
.kpi .k-value { font-size: 14px; font-weight: 900; color: #0f172a; }
.kpi.present { background: #f0fdfa; border-color: #99f6e4; }
.kpi.present .k-value { color: #115e59; }
.kpi.late { background: #fffbeb; border-color: #fcd34d; }
.kpi.late .k-value { color: #92400e; }
.kpi.absent { background: #fef2f2; border-color: #fecaca; }
.kpi.absent .k-value { color: #991b1b; }
.kpi.open { background: #eff6ff; border-color: #bfdbfe; }
.kpi.open .k-value { color: #1d4ed8; }
.kpi.excuse { background: #f0fdf4; border-color: #bbf7d0; }
.kpi.excuse .k-value { color: #166534; }

/* ========== شارة المستوى العام ========== */
.level-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: 2px solid #94a3b8; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px;
  background: linear-gradient(135deg,#f1f5f9,#e0e7ff);
}
.level-banner .left { display: flex; align-items: center; gap: 10px; }
.level-banner .badge-title { font-size: 11px; color: #475569; font-weight: 700; }
.level { display: inline-block; padding: 4px 12px; border: 1.5px solid; border-radius: 999px; font-weight: 900; font-size: 11.5px; }
.level-banner .summary { font-size: 11px; color: #334155; flex: 1; text-align: center; font-weight: 600; }
.level-banner .score-bubble {
  width: 60px; height: 60px; border-radius: 50%;
  background: conic-gradient(#1e3a8a var(--p), #e2e8f0 0);
  display: grid; place-items: center; position: relative;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.level-banner .score-bubble::before {
  content: ''; position: absolute; inset: 6px; background: #fff; border-radius: 50%;
}
.level-banner .score-bubble span { position: relative; font-weight: 900; font-size: 14px; color: #1e3a8a; }

/* ========== أقسام الفصول ========== */
.term {
  border: 1.5px solid var(--accent, #cbd5e1); border-radius: 12px;
  padding: 10px 12px; margin-bottom: 10px; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  page-break-inside: avoid; break-inside: avoid;
}
.term-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  padding-bottom: 8px; border-bottom: 1.5px dashed var(--accent, #cbd5e1);
}
.term-badge {
  background: var(--accent, #1e40af); color: #fff; padding: 5px 14px;
  border-radius: 999px; font-weight: 900; font-size: 12.5px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.term-sub { flex: 1; font-size: 10.5px; color: #64748b; font-weight: 600; }
.term-score { text-align: center; }
.term-score span { display: block; font-size: 18px; font-weight: 900; color: var(--accent, #1e40af); }
.term-score small { font-size: 9.5px; color: #64748b; font-weight: 700; }

.months-strip {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));
  gap: 6px; margin-bottom: 8px;
}
.month-chip {
  background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 6px 4px; text-align: center;
  border-top: 3px solid var(--accent, #1e40af);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.month-chip .m-name { font-size: 10.5px; font-weight: 800; color: #0f172a; }
.month-chip .m-rate { font-size: 14px; font-weight: 900; color: var(--accent, #1e40af); margin: 1px 0; }
.month-chip .m-meta { font-size: 9px; color: #64748b; }

.empty {
  text-align: center; padding: 16px; color: #94a3b8; font-size: 11px;
  background: #f8fafc; border-radius: 8px; font-weight: 600;
}

table.months {
  width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10.75px;
  border-radius: 8px; overflow: hidden; margin-top: 6px;
  table-layout: fixed;
}
table.months th {
  background: var(--accent, #1e3a8a); color: #fff; padding: 7px 3px; font-weight: 800;
  text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
table.months td {
  border-bottom: 1px solid #cbd5e1; border-left: 1px solid #e2e8f0;
  padding: 6px 4px; text-align: center; vertical-align: middle;
  font-family: ui-monospace, monospace; font-size: 10.75px;
}
table.months td:first-child, table.months th:first-child { border-left: none; }
table.months tbody tr:last-child td { border-bottom: none; }
table.months tr:nth-child(even) td { background: #f8fafc; }
table.months td.month-name {
  font-family: 'Cairo',sans-serif; font-weight: 800; color: #0f172a;
  text-align: right; padding-right: 8px;
}
@media print {
  table.months tr:nth-child(even) td { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
  table.months tr { page-break-inside: avoid; }
}

.observations {
  margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 8px 10px; background: linear-gradient(135deg, #fafafa, #f8fafc);
}
.observations .obs-title { font-size: 11px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
.observations ul { margin: 4px 0 0; padding-right: 18px; }
.observations li { margin: 3px 0; font-size: 10.5px; color: #1e293b; line-height: 1.7; }

/* ========== الملخص التربوي ========== */
.summary-box {
  margin-top: 8px; padding: 10px 14px; border-radius: 8px;
  background: linear-gradient(135deg, #1e3a8a, #1e40af);
  border: 1.5px solid #1e3a8a; font-size: 11px; color: #fff; font-weight: 600;
  line-height: 1.85; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.summary-box strong { color: #fde68a; font-weight: 900; }
.summary-box .pill {
  display: inline-block; background: rgba(255,255,255,0.18); padding: 1px 8px;
  border-radius: 999px; margin: 0 2px; font-weight: 800;
}

.signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 16px; }
.sig { text-align: center; padding-top: 22px; border-top: 1.5px solid #94a3b8; font-size: 10.5px; color: #1e293b; font-weight: 800; }
.sig small { display: block; font-weight: 600; color: #64748b; margin-top: 2px; }

.footer { text-align: center; margin-top: 10px; font-size: 9.5px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; }
@media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="report">
  <div class="header">
    <div class="school">المملكة العربية السعودية<br/>وزارة التعليم<br/><b>${schoolName || "ثانوية اليعقوبي - مسارات"}</b></div>
    <div class="title">
      <h1>تقرير الأداء الانضباطي التراكمي للمعلم</h1>
      <div class="sub">تحليل شامل ودقيق لأرشيف حضوري عبر الفصلين الدراسيين</div>
      <div class="crest">وثيقة رسمية · سرية · للاستخدام الإداري</div>
    </div>
    <div class="year">العام الدراسي<br/><b>1447 / 1448 هـ</b><br/>تاريخ التقرير<br/>${new Date().toLocaleDateString("ar-SA")}</div>
  </div>

  <div class="teacher-card">
    <div class="field"><span class="label">اسم المعلم</span><span class="value">${teacher.name}</span></div>
    <div class="field"><span class="label">رقم الهوية</span><span class="value">${teacher.civil_id || "—"}</span></div>
    <div class="field"><span class="label">التخصص</span><span class="value">${teacher.specialization || "—"}</span></div>
    <div class="field"><span class="label">الجوال</span><span class="value">${teacher.phone || "—"}</span></div>
  </div>

  ${months.length ? `
  <div class="hero-strip">
    <div class="label-tag">📅 أشهر التقرير</div>
    ${allMonthsStrip}
  </div>` : ""}

  <div class="level-banner">
    <div class="left">
      <div>
        <div class="badge-title">المستوى العام للمعلم</div>
        ${levelBadge(level)}
      </div>
    </div>
    <div class="summary">${level.note} · نسبة الحضور الفعلية ${attendanceRate}%</div>
    <div class="score-bubble" style="--p: ${score * 3.6}deg"><span>${score}%</span></div>
  </div>

  ${buildTermSection("الفصل الدراسي الأول", "1447/03/01 هـ — 1447/07/19 هـ", "#0ea5e9", term1Months)}
  ${buildTermSection("الفصل الدراسي الثاني", "1447/07/29 هـ — 1448/01/10 هـ", "#f59e0b", term2Months)}

  <div class="summary-box">
    <strong>📌 الملخص التربوي العام:</strong>
    استناداً إلى تحليل بيانات حضوري الفعلية لعدد <span class="pill">${months.length}</span> شهر مؤرشف
    (<span class="pill">${term1Months.length}</span> في الفصل الأول و<span class="pill">${term2Months.length}</span> في الفصل الثاني)،
    وبإجمالي أيام دوام <span class="pill">${totalDays}</span> يوم منها <span class="pill">${totalPresent}</span> يوم حضور فعلي
    (نسبة انضباط <span class="pill">${attendanceRate}%</span>)،
    صُنّف المستوى العام للمعلم بـ «<strong>${level.label}</strong>» بدرجة كلية <span class="pill">${score}%</span>.
    ${level.note}
    ${score < 60 ? " <strong>التوصية:</strong> إدراج المعلم ضمن خطة المتابعة الإدارية مع توثيق التنبيهات الكتابية وفق اللوائح." : ""}
    ${score >= 90 ? " <strong>التوصية:</strong> توجيه شكر كتابي رسمي وترشيحه للإشادة في الاجتماع الشهري للمعلمين." : ""}
    ${score >= 60 && score < 90 ? " <strong>التوصية:</strong> الاستمرار في الدعم التربوي مع متابعة المؤشرات التي تحتاج معالجة." : ""}
  </div>

  <div class="signatures">
    <div class="sig">شؤون الطلاب<small>الأستاذ / عدنان علي الزريق</small></div>
    <div class="sig">وكيل الشؤون التعليمية<small>الأستاذ / سعود فهد الرويجح</small></div>
    <div class="sig">مدير المدرسة<small>الأستاذ / فهد حامد الزهراني</small></div>
  </div>

  <div class="footer">تقرير آلي مُولّد من نظام إدارة شؤون المعلمين — تنفيذ وتطوير: فهد حامد الزهراني</div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;
}

/** يفتح نافذة طباعة بتقرير المعلم. */
export function printPerformanceReport(input: PerformanceReportInput): void {
  const html = buildPerformanceReportHTML(input);
  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}