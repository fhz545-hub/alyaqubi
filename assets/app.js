
import {
  dbGetAllSettings, dbGetSetting, dbSetSetting,
  dbUpsertStudent, dbGetStudent, dbListStudents,
  dbAddEvent, dbListEventsByDate, dbListEventsByDateType,
  dbListStudentEvents, dbCountStudentEvents,
  dbGetRecent,
  dbEnsureDefaultRules, dbListRules, dbAddRule, dbDeleteRule,
  dbExportBackup, dbImportBackup, dbWipeAll
} from "./db.js";

import { todayISO, fmtTs, normalizeArabic, safeNid, toast, downloadText, readFileText, readFileArrayBuffer } from "./util.js";
import { parseCSV, guessHeader } from "./csv.js";
import { code39Svg } from "./barcode.js";
import { printClassSheet, printSmallCard, printBulkCards } from "./print.js";
import { smsGetBalance, smsSend, whatsappLink } from "./sms.js";

const APP_VERSION = "1.0.0";

const state = {
  settings: {},
  rules: [],
  import: { headers: [], data: [], fileName:"", fileType:"" },
  pickedStudent: null,
  pickMode: null, // {purpose: "markLate"/"markAbsent"/"behavior"/"cardPick"}
  today: todayISO()
};

const el = (id)=>document.getElementById(id);

function setActiveView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  el(`view-${view}`).classList.remove("hidden");

  document.querySelectorAll(".nav__item").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.view===view);
  });
  document.querySelectorAll(".bottomnav__item").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.view===view);
  });

  if(view==="home") refreshHome();
  if(view==="students") refreshStudents();
  if(view==="attendance") refreshAttendance();
  if(view==="behavior") refreshBehavior();
  if(view==="prints") refreshPrintSelectors();
  if(view==="settings") refreshSettingsUI();
}

function openModal(id){
  const m = el(id);
  if(m && !m.open) m.showModal();
}
function closeModal(id){
  const m=el(id);
  if(m && m.open) m.close();
}

async function init(){
  el("appVersion").textContent = APP_VERSION;

  await dbEnsureDefaultRules();
  await ensureDefaultSettings();
  state.settings = await dbGetAllSettings();
  state.rules = await dbListRules();

  bindNav();
  bindUI();
  registerSW();

  refreshRuleSelect();
  refreshSettingsUI();
  refreshHome();
  refreshPrintSelectors();
}

async function ensureDefaultSettings(){
  const defaults = {
    eduAdmin: "الإدارة العامة للتعليم بالمنطقة الشرقية",
    sector: "قطاع الخبر",
    schoolName: "ثانوية اليعقوبي الثانوية",
    leader: "فهد حامد علي الزهراني",
    hijriYear: "1447هـ",
    term: "الأول",
    workerUrl: "",
    appKey: "",
    sender: ""
  };
  for(const [k,v] of Object.entries(defaults)){
    const cur = await dbGetSetting(k);
    if(cur===undefined) await dbSetSetting(k, v);
  }
}

function bindNav(){
  el("nav").addEventListener("click",(e)=>{
    const btn = e.target.closest(".nav__item");
    if(!btn) return;
    setActiveView(btn.dataset.view);
  });
  el("bottomnav").addEventListener("click",(e)=>{
    const btn = e.target.closest(".bottomnav__item");
    if(!btn) return;
    setActiveView(btn.dataset.view);
  });
}

function bindUI(){
  // quick search
  el("btnQuickSearch").addEventListener("click", ()=>openModal("modalSearch"));
  el("quickSearchInput").addEventListener("input", onQuickSearch);
  el("quickSearchResults").addEventListener("click", onQuickPick);

  // import
  el("btnImport").addEventListener("click", ()=>{ resetImportModal(); openModal("modalImport"); });
  el("fileInput").addEventListener("change", onFileChosen);
  el("btnDoImport").addEventListener("click", doImport);

  // add student
  el("btnAddStudent").addEventListener("click", ()=>openStudentModal(null));
  el("btnAddStudent2").addEventListener("click", ()=>openStudentModal(null));

  // students search
  el("studentsSearch").addEventListener("input", debounce(refreshStudents, 200));
  el("studentsTbody").addEventListener("click", onStudentTableClick);

  // attendance
  el("btnMarkLate").addEventListener("click", ()=>openPick("markLate"));
  el("btnMarkAbsent").addEventListener("click", ()=>openPick("markAbsent"));
  el("btnMarkBehavior").addEventListener("click", ()=>setActiveView("behavior"));

  el("btnMarkLate2").addEventListener("click", ()=>openPick("markLate"));
  el("btnMarkAbsent2").addEventListener("click", ()=>openPick("markAbsent"));
  el("attSearch").addEventListener("input", debounce(()=>renderAttendanceToday(), 200));
  document.querySelectorAll(".chip").forEach(c=>{
    c.addEventListener("click", ()=>{
      document.querySelectorAll(".chip").forEach(x=>x.classList.remove("is-active"));
      c.classList.add("is-active");
      renderAttendanceToday();
    });
  });

  // behavior
  el("btnMarkBehavior2").addEventListener("click", ()=>openPick("behavior"));
  el("behSearch").addEventListener("input", debounce(()=>renderBehaviorToday(), 200));
  el("behRuleSelect").addEventListener("change", ()=>{});

  // prints
  el("btnPrintSheet").addEventListener("click", onPrintSheet);
  el("btnPickStudent").addEventListener("click", ()=>openPick("cardPick"));
  el("btnPrintCard").addEventListener("click", onPrintCard);
  el("btnPrintBulkCards").addEventListener("click", onPrintBulkCards);

  // pick modal
  el("pickInput").addEventListener("input", debounce(renderPickList, 160));
  el("pickList").addEventListener("click", onPickListClick);

  // student modal actions
  el("btnSaveStudent").addEventListener("click", saveStudentFromModal);
  el("btnArchiveStudent").addEventListener("click", archiveStudentFromModal);
  el("btnPrintStudentCard").addEventListener("click", ()=>printStudentCardCurrent());

  // settings school
  el("btnSaveSchool").addEventListener("click", saveSchoolSettings);

  // settings sms
  el("btnSaveSms").addEventListener("click", saveSmsSettings);
  el("btnTestSms").addEventListener("click", testSmsBalance);
  el("btnSendSms").addEventListener("click", sendSmsNow);
  el("btnSendWa").addEventListener("click", openWhatsAppNow);

  // rules
  el("btnAddRule").addEventListener("click", addRuleNow);
  el("rulesList").addEventListener("click", onRuleListClick);

  // backup
  el("btnExportBackup").addEventListener("click", exportBackup);
  el("btnImportBackup").addEventListener("click", importBackup);
  el("btnWipe").addEventListener("click", wipeAllNow);
  el("btnSync").addEventListener("click", ()=>setActiveView("settings")); // quick access
}

function debounce(fn, ms){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), ms);
  };
}

/* -------- Home -------- */
async function refreshHome(){
  const students = await dbListStudents({activeOnly:true, limit: 100000});
  el("stStudents").textContent = students.length;

  const late = await dbListEventsByDateType(state.today, "LATE");
  const abs = await dbListEventsByDateType(state.today, "ABSENT");
  const beh = await dbListEventsByDateType(state.today, "BEHAVIOR");

  el("stLate").textContent = late.length;
  el("stAbsent").textContent = abs.length;
  el("stBehavior").textContent = beh.length;

  const recent = await dbGetRecent(12);
  el("recentList").innerHTML = recent.length ? recent.map(renderRecentItem).join("") : `<div class="hint">لا يوجد عمليات بعد.</div>`;
}

function renderRecentItem(r){
  const badge = r.type==="LATE" ? `<span class="badge badge--late">تأخر</span>`
              : r.type==="ABSENT" ? `<span class="badge badge--absent">غياب</span>`
              : `<span class="badge badge--beh">سلوك</span>`;
  return `
    <div class="item">
      <div class="item__top">
        ${badge}
        <div class="item__title">${escapeHtml(r.title || "عملية")}</div>
      </div>
      <div class="item__meta">${escapeHtml(r.date)} • ${escapeHtml(fmtTs(r.ts))}${r.note ? " • " + escapeHtml(r.note) : ""}</div>
    </div>
  `;
}

/* -------- Students -------- */
async function refreshStudents(){
  const q = el("studentsSearch").value.trim();
  if(q.length < 2 && !/\d{4,}/.test(q)){
    el("studentsTbody").innerHTML = `<tr><td colspan="5"><div class="hint">اكتب حرفين على الأقل للبحث عن طالب (حماية للخصوصية).</div></td></tr>`;
    return;
  }
  const qq = normalizeArabic(q);
  const list = await dbListStudents({q: qq, activeOnly:true, limit: 400});
  el("studentsTbody").innerHTML = list.length ? list.map(s=>`
    <tr>
      <td>${escapeHtml(s.name||"")}</td>
      <td>${escapeHtml(s.nid||"")}</td>
      <td>${escapeHtml(s.grade||"")}</td>
      <td>${escapeHtml(s.section||"")}</td>
      <td class="actions">
        <button class="linkbtn" data-open="${escapeHtml(s.nid)}">فتح</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5"><div class="hint">لا توجد نتائج.</div></td></tr>`;
}

async function onStudentTableClick(e){
  const btn = e.target.closest("button[data-open]");
  if(!btn) return;
  const nid = btn.dataset.open;
  openStudentModal(nid);
}

async function openStudentModal(nid){
  const modal = el("modalStudent");
  modal.dataset.nid = nid || "";
  if(nid){
    const s = await dbGetStudent(nid);
    if(!s){ toast("لم يتم العثور على الطالب"); return; }
    el("stName").value = s.name || "";
    el("stNid").value = s.nid || "";
    el("stGrade").value = s.grade || "";
    el("stSection").value = s.section || "";
    await renderStudentModalStats(nid);
    await renderStudentLog(nid);
    renderBarcodeBox(s.nid);
  }else{
    el("stName").value = "";
    el("stNid").value = "";
    el("stGrade").value = "";
    el("stSection").value = "";
    el("stLateCount").textContent = "0";
    el("stAbsentCount").textContent = "0";
    el("stBehCount").textContent = "0";
    el("studentLog").innerHTML = `<div class="hint">سجل الطالب سيظهر بعد الحفظ.</div>`;
    el("barcodeBox").innerHTML = "";
  }
  openModal("modalStudent");
}

async function renderStudentModalStats(nid){
  const counts = await dbCountStudentEvents(nid);
  el("stLateCount").textContent = counts.LATE;
  el("stAbsentCount").textContent = counts.ABSENT;
  el("stBehCount").textContent = counts.BEHAVIOR;
}

async function renderStudentLog(nid){
  const logs = await dbListStudentEvents(nid, 150);
  el("studentLog").innerHTML = logs.length ? logs.map(renderEventItem).join("") : `<div class="hint">لا يوجد سجل لهذا الطالب.</div>`;
}

function renderEventItem(e){
  const badge = e.type==="LATE" ? `<span class="badge badge--late">تأخر</span>`
              : e.type==="ABSENT" ? `<span class="badge badge--absent">غياب</span>`
              : `<span class="badge badge--beh">سلوك</span>`;
  const title = e.type==="BEHAVIOR" ? (e.ruleTitle || "مخالفة سلوكية") : (e.type==="LATE" ? "تسجيل تأخر" : "تسجيل غياب");
  return `
    <div class="item">
      <div class="item__top">
        ${badge}
        <div class="item__title">${escapeHtml(title)}</div>
      </div>
      <div class="item__meta">${escapeHtml(e.date)} • ${escapeHtml(fmtTs(e.ts))}${e.note ? " • " + escapeHtml(e.note) : ""}</div>
    </div>
  `;
}

function renderBarcodeBox(nid){
  const svg = code39Svg(nid, {height:46, showText:true});
  el("barcodeBox").innerHTML = svg;
}

async function saveStudentFromModal(){
  const prevNid = el("modalStudent").dataset.nid || "";
  const name = el("stName").value.trim();
  const nid = safeNid(el("stNid").value);
  const grade = el("stGrade").value.trim();
  const section = el("stSection").value.trim();
  if(!name || name.length < 6){ toast("اكتب اسم الطالب كامل"); return; }
  if(!nid || nid.length < 8){ toast("رقم الهوية غير صحيح"); return; }

  const student = {
    nid,
    name,
    grade,
    section,
    nameNorm: normalizeArabic(name),
    active: true,
    updatedAt: Date.now(),
    createdAt: Date.now()
  };
  const existing = await dbGetStudent(nid);
  if(existing){
    student.createdAt = existing.createdAt || student.createdAt;
  }
  await dbUpsertStudent(student);

  if(prevNid && prevNid !== nid){
    // If ID changed, archive old record to avoid duplicates
    const old = await dbGetStudent(prevNid);
    if(old){
      old.active = false;
      old.archivedAt = Date.now();
      await dbUpsertStudent(old);
    }
  }

  el("modalStudent").dataset.nid = nid;
  renderBarcodeBox(nid);
  await renderStudentModalStats(nid);
  await renderStudentLog(nid);
  toast("تم حفظ الطالب");
  refreshHome();
}

async function archiveStudentFromModal(){
  const nid = el("modalStudent").dataset.nid || safeNid(el("stNid").value);
  if(!nid){ toast("احفظ الطالب أولًا"); return; }
  const s = await dbGetStudent(nid);
  if(!s){ toast("لا يوجد طالب"); return; }
  s.active = false;
  s.archivedAt = Date.now();
  await dbUpsertStudent(s);
  toast("تم أرشفة الطالب (نقل/حذف)");
  closeModal("modalStudent");
  refreshHome();
  refreshStudents();
}

async function printStudentCardCurrent(){
  const nid = el("modalStudent").dataset.nid || "";
  if(!nid){ toast("احفظ الطالب أولًا"); return; }
  const s = await dbGetStudent(nid);
  const counts = await dbCountStudentEvents(nid);
  printSmallCard({settings: state.settings, student: s, kind: "LATE", counts});
}

/* -------- Quick Search Modal -------- */
let quickSearchTimer=null;
async function onQuickSearch(){
  const q = el("quickSearchInput").value.trim();
  if(q.length<2 && !/\d{4,}/.test(q)){
    el("quickSearchResults").innerHTML = `<div class="hint">اكتب حرفين على الأقل.</div>`;
    return;
  }
  const list = await dbListStudents({q: normalizeArabic(q), activeOnly:true, limit: 25});
  el("quickSearchResults").innerHTML = list.length ? list.map(s=>`
    <div class="item" data-nid="${escapeHtml(s.nid)}">
      <div class="item__title">${escapeHtml(s.name)}</div>
      <div class="item__meta">${escapeHtml(s.nid)} • ${escapeHtml(s.grade)} / ${escapeHtml(s.section)}</div>
    </div>
  `).join("") : `<div class="hint">لا توجد نتائج.</div>`;
}
async function onQuickPick(e){
  const it=e.target.closest(".item[data-nid]");
  if(!it) return;
  const nid = it.dataset.nid;
  closeModal("modalSearch");
  openStudentModal(nid);
}

/* -------- Import -------- */
function resetImportModal(){
  state.import = { headers: [], data: [], fileName:"", fileType:"" };
  el("fileInput").value = "";
  el("mapName").innerHTML = "";
  el("mapId").innerHTML = "";
  el("mapGrade").innerHTML = "";
  el("mapSection").innerHTML = "";
  el("importHint").textContent = "";
}

async function onFileChosen(){
  const file = el("fileInput").files?.[0];
  if(!file) return;
  try{
    const {headers, data, fileType} = await parseAnyFile(file);
    state.import.headers = headers;
    state.import.data = data;
    state.import.fileName = file.name;
    state.import.fileType = fileType;

    fillMapSelects(headers);
    el("importHint").textContent = `تمت قراءة الملف: ${file.name} • عدد الصفوف: ${data.length}`;
  }catch(err){
    el("importHint").textContent = String(err?.message || err);
  }
}

function fillMapSelects(headers){
  const opts = headers.map(h=>`<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
  const mk = (id, guess)=>{
    el(id).innerHTML = `<option value="">— اختر —</option>` + opts;
    if(guess){
      el(id).value = guess;
    }
  };
  mk("mapName", guessHeader(headers, "name"));
  mk("mapId", guessHeader(headers, "nid"));
  mk("mapGrade", guessHeader(headers, "grade"));
  mk("mapSection", guessHeader(headers, "section"));
}

async function parseAnyFile(file){
  const name = (file.name||"").toLowerCase();
  if(name.endsWith(".csv")){
    const text = await readFileText(file);
    const {headers, data} = parseCSV(text);
    return {headers, data, fileType:"csv"};
  }
  if(name.endsWith(".xlsx") || name.endsWith(".xls")){
    if(!window.XLSX){
      throw new Error("لا يمكن قراءة Excel الآن: ضع ملف SheetJS محليًا في vendor/xlsx.full.min.js أو استخدم CSV.");
    }
    const ab = await readFileArrayBuffer(file);
    const wb = window.XLSX.read(ab, {type:"array"});
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = window.XLSX.utils.sheet_to_json(ws, {defval:""});
    // headers from first row keys
    const headers = json.length ? Object.keys(json[0]) : [];
    return {headers, data: json, fileType:"excel"};
  }
  throw new Error("نوع الملف غير مدعوم");
}

async function doImport(){
  const mapName = el("mapName").value;
  const mapId = el("mapId").value;
  const mapGrade = el("mapGrade").value;
  const mapSection = el("mapSection").value;

  if(!state.import.data.length){ toast("اختر ملفًا أولًا"); return; }
  if(!mapName || !mapId){ toast("حدد عمود الاسم وعمود الهوية"); return; }

  let ok=0, bad=0;
  for(const row of state.import.data){
    const name = String(row[mapName]??"").trim();
    const nid = safeNid(row[mapId]??"");
    const grade = String(row[mapGrade]??"").trim();
    const section = String(row[mapSection]??"").trim();

    if(!name || !nid){ bad++; continue; }
    const s = {
      nid,
      name,
      grade,
      section,
      nameNorm: normalizeArabic(name),
      active: true,
      updatedAt: Date.now(),
      createdAt: Date.now()
    };
    const existing = await dbGetStudent(nid);
    if(existing){
      s.createdAt = existing.createdAt || s.createdAt;
    }
    await dbUpsertStudent(s);
    ok++;
  }
  toast(`تم الاستيراد: ${ok} طالب • تم تجاهل: ${bad}`);
  closeModal("modalImport");
  refreshHome();
  refreshPrintSelectors();
}

/* -------- Attendance -------- */
async function refreshAttendance(){
  await renderAttendanceToday();
}

async function renderAttendanceToday(){
  const q = normalizeArabic(el("attSearch").value.trim());
  const chip = document.querySelector(".chip.is-active")?.dataset.a || "all";
  let list=[];
  if(chip==="all"){
    list = await dbListEventsByDate(state.today);
    list = list.filter(x=>x.type==="LATE" || x.type==="ABSENT");
  }else{
    list = await dbListEventsByDateType(state.today, chip);
  }

  if(q){
    // filter by student name/id
    const students = await dbListStudents({q, activeOnly:true, limit: 60});
    const ids = new Set(students.map(s=>s.nid));
    list = list.filter(e=>ids.has(e.nid));
  }

  const items = [];
  for(const e of list){
    const s = await dbGetStudent(e.nid);
    items.push({e, s});
  }

  el("attendanceToday").innerHTML = items.length ? items.map(({e,s})=>{
    const badge = e.type==="LATE" ? `<span class="badge badge--late">تأخر</span>` : `<span class="badge badge--absent">غياب</span>`;
    return `
      <div class="item">
        <div class="item__top">
          ${badge}
          <div class="item__title">${escapeHtml(s?.name || e.nid)}</div>
        </div>
        <div class="item__meta">${escapeHtml(e.date)} • ${escapeHtml(fmtTs(e.ts))} • ${escapeHtml(s?.grade||"")} / ${escapeHtml(s?.section||"")}</div>
      </div>
    `;
  }).join("") : `<div class="hint">لا يوجد سجل اليوم.</div>`;
}

/* -------- Behavior -------- */
async function refreshBehavior(){
  refreshRuleSelect();
  await renderBehaviorToday();
}

function refreshRuleSelect(){
  const sel = el("behRuleSelect");
  sel.innerHTML = state.rules.map(r=>`<option value="${r.id}">${escapeHtml(r.title)} (${levelLabel(r.level)})</option>`).join("");
}

async function renderBehaviorToday(){
  const q = normalizeArabic(el("behSearch").value.trim());
  let list = await dbListEventsByDateType(state.today, "BEHAVIOR");
  if(q){
    const students = await dbListStudents({q, activeOnly:true, limit: 60});
    const ids = new Set(students.map(s=>s.nid));
    list = list.filter(e=>ids.has(e.nid));
  }
  const items=[];
  for(const e of list){
    const s = await dbGetStudent(e.nid);
    items.push({e,s});
  }
  el("behaviorToday").innerHTML = items.length ? items.map(({e,s})=>{
    return `
      <div class="item">
        <div class="item__top">
          <span class="badge badge--beh">سلوك</span>
          <div class="item__title">${escapeHtml(s?.name || e.nid)}</div>
        </div>
        <div class="item__meta">${escapeHtml(e.ruleTitle||"مخالفة")} • ${escapeHtml(e.date)} • ${escapeHtml(fmtTs(e.ts))}</div>
      </div>
    `;
  }).join("") : `<div class="hint">لا يوجد سجل سلوك اليوم.</div>`;
}

/* -------- Pick Modal & Marking -------- */
function openPick(purpose){
  state.pickMode = {purpose};
  el("pickInput").value = "";
  el("pickList").innerHTML = `<div class="hint">اكتب اسم الطالب أو رقم الهوية.</div>`;
  openModal("modalPickStudent");
  setTimeout(()=>el("pickInput").focus(), 50);
}

async function renderPickList(){
  const q = el("pickInput").value.trim();
  if(q.length<2 && !/\d{4,}/.test(q)){
    el("pickList").innerHTML = `<div class="hint">اكتب حرفين أو 4 أرقام للبحث.</div>`;
    return;
  }
  const list = await dbListStudents({q: normalizeArabic(q), activeOnly:true, limit: 30});
  el("pickList").innerHTML = list.length ? list.map(s=>`
    <div class="item" data-nid="${escapeHtml(s.nid)}">
      <div class="item__title">${escapeHtml(s.name)}</div>
      <div class="item__meta">${escapeHtml(s.nid)} • ${escapeHtml(s.grade)} / ${escapeHtml(s.section)}</div>
    </div>
  `).join("") : `<div class="hint">لا توجد نتائج.</div>`;
}

async function onPickListClick(e){
  const it=e.target.closest(".item[data-nid]");
  if(!it) return;
  const nid = it.dataset.nid;
  const s = await dbGetStudent(nid);
  closeModal("modalPickStudent");

  const p = state.pickMode?.purpose;

  if(p==="markLate"){
    await markAttendance(s, "LATE");
    return;
  }
  if(p==="markAbsent"){
    await markAttendance(s, "ABSENT");
    return;
  }
  if(p==="behavior"){
    await markBehavior(s);
    return;
  }
  if(p==="cardPick"){
    state.pickedStudent = s;
    el("pickedStudentMini").innerHTML = `
      <div><b>${escapeHtml(s.name)}</b></div>
      <div class="hint">${escapeHtml(s.nid)} • ${escapeHtml(s.grade)} / ${escapeHtml(s.section)}</div>
    `;
    toast("تم اختيار الطالب");
    return;
  }
}

async function markAttendance(student, type){
  if(!student) return;
  await dbAddEvent({
    nid: student.nid,
    type,
    date: state.today,
    title: student.name
  });
  toast(type==="LATE" ? "تم تسجيل التأخر" : "تم تسجيل الغياب");
  refreshHome();
  renderAttendanceToday();
  if(el("modalStudent").open && el("modalStudent").dataset.nid===student.nid){
    await renderStudentModalStats(student.nid);
    await renderStudentLog(student.nid);
  }
}

async function markBehavior(student){
  if(!student) return;
  const ruleId = Number(el("behRuleSelect").value || 0);
  const rule = state.rules.find(r=>r.id===ruleId) || state.rules[0];
  await dbAddEvent({
    nid: student.nid,
    type: "BEHAVIOR",
    date: state.today,
    ruleId: rule?.id,
    ruleTitle: rule?.title,
    level: rule?.level,
    title: student.name
  });
  toast("تم تسجيل المخالفة");
  refreshHome();
  renderBehaviorToday();
}

/* -------- Printing -------- */
async function refreshPrintSelectors(){
  // Fill grade/section options from current students
  const students = await dbListStudents({activeOnly:true, limit: 100000});
  const grades = uniq(students.map(s=>s.grade).filter(Boolean));
  const sections = uniq(students.map(s=>s.section).filter(Boolean));

  const fill = (selectId, arr, placeholder="— اختر —")=>{
    const sel = el(selectId);
    sel.innerHTML = `<option value="">${placeholder}</option>` + arr.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  };

  fill("sheetGrade", grades);
  fill("sheetSection", sections);
  fill("bulkGrade", grades);
  fill("bulkSection", sections);

  // defaults from settings
  el("sheetTerm").value = state.settings.term || "الأول";
  el("sheetHijri").value = state.settings.hijriYear || "1447هـ";
}

async function onPrintSheet(){
  const type = el("sheetType").value;
  const grade = el("sheetGrade").value;
  const section = el("sheetSection").value;
  const term = el("sheetTerm").value;
  const hijri = el("sheetHijri").value.trim();

  if(!grade || !section){ toast("اختر الصف والشعبة"); return; }
  const students = await dbListStudents({grade, section, activeOnly:true, limit: 10000});
  if(!students.length){ toast("لا يوجد طلاب لهذا الصف/الشعبة"); return; }
  printClassSheet({settings: state.settings, type, grade, section, term, hijri, students});
}

async function onPrintCard(){
  const kind = el("cardType").value;
  const s = state.pickedStudent;
  if(!s){ toast("اختر طالب أولًا"); return; }
  const counts = await dbCountStudentEvents(s.nid);

  if(kind==="BEHAVIOR"){
    const ruleId = Number(el("behRuleSelect").value || 0);
    const rule = state.rules.find(r=>r.id===ruleId) || state.rules[0];
    printSmallCard({settings: state.settings, student: s, kind:"BEHAVIOR", counts, behaviorTitle: rule?.title || ""});
  }else{
    printSmallCard({settings: state.settings, student: s, kind, counts});
  }
}

async function onPrintBulkCards(){
  const grade = el("bulkGrade").value;
  const section = el("bulkSection").value;
  if(!grade || !section){ toast("اختر الصف والشعبة"); return; }
  const students = await dbListStudents({grade, section, activeOnly:true, limit: 10000});
  if(!students.length){ toast("لا يوجد طلاب"); return; }

  // counts for each student (cheap for class sizes)
  const countsByNid = {};
  for(const s of students){
    countsByNid[s.nid] = await dbCountStudentEvents(s.nid);
  }
  const title = `${state.settings.schoolName || "ثانوية اليعقوبي الثانوية"} • كروت المتابعة • ${grade}/${section}`;
  printBulkCards({settings: state.settings, title, students, countsByNid});
}

/* -------- Settings -------- */
function refreshSettingsUI(){
  const s = state.settings;
  el("setEduAdmin").value = s.eduAdmin || "";
  el("setSector").value = s.sector || "";
  el("setSchoolName").value = s.schoolName || "";
  el("setLeader").value = s.leader || "";
  el("setHijriYear").value = s.hijriYear || "";
  el("setTerm").value = s.term || "الأول";

  el("setWorkerUrl").value = s.workerUrl || "";
  el("setAppKey").value = s.appKey || "";
  el("setSender").value = s.sender || "";

  renderRulesList();
}

async function saveSchoolSettings(){
  await dbSetSetting("eduAdmin", el("setEduAdmin").value.trim());
  await dbSetSetting("sector", el("setSector").value.trim());
  await dbSetSetting("schoolName", el("setSchoolName").value.trim());
  await dbSetSetting("leader", el("setLeader").value.trim());
  await dbSetSetting("hijriYear", el("setHijriYear").value.trim());
  await dbSetSetting("term", el("setTerm").value);

  state.settings = await dbGetAllSettings();
  toast("تم حفظ بيانات المدرسة");
  refreshPrintSelectors();
}

async function saveSmsSettings(){
  await dbSetSetting("workerUrl", el("setWorkerUrl").value.trim());
  await dbSetSetting("appKey", el("setAppKey").value.trim());
  await dbSetSetting("sender", el("setSender").value.trim());
  state.settings = await dbGetAllSettings();
  toast("تم حفظ إعدادات الرسائل");
}

async function testSmsBalance(){
  try{
    const data = await smsGetBalance(state.settings);
    toast(`الرصيد: ${data.balance ?? "—"}`);
  }catch(err){
    toast(String(err?.message || err));
  }
}

async function sendSmsNow(){
  try{
    const phone = el("smsPhone").value.trim();
    const text = el("smsText").value.trim();
    const data = await smsSend(state.settings, phone, text, el("setSender").value.trim());
    toast(data.message || "تم الإرسال");
  }catch(err){
    toast(String(err?.message || err));
  }
}

function openWhatsAppNow(){
  const phone = el("smsPhone").value.trim();
  const text = el("smsText").value.trim();
  const link = whatsappLink(phone, text);
  window.open(link, "_blank");
}

/* Rules */
async function renderRulesList(){
  state.rules = await dbListRules();
  refreshRuleSelect();
  el("rulesList").innerHTML = state.rules.map(r=>`
    <div class="item">
      <div class="item__top">
        <span class="badge badge--beh">${escapeHtml(levelLabel(r.level))}</span>
        <div class="item__title">${escapeHtml(r.title)}</div>
      </div>
      <div class="item__meta">
        <button class="linkbtn" data-delrule="${r.id}">حذف</button>
      </div>
    </div>
  `).join("");
}

function levelLabel(l){
  if(l==="high") return "عالية";
  if(l==="medium") return "متوسطة";
  return "منخفضة";
}

async function addRuleNow(){
  const title = el("ruleTitle").value.trim();
  const level = el("ruleLevel").value;
  if(!title){ toast("اكتب عنوان المخالفة"); return; }
  await dbAddRule({title, level});
  el("ruleTitle").value = "";
  toast("تمت الإضافة");
  renderRulesList();
}

async function onRuleListClick(e){
  const btn = e.target.closest("button[data-delrule]");
  if(!btn) return;
  const id = Number(btn.dataset.delrule);
  await dbDeleteRule(id);
  toast("تم الحذف");
  renderRulesList();
}

/* Backup */
async function exportBackup(){
  const data = await dbExportBackup();
  const name = `yaqubi-backup-${new Date().toISOString().slice(0,10)}.json`;
  downloadText(name, JSON.stringify(data, null, 2));
  toast("تم تصدير النسخة الاحتياطية");
}

async function importBackup(){
  const inp = document.createElement("input");
  inp.type="file";
  inp.accept=".json";
  inp.onchange = async ()=>{
    const file = inp.files?.[0];
    if(!file) return;
    try{
      const text = await readFileText(file);
      await dbImportBackup(JSON.parse(text));
      state.settings = await dbGetAllSettings();
      await renderRulesList();
      refreshHome();
      refreshPrintSelectors();
      toast("تمت الاستعادة");
    }catch(err){
      toast(String(err?.message || err));
    }
  };
  inp.click();
}

async function wipeAllNow(){
  if(!confirm("سيتم مسح جميع البيانات من هذا الجهاز. هل أنت متأكد؟")) return;
  await dbWipeAll();
  await ensureDefaultSettings();
  await dbEnsureDefaultRules();
  state.settings = await dbGetAllSettings();
  await renderRulesList();
  refreshHome();
  refreshPrintSelectors();
  toast("تم مسح البيانات");
}

/* -------- Service Worker -------- */
function registerSW(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

/* -------- Helpers -------- */
function uniq(arr){
  const s = new Set();
  arr.forEach(x=>{ if(x!==undefined && x!==null && String(x).trim()!=="") s.add(String(x).trim()); });
  return Array.from(s).sort((a,b)=>a.localeCompare(b,"ar"));
}

function escapeHtml(s){
  return String(s??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&apos;");
}

init();
