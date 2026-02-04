
import { code39Svg } from "./barcode.js";
import { fmtTs } from "./util.js";

function openPrint(html, title="طباعة"){
  const w = window.open("", "_blank", "noopener,noreferrer");
  if(!w) throw new Error("المتصفح منع نافذة الطباعة. فعّل النوافذ المنبثقة.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
  // allow fonts/layout
  setTimeout(()=>w.print(), 350);
}

function headerBlock(settings){
  const edu = settings.eduAdmin || "الإدارة العامة للتعليم بالمنطقة الشرقية";
  const sector = settings.sector || "قطاع الخبر";
  const school = settings.schoolName || "ثانوية اليعقوبي الثانوية";
  const leader = settings.leader || "فهد حامد علي الزهراني";
  return `
    <div class="printHeader">
      <div class="printHeader__top">
        <div class="printHeader__school">
          <div>${escapeHtml(edu)}</div>
          <div>${escapeHtml(sector)}</div>
          <div>${escapeHtml(school)}</div>
        </div>
        <div class="printHeader__meta">
          <div>قائد المدرسة: ${escapeHtml(leader)}</div>
          <div>تاريخ الطباعة: ${escapeHtml(new Date().toLocaleDateString("ar-SA"))}</div>
        </div>
      </div>
    </div>
  `;
}

export function printClassSheet({settings, type, grade, section, term, hijri, students}){
  const title = type === "LATE" ? "كشف التأخر" : "كشف الغياب";
  const sub = `الصف: ${grade || "-"} • الشعبة: ${section || "-"} • الفصل: ${term || "-"} • العام: ${hijri || "-"}`;

  const rows = students.map((s, idx)=>{
    const svg = code39Svg(s.nid, {height:34, showText:false});
    return `
      <tr>
        <td style="text-align:center">${idx+1}</td>
        <td>${escapeHtml(s.name || "")}</td>
        <td class="box"></td>
        <td class="box"></td>
        <td class="box"></td>
        <td class="box"></td>
        <td class="box"></td>
        <td class="printBarcode" style="text-align:center">${svg}</td>
      </tr>
    `;
  }).join("");

  const html = `
<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${basePrintCss()}
.box{height:22px}
</style></head><body>
<div class="printPage">
  ${headerBlock(settings)}
  <div class="printTitle">${escapeHtml(title)}</div>
  <div class="printSub">${escapeHtml(sub)}</div>
  <table class="printTable">
    <thead>
      <tr>
        <th style="width:34px">م</th>
        <th>اسم الطالب</th>
        <th style="width:70px">الأحد</th>
        <th style="width:70px">الإثنين</th>
        <th style="width:70px">الثلاثاء</th>
        <th style="width:70px">الأربعاء</th>
        <th style="width:70px">الخميس</th>
        <th style="width:190px">باركود الهوية</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body></html>`;
  openPrint(html, title);
}

export function printSmallCard({settings, student, kind, counts, behaviorTitle=""}){
  const school = settings.schoolName || "ثانوية اليعقوبي الثانوية";
  const h = kind === "LATE" ? "كرت تأخر" : kind === "ABSENT" ? "كرت غياب" : "كرت مخالفة سلوكية";
  const cLate = counts?.LATE ?? 0;
  const cAbs = counts?.ABSENT ?? 0;
  const cBeh = counts?.BEHAVIOR ?? 0;
  const svg = code39Svg(student?.nid || "", {height:36, showText:true});

  const line = kind === "BEHAVIOR"
    ? `<div class="k"><b>المخالفة:</b> ${escapeHtml(behaviorTitle || "—")}</div>`
    : ``;

  const html = `
<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(h)}</title>
<style>${basePrintCss()}</style></head><body>
  <div class="printSmallCard">
    <div class="h">${escapeHtml(school)} • ${escapeHtml(h)}</div>
    <div class="k"><b>الطالب:</b> ${escapeHtml(student?.name || "")}</div>
    <div class="k"><b>الصف/الشعبة:</b> ${escapeHtml(student?.grade || "")} / ${escapeHtml(student?.section || "")}</div>
    <div class="k"><b>إحصاء:</b> تأخر (${cLate}) • غياب (${cAbs}) • سلوك (${cBeh})</div>
    ${line}
    <div class="b">${svg}</div>
    <div class="k" style="text-align:center; font-size:11px; margin-top:6px">تاريخ: ${escapeHtml(new Date().toLocaleDateString("ar-SA"))}</div>
  </div>
</body></html>`;
  openPrint(html, h);
}

export function printBulkCards({settings, title, students, countsByNid}){
  const cards = students.map(s=>{
    const counts = countsByNid?.[s.nid] || {LATE:0, ABSENT:0, BEHAVIOR:0};
    const svg = code39Svg(s.nid, {height:34, showText:true});
    return `
      <div class="printSmallCard">
        <div class="h">${escapeHtml(title)}</div>
        <div class="k"><b>الطالب:</b> ${escapeHtml(s.name||"")}</div>
        <div class="k"><b>الصف/الشعبة:</b> ${escapeHtml(s.grade||"")} / ${escapeHtml(s.section||"")}</div>
        <div class="k"><b>إحصاء:</b> تأخر (${counts.LATE||0}) • غياب (${counts.ABSENT||0}) • سلوك (${counts.BEHAVIOR||0})</div>
        <div class="b">${svg}</div>
      </div>
    `;
  }).join("");

  const html = `
<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${basePrintCss()}</style></head><body>
${cards}
</body></html>`;
  openPrint(html, title);
}

function basePrintCss(){
  // Minimal print CSS only (no app UI)
  return `
body{font-family:system-ui, Arial; margin:0; padding:0; background:#fff; color:#000}
.printHeader{display:flex; flex-direction:column; gap:6px; padding:12px 12px 6px; border-bottom:1px solid #000}
.printHeader__top{display:flex; align-items:flex-start; justify-content:space-between; gap:12px}
.printHeader__school{font-weight:900; font-size:13px; line-height:1.5}
.printHeader__meta{font-size:12px; text-align:left}
.printTitle{font-size:16px; font-weight:1000; text-align:center; margin:8px 0}
.printSub{font-size:12px; text-align:center; margin-top:-4px}
table.printTable{width:100%; border-collapse:collapse; font-size:11px}
table.printTable th, table.printTable td{border:1px solid #000; padding:6px; vertical-align:middle}
table.printTable th{background:#f2f2f2}
.printBarcode svg{height:34px; width:170px}
.printSmallCard{width: 80mm; border:1px solid #000; padding:8px; border-radius:8px; margin:0 auto 6mm; page-break-inside:avoid}
.printSmallCard .h{font-weight:1000; text-align:center; margin-bottom:6px}
.printSmallCard .k{font-size:12px; margin:4px 0}
.printSmallCard .b{display:flex; justify-content:center; margin-top:8px}
.printSmallCard .b svg{height:44px; width:180px}
@page{margin:10mm}
`;
}

function escapeHtml(s){
  return String(s??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&apos;");
}
