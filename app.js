import { Store } from "./db.js";
import { BEHAVIOR_RULES, DEFAULT_ACTIONS } from "./rules.js";
import { sendSMS } from "./sms.js";

// ---- helpers
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const fmtDT = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("ar-SA",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
};
const todayAr = () => new Date().toLocaleDateString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"2-digit"});
const nowTime = () => new Date().toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

// Barcode (Code39) from assets/barcode.js
// The file defines window.generateBarcode(canvas, code)
async function ensureBarcodeLib(){
  if(window.generateBarcode) return;
  await new Promise((resolve, reject)=>{
    const s=document.createElement("script");
    s.src="assets/barcode.js";
    s.onload=resolve; s.onerror=reject;
    document.head.appendChild(s);
  });
}

function toast(msg, ok=true){
  const t=$("#toast");
  t.textContent=msg;
  t.style.background = ok ? "rgba(15,23,42,.92)" : "rgba(153,27,27,.92)";
  t.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT=setTimeout(()=>t.classList.remove("show"), 2800);
}

function setTab(id){
  $$(".tab").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.tab===id)));
  $$(".page").forEach(p=>p.hidden = p.id !== id);
  // scroll to top for clarity on mobile
  window.scrollTo({top:0, behavior:"smooth"});
}

function renderBadges(){
  const s=Store.state.settings;
  $("#bSchool").textContent = s.schoolName;
  $("#bTerm").textContent = `الفصل الدراسي ${s.term}`;
  $("#bYear").textContent = `1447هـ` === `${s.hijriYear}هـ` ? `${s.hijriYear}هـ` : `${s.hijriYear}هـ`;
}

function hydrateSettingsForm(){
  const s=Store.state.settings;
  $("#set_schoolName").value = s.schoolName;
  $("#set_educationOffice").value = s.educationOffice;
  $("#set_hijriYear").value = s.hijriYear;
  $("#set_term").value = s.term;
  $("#set_proxyUrl").value = s.proxyUrl;
  $("#set_proxyKey").value = s.proxyKey ? "••••••••" : "";
  $("#set_smsSender").value = s.smsSender;
  const m=$("#set_managerName"); if(m) m.value = s.managerName||"";
  const d=$("#set_deputyName"); if(d) d.value = s.deputyName||"";
  const c=$("#set_counselorName"); if(c) c.value = s.counselorName||"";
}

function saveSettingsFromForm(){
  const s=Store.state.settings;
  s.schoolName = $("#set_schoolName").value.trim() || s.schoolName;
  s.educationOffice = $("#set_educationOffice").value.trim() || s.educationOffice;
  s.hijriYear = $("#set_hijriYear").value.trim() || s.hijriYear;
  s.term = $("#set_term").value;
  s.proxyUrl = $("#set_proxyUrl").value.trim();
  // proxyKey: allow update only if user typed real value
  const pk = $("#set_proxyKey").value.trim();
  if(pk && pk !== "••••••••") s.proxyKey = pk;
  s.smsSender = $("#set_smsSender").value.trim() || s.smsSender;
  Store.save();
  renderBadges();
  toast("تم حفظ الإعدادات");
}

function renderTopSearchResults(items){
  if(!topSearchResultsEl) return;
  if(!items || items.length===0){ topSearchResultsEl.innerHTML=""; topSearchResultsEl.hidden=true; return; }
  topSearchResultsEl.hidden=false;
  topSearchResultsEl.innerHTML = items.map(s=>{
    return `<button class="result" data-nid="${s.nid}">
      <span>${s.name} <span class="muted">(${s.grade}/${s.section})</span></span>
      <span class="muted">${s.nid}</span>
    </button>`;
  }).join("");
}

function renderStudentCard(student){
  if(!student){
    $("#studentCard").innerHTML = `<div class="help">ابحث عن الطالب بالاسم أو رقم الهوية، ثم اختره من النتائج.</div>`;
    return;
  }
  const counts = Store.getCounts(student.nid);
  const html = `
    <div class="studentCard">
      <div class="kv">
        <div class="k">اسم الطالب</div><div class="v">${escapeHTML(student.name||"")}</div>
        <div class="k">رقم الهوية</div><div class="v">${escapeHTML(student.nid||"")}</div>
        <div class="k">الصف</div><div class="v">${escapeHTML(student.grade||"-")}</div>
        <div class="k">الشعبة</div><div class="v">${escapeHTML(student.section||"-")}</div>
        <div class="k">جوال ولي الأمر</div><div class="v">${escapeHTML(student.phone||"-")}</div>
        <div class="k">ملخص</div>
        <div class="v">
          <span class="pill warn">تأخر: ${counts.late}</span>
          <span class="pill bad" style="margin-inline-start:6px">غياب: ${counts.absent}</span>
          <span class="pill" style="margin-inline-start:6px">سلوك: ${counts.behavior}</span>
        </div>
      </div>
      <div class="barBox">
        <div class="mini">رمز الباركود</div>
        <canvas id="barCanvas" width="520" height="120" aria-label="barcode"></canvas>
        <div class="code">${escapeHTML(student.nid||"")}</div>
      </div>
    </div>
  `;
  $("#studentCard").innerHTML = html;
  ensureBarcodeLib().then(()=>{
    const c=$("#barCanvas");
    window.generateBarcode(c, String(student.nid||""));
  });
}


function renderStudentCardBeh(student){
  const box = $("#studentCardBeh");
  if(!box) return;
  if(!student){
    box.className = "help";
    box.innerHTML = "ارجع للرئيسية واختر الطالب ثم عد هنا.";
    return;
  }
  const counts = Store.getCounts(student.nid);
  box.className = "";
  box.innerHTML = `
    <div class="studentCard">
      <div class="kv">
        <div class="k">اسم الطالب</div><div class="v">${escapeHTML(student.name||"")}</div>
        <div class="k">رقم الهوية</div><div class="v">${escapeHTML(student.nid||"")}</div>
        <div class="k">الصف/الشعبة</div><div class="v">${escapeHTML(student.grade||"-")} / ${escapeHTML(student.section||"-")}</div>
        <div class="k">ملخص</div>
        <div class="v">
          <span class="pill warn">تأخر: ${counts.late}</span>
          <span class="pill bad" style="margin-inline-start:6px">غياب: ${counts.absent}</span>
          <span class="pill" style="margin-inline-start:6px">سلوك: ${counts.behavior}</span>
        </div>
      </div>
      <div class="barBox">
        <div class="mini">باركود الهوية</div>
        <canvas id="barCanvasBeh" width="520" height="120" aria-label="barcode"></canvas>
        <div class="code">${escapeHTML(student.nid||"")}</div>
      </div>
    </div>
  `;
  ensureBarcodeLib().then(()=>{
    const c=$("#barCanvasBeh");
    if(c) window.generateBarcode(c, String(student.nid||""));
  }).catch(()=>{});
}


function escapeHTML(s){
  return String(s||"").replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// ---- Search
function renderSearchResults(list){
  const box=$("#searchResults");
  if(!list.length){
    box.innerHTML = `<div class="small">لا توجد نتائج مطابقة.</div>`;
    return;
  }
  box.innerHTML = `
    <ul class="list">
      ${list.map(s=>`
        <li>
          <div>
            <div class="noWrap" style="font-weight:900">${escapeHTML(s.name)}</div>
            <div class="meta">هوية: ${escapeHTML(s.nid)} • الصف: ${escapeHTML(s.grade||"-")} • الشعبة: ${escapeHTML(s.section||"-")}</div>
          </div>
          <button class="btn primary" data-action="select-student" data-nid="${escapeHTML(s.nid)}">اختيار</button>
        </li>
      `).join("")}
    </ul>
  `;
}

let selectedStudent = null;
let qTopEl=null, qTopClearEl=null, topSearchResultsEl=null, topSearchWrapEl=null;

function selectStudentByNid(nid){
  const s = Store.getStudent(nid);
  if(!s){ toast("لم يتم العثور على الطالب", false); return; }
  selectedStudent = s;
  $("#q").value = s.name;
  $("#searchResults").innerHTML = "";
  renderStudentCard(s);
  if(typeof renderStudentCardBeh==="function") renderStudentCardBeh(s);
  renderLogs();
}

function renderLogs(){
  const box=$("#logList");
  if(!selectedStudent){
    box.innerHTML = `<div class="small">اختر طالبًا لعرض السجل.</div>`;
    return;
  }
  const logs = Store.state.logs.filter(l=>String(l.nid)===String(selectedStudent.nid)).slice(0, 30);
  if(!logs.length){
    box.innerHTML = `<div class="small">لا يوجد سجل مسجل لهذا الطالب حتى الآن.</div>`;
    return;
  }
  box.innerHTML = `
    <ul class="list">
      ${logs.map(l=>{
        const label = l.type==="LATE" ? "تأخر" : l.type==="ABSENT" ? "غياب" : "سلوك";
        const pill = l.type==="LATE" ? "pill warn" : l.type==="ABSENT" ? "pill bad" : "pill";
        return `
          <li>
            <div>
              <div><span class="${pill}">${label}</span> <span class="meta">${fmtDT(l.at)}</span></div>
              <div class="meta">${escapeHTML(l.note||"")}</div>
            </div>
            <div class="meta">${escapeHTML(l.by||"")}</div>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

// ---- Attendance actions
function addAttendance(type){
  if(!selectedStudent) return toast("اختر طالبًا أولًا", false);
  const note = (type==="LATE" ? $("#late_note").value : $("#abs_note").value).trim();
  const by = $("#actor").value.trim();
  Store.addLog({
    type,
    nid: selectedStudent.nid,
    name: selectedStudent.name,
    grade: selectedStudent.grade,
    section: selectedStudent.section,
    note: note || (type==="LATE" ? "تسجيل تأخر" : "تسجيل غياب"),
    by
  });
  toast(type==="LATE" ? "تم تسجيل التأخر" : "تم تسجيل الغياب");
  $("#late_note").value=""; $("#abs_note").value="";
  renderStudentCard(selectedStudent);
  renderLogs();
}

// ---- Behavior
function hydrateBehavior(){
  const sel=$("#beh_rule");
  sel.innerHTML = `<option value="">اختر المخالفة</option>` + BEHAVIOR_RULES.map(r=>`<option value="${r.code}">${r.code} — ${r.title} (${r.severity})</option>`).join("");
}
function onBehaviorChange(){
  const code=$("#beh_rule").value;
  const r=BEHAVIOR_RULES.find(x=>x.code===code);
  if(!r){
    $("#beh_actions").value="";
    $("#beh_sev").textContent="—";
    return;
  }
  $("#beh_sev").textContent = r.severity;
  $("#beh_actions").value = (DEFAULT_ACTIONS[r.severity]||[]).join("، ");
}
function addBehavior(){
  if(!selectedStudent) return toast("اختر طالبًا أولًا", false);
  const code=$("#beh_rule").value;
  const r=BEHAVIOR_RULES.find(x=>x.code===code);
  if(!r) return toast("اختر المخالفة أولًا", false);
  const note = $("#beh_note").value.trim();
  const actions = $("#beh_actions").value.trim();
  const by = $("#actor").value.trim();
  Store.addLog({
    type:"BEHAVIOR",
    nid:selectedStudent.nid,
    name:selectedStudent.name,
    grade:selectedStudent.grade,
    section:selectedStudent.section,
    ruleCode:r.code,
    ruleTitle:r.title,
    severity:r.severity,
    actions,
    note: note || `${r.code} — ${r.title}`,
    by
  });
  toast("تم تسجيل المخالفة السلوكية");
  $("#beh_note").value="";
  renderStudentCard(selectedStudent);
  renderLogs();
}

// ---- Printing
function openPrintWindow(html, title="طباعة"){
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
}

async function getBarcodeLibText(){
  // embed barcode lib inside print window for reliability
  const res = await fetch("assets/barcode.js");
  return await res.text();
}

async function printSheet(type){
  const s=Store.state.settings;
  const grade=$("#sheet_grade").value.trim();
  const section=$("#sheet_section").value.trim();
  const date=$("#sheet_date").value || new Date().toISOString().slice(0,10);

  let list = Store.state.students.slice();
  if(grade) list = list.filter(x=>String(x.grade||"")===grade);
  if(section) list = list.filter(x=>String(x.section||"")===section);
  // sort by name
  list.sort((a,b)=> (a.name||"").localeCompare(b.name||"", "ar"));

  if(!list.length) return toast("لا يوجد طلاب مطابقين للفلاتر", false);

  const perPage = 40;
  const pages = [];
  for(let i=0;i<list.length;i+=perPage) pages.push(list.slice(i, i+perPage));

  const title = type==="LATE" ? "كشف متابعة تأخر الطلاب" : "كشف متابعة غياب الطلاب";
  const days = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس"];
  const barcodeLib = await getBarcodeLibText();

  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body{font-family:Tajawal, Arial, sans-serif; direction:rtl; margin:0; color:#111; -webkit-print-color-adjust:exact; print-color-adjust:exact}
  .page{page-break-after: always;}
  .page:last-child{page-break-after: auto;}
  .hdr{margin-bottom:8px}
  .hdrTop{display:flex; justify-content:space-between; align-items:flex-start; gap:12px}
  .office{font-weight:900;font-size:13px}
  .school{font-weight:900;font-size:14px;margin-top:2px}
  .ttl{font-weight:900; font-size:16px; text-align:center; margin:8px 0 6px}
  .meta{display:flex; gap:10px; justify-content:center; flex-wrap:wrap; font-size:12.5px}
  .meta span{border:1px solid #222; padding:4px 8px}
  .pageNo{font-size:12px; opacity:.9; text-align:center; margin-top:6px}
  table{width:100%; border-collapse:collapse; table-layout:fixed}
  th,td{border:1px solid #222; padding:6px 6px; text-align:center}
  th{background:#e9ecef; font-weight:900}
  td.name{font-weight:800; text-align:right; white-space:nowrap; overflow:visible}
  th.day{writing-mode:vertical-rl; transform:rotate(180deg); width:34px}
  th.bar{width:260px}
  td.bar{padding:0 6px}
  canvas{width:100%; height:54px}
  .sign{display:flex; justify-content:space-between; gap:10mm; margin-top:8mm; direction:rtl}
  .sig{width:50%; border:1px solid #222; padding:8px; min-height:18mm}
  .sig .lbl{font-weight:900; font-size:12.5px}
  .sig .nm{font-size:12px; margin-top:2px}
  .sig .line{border-top:1px dashed #222; margin-top:12mm}
</style>
</head>
<body>
  ${pages.map((page,pi)=>`
    <div class="page">
      <div class="hdr">
        <div class="hdrTop">
          <div>
            <div class="office">${escapeHTML(s.educationOffice)}</div>
            <div class="school">${escapeHTML(s.schoolName)}</div>
          </div>
          <div style="text-align:left;font-size:12px">
            التاريخ: <b>${escapeHTML(date)}</b><br/>
            الوقت: <b>${escapeHTML(nowTime())}</b>
          </div>
        </div>
        <div class="ttl">${title}</div>
        <div class="meta">
          <span>الصف: <b>${escapeHTML(grade||"—")}</b></span>
          <span>الشعبة: <b>${escapeHTML(section||"—")}</b></span>
          <span>الفصل الدراسي: <b>${escapeHTML(s.term)}</b></span>
          <span>العام: <b>${escapeHTML(s.hijriYear)}هـ</b></span>
        </div>
        <div class="pageNo">صفحة ${pi+1} من ${pages.length} • (حد أقصى 40 طالب لكل صفحة)</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>اسم الطالب</th>
            ${days.map(d=>`<th class="day">${d}</th>`).join("")}
            <th class="bar">رمز الباركود</th>
          </tr>
        </thead>
        <tbody>
          ${page.map((st)=>`
            <tr>
              <td class="name">${escapeHTML(st.name)}</td>
              ${days.map(()=>`<td></td>`).join("")}
              <td class="bar"><canvas data-bar="${escapeHTML(st.nid)}" width="520" height="120"></canvas></td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="sign">
        <div class="sig">
          <div class="lbl">توقيع مدير المدرسة</div>
          <div class="nm">(${escapeHTML(s.managerName||"")})</div>
          <div class="line"></div>
        </div>
        <div class="sig">
          <div class="lbl">توقيع وكيل المدرسة</div>
          <div class="nm">(${escapeHTML(s.deputyName||"")})</div>
          <div class="line"></div>
        </div>
      </div>
    </div>
  `).join("")}

<script>
${barcodeLib}
// barcode.js defines generateBarcode(...)
try{
  document.querySelectorAll("canvas[data-bar]").forEach(c=>{
    const v = c.getAttribute("data-bar") || "";
    if(!v) return;
    try{ generateBarcode(c, v); }catch(e){}
  });
}catch(e){}

// ضبط حجم خط الاسم تلقائيًا لتفادي التفاف/اجتزاء الاسم
document.querySelectorAll("td.name").forEach(td=>{
  const n = (td.textContent||"").trim().length;
  if(n > 42) td.style.fontSize = "9.5px";
  else if(n > 34) td.style.fontSize = "10px";
  else if(n > 28) td.style.fontSize = "11px";
});

window.onload = () => setTimeout(()=>window.print(), 220);
</script>
</body>
</html>`;
  openPrintWindow(html, title);
}

async function printEntryCard(kind){
  // kind: "ENTRY" for late permission, "BEHAVIOR" for behavior notice
  if(!selectedStudent) return toast("اختر طالبًا أولًا", false);
  const s=Store.state.settings;
  const counts = Store.getCounts(selectedStudent.nid);
  const barcodeLib = await getBarcodeLibText();
  const dt = new Date();
  const dateStr = dt.toLocaleDateString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"2-digit"});
  const timeStr = dt.toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

  const title = kind==="ENTRY" ? "ورقة إذن بالدخول للفصل" : (kind==="EXIT" ? "ورقة إذن بالخروج من الفصل" : "إشعار مخالفة سلوكية");
  const note = kind==="ENTRY"
    ? "المعلم الفاضل/ نرجو السماح للطالب التالي بالدخول للفصل علمًا بأنه تم اتخاذ الإجراءات التربوية المعتمدة."
    : (kind==="EXIT"
        ? "المعلم الفاضل/ نرجو السماح للطالب التالي بالخروج وفق ما يقتضيه التنظيم (مراجعة الإدارة/الوكيل/التوجيه الطلابي أو لظرف طارئ)، مع التأكد من عودته للحصة."
        : "نفيدكم بتسجيل مخالفة سلوكية على الطالب وفق الإجراءات المعتمدة، وتم اتخاذ الإجراء المناسب.");

  const extra = (kind==="ENTRY" || kind==="EXIT")
    ? `<div class="box">تأخر متراكم: <b>${counts.late}</b></div>
       <div class="box">غياب متراكم: <b>${counts.absent}</b></div>`
    : `<div class="box">مخالفات سلوكية مسجلة: <b>${counts.behavior}</b></div>`;

  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  @page{ size: 80mm 200mm; margin: 4mm; }
  body{font-family:Tajawal, Arial, sans-serif; direction:rtl; margin:0; color:#111;}
  .card{
    border:2px solid #111;
    padding:8px 8px 10px;
    border-radius:10px;
  }
  .h1{font-size:16px;font-weight:900;text-align:center;margin:0 0 6px;background:#e9ecef;padding:6px;border-radius:8px}
  .school{font-size:12px;text-align:center;margin:2px 0 8px}
  .dt{display:flex;justify-content:space-between;font-size:12px;margin:6px 0 8px}
  .box{
    border:1px solid #111;
    padding:7px 8px;
    margin:6px 0;
    font-size:13px;
    font-weight:800;
    text-align:center;
  }
  .msg{
    border:1px dashed #111;
    padding:7px 8px;
    margin:8px 0;
    font-size:12.5px;
    line-height:1.6;
  }
  .name{border:1px dashed #111;padding:10px 8px;margin:8px 0;font-size:15px;font-weight:900;text-align:center}
  .class{font-size:13px;text-align:center;font-weight:800;margin:6px 0}
  .foot{
    border:1px dashed #111;
    padding:8px;
    margin-top:8px;
    text-align:center;
  }
  .signRow{display:flex; gap:4mm; justify-content:space-between; direction:rtl; margin-top:4px}
  .sig{width:50%; border:1px solid #111; padding:6px; min-height:16mm}
  .sigLbl{font-weight:900; font-size:11px}
  .sigName{font-weight:800; font-size:10.5px; margin-top:2px; opacity:.95}
  .sigLine{border-top:1px dashed #111; margin-top:10mm}
  canvas{width:100%; height:54px}
  .code{text-align:center;font-weight:900;letter-spacing:1px;margin-top:2px}
</style>
</head>
<body>
  <div class="card">
    <div class="h1">${title}</div>
    <div class="school">${escapeHTML(s.schoolName)}</div>
    <div class="dt"><div>${escapeHTML(dateStr)}</div><div>${escapeHTML(timeStr)}</div></div>
    ${extra}
    <div class="msg">${note}</div>
    <div class="name">${escapeHTML(selectedStudent.name)}</div>
    <div class="class">الصف: ${escapeHTML(selectedStudent.grade||"—")} • الشعبة: ${escapeHTML(selectedStudent.section||"—")}</div>
    <div style="margin-top:8px">
      <canvas id="c" width="520" height="120"></canvas>
      <div class="code">${escapeHTML(selectedStudent.nid||"")}</div>
    </div>
    <div class="foot">
      <div class="signRow">
        <div class="sig">
          <div class="sigLbl">توقيع مدير المدرسة</div>
          <div class="sigName">(${escapeHTML(s.managerName||"")})</div>
          <div class="sigLine"></div>
        </div>
        <div class="sig">
          <div class="sigLbl">توقيع وكيل المدرسة</div>
          <div class="sigName">(${escapeHTML(s.deputyName||"")})</div>
          <div class="sigLine"></div>
        </div>
      </div>
      <div style="margin-top:6px;font-size:11px">ملاحظة: صلاحية هذه الورقة 5 دقائق فقط من تاريخ طباعتها</div>
    </div>
  </div>
<script>
${barcodeLib}
try{ generateBarcode(document.getElementById("c"), "${escapeHTML(selectedStudent.nid||"")}"); }catch(e){}
window.onload = () => setTimeout(()=>window.print(), 200);
</script>
</body>
</html>`;
  openPrintWindow(html, title);
}

// ---- Import default
async function ensureDefaultStudents(){
  if(Store.hasStudents()) return;
  try{
    const res = await fetch("assets/students_default.json", {cache:"no-cache"});
    if(!res.ok) return;
    const data = await res.json();
    if(data && Array.isArray(data.students) && data.students.length){
      Store.setStudents(data.students);
      toast(`تم تحميل بيانات الطلاب (${data.students.length})`);
      refreshFilters();
    }
  }catch(e){}
}

// ---- Import CSV
function parseCSV(text){
  // robust enough for our Arabic csv (comma separated)
  const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim().length);
  if(!lines.length) return [];
  const headers = lines[0].split(",").map(h=>h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cells = [];
    let cur="", inQ=false;
    const line = lines[i];
    for(let j=0;j<line.length;j++){
      const ch=line[j];
      if(ch === '"' ){
        if(inQ && line[j+1]==='"'){ cur+='"'; j++; }
        else inQ = !inQ;
      }else if(ch === "," && !inQ){
        cells.push(cur); cur="";
      }else cur+=ch;
    }
    cells.push(cur);
    const obj={};
    headers.forEach((h,idx)=>obj[h]= (cells[idx]??"").trim());
    rows.push(obj);
  }
  return rows;
}
function cleanDigits(s){
  return String(s||"").replace(/[^\d]/g,"").replace(/\.0$/,"");
}
function mapStudentsFromRows(rows){
  // supports Arabic headers: اسم الطالب, رقم الطالب, الجوال, رقم الصف, الفصل
  const list = [];
  for(const r of rows){
    const name = r["اسم الطالب"] || r["الاسم"] || r["StudentName"] || "";
    const nid = cleanDigits(r["رقم الطالب"] || r["السجل المدني"] || r["رقم الهوية"] || r["NationalId"] || "");
    const phone = cleanDigits(r["الجوال"] || r["جوال"] || r["Phone"] || "");
    const grade = (r["رقم الصف"] || r["الصف"] || r["Grade"] || "").trim();
    const section = (r["الفصل"] || r["الشعبة"] || r["Section"] || "").trim();
    if(!name || !nid) continue;
    list.push({name:name.trim(), nid, phone, grade, section});
  }
  return list;
}

async function importFile(file){
  const text = await file.text();
  const rows = parseCSV(text);
  const list = mapStudentsFromRows(rows);
  if(!list.length) throw new Error("لم يتم التعرف على الأعمدة. تأكد أن الملف CSV يحتوي: اسم الطالب، رقم الطالب، الجوال، رقم الصف، الفصل");
  Store.setStudents(list);
  refreshFilters();
  toast(`تم استيراد ${list.length} طالب`);
}

// ---- Filters for sheets
function refreshFilters(){
  const grades = Array.from(new Set(Store.state.students.map(s=>String(s.grade||"")).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ar"));
  const sections = Array.from(new Set(Store.state.students.map(s=>String(s.section||"")).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ar"));
  $("#sheet_grade").innerHTML = `<option value="">كل الصفوف</option>` + grades.map(g=>`<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join("");
  $("#sheet_section").innerHTML = `<option value="">كل الشعب</option>` + sections.map(g=>`<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join("");
  $("#stats_students").textContent = String(Store.state.students.length||0);
}

// ---- SMS
async function sendSMSForSelected(){
  if(!selectedStudent) return toast("اختر طالبًا أولًا", false);
  const phone = (selectedStudent.phone||"").trim();
  if(!phone) return toast("لا يوجد رقم جوال مسجل", false);

  const s=Store.state.settings;
  const template = $("#sms_body").value.trim() || `نفيدكم بتسجيل ${todayAr()} للطالب ${selectedStudent.name}. نأمل المتابعة.`;
  // normalize number: ensure 966... if local 05...
  let number = phone;
  if(number.startsWith("05")) number = "966" + number.slice(1);
  if(number.startsWith("5") && number.length===9) number = "966" + number;
  $("#btnSendSMS").disabled = true;
  try{
    const res = await sendSMS({
      proxyUrl: s.proxyUrl,
      proxyKey: s.proxyKey,
      number,
      senderName: s.smsSender,
      messageBody: template
    });
    toast("تم إرسال الرسالة");
    // store log as note
    Store.addLog({
      type:"SMS",
      nid:selectedStudent.nid,
      name:selectedStudent.name,
      grade:selectedStudent.grade,
      section:selectedStudent.section,
      note:`SMS: ${template}`,
      by: $("#actor").value.trim()
    });
    renderLogs();
  }catch(e){
    toast(e.message || "فشل الإرسال", false);
  }finally{
    $("#btnSendSMS").disabled = false;
  }
}

// ---- Events
function bindEvents(){
  document.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-action]");
    if(!btn) return;
    const act = btn.dataset.action;
    if(act==="tab") return setTab(btn.dataset.tab);
    if(act==="select-student") return selectStudentByNid(btn.dataset.nid);
    if(act==="add-late") return addAttendance("LATE");
    if(act==="add-absent") return addAttendance("ABSENT");
    if(act==="add-behavior") return addBehavior();
    if(act==="print-late-sheet") return printSheet("LATE");
    if(act==="print-abs-sheet") return printSheet("ABSENT");
    if(act==="print-entry-card") return printEntryCard("ENTRY");
    if(act==="print-exit-card") return printEntryCard("EXIT");
    if(act==="print-behavior-card") return printEntryCard("BEHAVIOR");
    if(act==="save-settings") return saveSettingsFromForm();
    if(act==="export-backup") return exportBackup();
    if(act==="import-backup") return $("#backupFile").click();
    if(act==="clear-all") return clearAll();
    if(act==="send-sms") return sendSMSForSelected();
    if(act==="import-students") return $("#studentsFile").click();
  });

  $("#q").addEventListener("input", ()=>{
    const q=$("#q").value.trim();
    if(q.length < 2){ $("#searchResults").innerHTML=""; return; }
    renderSearchResults(Store.searchStudents(q, 20));
  });

  // Top quick search (available on all tabs)
  qTopEl = $("#qTop");
  qTopClearEl = $("#qTopClear");
  topSearchResultsEl = $("#topSearchResults");
  topSearchWrapEl = qTopEl ? qTopEl.closest(".topsearch") : null;

  function closeTopSearch(){
    if(topSearchResultsEl){ topSearchResultsEl.innerHTML=""; topSearchResultsEl.hidden=true; }
  }

  if(qTopEl){
    qTopEl.addEventListener("input", ()=>{
      const qv = qTopEl.value.trim();
      if(qv.length < 2){ closeTopSearch(); return; }
      renderTopSearchResults(Store.searchStudents(qv, 12));
    });
    qTopEl.addEventListener("keydown", (e)=>{
      if(e.key==="Escape"){ qTopEl.value=""; closeTopSearch(); }
    });
  }
  if(qTopClearEl){
    qTopClearEl.addEventListener("click", ()=>{ if(qTopEl) qTopEl.value=""; closeTopSearch(); });
  }
  if(topSearchResultsEl){
    topSearchResultsEl.addEventListener("click", (e)=>{
      const b = e.target.closest("button[data-nid]");
      if(!b) return;
      selectStudentByNid(b.dataset.nid);
      closeTopSearch();
      if(qTopEl) qTopEl.value="";
    });
  }
  document.addEventListener("click", (e)=>{
    if(!topSearchWrapEl) return;
    if(topSearchWrapEl.contains(e.target)) return;
    closeTopSearch();
  }, true);

  $("#beh_rule").addEventListener("change", onBehaviorChange);

  $("#studentsFile").addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    try{ await importFile(f); }catch(err){ toast(err.message||"فشل الاستيراد", false); }
    e.target.value="";
  });

  $("#backupFile").addEventListener("change", async (e)=>{
    const f=e.target.files?.[0];
    if(!f) return;
    try{
      const obj = JSON.parse(await f.text());
      Store.importBackup(obj);
      renderBadges();
      hydrateSettingsForm();
      refreshFilters();
      toast("تم استيراد النسخة الاحتياطية");
    }catch(err){
      toast("ملف النسخة غير صالح", false);
    }
    e.target.value="";
  });
}

function exportBackup(){
  const data = Store.exportBackup();
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download = `rasid-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function clearAll(){
  if(!confirm("سيتم حذف جميع البيانات من هذا الجهاز. هل أنت متأكد؟")) return;
  Store.clearAll();
  selectedStudent=null;
  renderStudentCard(null);
  renderLogs();
  refreshFilters();
  toast("تم مسح البيانات");
}

async function init(){
  Store.load();
  renderBadges();
  hydrateSettingsForm();
  hydrateBehavior();
  bindEvents();
  setTab("home");
  refreshFilters();
  renderStudentCard(null);
  renderLogs();
  $("#sheet_date").value = new Date().toISOString().slice(0,10);
  await ensureDefaultStudents();
  // show totals
  $("#stats_logs").textContent = String(Store.state.logs.length||0);
}

document.addEventListener("DOMContentLoaded", init);
