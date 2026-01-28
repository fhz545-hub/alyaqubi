/* =====================  متابعة الطلاب — وضع خصوصية (بدون عرض أسماء بالقوائم)  ===================== */

const STORE = {
  students: "alyaqubi_students_v2",
  logs: "alyaqubi_logs_v2",
  settings: "alyaqubi_settings_v2",
  pin: "alyaqubi_pin_v2",
  taxonomy: "alyaqubi_taxonomy_v2",
};

const $ = (id) => document.getElementById(id);

// عناصر
const el = {
  // nav/views
  tabs: Array.from(document.querySelectorAll(".tab")),
  views: Array.from(document.querySelectorAll(".view")),

  // top actions
  btnImport: $("btnImport"),
  btnBackup: $("btnBackup"),

  // search
  studentSearch: $("studentSearch"),
  btnSearch: $("btnSearch"),
  searchStatus: $("searchStatus"),
  matchList: $("matchList"),
  studentCard: $("studentCard"),
  studentMeta: $("studentMeta"),
  maskedName: $("maskedName"),
  stClassView: $("stClassView"),
  stIdMasked: $("stIdMasked"),
  stParentMasked: $("stParentMasked"),
  btnClear: $("btnClear"),
  btnOpenAttendance: $("btnOpenAttendance"),
  btnOpenBehavior: $("btnOpenBehavior"),

  // dialogs
  dlgAttendance: $("dlgAttendance"),
  attStudentLine: $("attStudentLine"),
  attStatus: $("attStatus"),
  attWhen: $("attWhen"),
  attExcused: $("attExcused"),
  attNote: $("attNote"),
  attMsg: $("attMsg"),
  btnAttSend: $("btnAttSend"),
  btnAttSave: $("btnAttSave"),
  attStudentId: $("attStudentId"),

  dlgBehavior: $("dlgBehavior"),
  behStudentLine: $("behStudentLine"),
  behDegree: $("behDegree"),
  behViolation: $("behViolation"),
  behWhen: $("behWhen"),
  behNote: $("behNote"),
  behMsg: $("behMsg"),
  behPointsPill: $("behPointsPill"),
  behActionsLine: $("behActionsLine"),
  btnBehSend: $("btnBehSend"),
  btnBehSave: $("btnBehSave"),
  behStudentId: $("behStudentId"),

  dlgBackup: $("dlgBackup"),
  btnDoBackup: $("btnDoBackup"),
  restoreFile: $("restoreFile"),

  dlgTaxonomy: $("dlgTaxonomy"),
  taxJson: $("taxJson"),
  btnOpenTaxonomy: $("btnOpenTaxonomy"),
  btnSaveTax: $("btnSaveTax"),

  // inputs
  importFile: $("importFile"),

  // log
  viewLog: $("viewLog"),
  logFilter: $("logFilter"),
  btnExportXlsx: $("btnExportXlsx"),
  btnClearLog: $("btnClearLog"),
  logList: $("logList"),

  // settings
  setSchoolName: $("setSchoolName"),
  setPrincipalName: $("setPrincipalName"),
  setCountryCode: $("setCountryCode"),
  setDefaultChannel: $("setDefaultChannel"),
  setPin: $("setPin"),
  btnSavePin: $("btnSavePin"),
  btnClearPin: $("btnClearPin"),
  btnResetAll: $("btnResetAll"),

  // lock
  lockScreen: $("lockScreen"),
  pinInput: $("pinInput"),
  btnUnlock: $("btnUnlock"),
  pinErr: $("pinErr"),
};

// حالة
let state = {
  selectedId: null,
  selected: null,
  lastMatches: [],
};

/* ===================== أدوات عامة ===================== */
function readLS(key, fallback){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  }catch(e){ return fallback; }
}
function writeLS(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function nowLocalInputValue(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function normalizeArabic(s){
  return String(s||"")
    .trim()
    .replace(/\s+/g," ")
    .replace(/[إأآا]/g,"ا")
    .replace(/ى/g,"ي")
    .replace(/ة/g,"ه")
    .replace(/[^\u0600-\u06FF0-9\s]/g,"")
    .toLowerCase();
}

function digitsOnly(s){
  return String(s||"").replace(/\D/g,"");
}

function maskName(name){
  const t = String(name||"").trim();
  if(!t) return "••••";
  if(t.length <= 2) return t[0] + "•";
  const first = t[0];
  const last = t[t.length-1];
  return first + "•".repeat(Math.min(6, Math.max(3, t.length-2))) + last;
}

function maskPhone(p){
  const d = digitsOnly(p);
  if(!d) return "—";
  const last4 = d.slice(-4);
  return "****" + last4;
}
function maskId(n){
  const d = digitsOnly(n);
  if(!d) return "—";
  const last4 = d.slice(-4);
  return "****" + last4;
}

function uid(){
  return "st_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ===================== البيانات ===================== */
function getStudents(){ return readLS(STORE.students, []); }
function setStudents(list){ writeLS(STORE.students, list); }

function getLogs(){ return readLS(STORE.logs, []); }
function setLogs(list){ writeLS(STORE.logs, list); }

function getSettings(){
  return readLS(STORE.settings, {
    schoolName: "",
    principalName: "",
    countryCode: "966",
    defaultChannel: "whatsapp",
  });
}
function setSettings(s){ writeLS(STORE.settings, s); }

function getTaxonomy(){
  return readLS(STORE.taxonomy, defaultTaxonomy());
}
function setTaxonomy(t){ writeLS(STORE.taxonomy, t); }

async function seedIfEmpty(){
  const list = getStudents();
  if(list.length) return;
  try{
    const res = await fetch("students-seed.json", {cache:"no-store"});
    if(!res.ok) return;
    const seed = await res.json();
    if(Array.isArray(seed) && seed.length){
      const normalized = seed.map(x => ({
        id: x.id || uid(),
        name: String(x.name||"").trim(),
        idNumber: String(x.idNumber||"").trim(),
        class: String(x.class||"").trim(),
        notes: String(x.notes||"").trim(),
        parentName: String(x.parentName||"").trim(),
        parentMobile: String(x.parentMobile||"").trim(),
      })).filter(s=>s.name || s.idNumber);
      setStudents(normalized);
    }
  }catch(e){}
}

/* ===================== القفل ===================== */
function pinGet(){ return localStorage.getItem(STORE.pin) || ""; }
function pinSet(v){ localStorage.setItem(STORE.pin, v || ""); }

function applyLockIfNeeded(){
  const p = pinGet();
  if(!p){
    el.lockScreen.classList.add("hidden");
    el.lockScreen.setAttribute("aria-hidden","true");
    return;
  }
  el.lockScreen.classList.remove("hidden");
  el.lockScreen.setAttribute("aria-hidden","false");
  el.pinInput.value = "";
  el.pinErr.classList.add("hidden");
}
function tryUnlock(){
  const p = pinGet();
  const entered = (el.pinInput.value||"").trim();
  if(entered && entered === p){
    el.lockScreen.classList.add("hidden");
    el.lockScreen.setAttribute("aria-hidden","true");
    el.pinErr.classList.add("hidden");
  }else{
    el.pinErr.classList.remove("hidden");
  }
}

/* ===================== التنقل ===================== */
function openView(viewId){
  el.views.forEach(v => v.classList.toggle("active", v.id === viewId));
  el.tabs.forEach(t => t.classList.toggle("active", t.dataset.view === viewId));
}

/* ===================== البحث (بدون أسماء) ===================== */
function searchStudents(queryRaw){
  const q = String(queryRaw||"").trim();
  if(!q) return [];
  const list = getStudents();

  const qDigits = digitsOnly(q);
  const qNorm = normalizeArabic(q);

  return list.filter(s=>{
    const nameNorm = normalizeArabic(s.name);
    const idDigits = digitsOnly(s.idNumber);
    // البحث: رقم أو جزء من الاسم
    if(qDigits && idDigits.includes(qDigits)) return true;
    if(qNorm && nameNorm.includes(qNorm)) return true;
    return false;
  });
}

function renderMatches(matches){
  state.lastMatches = matches;

  el.matchList.innerHTML = "";
  el.matchList.classList.toggle("hidden", matches.length <= 1);

  if(matches.length > 1){
    // عرض بدون أسماء: الصف + آخر4
    matches.slice(0, 20).forEach(s=>{
      const item = document.createElement("div");
      item.className = "matchItem";
      const cls = (s.class || "—");
      const id4 = maskId(s.idNumber);
      item.innerHTML = `
        <div>
          <div style="font-weight:900">طالب</div>
          <div class="muted small">${cls} • ${id4}</div>
        </div>
        <div class="tag">اختيار</div>
      `;
      item.addEventListener("click", ()=> selectStudentById(s.id));
      el.matchList.appendChild(item);
    });

    if(matches.length > 20){
      const more = document.createElement("div");
      more.className = "muted small";
      more.style.marginTop = "6px";
      more.textContent = `يوجد ${matches.length} نتيجة. ضيّق البحث لنتائج أقل.`;
      el.matchList.appendChild(more);
    }
  }
}

function selectStudentById(id){
  const s = getStudents().find(x=>x.id === id);
  state.selectedId = id;
  state.selected = s || null;

  if(!s){
    el.studentCard.classList.add("hidden");
    el.searchStatus.textContent = "لم يتم العثور على السجل.";
    return;
  }

  // عرض مقنّع فقط
  el.studentMeta.textContent = "تم اختيار سجل مطابق (عرض مقنّع)";
  el.maskedName.textContent = maskName(s.name);
  el.stClassView.textContent = s.class || "—";
  el.stIdMasked.textContent = maskId(s.idNumber);
  el.stParentMasked.textContent = maskPhone(s.parentMobile);

  el.studentCard.classList.remove("hidden");
  el.matchList.classList.add("hidden");

  el.searchStatus.textContent = "✅ تم العثور على سجل. يمكنك الآن تسجيل مواظبة أو سلوك.";
}

function clearSelection(){
  state.selectedId = null;
  state.selected = null;
  el.studentCard.classList.add("hidden");
  el.matchList.classList.add("hidden");
  el.searchStatus.textContent = "تم إخفاء البيانات.";
}

/* ===================== سجل + تصدير ===================== */
function addLog(entry){
  const logs = getLogs();
  logs.unshift(entry);
  setLogs(logs);
  renderLogs();
}

function renderLogs(){
  const logs = getLogs();
  const filter = el.logFilter.value || "all";
  const shown = logs.filter(l => filter === "all" ? true : l.type === filter);

  el.logList.innerHTML = "";
  if(!shown.length){
    el.logList.innerHTML = `<div class="muted" style="padding:10px">لا يوجد سجل.</div>`;
    return;
  }

  shown.slice(0, 200).forEach(l=>{
    const card = document.createElement("div");
    card.className = "logCard";

    const pillClass = l.type === "behavior" ? "bad" : "ok";
    const label = l.type === "attendance" ? "مواظبة" : (l.type === "behavior" ? "سلوك" : "رسالة");
    const when = new Date(l.when).toLocaleString("ar-SA");

    // لا أسماء هنا: فقط مقنّع
    card.innerHTML = `
      <div class="logTop">
        <span class="pill ${pillClass}">${label}</span>
        <span class="muted small">${when}</span>
      </div>
      <div style="margin-top:8px;font-weight:900">${l.studentTag || "طالب"}</div>
      <div class="muted" style="margin-top:6px;white-space:pre-wrap">${l.note || ""}</div>
    `;
    el.logList.appendChild(card);
  });
}

function exportLogsXlsx(){
  if(!window.XLSX){
    alert("مكتبة Excel لم تُحمَّل بعد.");
    return;
  }
  const logs = getLogs();
  const rows = logs.map(l=>({
    النوع: l.type,
    الطالب_مقنع: l.studentTag || "",
    التاريخ: new Date(l.when).toLocaleString("ar-SA"),
    ملاحظة: l.note || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "السجل");
  XLSX.writeFile(wb, "سجل-متابعة-مقنع.xlsx");
}

/* ===================== تصنيف المخالفات ===================== */
function defaultTaxonomy(){
  return {
    "1": [
      { v: "التأخر عن الحصة", points: 1, actions: "تنبيه شفهي + إشعار ولي الأمر" },
      { v: "عدم إحضار الأدوات", points: 1, actions: "تنبيه + متابعة" },
    ],
    "2": [
      { v: "إثارة الشغب", points: 2, actions: "إنذار + إشعار ولي الأمر" },
      { v: "تلفظ غير لائق", points: 2, actions: "معالجة تربوية + إشعار" },
    ],
    "3": [
      { v: "اعتداء لفظي", points: 3, actions: "إحالة للمرشد + إشعار" },
    ],
    "4": [
      { v: "اعتداء بدني", points: 4, actions: "تطبيق الإجراءات النظامية" },
    ],
    "5": [
      { v: "سلوك جسيم", points: 5, actions: "تطبيق الإجراءات النظامية" },
    ]
  };
}

function rebuildBehaviorViolations(){
  const tax = getTaxonomy();
  const deg = el.behDegree.value || "1";
  const list = Array.isArray(tax[deg]) ? tax[deg] : [];

  el.behViolation.innerHTML = "";
  list.forEach((x, idx)=>{
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = x.v;
    el.behViolation.appendChild(opt);
  });

  updateBehaviorMeta();
}

function updateBehaviorMeta(){
  const tax = getTaxonomy();
  const deg = el.behDegree.value || "1";
  const list = Array.isArray(tax[deg]) ? tax[deg] : [];
  const idx = parseInt(el.behViolation.value || "0", 10);
  const item = list[idx] || {points:0, actions:"—", v:"—"};

  el.behPointsPill.textContent = `خصم: ${item.points||0}`;
  el.behActionsLine.textContent = `إجراءات مقترحة: ${item.actions||"—"}`;

  // رسالة بدون اسم الطالب
  const s = state.selected || null;
  const school = getSettings().schoolName || "المدرسة";
  const v = item.v || "مخالفة سلوكية";
  const when = el.behWhen.value ? new Date(el.behWhen.value).toLocaleString("ar-SA") : new Date().toLocaleString("ar-SA");

  el.behMsg.value =
`نأمل الإحاطة بأن (ابنكم) تم تسجيل: ${v}.
التاريخ/الوقت: ${when}
المدرسة: ${school}
يرجى التعاون والمتابعة.`;
}

/* ===================== مواظبة/سلوك ===================== */
function openAttendance(){
  if(!state.selected) return;
  el.attStudentId.value = state.selected.id;
  el.attWhen.value = nowLocalInputValue();
  el.attStatus.value = "present";
  el.attExcused.value = "no";
  el.attNote.value = "";

  const school = getSettings().schoolName || "المدرسة";
  el.attStudentLine.textContent = `سجل مقنّع: ${state.selected.class || "—"} • ${maskId(state.selected.idNumber)}`;
  el.attMsg.value =
`نحيطكم علمًا بأن (ابنكم) تم تسجيل حالة مواظبة اليوم.
المدرسة: ${school}
شاكرين تعاونكم.`;

  el.dlgAttendance.showModal();
}

function openBehavior(){
  if(!state.selected) return;
  el.behStudentId.value = state.selected.id;
  el.behWhen.value = nowLocalInputValue();
  el.behDegree.value = "1";
  rebuildBehaviorViolations();
  el.behNote.value = "";

  el.behStudentLine.textContent = `سجل مقنّع: ${state.selected.class || "—"} • ${maskId(state.selected.idNumber)}`;

  el.dlgBehavior.showModal();
}

function saveAttendance(send=false){
  const s = state.selected;
  if(!s) return;

  const when = el.attWhen.value ? new Date(el.attWhen.value).toISOString() : new Date().toISOString();
  const status = el.attStatus.value;
  const excused = el.attExcused.value;
  const note = (el.attNote.value||"").trim();

  const tag = `${s.class || "—"} • ${maskId(s.idNumber)}`;

  addLog({
    id: "log_" + Date.now(),
    type: "attendance",
    when,
    studentId: s.id,
    studentTag: tag,
    note: `الحالة: ${status} • ${excused === "yes" ? "بعذر" : "بدون عذر"}${note ? "\nملاحظة: " + note : ""}`,
  });

  if(send) sendMessageToParent(s, el.attMsg.value);

  el.dlgAttendance.close();
}

function saveBehavior(send=false){
  const s = state.selected;
  if(!s) return;

  const when = el.behWhen.value ? new Date(el.behWhen.value).toISOString() : new Date().toISOString();
  const deg = el.behDegree.value;
  const note = (el.behNote.value||"").trim();

  const tax = getTaxonomy();
  const list = Array.isArray(tax[deg]) ? tax[deg] : [];
  const idx = parseInt(el.behViolation.value || "0", 10);
  const item = list[idx] || {v:"—", points:0, actions:"—"};

  const tag = `${s.class || "—"} • ${maskId(s.idNumber)}`;

  addLog({
    id: "log_" + Date.now(),
    type: "behavior",
    when,
    studentId: s.id,
    studentTag: tag,
    note: `الدرجة: ${deg}\nالمخالفة: ${item.v}\nإجراءات: ${item.actions}${note ? "\nتفاصيل: " + note : ""}`,
  });

  if(send) sendMessageToParent(s, el.behMsg.value);

  el.dlgBehavior.close();
}

function sendMessageToParent(student, msg){
  const settings = getSettings();
  const mobile = digitsOnly(student.parentMobile);
  if(!mobile){
    alert("لا يوجد رقم ولي أمر لهذا السجل.");
    return;
  }
  const cc = digitsOnly(settings.countryCode || "966");
  const full = mobile.startsWith("0") ? mobile.slice(1) : mobile;
  const phone = cc + full;

  const text = encodeURIComponent(String(msg||"").trim());

  // الافتراضي: واتساب
  const channel = settings.defaultChannel || "whatsapp";
  if(channel === "whatsapp"){
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
    addLog({
      id: "log_" + Date.now(),
      type: "message",
      when: new Date().toISOString(),
      studentId: student.id,
      studentTag: `${student.class || "—"} • ${maskId(student.idNumber)}`,
      note: `تم فتح واتساب لإرسال رسالة.\nالنص:\n${String(msg||"").trim()}`,
    });
  }else if(channel === "sms"){
    window.location.href = `sms:${phone}?&body=${text}`;
  }else{
    window.location.href = `tel:${phone}`;
  }
}

/* ===================== الاستيراد Excel ===================== */
function openImport(){ el.importFile.click(); }

async function importFromExcel(file){
  if(!window.XLSX){
    alert("مكتبة Excel لم تُحمَّل بعد.");
    return;
  }
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:""});

  // محاولة فهم الأعمدة (اسم/هوية/صف/ولي/جوال)
  const mapKey = (obj, keys)=>{
    for(const k of keys){
      const found = Object.keys(obj).find(x => normalizeArabic(x) === normalizeArabic(k));
      if(found) return found;
    }
    return null;
  };

  const out = [];
  for(const r of rows){
    const kName = mapKey(r, ["اسم الطالب","الطالب","الاسم"]);
    const kId = mapKey(r, ["رقم الهوية","رقم الإقامة","الهوية/الإقامة","الهوية"]);
    const kClass = mapKey(r, ["الصف","الصف/الشعبة","الشعبة"]);
    const kPName = mapKey(r, ["اسم ولي الأمر","ولي الأمر"]);
    const kPMob = mapKey(r, ["جوال ولي الأمر","رقم الجوال","جوال"]);

    const s = {
      id: uid(),
      name: String(kName ? r[kName] : "").trim(),
      idNumber: String(kId ? r[kId] : "").trim(),
      class: String(kClass ? r[kClass] : "").trim(),
      notes: "",
      parentName: String(kPName ? r[kPName] : "").trim(),
      parentMobile: String(kPMob ? r[kPMob] : "").trim(),
    };

    if(s.name || s.idNumber) out.push(s);
  }

  if(!out.length){
    alert("لم يتم التعرف على الأعمدة. تأكد من وجود (اسم الطالب/رقم الهوية/الصف).");
    return;
  }

  // دمج: إذا نفس الهوية موجودة استبدل
  const existing = getStudents();
  const byId = new Map(existing.map(x => [digitsOnly(x.idNumber), x]));
  out.forEach(n=>{
    const key = digitsOnly(n.idNumber);
    if(key && byId.has(key)){
      const old = byId.get(key);
      Object.assign(old, n, {id: old.id}); // احتفظ بالمعرف
    }else{
      existing.push(n);
    }
  });

  setStudents(existing);
  el.searchStatus.textContent = `✅ تم استيراد/تحديث ${out.length} سجل.`;
}

/* ===================== نسخ احتياطي/استعادة ===================== */
function openBackup(){
  el.dlgBackup.showModal();
}
function doBackup(){
  const payload = {
    v: 2,
    when: new Date().toISOString(),
    students: getStudents(),
    logs: getLogs(),
    settings: getSettings(),
    taxonomy: getTaxonomy(),
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "backup-alyqubi-privacy.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function doRestore(file){
  const text = await file.text();
  const data = JSON.parse(text);

  if(data && data.students) setStudents(data.students);
  if(data && data.logs) setLogs(data.logs);
  if(data && data.settings) setSettings(data.settings);
  if(data && data.taxonomy) setTaxonomy(data.taxonomy);

  el.dlgBackup.close();
  renderLogs();
  el.searchStatus.textContent = "✅ تمت الاستعادة بنجاح.";
}

/* ===================== إعدادات ===================== */
function loadSettingsUI(){
  const s = getSettings();
  el.setSchoolName.value = s.schoolName || "";
  el.setPrincipalName.value = s.principalName || "";
  el.setCountryCode.value = s.countryCode || "966";
  el.setDefaultChannel.value = s.defaultChannel || "whatsapp";
}

function saveSettingsFromUI(){
  const s = getSettings();
  s.schoolName = el.setSchoolName.value.trim();
  s.principalName = el.setPrincipalName.value.trim();
  s.countryCode = digitsOnly(el.setCountryCode.value.trim()) || "966";
  s.defaultChannel = el.setDefaultChannel.value;
  setSettings(s);
}

function openTaxonomy(){
  const tax = getTaxonomy();
  el.taxJson.value = JSON.stringify(tax, null, 2);
  el.dlgTaxonomy.showModal();
}
function saveTaxonomy(){
  try{
    const obj = JSON.parse(el.taxJson.value);
    setTaxonomy(obj);
    el.dlgTaxonomy.close();
    rebuildBehaviorViolations();
  }catch(e){
    alert("JSON غير صالح.");
  }
}

function resetAll(){
  if(!confirm("تأكيد حذف جميع البيانات من هذا الجهاز؟")) return;
  localStorage.removeItem(STORE.students);
  localStorage.removeItem(STORE.logs);
  localStorage.removeItem(STORE.settings);
  localStorage.removeItem(STORE.taxonomy);
  state.selected = null;
  state.selectedId = null;
  el.studentCard.classList.add("hidden");
  el.matchList.classList.add("hidden");
  el.searchStatus.textContent = "تمت إعادة الضبط.";
  renderLogs();
  loadSettingsUI();
}

/* ===================== أحداث ===================== */
function wireEvents(){
  // nav
  el.tabs.forEach(t=>{
    t.addEventListener("click", ()=>{
      openView(t.dataset.view);
      if(t.dataset.view === "viewLog") renderLogs();
      if(t.dataset.view === "viewSettings") loadSettingsUI();
    });
  });

  // lock
  el.btnUnlock.addEventListener("click", tryUnlock);
  el.pinInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") tryUnlock(); });

  // search
  el.btnSearch.addEventListener("click", ()=> runSearch());
  el.studentSearch.addEventListener("keydown", (e)=>{ if(e.key==="Enter") runSearch(); });

  el.btnClear.addEventListener("click", clearSelection);

  // actions
  el.btnOpenAttendance.addEventListener("click", openAttendance);
  el.btnOpenBehavior.addEventListener("click", openBehavior);

  // attendance save/send
  el.btnAttSave.addEventListener("click", (e)=>{ e.preventDefault(); saveAttendance(false); });
  el.btnAttSend.addEventListener("click", (e)=>{ e.preventDefault(); saveAttendance(true); });

  // behavior
  el.behDegree.addEventListener("change", rebuildBehaviorViolations);
  el.behViolation.addEventListener("change", updateBehaviorMeta);
  el.behWhen.addEventListener("change", updateBehaviorMeta);

  el.btnBehSave.addEventListener("click", (e)=>{ e.preventDefault(); saveBehavior(false); });
  el.btnBehSend.addEventListener("click", (e)=>{ e.preventDefault(); saveBehavior(true); });

  // import
  el.btnImport.addEventListener("click", openImport);
  el.importFile.addEventListener("change", async ()=>{
    const f = el.importFile.files && el.importFile.files[0];
    el.importFile.value = "";
    if(!f) return;
    try{ await importFromExcel(f); }catch(e){ alert("فشل الاستيراد."); }
  });

  // backup
  el.btnBackup.addEventListener("click", openBackup);
  el.btnDoBackup.addEventListener("click", (e)=>{ e.preventDefault(); doBackup(); });
  el.restoreFile.addEventListener("change", async ()=>{
    const f = el.restoreFile.files && el.restoreFile.files[0];
    el.restoreFile.value = "";
    if(!f) return;
    try{ await doRestore(f); }catch(e){ alert("فشل الاستعادة."); }
  });

  // log
  el.logFilter.addEventListener("change", renderLogs);
  el.btnExportXlsx.addEventListener("click", exportLogsXlsx);
  el.btnClearLog.addEventListener("click", ()=>{
    if(!confirm("مسح السجل بالكامل؟")) return;
    setLogs([]);
    renderLogs();
  });

  // settings auto-save
  [el.setSchoolName, el.setPrincipalName, el.setCountryCode, el.setDefaultChannel].forEach(inp=>{
    inp.addEventListener("input", saveSettingsFromUI);
    inp.addEventListener("change", saveSettingsFromUI);
  });

  // pin
  el.btnSavePin.addEventListener("click", ()=>{
    const p = (el.setPin.value||"").trim();
    if(p && p.length < 4) { alert("الرمز لا يقل عن 4 أرقام."); return; }
    if(p){ pinSet(p); el.setPin.value = ""; alert("تم حفظ الرمز."); applyLockIfNeeded(); }
    else { alert("أدخل رمزًا."); }
  });
  el.btnClearPin.addEventListener("click", ()=>{
    pinSet("");
    alert("تمت إزالة القفل.");
    applyLockIfNeeded();
  });

  // taxonomy
  el.btnOpenTaxonomy.addEventListener("click", openTaxonomy);
  el.btnSaveTax.addEventListener("click", (e)=>{ e.preventDefault(); saveTaxonomy(); });

  // reset
  el.btnResetAll.addEventListener("click", resetAll);
}

function runSearch(){
  const q = el.studentSearch.value.trim();
  if(!q){
    el.searchStatus.textContent = "اكتب كلمة بحث أولاً.";
    el.matchList.classList.add("hidden");
    el.studentCard.classList.add("hidden");
    return;
  }

  const matches = searchStudents(q);

  if(matches.length === 0){
    el.searchStatus.textContent = "لا توجد نتائج. جرّب كتابة الاسم بشكل أدق أو رقم الهوية/الإقامة.";
    el.matchList.classList.add("hidden");
    el.studentCard.classList.add("hidden");
    return;
  }

  if(matches.length === 1){
    el.searchStatus.textContent = "تم العثور على نتيجة واحدة.";
    renderMatches(matches);
    selectStudentById(matches[0].id);
    return;
  }

  // متعددة: بدون أسماء
  el.searchStatus.textContent = `تم العثور على ${matches.length} نتائج (بدون أسماء). اختر السجل الصحيح.`;
  el.studentCard.classList.add("hidden");
  renderMatches(matches);
}

/* ===================== تشغيل ===================== */
(async function init(){
  wireEvents();
  await seedIfEmpty();
  loadSettingsUI();
  rebuildBehaviorViolations();
  renderLogs();
  applyLockIfNeeded();
  openView("viewSearch");
})();
