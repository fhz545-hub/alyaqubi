/**
 * يبني HTML احترافي مطابق للنموذج المعتمد لكشف حضوري شهري للمعلم.
 * - هيدر بشعار وزارة التعليم + معلومات المدرسة
 * - بطاقة بيانات المعلم
 * - ملخص الشهر (إجمالي ساعات الدوام، التأخر، الاستئذان، الغياب، أيام لم يُغلق)
 * - مؤشر الانضباط ونسبة الحضور
 * - جدول يومي مفصل مرتب من الأحدث للأقدم بالتاريخ الهجري
 */
import { gregToHijri, arabicDayName, minutesToHHMM } from "./teacherAttendanceParser";

/** تنسيق التاريخ الميلادي بصيغة عربية مختصرة (مثال: 23/04/2026) */
function formatGregShort(greg: string): string {
  if (!greg) return "—";
  const m = greg.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return greg;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** خلية اليوم: يوم الأسبوع + التاريخ الميلادي فقط (وفق المعتمد) */
function dayCell(greg: string): string {
  const day = arabicDayName(greg);
  const gregFmt = formatGregShort(greg);
  return `<span class="day-cell">
      <span class="day-name">${day}</span>
      <span class="day-greg">${gregFmt}</span>
    </span>`;
}

export interface MonthlyPrintInput {
  teacher: {
    name: string;
    civil_id: string;
    phone: string;
    specialization: string;
    rank?: string;
    job?: string;
  };
  monthLabel: string;
  totals: {
    work_min: number;
    late_min: number;
    excuse_min: number;
    absent_days: number;
    open_days: number;
    present_days: number;
    total_days: number;
  };
  daily: Array<{
    greg_date: string;
    in_time: string;
    out_time: string;
    work_min: number;
    late_min: number;
    excuse_min: number;
    status: string;
    absence_type?: string;
    fares_upload_status?: string;
    excuse_period?: string;
  }>;
  shiftLabel?: string; // e.g. "شتوي – 07:00"
  schoolName?: string;
  /** تفاصيل الاستئذانات (اختياري) لإظهار جدول إضافي عند توفّرها */
  excuses?: Array<{
    greg_date: string;
    from_time: string;
    to_time: string;
    duration_min: number;
    kind: string;
    period?: string;
    status_request: string;
    request_id?: string;
  }>;
  /** نطاق الفترة المغطاة لتقرير الاستئذانات */
  excusesRange?: { from: string; to: string };
}

export function buildMonthlyPrintHTML(input: MonthlyPrintInput): string {
  const {
    teacher,
    monthLabel,
    totals,
    daily,
    excuses = [],
    excusesRange,
    shiftLabel = "صيفي – 06:45 إلى 13:45",
    schoolName = "مدرسة اليعقوبي الثانوية",
  } = input;

  const safe = (s: string) =>
    String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);

  // Sort daily desc (most recent first)
  const sortedDaily = [...daily].sort((a, b) => (b.greg_date || "").localeCompare(a.greg_date || ""));

  // Compute discipline & attendance %
  const expected = totals.total_days > 0 ? totals.total_days : sortedDaily.length;
  const presentEffective = totals.present_days + totals.open_days;
  const attendancePct = expected > 0 ? Math.round((presentEffective / expected) * 100) : 0;

  let disciplineScore = 100;
  disciplineScore -= totals.absent_days * 8;
  disciplineScore -= totals.open_days * 2;
  disciplineScore -= Math.floor(totals.late_min / 30);
  disciplineScore = Math.max(0, Math.min(100, disciplineScore));

  let level = "ممتاز";
  if (disciplineScore < 60) level = "يحتاج متابعة";
  else if (disciplineScore < 75) level = "جيد";
  else if (disciplineScore < 90) level = "جيد جداً";

  const rowsHtml = sortedDaily
    .map((d) => {
      const lateBadge =
        d.late_min > 0
          ? `<span class="pill pill-red">تأخر ${minutesToHHMM(d.late_min)}</span>`
          : `<span style="color:#94a3b8">00:00</span>`;
      const excuseCell =
        d.excuse_min > 0
          ? `<span class="cell-inline"><span class="time-num">${minutesToHHMM(d.excuse_min)}</span><span class="pill pill-blue">${safe(d.excuse_period || "استئذان")}</span></span>`
          : `<span style="color:#94a3b8">—</span>`;
      const workCell = d.status === "لم يُغلق"
        ? `<span class="cell-inline"><span class="time-num">${minutesToHHMM(d.work_min || 210)}</span><span class="pill pill-amber">نصف يوم</span></span>`
        : `<span class="time-num">${minutesToHHMM(d.work_min)}</span>`;
      // اشتقاق نص الحالة عند الغياب: مقبول/غير مقبول وفق نوع الغياب
      let statusColor = "#0b7e88";
      let statusText = d.status;
      if (d.status === "غياب") {
        const at = (d.absence_type || "بدون سند نظامي").trim();
        if (at === "بدون سند نظامي" || at === "") {
          statusText = "غياب غير مقبول";
          statusColor = "#b91c1c";
        } else {
          statusText = "غياب مقبول";
          statusColor = "#047857";
        }
      } else if (d.status === "لم يُغلق") {
        statusColor = "#b45309";
      } else if (d.status === "استئذان") {
        statusColor = "#0369a1";
      }
      return `
      <tr>
        <td class="td-day">${dayCell(d.greg_date)}</td>
        <td style="text-align:center;font-family:ui-monospace,monospace">${safe(d.in_time || "—")}</td>
        <td style="text-align:center;font-family:ui-monospace,monospace">${safe(d.out_time || "—")}</td>
        <td class="td-work">${workCell}</td>
        <td class="td-late">${lateBadge}</td>
        <td class="td-exc">${excuseCell}</td>
        <td style="text-align:center;font-weight:800;color:${statusColor};white-space:nowrap">${safe(statusText)}</td>
      </tr>`;
    })
    .join("");

  // جدول تفاصيل الاستئذانات (إن وُجد)
  const sortedExcuses = [...excuses].sort((a, b) => (b.greg_date || "").localeCompare(a.greg_date || ""));
  const excuseRowsHtml = sortedExcuses
    .map((e) => {
      return `
      <tr>
        <td class="td-day">${dayCell(e.greg_date)}</td>
        <td style="text-align:center;font-family:ui-monospace,monospace">${safe(e.from_time || "—")}</td>
        <td style="text-align:center;font-family:ui-monospace,monospace">${safe(e.to_time || "—")}</td>
        <td style="text-align:center;font-family:ui-monospace,monospace;font-weight:700">${minutesToHHMM(e.duration_min)}</td>
        <td style="text-align:center">${safe(e.kind || "—")}</td>
        <td style="text-align:center;color:#0b7e88;font-weight:800">${safe(e.period || "وسط الدوام")}</td>
        <td style="text-align:center;color:#0369a1;font-weight:700">${safe(e.status_request || "مقبول")}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كشف حضوري شهري - ${safe(teacher.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 9mm 7mm 11mm 7mm; }
* { box-sizing: border-box; }
body { font-family: 'Tajawal','Segoe UI',system-ui,-apple-system,sans-serif; color: #0f172a; padding: 0; margin: 0; background:#fff; font-size:12.25px; line-height:1.55; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
/* البنر (شعار وزارة التعليم): يمتد على كامل عرض الصفحة بدقة، بدون قص أو انكماش */
.banner-wrap {
  width:100%;
  margin:0;
  padding:0;
  background:#ffffff;
  line-height:0; /* يمنع أي مسافة بيضاء أسفل الصورة */
}
.banner-wrap img {
  width: 100% !important;
  display: block;
  height: auto;
  /* البنر بنسبة 1920×357 تقريبًا — اتركه يمتد طبيعياً ليملأ العرض */
}
/* شريط العنوان: متوازن، فاتح، مع عنوان فرعي */
.title-bar {
  text-align:center;
  margin:6px 0 10px;
  padding:10px 14px;
  background:linear-gradient(180deg,#ecfeff 0%, #ffffff 100%);
  border:1.5px solid #0b7e88;
  border-radius:6px;
}
.title-bar .main-title {
  color:#0b7e88; font-weight:900; font-size:19px; letter-spacing:0.3px; display:block;
}
/* تمت إزالة العنوان الفرعي (اسم المدرسة + منصة حضوري) بناءً على متطلبات العرض */
.summary-head {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin:14px 0 6px;
}
.summary-head .section-title { margin:0; flex:0 0 auto; }
.summary-head .kpi-row { margin-top:0; flex:1 1 auto; justify-content:flex-end; }
table { width:100%; border-collapse: separate; border-spacing:0; margin-top:6px; border-radius:8px; overflow:hidden; box-shadow:0 1px 0 rgba(15,23,42,0.04); }
table.info td, table.info th, table.summary td, table.summary th, table.daily td, table.daily th {
  border-bottom: 1px solid #cbd5e1; border-left: 1px solid #e2e8f0; padding: 8px 10px;
}
table.info td:first-child, table.info th:first-child,
table.summary td:first-child, table.summary th:first-child,
table.daily td:first-child, table.daily th:first-child { border-left:none; }
table.info tr:last-child td, table.summary tr:last-child td, table.daily tbody tr:last-child td { border-bottom:none; }
table.info th, table.summary th, table.daily th {
  background: linear-gradient(180deg,#0b7e88 0%, #0a6e78 100%);
  color:#ffffff; font-weight:800; text-align:center; font-size:12.5px;
  letter-spacing:0.25px; text-shadow:0 1px 0 rgba(0,0,0,0.08);
  border-bottom: 1.5px solid #064e55;
}
/* بطاقة بيانات المعلم: مساحة أوسع، أعمدة متناسقة وقيمة بارزة */
table.info { table-layout: fixed; }
table.info th { font-size:11.5px; padding:7px 8px; }
table.info td { text-align:center; vertical-align:middle; font-size:12.5px; height:36px; }
table.info td.name-cell {
  font-weight:900; font-size:13.5px; color:#0b7e88; background:#f0fdfa;
}
/* جدول الملخص: أرقام بارزة سهلة القراءة */
table.summary { table-layout: fixed; }
table.summary td { text-align:center; vertical-align:middle; font-size:13.5px; height:38px; background:#f8fafc; }
/* جدول يومي: تكرار الرأس في كل صفحة + تجنب قطع الصفوف */
table.daily { table-layout: fixed; }
table.daily thead { display: table-header-group; }
table.daily tfoot { display: table-footer-group; }
table.daily tr { page-break-inside: avoid; break-inside: avoid; }
table.daily tbody tr:nth-child(even) td { background:#f6f9fb; }
table.daily tbody tr:nth-child(odd) td { background:#ffffff; }
table.daily tbody tr:hover td { background:#ecfeff; }
table.daily td { vertical-align: middle; height:36px; font-size:12.25px; }
table.daily th {
  border-color:#0b7e88 !important;
  padding:9px 6px;
  font-size:12.5px;
}
/* خلية اليوم: اليوم + التاريخ الميلادي فقط، بصف واحد متناسق */
.td-day { padding: 6px 8px !important; text-align: center; white-space: nowrap; }
.day-cell { display:inline-flex; align-items:center; gap:10px; line-height:1.25; justify-content:center; flex-wrap:nowrap; }
.day-name { font-weight:900; color:#0b7e88; font-size:12.5px; }
.day-greg { font-weight:700; color:#0f172a; font-size:12.5px; font-family:ui-monospace,'Courier New',monospace; direction:ltr; }
/* عرض الأعمدة في الجدول اليومي — متوازن وواضح */
table.daily col.c-day { width: 19%; }
table.daily col.c-time { width: 9%; }
table.daily col.c-work { width: 13%; }
table.daily col.c-late { width: 11%; }
table.daily col.c-exc { width: 18%; }
table.daily col.c-status { width: 17%; }
/* خلايا زمنية ومؤشرات: صف واحد بدون التفاف */
.td-work, .td-late, .td-exc { text-align:center; vertical-align:middle; white-space:nowrap; padding:6px 6px !important; }
table.daily td { white-space: nowrap; }
.cell-inline {
  display:inline-flex; align-items:center; justify-content:center;
  gap:6px; flex-wrap:nowrap; white-space:nowrap; line-height:1.2;
}
.time-num {
  font-family: ui-monospace,'Courier New',monospace;
  font-weight: 800; font-size: 12.5px; color:#0f172a; direction:ltr;
}
.pill {
  display:inline-block; border-radius:999px; padding:2px 9px;
  font-size:10.5px; font-weight:800; line-height:1.3;
  white-space:nowrap; border:1px solid transparent;
}
.pill-amber { background:#fff7ed; color:#9a3412; border-color:#fed7aa; }
.pill-red   { background:#fef2f2; color:#b91c1c; border-color:#fecaca; }
.pill-blue  { background:#eff6ff; color:#1e40af; border-color:#bfdbfe; }
/* تأكيد التباين في الطباعة بالأبيض والأسود */
table.daily th { border-color:#0b7e88 !important; }
table.daily td { border-color:#cbd5e1 !important; }
.section-title {
  color:#0b7e88; font-weight:900; margin:14px 0 6px; font-size:14.5px; text-align:right;
  border-right: 4px solid #0b7e88;
  padding: 7px 12px;
  background: linear-gradient(90deg, rgba(11,126,136,0.10), rgba(11,126,136,0.00));
  border-radius:4px;
}
.kpi-row { display:flex; gap:8px; margin-top:6px; flex-wrap:wrap; justify-content:flex-end; }
.kpi { background:#ecfdf5; border:1px solid #a7f3d0; color:#166534; border-radius:999px; padding:5px 12px; font-weight:800; font-size:11.5px; }
.kpi.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
.kpi.info { background:#eff6ff; border-color:#bfdbfe; color:#1e3a8a; }
.foot { margin-top:14px; font-size:10.5px; color:#64748b; text-align:center; padding-top:8px; border-top:1px solid #e2e8f0; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size:11.5px; }
  .banner-wrap, .banner-wrap img { width:100% !important; }
  .banner-wrap img { max-width:100% !important; }
  .section-title, table.info, table.summary, .kpi-row { page-break-inside: avoid; break-inside: avoid; }
  table { box-shadow:none !important; border-radius:0 !important; }
  table.daily thead th, table.summary th, table.info th { background: #0b7e88 !important; color:#fff !important; -webkit-print-color-adjust: exact; }
  table.daily td, table.summary td, table.info td { border-color:#94a3b8 !important; }
  table.daily tbody tr:nth-child(even) td { background:#f1f5f9 !important; }
  .pill { border-width:1px !important; }
  .avoid-break { page-break-inside: avoid; break-inside: avoid; }
  /* تكبير عمود اليوم قليلاً عند الطباعة لمنع التفاف التاريخ */
  table.daily col.c-day { width: 22% !important; }
}
</style></head><body>

<div class="banner-wrap">
  <img src="${window.location.origin}/legacy/shree.png" alt="بنر وزارة التعليم" onerror="this.style.display='none'">
</div>

<div class="title-bar">
  <span class="main-title">كشف حضور وانصراف المعلم${monthLabel ? " — " + safe(monthLabel) : ""}</span>
</div>

<table class="info">
  <colgroup>
    <col style="width:24%"><col style="width:16%"><col style="width:14%"><col style="width:18%"><col style="width:14%"><col style="width:14%">
  </colgroup>
  <tr>
    <th>الاسم</th>
    <th>رقم الهوية (الرقم الوظيفي)</th>
    <th>الجوال</th>
    <th>التخصص</th>
    <th>المرتبة</th>
    <th>الدوام الأساسي</th>
  </tr>
  <tr>
    <td class="name-cell">${safe(teacher.name)}</td>
    <td style="font-family:ui-monospace,monospace">${safe(teacher.civil_id)}</td>
    <td style="font-family:ui-monospace,monospace">${safe(teacher.phone || "—")}</td>
    <td>${safe(teacher.specialization || "—")}</td>
    <td>${safe(teacher.rank || "معلم ممارس")}</td>
    <td>${safe(shiftLabel)}</td>
  </tr>
</table>

<div class="summary-head">
  <div class="section-title">ملخص الشهر</div>
  <div class="kpi-row">
    <span class="kpi">نسبة الحضور: ${attendancePct}%</span>
    <span class="kpi info">مؤشر الانضباط: ${disciplineScore}/100</span>
    <span class="kpi ${disciplineScore < 75 ? "warn" : ""}">المستوى: ${level}</span>
  </div>
</div>
<table class="summary">
  <tr>
    <th>إجمالي ساعات الدوام</th>
    <th>إجمالي التأخر</th>
    <th>إجمالي الاستئذان</th>
    <th>إجمالي الغياب</th>
    <th>أيام لم يُغلق الدوام</th>
  </tr>
  <tr>
    <td style="text-align:center;font-family:ui-monospace,monospace;font-weight:800">${minutesToHHMM(totals.work_min)}</td>
    <td style="text-align:center;font-family:ui-monospace,monospace;font-weight:800">${minutesToHHMM(totals.late_min)}</td>
    <td style="text-align:center;font-family:ui-monospace,monospace;font-weight:800">${minutesToHHMM(totals.excuse_min)}</td>
    <td style="text-align:center;font-weight:800">${totals.absent_days}</td>
    <td style="text-align:center;font-weight:800">${totals.open_days}</td>
  </tr>
</table>

<table class="daily">
  <colgroup>
    <col class="c-day"><col class="c-time"><col class="c-time"><col class="c-work"><col class="c-late"><col class="c-exc"><col class="c-status">
  </colgroup>
  <thead>
    <tr>
      <th>اليوم والتاريخ</th>
      <th>الحضور</th>
      <th>الانصراف</th>
      <th>ساعات الدوام</th>
      <th>التأخر</th>
      <th>الاستئذان</th>
      <th>الحالة</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml || `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:14px">لا توجد أيام مسجلة لهذا الشهر</td></tr>`}
  </tbody>
</table>

${excuses.length ? `
<div class="section-title">سجل الاستئذانات${excusesRange ? ` (${safe(excusesRange.from)} → ${safe(excusesRange.to)})` : ""} — ${excuses.length} طلب</div>
<table class="daily">
  <colgroup>
    <col class="c-day"><col class="c-time"><col class="c-time"><col class="c-work"><col class="c-exc"><col class="c-late"><col class="c-status">
  </colgroup>
  <thead>
    <tr>
      <th>اليوم والتاريخ</th>
      <th>من وقت</th>
      <th>إلى وقت</th>
      <th>المدة</th>
      <th>نوع الاستئذان</th>
      <th>موقع الاستئذان</th>
      <th>حالة الطلب</th>
    </tr>
  </thead>
  <tbody>
    ${excuseRowsHtml}
  </tbody>
</table>` : ""}

<div class="foot">وفق منصة حضوري الرسمية لتسهيل المتابعة · ${safe(schoolName)}</div>

<script>
  // اضبط اسم الملف الافتراضي عند الحفظ كـ PDF ليكون "كشف حضوري شهري - اسم المعلم - الشهر"
  try {
    var rawName = ${JSON.stringify(teacher.name || "معلم")};
    var rawMonth = ${JSON.stringify(monthLabel || "")};
    var safeName = String(rawName).replace(/[\\\\\\/:*?"<>|]/g, "").trim();
    var safeMonth = String(rawMonth).replace(/[\\\\\\/:*?"<>|]/g, "").trim();
    var title = "كشف حضوري شهري - " + safeName + (safeMonth ? " - " + safeMonth : "");
    document.title = title;
  } catch(e) {}
</script>

</body></html>`;
}
