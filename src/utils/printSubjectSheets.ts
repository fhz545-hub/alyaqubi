import { Student } from "@/types/school";

const MOE_LOGO_URL = "/images/moe-education-logo.png";

export type SubjectSheetTemplate = "template1" | "template2" | "template3" | "template4";

export const SUBJECT_SHEET_TEMPLATES: Record<SubjectSheetTemplate, { label: string; description: string }> = {
  template1: { label: "كشف متابعة (مع الغياب)", description: "المهام الأدائية والمشاركة والتفاعل + الغياب" },
  template2: { label: "كشف متابعة (بدون الغياب)", description: "المهام الأدائية والمشاركة والتفاعل" },
  template3: { label: "كشف متابعة (مبسط)", description: "مهام أدائية + واجبات" },
  template4: { label: "متابعة الأعمال الطلابية", description: "مهام أدائية + واجبات + مشاريع" },
};

const getSharedCSS = (studentCount: number) => {
  const baseFontSize = studentCount > 40 ? 6 : studentCount > 35 ? 6.5 : studentCount > 30 ? 7 : studentCount > 25 ? 8 : 9;
  const rowHeight = studentCount > 40 ? 14 : studentCount > 35 ? 15 : studentCount > 30 ? 16 : studentCount > 25 ? 18 : 20;
  const nameFontSize = studentCount > 40 ? 6 : studentCount > 35 ? 6.5 : studentCount > 30 ? 7 : studentCount > 25 ? 8 : 9;

  return `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', sans-serif; padding: 2mm 4mm; font-size: ${baseFontSize}px; color: #111; direction: rtl; }
  @page { size: A4 landscape; margin: 2mm; }

  .header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding-bottom: 6px; margin-bottom: 4px; border-bottom: 3px solid #1a5c4d;
  }

  .header-right {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0;
    min-width: 200px; text-align: right;
  }
  .header-right p { font-size: 11px; font-weight: 800; margin: 0; color: #1a5c4d; line-height: 1.5; }

  .header-center {
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0;
    padding: 0 15px;
  }
  .header-center img { height: 55px; }

  .header-left {
    display: flex; flex-direction: column; align-items: flex-end; gap: 0;
    min-width: 180px; text-align: left;
  }
  .header-left p { font-size: 11px; font-weight: 800; margin: 0; color: #1a5c4d; line-height: 1.5; }

  .title-row {
    display: flex; align-items: center; justify-content: center; gap: 16px;
    background: linear-gradient(135deg, #1a5c4d, #2d8e7f);
    color: #fff; padding: 4px 20px; border-radius: 8px;
    font-weight: 900; letter-spacing: 1px;
    text-align: center; margin-bottom: 3px;
    box-shadow: 2px 3px 10px rgba(0,0,0,0.12);
  }
  .title-row .sheet-name { font-size: 13px; }
  .title-row .semester { font-size: 10px; opacity: 0.95; }

  .signatures {
    display: flex; justify-content: space-between; margin-top: 4px; padding: 0 10px;
    page-break-inside: avoid; break-inside: avoid;
  }
  .sig-block {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 800; color: #333;
  }
  .sig-block .sig-label { }
  .sig-block .sig-name { border-bottom: 1px solid #333; min-width: 100px; text-align: center; padding-bottom: 1px; }

  table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  th, td { border: 1.5px solid #333; text-align: center; vertical-align: middle; }
  th {
    background: #1a5c4d; color: #fff; font-weight: 800; font-size: ${baseFontSize - 1}px;
    padding: 2px 1px; white-space: nowrap;
  }
  th.sub-header { background: #2d8e7f; font-size: ${baseFontSize - 2}px; }
  td { font-size: ${baseFontSize}px; padding: 0px 1px; height: ${rowHeight}px; }
  td.num { width: 18px; font-weight: 800; background: #f8fffe; }
  td.name {
    text-align: right; font-size: ${nameFontSize}px; font-weight: 800; color: #000;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding-right: 3px; min-width: 100px; max-width: 140px;
  }
  td.grade-cell { width: 24px; }
  tr:nth-child(even) td:not(.num):not(.name) { background: #f8fffe; }
`;
};

const getHeaderHTML = (subjectName: string, teacherName: string, grade: string, section: number, template: SubjectSheetTemplate) => {
  return `
    <div class="header">
      <div class="header-right">
        <p>الإدارة العامة للتعليم بالمنطقة الشرقية</p>
        <p>مدرسة اليعقوبي الثانوية</p>
      </div>
      <div class="header-center">
        <img src="${MOE_LOGO_URL}" alt="شعار وزارة التعليم" onerror="this.style.display='none'" />
      </div>
      <div class="header-left">
        <p>${grade} / ${section}</p>
        <p>المادة: ${subjectName}</p>
      </div>
    </div>

    <div class="title-row">
      <span class="sheet-name">${SUBJECT_SHEET_TEMPLATES[template].label}</span>
      <span class="semester">— الفصل الدراسي الثاني من العام ١٤٤٧هـ</span>
    </div>
  `;
};

const getFooterHTML = (teacherName: string) => {
  return `
    <div class="signatures">
      <div class="sig-block">
        <span class="sig-label">معلم المادة:</span>
        <span class="sig-name">${teacherName}</span>
      </div>
    </div>
  `;
};

const generateGradeCells = (count: number) => Array(count).fill('<td class="grade-cell"></td>').join("");

const getTemplate1HTML = (students: Student[]) => {
  const taskCols = 5;
  const rows = students.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${s.name}</td>
      <td class="grade-cell"></td>
      ${generateGradeCells(taskCols)}
      ${generateGradeCells(taskCols)}
      ${generateGradeCells(taskCols)}
      ${generateGradeCells(taskCols)}
      ${generateGradeCells(taskCols)}
      <td class="grade-cell"></td>
      <td class="grade-cell"></td>
      <td class="grade-cell"></td>
    </tr>
  `).join("");

  return `
    <table>
      <thead>
        <tr>
          <th rowspan="2" style="width:20px">م</th>
          <th rowspan="2" style="min-width:110px">الاســـــم</th>
          <th rowspan="2">الغياب</th>
          <th colspan="${taskCols * 5}">المهام الأدائية والمشاركة والتفاعل 40 درجة</th>
          <th colspan="2" rowspan="1">تقويم تحريري وتطبيقات عملية<br/>20 درجة</th>
          <th rowspan="2">المجموع<br/>60 درجة</th>
        </tr>
        <tr>
          <th class="sub-header" colspan="${taskCols}">.......... درجات</th>
          <th class="sub-header" colspan="${taskCols}">.......... درجات</th>
          <th class="sub-header" colspan="${taskCols}">.......... درجات</th>
          <th class="sub-header" colspan="${taskCols}">.......... درجات</th>
          <th class="sub-header" colspan="${taskCols}">.......... درجات</th>
          <th class="sub-header">نظـــري<br/>15 درجة</th>
          <th class="sub-header">عمـــلي<br/>5 درجة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const getTemplate2HTML = (students: Student[]) => {
  const rows = students.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${s.name}</td>
      ${generateGradeCells(5)}
      ${generateGradeCells(5)}
      ${generateGradeCells(5)}
      ${generateGradeCells(5)}
      ${generateGradeCells(5)}
      <td class="grade-cell"></td>
      <td class="grade-cell"></td>
      <td class="grade-cell"></td>
    </tr>
  `).join("");

  return `
    <table>
      <thead>
        <tr>
          <th rowspan="2" style="width:20px">م</th>
          <th rowspan="2" style="min-width:110px">الاســـــم</th>
          <th colspan="25">المهام الأدائية والمشاركة والتفاعل 40 درجة</th>
          <th colspan="2" rowspan="1">تقويم تحريري وتطبيقات عملية<br/>20 درجة</th>
          <th rowspan="2">المجموع<br/>60 درجة</th>
        </tr>
        <tr>
          <th class="sub-header" colspan="5">الواجبـــــــــــات<br/>10 درجات</th>
          <th class="sub-header" colspan="5">بحـث<br/>5 درجات</th>
          <th class="sub-header" colspan="5">الواجبـــــــــــــات<br/>10 درجات</th>
          <th class="sub-header" colspan="5">نشاطات وتطبيقات صفية<br/>10 درجات</th>
          <th class="sub-header" colspan="5">المشـــــــاركة<br/>10 درجات</th>
          <th class="sub-header">نظـــري<br/>15 درجة</th>
          <th class="sub-header">عمـــلي<br/>5 درجة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const getTemplate3HTML = (students: Student[]) => {
  const rows = students.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${s.name}</td>
      <td class="grade-cell"></td>
      ${generateGradeCells(8)}
      ${generateGradeCells(8)}
      ${generateGradeCells(8)}
      <td class="grade-cell"></td>
      <td class="grade-cell"></td>
      <td class="grade-cell"></td>
    </tr>
  `).join("");

  return `
    <table>
      <thead>
        <tr>
          <th rowspan="2" style="width:20px">م</th>
          <th rowspan="2" style="min-width:110px">الاســـــم</th>
          <th rowspan="2">الغياب</th>
          <th colspan="24">المهام الأدائية والمشاركة والتفاعل 40 درجة</th>
          <th colspan="2" rowspan="1">تقويم تحريري وتطبيقات عملية<br/>20 درجة</th>
          <th rowspan="2">المجموع<br/>60 درجة</th>
        </tr>
        <tr>
          <th class="sub-header" colspan="8">الواجبـــــــــــــات<br/>.......... درجات</th>
          <th class="sub-header" colspan="8">مهـــام أدائية وتطبيقـــات صفية<br/>.......... درجات</th>
          <th class="sub-header" colspan="8">المشـــــــاركة<br/>.......... درجات</th>
          <th class="sub-header">نظـــري<br/>15 درجة</th>
          <th class="sub-header">عمـــلي<br/>5 درجة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const getTemplate4HTML = (students: Student[]) => {
  const deliveryLegend = `
    <div style="display:flex;gap:12px;justify-content:flex-end;margin:3px 0;font-size:8px;font-weight:700;color:#333;">
      <span>△ تم التسليم في الوقت المحدد</span>
      <span>□ لم يتـــم التسليم إطلاقاً</span>
      <span>■ تم التسليم بعد انتهاء الوقت</span>
    </div>
  `;

  const rows = students.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${s.name}</td>
      ${generateGradeCells(6)}
      ${generateGradeCells(6)}
      ${generateGradeCells(6)}
      ${generateGradeCells(4)}
    </tr>
  `).join("");

  return `
    ${deliveryLegend}
    <table>
      <thead>
        <tr>
          <th style="width:20px">م</th>
          <th style="min-width:130px">الاسم</th>
          <th colspan="6">مهام أدائية</th>
          <th colspan="6">الواجبات</th>
          <th colspan="6">المشـــاركة</th>
          <th colspan="4">مشاريع</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

export const printSubjectSheet = (
  template: SubjectSheetTemplate,
  subjectName: string,
  teacherName: string,
  gradeCode: string,
  section: number,
  students: Student[]
) => {
  const sectionStudents = students
    .filter(s => s.gradeCode === gradeCode && s.section === section)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const grade = sectionStudents[0]?.grade || "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  let tableHTML = "";
  switch (template) {
    case "template1": tableHTML = getTemplate1HTML(sectionStudents); break;
    case "template2": tableHTML = getTemplate2HTML(sectionStudents); break;
    case "template3": tableHTML = getTemplate3HTML(sectionStudents); break;
    case "template4": tableHTML = getTemplate4HTML(sectionStudents); break;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>كشف متابعة - ${subjectName} - ${grade} فصل ${section}</title>
      <style>${getSharedCSS(sectionStudents.length)}</style>
    </head>
    <body>
      ${getHeaderHTML(subjectName, teacherName, grade, section, template)}
      ${tableHTML}
      ${getFooterHTML(teacherName)}
      <script>window.onload = () => { setTimeout(() => { window.print(); }, 300); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};
