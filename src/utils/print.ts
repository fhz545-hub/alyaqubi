import { Student, SCHOOL_INFO } from "@/types/school";
import { getHijriDate, getHijriYear, getHijriDay } from "@/utils/hijri";
import { getCurrentAcademicWeek } from "@/utils/academicWeeks";

const MOE_LOGO_URL = "/images/moe-education-logo.png";

// Shared official header HTML & CSS for all A4 documents
const getOfficialHeaderCSS = () => `
  .official-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 8px;
    margin-bottom: 6px;
    border-bottom: 2.5px solid #000;
  }
  .official-header .right-side {
    text-align: center;
    font-weight: 700;
    line-height: 1.7;
    color: #000;
  }
  .official-header .right-side p {
    margin: 0;
    font-size: 10px;
  }
  .official-header .right-side p:first-child {
    font-size: 11px;
    font-weight: 800;
  }
  .official-header .right-side p:last-child {
    font-size: 11px;
    font-weight: 800;
  }
  .official-header .center-logo {
    text-align: center;
    flex-shrink: 0;
    padding: 0 10px;
  }
  .official-header .center-logo img {
    height: 60px;
  }
  .official-header .left-side {
    text-align: center;
    font-weight: 600;
    line-height: 1.7;
    font-size: 10px;
    color: #000;
    min-width: 150px;
  }
  .official-header .left-side p {
    margin: 0;
  }
`;

const getOfficialHeaderHTML = (options?: { showAttachments?: string; showDate?: boolean }) => {
  const now = new Date();
  const dayName = getHijriDay(now);
  const dateStr = getHijriDate(now);
  const showDate = options?.showDate !== false;
  
  return `
    <div class="official-header">
      <div class="right-side">
        <p>${SCHOOL_INFO.kingdom}</p>
        <p>${SCHOOL_INFO.ministry}</p>
        <p>${SCHOOL_INFO.region}</p>
        <p>${SCHOOL_INFO.sector}</p>
        <p>${SCHOOL_INFO.school}</p>
      </div>
      <div class="center-logo">
        <img src="${MOE_LOGO_URL}" alt="شعار وزارة التعليم" onerror="this.style.display='none'" />
      </div>
      <div class="left-side">
        <p>الرقم: ..............</p>
        ${showDate ? `<p>اليوم: ${dayName}</p>` : ''}
        ${showDate ? `<p>التاريخ: ${dateStr}</p>` : ''}
        ${options?.showAttachments ? `<p>المشفوعات: ${options.showAttachments}</p>` : '<p>المرفقات:</p>'}
      </div>
    </div>
  `;
};


// Print thermal card (for Epson thermal printers ~58mm or 80mm)
export const printThermalCard = (
  student: Student,
  purpose: "late" | "violation" | "entry" | "exit" | "permission" | "exam-reentry",
  details?: string,
  extraData?: { absenceDate?: string; excused?: boolean; violationType?: string },
  userName?: string,
  archiveCounts?: { absences: number; lateCount: number }
) => {
  const now = new Date();
  const date = getHijriDate(now);
  const time = now.toTimeString().slice(0, 5);

  const purposeLabels: Record<string, string> = {
    late: "تأخر صباحي",
    violation: "مخالفة سلوكية",
    entry: "إذن دخول فصل",
    exit: "إذن خروج من فصل",
    permission: "إذن استئذان",
    "exam-reentry": "إذن إعادة اختبار",
  };

  const recipientMap: Record<string, string> = {
    late: "معلم الحصة",
    violation: "معلم الحصة",
    entry: "معلم الحصة",
    exit: "معلم الحصة",
    permission: "حارس المدرسة",
    "exam-reentry": "معلم المادة",
  };

  const iconMap: Record<string, string> = {
    entry: "🚪",
    exit: "🔓",
    permission: "📋",
    late: "⏰",
    violation: "⚠️",
    "exam-reentry": "📝",
  };

  // Minimal accent - light gray only for purpose banner
  const accent = { bg: "#f0f0f0" };

  const violationRow = purpose === "violation" && extraData?.violationType ? `
    <div class="info-row">
      <span class="info-label">نوع المخالفة</span>
      <span class="info-value" style="font-size:10px;max-width:60%;text-align:left">${extraData.violationType}</span>
    </div>
  ` : "";

  const extraRows = purpose === "exam-reentry" && extraData ? `
    <div class="info-row">
      <span class="info-label">تاريخ الغياب</span>
      <span class="info-value">${extraData.absenceDate || "-"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">نوع الغياب</span>
      <span class="info-value excuse-badge ${extraData.excused ? 'excused' : 'unexcused'}">${extraData.excused ? "بعذر" : "بدون عذر"}</span>
    </div>
  ` : "";

  const printWindow = window.open("", "_blank", "width=350,height=600");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>كرت طالب</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
          font-family: 'Cairo', sans-serif;
          width: 58mm;
          margin: 0 auto;
          padding: 1mm 2mm;
          font-size: 11px;
          color: #000;
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .card {
          border: 2px solid #000;
          border-radius: 4px;
          overflow: hidden;
          background: #fff;
        }

        .card-header {
          background: #fff;
          color: #000;
          padding: 6px 10px 4px;
          text-align: center;
          border-bottom: 2px solid #000;
        }
        .card-header .school-logo {
          height: 26px;
          margin-bottom: 3px;
          filter: grayscale(100%) brightness(0);
        }
        .card-header .school-name {
          font-size: 10px;
          font-weight: 900;
          color: #000;
          letter-spacing: 0.3px;
        }
        .card-header .region-name {
          font-size: 8px;
          color: #000;
          font-weight: 700;
        }

        .purpose-banner {
          background: ${accent.bg};
          border-bottom: 2px solid #000;
          padding: 6px 10px;
          text-align: center;
        }
        .purpose-text {
          font-size: 13px;
          font-weight: 900;
          color: #000;
          letter-spacing: 0.5px;
        }

        .recipient-bar {
          border-bottom: 1px solid #000;
          padding: 4px 10px;
          text-align: center;
          font-size: 11px;
          font-weight: 800;
          color: #000;
        }

        .student-section {
          padding: 8px 10px;
          border-bottom: 1px solid #000;
          text-align: center;
        }
        .student-label {
          font-size: 10px;
          font-weight: 700;
          color: #000;
          margin-bottom: 1px;
        }
        .student-name {
          font-size: 16px;
          font-weight: 900;
          color: #000;
          line-height: 1.3;
          margin-bottom: 4px;
        }
        .student-grade {
          font-size: 12px;
          font-weight: 800;
          color: #000;
        }

        .card-body {
          padding: 6px 10px;
          border-bottom: 1px solid #000;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 3px 0;
        }
        .info-row + .info-row {
          border-top: 1px dashed #000;
        }
        .info-label {
          font-size: 11px;
          font-weight: 800;
          color: #000;
        }
        .info-value {
          font-size: 12px;
          font-weight: 900;
          color: #000;
        }

        .excuse-badge {
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 900;
          border: 1px solid #000;
          background: #fff;
        }
        .excuse-badge.excused {
          background: #fff;
        }
        .excuse-badge.unexcused {
          background: #fff;
        }

        .details-box {
          padding: 5px 10px;
          border-bottom: 1px solid #000;
          font-size: 11px;
          font-weight: 700;
          color: #000;
        }
        .details-box .details-label {
          font-size: 9px;
          color: #000;
          font-weight: 800;
          margin-bottom: 2px;
        }

        .datetime-bar {
          display: flex;
          justify-content: space-around;
          padding: 5px 10px;
          border-bottom: 1px solid #000;
        }
        .datetime-item {
          text-align: center;
        }
        .datetime-item .dt-label {
          font-size: 9px;
          color: #000;
          font-weight: 700;
        }
        .datetime-item .dt-value {
          font-size: 12px;
          font-weight: 900;
          color: #000;
        }

        .card-footer {
          background: #fff;
          color: #000;
          padding: 4px 10px;
          text-align: center;
          font-size: 9px;
          font-weight: 700;
          border-top: 1px solid #000;
          letter-spacing: 0.3px;
        }
        .validity-note {
          text-align: center;
          font-size: 8px;
          font-weight: 700;
          color: #000;
          padding: 2px 10px;
          border-top: 1px dashed #000;
        }

        @media print {
          body { width: 58mm; margin: 0 auto; }
          @page { size: 58mm auto; margin: 0mm 1mm; }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="card-header">
          <img class="school-logo" src="${MOE_LOGO_URL}" alt="شعار" onerror="this.style.display='none'" />
          <div class="school-name">${SCHOOL_INFO.school}</div>
          <div class="region-name">${SCHOOL_INFO.sector}</div>
        </div>

        <div class="purpose-banner">
          <span class="purpose-text">${purposeLabels[purpose]}</span>
        </div>

        <div class="recipient-bar">
          موجّه إلى: ${recipientMap[purpose]}
        </div>

        <div class="student-section">
          <div class="student-label">الطالب</div>
          <div class="student-name">${student.name}</div>
          <div class="student-grade">${student.grade} — فصل ${student.section}</div>
        </div>

        ${violationRow ? `<div class="card-body">${violationRow}</div>` : ""}
        ${extraRows ? `<div class="card-body">${extraRows}</div>` : ""}

        ${archiveCounts && (archiveCounts.absences > 0 || archiveCounts.lateCount > 0) ? `
          <div class="card-body" style="background:#f8f8f8;">
            <div style="text-align:center;font-size:9px;font-weight:800;margin-bottom:3px;color:#000;">أرشيف الطالب</div>
            <div style="display:flex;justify-content:space-around;">
              <div style="text-align:center;">
                <div style="font-size:16px;font-weight:900;color:#000;">${archiveCounts.absences}</div>
                <div style="font-size:8px;font-weight:700;color:#000;">أيام غياب</div>
              </div>
              <div style="border-right:1px solid #000;"></div>
              <div style="text-align:center;">
                <div style="font-size:16px;font-weight:900;color:#000;">${archiveCounts.lateCount}</div>
                <div style="font-size:8px;font-weight:700;color:#000;">أيام تأخر</div>
              </div>
            </div>
          </div>
        ` : ""}

        <div class="datetime-bar">
          <div class="datetime-item">
            <div class="dt-label">التاريخ</div>
            <div class="dt-value">${date}</div>
          </div>
          <div class="datetime-item">
            <div class="dt-label">الوقت</div>
            <div class="dt-value">${time}</div>
          </div>
        </div>

        ${details ? `
          <div class="details-box">
            <div class="details-label">ملاحظة</div>
            ${details}
          </div>
        ` : ""}

        <div class="validity-note">⏱ صلاحية الكرت: 5 دقائق من وقت الطباعة</div>
        <div class="card-footer">
          ${SCHOOL_INFO.school}${userName ? ` — ${userName}` : ''}
        </div>
      </div>

      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// Print A4 attendance sheet per section (weekly - Sun to Thu)
export const printAttendanceSheet = (gradeCode: string, section: number, type: "late" | "absent", studentsList: Student[]) => {
  
  const sectionStudents = studentsList
    .filter((s) => s.gradeCode === gradeCode && s.section === section)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const grade = studentsList.find((s) => s.gradeCode === gradeCode)?.grade || "";
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const title = type === "late" ? "كشف متابعة التأخر الصباحي" : "كشف متابعة الغياب";
  const titleColor = type === "late" ? "#b45309" : "#dc2626";

  const now = new Date();
  const dateStr = getHijriDate(now);
  const acWeek = getCurrentAcademicWeek(now);
  const weekNum = acWeek ? acWeek.weekNumber : "-";
  
  // Get hijri date range for the week (Sun to Thu)
  const getWeekDateRange = () => {
    const d = new Date(now);
    const dayOfWeek = d.getDay(); // 0=Sun
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    const thursday = new Date(sunday);
    thursday.setDate(sunday.getDate() + 4);
    const fmt = (dt: Date) => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "short" }).format(dt);
    return `${fmt(sunday)} — ${fmt(thursday)}`;
  };
  const weekDateRange = getWeekDateRange();

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

const rows = sectionStudents.map((s: Student, i: number) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${s.name}</td>
      ${days.map(() => `<td class="day"></td>`).join("")}
      <td class="barcode-cell"><svg class="barcode-svg" data-value="${s.studentNumber}"></svg></td>
    </tr>
  `).join("");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${title} - ${grade} فصل ${section}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 3mm 5mm; font-size: 10px; color: #111; }
        @page { size: A4 portrait; margin: 3mm; }
        
        ${getOfficialHeaderCSS()}
        
        .title {
          text-align: center; font-size: 16px; font-weight: 900; margin: 4px 0; padding: 4px 0;
          border: 2.5px solid ${titleColor}; background: ${type === "late" ? "#fef3c7" : "#fee2e2"};
          color: ${titleColor}; letter-spacing: 1px;
        }
        .meta {
          display: flex; justify-content: center; align-items: center; gap: 20px;
          margin-bottom: 4px; font-size: 11px; font-weight: 700; color: #333;
          text-align: center;
        }
        .meta span { display: inline-block; }
        
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 2px solid #333; text-align: center; vertical-align: middle; }
        th {
          background: #d4d4d4; font-weight: 900; font-size: 10px;
          padding: 3px 2px; color: #111; white-space: nowrap;
        }
        td { font-size: 9px; padding: 1px 2px; height: 24px; }
        
        td.num { width: 22px; font-weight: 800; font-size: 8px; }
        td.name {
          width: 90px; text-align: right; font-size: 8px; font-weight: 900; color: #000;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          padding-right: 3px; padding-left: 1px;
        }
        td.day { width: 42px; }
        td.barcode-cell { width: 140px; padding: 3px 6px; height: 24px; text-align: center; vertical-align: middle; }
        td.barcode-cell svg { width: 100%; height: 18px; display: block; }
        
        .footer {
          margin-top: 10px; display: flex; justify-content: space-between;
          font-size: 11px; page-break-inside: avoid; break-inside: avoid;
        }
        .footer .sig { display: flex; align-items: center; gap: 6px; }
        .footer .sig .lbl { font-weight: 900; font-size: 12px; }
        .footer .sig .name { font-weight: 700; font-size: 11px; }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML({ showAttachments: title })}

      <div class="title">${title}</div>
      <div class="meta">
        <span>المرحلة: ${grade}</span>
        <span>الشعبة: ${section}</span>
        <span>الأسبوع: ${weekNum}</span>
        <span>${weekDateRange}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:22px">م</th>
            <th style="width:90px">اسم الطالب</th>
            ${days.map((d) => `<th style="width:42px">${d}</th>`).join("")}
            <th style="width:140px">الباركود</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="footer">
        <div class="sig">
          <span class="lbl">${SCHOOL_INFO.viceTitle}:</span>
          <span class="name">${SCHOOL_INFO.viceName}</span>
        </div>
        <div class="sig">
          <span class="lbl">${SCHOOL_INFO.principalTitle}:</span>
          <span class="name">${SCHOOL_INFO.principal}</span>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <script>
        window.onload = () => {
          document.querySelectorAll('.barcode-svg').forEach(svg => {
            const val = svg.getAttribute('data-value');
            if (val) {
              try {
                JsBarcode(svg, val, {
                  format: 'CODE128',
                  width: 1.5,
                  height: 20,
                  displayValue: false,
                  margin: 0,
                  background: '#ffffff',
                  lineColor: '#000000'
                });
              } catch(e) { console.error(e); }
            }
          });
          setTimeout(() => { window.print(); }, 500);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// Print official A4 summon document
export const printOfficialDocument = (
  student: Student,
  type: "summon" | "violation" | "general",
  content: string,
  summonDate?: string
) => {
  const now = new Date();
  const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(now);
  const dateStr = getHijriDate(now);

  const titles: Record<string, string> = {
    summon: "خطاب استدعاء ولي أمر طالب",
    violation: "إشعار مخالفة سلوكية وفق قواعد السلوك والمواظبة",
    general: "إشعار رسمي",
  };

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const summonDateDisplay = summonDate || dateStr;

  const summonBody = type === "summon" ? `
    <p style="line-height:2.2; font-size:14px; text-align:justify;">
      المكرم ولي أمر الطالب / <strong>${student.name}</strong> &nbsp;&nbsp; بالصف / <strong>${student.grade} - فصل ${student.section}</strong>
    </p>
    <p style="font-size:14px; margin-top:10px;">السلام عليكم ورحمة الله وبركاته .. وبعد</p>
    <p style="line-height:2.4; font-size:14px; text-align:justify; margin-top:8px;">
      نظراً لأهمية التعاون والتنسيق بين المدرسة والمنزل، واطلاع ولي أمر الطالب على ما يستجد في جانب السلوك والمواظبة لابنه، وسعياً من المدرسة للأخذ بيد الطالب إلى بر الأمان ومساعدته على التغلب على مشكلاته والصعوبات التي تواجهه.
    </p>
    <p style="line-height:2.4; font-size:14px; text-align:justify; margin-top:8px;">
      يرجى منكم التكرم بالحضور إلى المدرسة يوم الموافق <strong>${summonDateDisplay}</strong> في تمام الساعة (09:00 ص) لمقابلة وكيل المدرسة ${SCHOOL_INFO.viceName} لأمر هام يتعلق بابنكم.
    </p>
    ${content ? `<p style="line-height:2; font-size:14px; margin-top:8px;"><strong>ملاحظات:</strong> ${content}</p>` : ""}
    <p style="font-size:14px; margin-top:10px;">في حالة الاعتذار عن الحضور، نأمل إبلاغنا بذلك.</p>
    <p style="font-size:14px; margin-top:6px;">شاكرين لكم حسن تعاونكم وتجاوبكم معنا لتحقيق مصلحته.</p>
  ` : `
    <div style="margin:15px 0;">
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:8px 12px; font-weight:700; width:120px; border:1.5px solid #333; background:#f5f5f5;">اسم الطالب:</td><td style="padding:8px 12px; border:1.5px solid #333; font-size:14px;">${student.name}</td><td style="font-weight:700; width:100px; padding:8px 12px; border:1.5px solid #333; background:#f5f5f5;">رقم الهوية:</td><td style="padding:8px 12px; border:1.5px solid #333; font-size:14px;">${student.studentNumber}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:700; border:1.5px solid #333; background:#f5f5f5;">المرحلة:</td><td style="padding:8px 12px; border:1.5px solid #333; font-size:14px;">${student.grade}</td><td style="font-weight:700; padding:8px 12px; border:1.5px solid #333; background:#f5f5f5;">الفصل:</td><td style="padding:8px 12px; border:1.5px solid #333; font-size:14px;">فصل ${student.section}</td></tr>
      </table>
    </div>
    <p style="font-size:14px; margin-top:10px;">السلام عليكم ورحمة الله وبركاته .. وبعد</p>
    <p style="line-height:2.2; font-size:14px; text-align:justify; margin-top:8px;">
      بناءً على ما نصت عليه قواعد السلوك والمواظبة المعتمدة من وزارة التعليم، نحيطكم علماً بأنه قد صدر بحق ابنكم الطالب المذكور أعلاه الإجراء التالي:
    </p>
    <div style="margin:15px 0; padding:14px; border:2px solid #333; background:#f9f9f9; font-size:14px; line-height:2;">
      <strong>وصف المخالفة / الإجراء:</strong><br/>
      ${content}
    </div>
    <p style="font-size:14px; line-height:2;">
      نأمل منكم التعاون مع إدارة المدرسة لتصحيح سلوك ابنكم، وتوجيهه بما يضمن انضباطه والتزامه بأنظمة المدرسة وقواعد السلوك والمواظبة.
    </p>
    <p style="font-size:14px; margin-top:6px;">وتقبلوا وافر التحية والتقدير.</p>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${titles[type]}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 20mm; font-size: 14px; line-height: 2; }
        @page { size: A4; margin: 15mm; }
        ${getOfficialHeaderCSS()}
        .title { text-align: center; font-size: 18px; font-weight: 800; margin: 10px 0; padding: 8px; border: 2px solid #333; background: #f5f5f5; }
        .note { font-size: 11px; color: #555; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 6px; }
        .footer { margin-top: 40px; display: flex; justify-content: space-around; page-break-inside: avoid; break-inside: avoid; }
        .footer .sig { display: flex; align-items: center; gap: 6px; }
        .footer .sig .lbl { font-weight: 800; font-size: 13px; }
        .footer .sig .name { font-size: 12px; font-weight: 600; }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML({ showAttachments: titles[type] })}

      <div class="title">${titles[type]}</div>

      ${summonBody}

      <div class="footer">
        <div class="sig">
          <span class="lbl">${SCHOOL_INFO.viceTitle}:</span>
          <span class="name">${SCHOOL_INFO.viceName}</span>
        </div>
        <div class="sig">
          <span class="lbl">${SCHOOL_INFO.principalTitle}:</span>
          <span class="name">${SCHOOL_INFO.principal}</span>
        </div>
      </div>

      <div class="note">
        ملحوظة: يسلم الأصل لولي الأمر ويحتفظ بصورة منه في المدرسة بعد التوقيع.
      </div>

      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// Print student archive report
export const printStudentArchive = (
  student: Student,
  actions: {
    type: string;
    date: string;
    time: string;
    period?: number;
    subjectName?: string;
    followupStage?: string;
    followupSequence?: number;
    description?: string;
    performedByName?: string;
    performedByRole?: string;
    dayName?: string;
  }[]
) => {
  const now = new Date();
  const dateStr = getHijriDate(now);

  const typeLabels: Record<string, string> = {
    late: "تأخر", absent: "غياب", violation: "مخالفة", permission: "استئذان",
    entry: "دخول فصل", exit: "خروج فصل", summon: "استدعاء",
    class_late: "تأخر عن الحصة",
    class_escape: "هروب من الحصة",
    class_chaos: "إثارة فوضى",
    no_homework: "عدم إحضار الواجب",
    sleeping: "نوم داخل الحصة",
    class_note: "ملاحظة صفية",
  };

  const counts: Record<string, number> = {};
  actions.forEach((a) => { counts[a.type] = (counts[a.type] || 0) + 1; });

  const educationalActionByType: Record<string, string> = {
    late: "تنبيه تربوي ومتابعة الانضباط الصباحي",
    absent: "إشعار ولي الأمر ومتابعة الانتظام الدراسي",
    violation: "تطبيق الإجراء التربوي وفق درجة المخالفة",
    permission: "توثيق الاستئذان ومتابعة الحالة",
    summon: "مراجعة ولي الأمر ومناقشة الخطة العلاجية",
    entry: "تنظيم دخول الطالب للفصل",
    exit: "تنظيم خروج الطالب من الفصل",
    class_late: "متابعة تربوية صفية",
    class_escape: "متابعة تربوية صفية",
    class_chaos: "متابعة تربوية صفية",
    no_homework: "متابعة تربوية صفية",
    sleeping: "متابعة تربوية صفية",
    class_note: "متابعة تربوية صفية",
  };

  const getDayName = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
    } catch { return ""; }
  };

  const rows = actions.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${typeLabels[a.type] || a.type}</td>
      <td>${a.dayName || getDayName(a.date)}</td>
      <td>${a.date}</td>
      <td>${a.time}</td>
      <td>${a.period ? `الحصة ${a.period}` : "-"}</td>
      <td>${a.subjectName || "-"}</td>
      <td>${a.followupSequence ? `تسلسل ${a.followupSequence}${a.followupStage ? ` • ${a.followupStage}` : ""}` : (a.followupStage || "-")}</td>
      <td>${a.description || "-"}</td>
      <td>${educationalActionByType[a.type] || "متابعة تربوية"}</td>
      <td>${a.performedByName ? `${a.performedByName}${a.performedByRole ? ` (${a.performedByRole})` : ""}` : "-"}</td>
    </tr>
  `).join("");

  const summaryHtml = Object.entries(counts).map(([t, c]) =>
    `<span style="display:inline-block;margin:0 8px;padding:4px 12px;border:1px solid #333;border-radius:6px;font-weight:700;">${typeLabels[t] || t}: ${c}</span>`
  ).join("");

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>تقرير الطالب - ${student.name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 15mm; font-size: 12px; }
        @page { size: A4 portrait; margin: 10mm; }
        ${getOfficialHeaderCSS()}
        .title { text-align: center; font-size: 18px; font-weight: 800; margin: 8px 0; }
        .student-info { display: flex; gap: 20px; margin: 10px 0; padding: 10px; border: 1.5px solid #333; background: #f9f9f9; font-size: 13px; font-weight: 600; flex-wrap: wrap; }
        .summary { text-align: center; margin: 12px 0; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1.5px solid #333; padding: 5px 6px; text-align: center; font-size: 11px; }
        th { background: #e8e8e8; font-weight: 800; font-size: 12px; }
        .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML({ showAttachments: 'تقرير شامل عن الطالب' })}
      <div class="title">تقرير شامل عن الطالب</div>
      <div class="student-info">
        <span>الاسم: ${student.name}</span>
        <span>رقم الهوية: ${student.studentNumber}</span>
        <span>المرحلة: ${student.grade}</span>
        <span>الفصل: فصل ${student.section}</span>
        <span>جوال ولي الأمر: ${student.guardianPhone || "غير مسجل"}</span>
      </div>
      <div class="summary">${summaryHtml}</div>
      <table>
        <thead><tr><th>م</th><th>نوع الإجراء</th><th>اليوم</th><th>التاريخ</th><th>الوقت</th><th>الحصة</th><th>المادة</th><th>تسلسل المتابعة</th><th>الوصف</th><th>الإجراء التربوي</th><th>بواسطة</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="11">لا توجد سجلات</td></tr>'}</tbody>
      </table>
      <div class="footer"><p>${SCHOOL_INFO.school} - ${SCHOOL_INFO.region} - ${getHijriYear(now)}هـ</p></div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// Print daily late/absent list
export const printDailyAttendanceList = (
  type: "late" | "absent",
  students: { name: string; grade: string; section: number; time: string; studentNumber: string }[],
  dateStr: string,
  dayName: string
) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const title = type === "late" ? "كشف المتأخرين اليومي" : "كشف الغائبين اليومي";
  const titleColor = type === "late" ? "#b45309" : "#dc2626";
  const titleBg = type === "late" ? "#fef3c7" : "#fee2e2";
  const headerBg = type === "late" ? "#f59e0b" : "#dc2626";

  const rows = students.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${s.name}</td>
      <td>${s.grade}</td>
      <td>${s.section}</td>
      <td class="time">${s.time || "-"}</td>
      <td class="sig"></td>
    </tr>
  `).join("");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${title} - ${dateStr}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 12mm; font-size: 11px; color: #111; }
        @page { size: A4 portrait; margin: 10mm; }
        ${getOfficialHeaderCSS()}
        .title-box {
          text-align: center; margin: 10px 0; padding: 10px 20px;
          border: 3px solid ${titleColor}; border-radius: 10px; background: ${titleBg};
        }
        .title-box h1 { font-size: 22px; font-weight: 900; color: ${titleColor}; letter-spacing: 2px; margin: 0; }
        .title-box .sub { font-size: 13px; font-weight: 700; color: #555; margin-top: 4px; }
        .meta {
          display: flex; justify-content: space-between; align-items: center;
          margin: 12px 0; padding: 8px 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e0e0e0;
        }
        .meta span { font-size: 13px; font-weight: 700; }
        .meta .count { font-size: 16px; font-weight: 900; color: ${titleColor}; background: ${titleBg}; padding: 2px 12px; border-radius: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: ${headerBg}; color: #fff; font-weight: 800; font-size: 12px; padding: 8px 6px; border: 1.5px solid #333; }
        td { border: 1.5px solid #444; text-align: center; vertical-align: middle; padding: 6px 4px; font-size: 11px; }
        tr:nth-child(even) { background: #f9f9f9; }
        td.num { width: 30px; font-weight: 800; }
        td.name { text-align: right; padding-right: 8px; font-weight: 700; font-size: 12px; }
        td.time { font-weight: 800; font-family: monospace; font-size: 12px; }
        td.sig { width: 80px; }
        .footer { margin-top: 20px; display: flex; justify-content: space-between; page-break-inside: avoid; break-inside: avoid; }
        .footer .sig-box { display: flex; align-items: center; gap: 6px; }
        .footer .sig-box .lbl { font-weight: 900; font-size: 12px; }
        .footer .sig-box .name { font-weight: 700; font-size: 11px; }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML({ showAttachments: title })}

      <div class="title-box">
        <h1>${title}</h1>
        <div class="sub">${dayName} — ${dateStr}</div>
      </div>

      <div class="meta">
        <span>إجمالي ${type === "late" ? "المتأخرين" : "الغائبين"}: <span class="count">${students.length}</span></span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:30px">م</th>
            <th>اسم الطالب</th>
            <th style="width:100px">المرحلة</th>
            <th style="width:50px">الفصل</th>
            <th style="width:60px">${type === "late" ? "وقت الحضور" : "ملاحظات"}</th>
            <th style="width:80px">التوقيع</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" style="padding:20px;color:#999">لا يوجد ${type === "late" ? "متأخرون" : "غائبون"} اليوم</td></tr>`}
        </tbody>
      </table>

      <div class="footer">
        <div class="sig-box">
          <span class="lbl">${SCHOOL_INFO.viceTitle}:</span>
          <span class="name">${SCHOOL_INFO.viceName}</span>
        </div>
        <div class="sig-box">
          <span class="lbl">${SCHOOL_INFO.principalTitle}:</span>
          <span class="name">${SCHOOL_INFO.principal}</span>
        </div>
      </div>

      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ========== طباعة قائمة المؤشرات التنبيهية (كثيرو الغياب / التأخر / المخالفات) ==========
export interface AlertListStudent {
  name: string;
  grade: string;
  section: number;
  count: number;
  lastAction: string;
  hasReferral: boolean;
  referralDate?: string;
}

export const printAlertList = (
  alertType: "absent" | "late" | "violation" | "permission",
  students: AlertListStudent[],
  minCount: number = 3
) => {
  const now = new Date();
  const dateStr = getHijriDate(now);
  const hijriYear = getHijriYear(now);

  const titleMap: Record<string, string> = {
    absent: "كشف كثيري الغياب",
    late: "كشف كثيري التأخر",
    violation: "كشف كثيري المخالفات السلوكية",
    permission: "كشف كثيري الاستئذان",
  };

  const typeLabel: Record<string, string> = {
    absent: "غياب",
    late: "تأخر",
    violation: "مخالفة سلوكية",
    permission: "استئذان",
  };

  const filtered = students.filter(s => s.count >= minCount).sort((a, b) => b.count - a.count);

  const rows = filtered.map((s, i) => `
    <tr${i === 0 ? ' class="top-student"' : ''}>
      <td class="num">${i + 1}</td>
      <td class="name-cell">${s.name}</td>
      <td>${s.grade}</td>
      <td>${s.section}</td>
      <td>${typeLabel[alertType]}</td>
      <td class="count-cell">${s.count}</td>
      <td class="action-cell">${s.lastAction}</td>
      <td class="referral-cell">${s.hasReferral ? `<span class="ref-yes">نعم${s.referralDate ? ` (${s.referralDate})` : ''}</span>` : '<span class="ref-no">لا</span>'}</td>
    </tr>
  `).join("");

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${titleMap[alertType]}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 8mm 10mm; font-size: 11px; color: #111; }
        @page { size: A4 portrait; margin: 8mm; }
        
        ${getOfficialHeaderCSS()}
        
        .doc-title {
          text-align: center; font-size: 16px; font-weight: 900; margin: 8px 0;
          padding: 6px 0; border: 2px solid #333; background: #f0f0f0; color: #111;
        }
        .doc-meta {
          display: flex; justify-content: space-between; margin-bottom: 8px;
          font-size: 11px; font-weight: 700; color: #333;
        }
        .doc-note {
          text-align: center; font-size: 10px; font-weight: 600; color: #555;
          margin-bottom: 6px; font-style: italic;
        }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border: 1.5px solid #333; text-align: center; vertical-align: middle; padding: 5px 4px; }
        th { background: #d4d4d4; font-weight: 900; font-size: 10px; color: #000; }
        td { font-size: 10px; }
        td.num { width: 30px; font-weight: 800; }
        td.name-cell { text-align: right; padding-right: 8px; font-weight: 800; font-size: 11px; }
        td.count-cell { font-weight: 900; font-size: 13px; color: #b91c1c; }
        td.action-cell { font-size: 9px; font-weight: 700; }
        td.referral-cell { font-size: 9px; }
        .ref-yes { color: #b91c1c; font-weight: 900; }
        .ref-no { color: #059669; font-weight: 700; }
        tr.top-student { background: #fef2f2; }
        tr.top-student td.name-cell { color: #b91c1c; }
        
        .footer-sigs {
          display: flex; justify-content: space-between; margin-top: 20px;
          padding-top: 10px; border-top: 1.5px solid #333;
          font-size: 11px; font-weight: 800;
        }
        .sig-item { text-align: center; }
        .sig-item .sig-title { font-size: 10px; color: #555; margin-bottom: 2px; }
        .sig-item .sig-name { font-size: 12px; font-weight: 900; }
        .sig-line { border-bottom: 1px dotted #999; width: 120px; margin: 15px auto 0; }
        
        .regulation-note {
          margin-top: 12px; padding: 6px 10px; border: 1px solid #ccc;
          background: #f9f9f9; font-size: 9px; color: #555; font-weight: 600;
          text-align: center; border-radius: 4px;
        }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML()}
      
      <div class="doc-title">${titleMap[alertType]}</div>
      <div class="doc-meta">
        <span>التاريخ: ${dateStr}</span>
        <span>العام الدراسي: ${hijriYear}هـ</span>
        <span>الحد الأدنى: ${minCount} مرات فأكثر</span>
        <span>عدد الطلاب: ${filtered.length}</span>
      </div>
      <div class="doc-note">وفق قواعد السلوك والمواظبة — الإصدار الأخير</div>
      
      <table>
        <thead>
          <tr>
            <th style="width:30px">م</th>
            <th>اسم الطالب</th>
            <th style="width:80px">الصف</th>
            <th style="width:45px">الشعبة</th>
            <th style="width:80px">نوع الحالة</th>
            <th style="width:55px">التكرار</th>
            <th style="width:130px">آخر إجراء</th>
            <th style="width:90px">سبق تحويله</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8" style="padding:20px;color:#999">لا يوجد طلاب مستوفون</td></tr>'}
        </tbody>
      </table>
      
      <div class="footer-sigs">
        <div class="sig-item">
          <div class="sig-title">المعلم / المسؤول</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-item">
          <div class="sig-title">الموجه الطلابي</div>
          <div class="sig-name">عادل علي السبعان</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-item">
          <div class="sig-title">${SCHOOL_INFO.viceTitle}</div>
          <div class="sig-name">${SCHOOL_INFO.viceName}</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-item">
          <div class="sig-title">${SCHOOL_INFO.principalTitle}</div>
          <div class="sig-name">${SCHOOL_INFO.principal}</div>
          <div class="sig-line"></div>
        </div>
      </div>
      
      <div class="regulation-note">
        هذا الكشف صادر وفق قواعد السلوك والمواظبة المعتمدة — ويستخدم لأغراض المتابعة والتحويل الرسمي
      </div>

      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ========== طباعة خطاب استدعاء رسمي لولي أمر (من المؤشرات التنبيهية) ==========
export const printAlertSummonLetter = (
  studentName: string,
  grade: string,
  section: number,
  alertType: "absent" | "late" | "violation" | "permission",
  count: number,
  lastAction: string
) => {
  const now = new Date();
  const dateStr = getHijriDate(now);

  const typeLabel: Record<string, string> = {
    absent: "الغياب المتكرر",
    late: "التأخر المتكرر",
    violation: "المخالفات السلوكية المتكررة",
    permission: "الاستئذان المتكرر",
  };

  const body = `
    <p style="font-size:13px;line-height:2;text-align:justify;margin-top:15px;">
      سعادة ولي أمر الطالب / <strong>${studentName}</strong><br/>
      الصف: <strong>${grade} — فصل ${section}</strong>
    </p>
    <p style="font-size:12px;line-height:2.2;text-align:justify;margin-top:10px;">
      السلام عليكم ورحمة الله وبركاته، وبعد:
    </p>
    <p style="font-size:12px;line-height:2.2;text-align:justify;">
      نفيدكم بأنه قد تم رصد <strong>${typeLabel[alertType]}</strong> على نجلكم بعدد
      <strong>(${count}) ${count > 10 ? 'مرة' : 'مرات'}</strong>،
      وقد تم اتخاذ الإجراءات التربوية اللازمة وفق قواعد السلوك والمواظبة المعتمدة،
      وكان آخر إجراء تم: <strong>${lastAction}</strong>.
    </p>
    <p style="font-size:12px;line-height:2.2;text-align:justify;">
      لذا نأمل التكرم بالحضور إلى المدرسة للاطلاع على تفاصيل الحالة ومناقشة الخطوات اللازمة
      لضمان انتظام الطالب والتزامه، وذلك خلال أوقات الدوام الرسمي.
    </p>
    <p style="font-size:12px;line-height:2.2;text-align:justify;">
      شاكرين لكم حسن تعاونكم، ونسأل الله التوفيق للجميع.
    </p>
  `;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>خطاب استدعاء — ${studentName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 15mm 15mm; font-size: 12px; color: #111; }
        @page { size: A4 portrait; margin: 10mm; }
        ${getOfficialHeaderCSS()}
        .doc-title {
          text-align: center; font-size: 16px; font-weight: 900; margin: 12px 0 8px;
          padding: 6px 0; border-bottom: 2px solid #333;
        }
        .footer-sigs {
          display: flex; justify-content: space-between; margin-top: 40px;
          padding-top: 10px; font-size: 11px; font-weight: 800;
        }
        .sig-item { text-align: center; }
        .sig-item .sig-title { font-size: 10px; color: #555; margin-bottom: 2px; }
        .sig-item .sig-name { font-size: 12px; font-weight: 900; }
        .sig-line { border-bottom: 1px dotted #999; width: 120px; margin: 20px auto 0; }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML()}
      <div class="doc-title">خطاب استدعاء ولي أمر طالب</div>
      ${body}
      <div class="footer-sigs">
        <div class="sig-item">
          <div class="sig-title">ولي الأمر</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-item">
          <div class="sig-title">الموجه الطلابي</div>
          <div class="sig-name">عادل علي السبعان</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-item">
          <div class="sig-title">${SCHOOL_INFO.viceTitle}</div>
          <div class="sig-name">${SCHOOL_INFO.viceName}</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-item">
          <div class="sig-title">${SCHOOL_INFO.principalTitle}</div>
          <div class="sig-name">${SCHOOL_INFO.principal}</div>
          <div class="sig-line"></div>
        </div>
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ========== طباعة نموذج تعهد خطي رسمي ==========
export const printWrittenPledge = (
  studentName: string,
  grade: string,
  section: number,
  alertType: "absent" | "late" | "violation" | "permission",
  count: number,
  lastAction: string
) => {
  const now = new Date();
  const dateStr = getHijriDate(now);

  const typeLabel: Record<string, string> = {
    absent: "الغياب المتكرر",
    late: "التأخر المتكرر",
    violation: "المخالفات السلوكية المتكررة",
    permission: "الاستئذان المتكرر",
  };

  const typeDescMap: Record<string, string> = {
    absent: `تكرار الغياب عن المدرسة بدون عذر مقبول بعدد (${count}) مرات، مما يؤثر على تحصيله الدراسي ومستواه الأكاديمي`,
    late: `تكرار التأخر الصباحي عن الحضور للمدرسة بعدد (${count}) مرات، وعدم الالتزام بالحضور في الوقت المحدد`,
    violation: `تكرار المخالفات السلوكية بعدد (${count}) مرات، وعدم الالتزام بقواعد السلوك والمواظبة المعتمدة`,
    permission: `تكرار الاستئذان والخروج من المدرسة بعدد (${count}) مرات، مما يؤثر على انتظامه الدراسي`,
  };

  const commitmentMap: Record<string, string[]> = {
    absent: [
      "الانتظام في الحضور اليومي وعدم التغيب إلا بعذر مقبول ومثبت",
      "إحضار ما يثبت العذر خلال يومين من تاريخ الغياب",
      "التواصل المسبق مع المدرسة في حال وجود ظروف تستدعي الغياب",
      "الالتزام بجميع الإجراءات النظامية المترتبة في حال تكرار الغياب",
    ],
    late: [
      "الحضور إلى المدرسة قبل بداية الاصطفاف الصباحي",
      "عدم التأخر عن الحصص الدراسية",
      "الالتزام بالمواعيد المحددة للدوام المدرسي",
      "الالتزام بجميع الإجراءات النظامية المترتبة في حال تكرار التأخر",
    ],
    violation: [
      "الالتزام بقواعد السلوك والمواظبة المعتمدة من وزارة التعليم",
      "احترام المعلمين والإداريين والزملاء داخل المدرسة",
      "عدم تكرار أي مخالفة سلوكية",
      "الالتزام بجميع الإجراءات النظامية المترتبة في حال تكرار المخالفة",
    ],
    permission: [
      "عدم الاستئذان إلا للضرورة القصوى وبموافقة ولي الأمر",
      "تقديم ما يثبت الحاجة للاستئذان من ولي الأمر مسبقًا",
      "الالتزام بالبقاء داخل المدرسة طوال فترة الدوام",
      "الالتزام بجميع الإجراءات النظامية المترتبة في حال تكرار الاستئذان",
    ],
  };

  const commitments = commitmentMap[alertType] || commitmentMap.absent;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>تعهد خطي — ${studentName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; padding: 15mm 15mm; font-size: 12px; color: #111; }
        @page { size: A4 portrait; margin: 10mm; }
        ${getOfficialHeaderCSS()}
        .doc-title {
          text-align: center; font-size: 16px; font-weight: 900; margin: 14px 0 10px;
          padding: 8px 0; border-bottom: 2.5px solid #333; border-top: 2.5px solid #333;
        }
        .info-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px;
          margin: 12px 0; padding: 10px 14px; background: #f8f9fa;
          border: 1px solid #ddd; border-radius: 6px; font-size: 12px;
        }
        .info-grid .item { padding: 4px 0; }
        .info-grid .item span { font-weight: 800; }
        .section-title {
          font-size: 13px; font-weight: 800; margin: 14px 0 6px;
          padding-bottom: 4px; border-bottom: 1.5px solid #444;
        }
        .violation-box {
          padding: 10px 14px; background: #fff5f5; border: 1px solid #e0c0c0;
          border-radius: 6px; margin: 8px 0; line-height: 2;
        }
        .commitments { margin: 8px 0; padding: 0 10px; }
        .commitments li {
          padding: 5px 0; font-size: 12px; line-height: 1.9;
          border-bottom: 1px dotted #ddd; list-style-type: none;
          counter-increment: item;
        }
        .commitments li::before {
          content: counter(item) "- ";
          font-weight: 800; color: #333;
        }
        .commitments { counter-reset: item; }
        .consequence-box {
          padding: 10px 14px; background: #fffbeb; border: 1px solid #e0d5a0;
          border-radius: 6px; margin: 10px 0; font-size: 11px; line-height: 2;
        }
        .pledge-text {
          margin: 14px 0; font-size: 12px; line-height: 2.2; text-align: justify;
        }
        .sig-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px 40px;
          margin-top: 30px; font-size: 11px;
        }
        .sig-box { text-align: center; }
        .sig-box .sig-label { font-size: 10px; color: #555; font-weight: 700; margin-bottom: 2px; }
        .sig-box .sig-name { font-size: 12px; font-weight: 900; margin-bottom: 4px; }
        .sig-box .sig-line { border-bottom: 1px dotted #999; width: 150px; margin: 18px auto 0; }
        .sig-box .sig-sub { font-size: 9px; color: #777; margin-top: 3px; }
        .footer-officials {
          display: flex; justify-content: space-between; margin-top: 25px;
          padding-top: 10px; border-top: 1.5px solid #ccc;
        }
        .footer-officials .off-item { text-align: center; }
        .footer-officials .off-label { font-size: 9px; color: #555; }
        .footer-officials .off-name { font-size: 11px; font-weight: 800; }
        .footer-officials .off-line { border-bottom: 1px dotted #999; width: 100px; margin: 14px auto 0; }
      </style>
    </head>
    <body>
      ${getOfficialHeaderHTML({ showDate: true })}
      <div class="doc-title">نموذج تعهد خطي على الطالب وولي الأمر</div>

      <div class="info-grid">
        <div class="item">اسم الطالب: <span>${studentName}</span></div>
        <div class="item">الصف: <span>${grade} — فصل ${section}</span></div>
        <div class="item">نوع الحالة: <span>${typeLabel[alertType]}</span></div>
        <div class="item">عدد مرات التكرار: <span>${count} مرات</span></div>
        <div class="item">آخر إجراء: <span>${lastAction}</span></div>
        <div class="item">تاريخ التعهد: <span>${dateStr}</span></div>
      </div>

      <div class="section-title">أولًا: وصف المشكلة السلوكية</div>
      <div class="violation-box">
        تم رصد <strong>${typeDescMap[alertType]}</strong>،
        وقد تم اتخاذ الإجراءات التربوية اللازمة وفق قواعد السلوك والمواظبة — الإصدار الخامس (1447هـ)،
        وكان آخر إجراء: <strong>${lastAction}</strong>.
      </div>

      <div class="section-title">ثانيًا: الالتزامات المطلوبة</div>
      <p style="font-size:11px;color:#555;margin-bottom:4px;">يلتزم الطالب وولي الأمر بما يلي:</p>
      <ol class="commitments">
        ${commitments.map(c => `<li>${c}</li>`).join("")}
      </ol>

      <div class="section-title">ثالثًا: الإجراءات المترتبة على مخالفة التعهد</div>
      <div class="consequence-box">
        في حال عدم الالتزام بما ورد أعلاه، فإن إدارة المدرسة ستتخذ الإجراءات النظامية التالية وفق قواعد السلوك والمواظبة:
        حسم درجات من درجات السلوك، نقل الطالب إلى فصل آخر، تحويل الحالة إلى لجنة التوجيه الطلابي،
        رفع الحالة إلى إدارة التعليم، وأي إجراءات أخرى يقررها النظام.
      </div>

      <div class="pledge-text">
        <strong>أقر أنا الطالب / ${studentName}،</strong>
        بأنني اطلعت على ما ورد أعلاه وأتعهد بالالتزام بجميع البنود المذكورة، وأتحمل كامل المسؤولية في حال مخالفة هذا التعهد.
        <br/>
        <strong>وأقر أنا ولي أمر الطالب</strong> بأنني اطلعت على هذا التعهد وأتعهد بمتابعة نجلي والتواصل مع المدرسة لضمان التزامه.
      </div>

      <div class="sig-grid">
        <div class="sig-box">
          <div class="sig-label">توقيع الطالب</div>
          <div class="sig-name">${studentName}</div>
          <div class="sig-line"></div>
          <div class="sig-sub">التوقيع / البصمة</div>
        </div>
        <div class="sig-box">
          <div class="sig-label">توقيع ولي الأمر</div>
          <div class="sig-name">الاسم: .................................................</div>
          <div class="sig-line"></div>
          <div class="sig-sub">التوقيع / رقم الجوال</div>
        </div>
      </div>

      <div class="footer-officials">
        <div class="off-item">
          <div class="off-label">الموجه الطلابي</div>
          <div class="off-name">عادل علي السبعان</div>
          <div class="off-line"></div>
        </div>
        <div class="off-item">
          <div class="off-label">${SCHOOL_INFO.viceTitle}</div>
          <div class="off-name">${SCHOOL_INFO.viceName}</div>
          <div class="off-line"></div>
        </div>
        <div class="off-item">
          <div class="off-label">${SCHOOL_INFO.principalTitle}</div>
          <div class="off-name">${SCHOOL_INFO.principal}</div>
          <div class="off-line"></div>
        </div>
      </div>

      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};
