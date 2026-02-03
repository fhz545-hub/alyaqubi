import { openDB, put, get, all, del, uid, setSetting, getSetting, byIndexRange } from "./db.js";
import { hashPassword, verifyPassword } from "./security.js";
import { DEFAULT_RULES, renderTemplate, suggestAttendance, suggestBehavior } from "./rules.js";
import { queueSms, flushSmsQueue, removeSms } from "./sms.js";
import { makeBackup, restoreBackup } from "./backup.js";

let db = null;
let currentUser = null;
let currentStudent = null;
let rules = DEFAULT_RULES;

const ROLES = {
  ADMIN:"admin",
  DEPUTY:"deputy",
  COUNSELOR:"counselor",
  TEACHER:"teacher",
  VIEWER:"viewer"
};

const PERMS = {
  STUDENTS_READ:"students.read",
  STUDENTS_WRITE:"students.write",
  STUDENTS_IMPORT:"students.import",
  ATT_WRITE:"attendance.write",
  ATT_APPROVE:"attendance.approve",
  BEH_WRITE:"behavior.write",
  BEH_APPROVE:"behavior.approve",
  SMS_SEND:"sms.send",
  USERS_MANAGE:"users.manage",
  SETTINGS_MANAGE:"settings.manage",
  AUDIT_READ:"audit.read"
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMS),
  [ROLES.DEPUTY]: [
    PERMS.STUDENTS_READ, PERMS.STUDENTS_WRITE, PERMS.STUDENTS_IMPORT,
    PERMS.ATT_WRITE, PERMS.ATT_APPROVE,
    PERMS.BEH_WRITE, PERMS.BEH_APPROVE,
    PERMS.SMS_SEND, PERMS.AUDIT_READ
  ],
  [ROLES.COUNSELOR]: [
    PERMS.STUDENTS_READ,
    PERMS.BEH_WRITE, PERMS.BEH_APPROVE,
    PERMS.SMS_SEND, PERMS.AUDIT_READ
  ],
  [ROLES.TEACHER]: [
    PERMS.STUDENTS_READ,
    PERMS.ATT_WRITE,
    PERMS.BEH_WRITE
  ],
  [ROLES.VIEWER]: [PERMS.STUDENTS_READ, PERMS.AUDIT_READ]
};

function can(perm){
  if(!currentUser) return false;
  const role = currentUser.role;
  return (ROLE_PERMISSIONS[role] || []).includes(perm);
}

function $(id){ return document.getElementById(id); }
function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function norm(s=""){
  return String(s)
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g,"")
    .replace(/[أإآ]/g,"ا")
    .replace(/ة/g,"ه")
    .replace(/\s+/g," ")
    .trim();
}

function containsLoose(hay, needle){
  hay = norm(hay);
  needle = norm(needle);
  if(!needle) return true;
  // دعم "بن/ابن" بتخفيف أثره
  const n2 = needle.replace(/\b(بن|ابن)\b/g,"").trim();
  return hay.includes(needle) || (n2 && hay.includes(n2));
}

async function audit(action, details=""){
  const item = {
    id: uid("audit"),
    at: new Date().toISOString(),
    userId: currentUser?.userId || "system",
    userName: currentUser?.name || "system",
    action,
    details
  };
  await put(db, "audit_log", item);
}

async function ensureDefaults(){
  // المدرسة
  const school = await getSetting(db, "schoolName", "");
  if(school) $("schoolName").textContent = school;

  // قواعد
  const savedRules = await getSetting(db, "rules", null);
  rules = savedRules || DEFAULT_RULES;

  // مستخدم admin
  const users = await all(db, "users");
  if(users.length === 0){
    const { salt, hash } = await hashPassword("admin123");
    const admin = {
      userId: "admin",
      name: "مدير النظام",
      role: ROLES.ADMIN,
      active: true,
      passSalt: salt,
      passHash: hash,
      createdAt: new Date().toISOString()
    };
    await put(db, "users", admin);
    await audit("init", "إنشاء admin الافتراضي");
  }
}

function showView(view){
  const views = [
    "login","dashboard","students","attendance","behavior","sms","reports","users","settings"
  ];
  for(const v of views){
    const el = $(`view-${v}`);
    if(el) el.hidden = (v !== view);
  }
  // sidebar active
  qa(".navItem").forEach(b=>{
    b.classList.toggle("active", b.dataset.view === view);
  });
}

function setAuthedUI(on){
  $("sidebar").hidden = !on;
  $("btnLogout").hidden = !on;
}

async function refreshSchool(){
  const school = await getSetting(db, "schoolName", "");
  $("schoolName").textContent = school || "—";
  $("setSchoolName").value = school || "";
}

async function loadRulesToEditor(){
  $("rulesEditor").value = JSON.stringify(rules, null, 2);
}

async function updateDashboard(){
  const students = await all(db, "students");
  const att = await all(db, "attendance_events");
  const beh = await all(db, "behavior_events");
  const smsQ = await all(db, "sms_queue");
  const t = todayISO();

  $("stStudents").textContent = students.length;
  $("stAttToday").textContent = att.filter(x=>x.dateISO===t).length;
  $("stBehToday").textContent = beh.filter(x=>x.dateISO===t).length;
  $("stSmsQueue").textContent = smsQ.filter(x=>x.status!=="sent").length;

  // audit table
  const aud = (await all(db, "audit_log"))
    .sort((a,b)=> (b.at||"").localeCompare(a.at||""))
    .slice(0, 20);

  const tb = $("auditTable").querySelector("tbody");
  tb.innerHTML = "";
  for(const x of aud){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${x.at.replace("T"," ").slice(0,19)}</td>
      <td>${x.userName}</td>
      <td>${x.action}</td>
      <td>${escapeHtml(x.details || "")}</td>
    `;
    tb.appendChild(tr);
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

/* ---------------- Students ---------------- */

async function renderStudentsTable(){
  if(!can(PERMS.STUDENTS_READ)) return;

  const students = await all(db, "students");
  const q1 = $("studentSearch").value || "";
  const f1 = $("studentFilter").value || "";

  const filtered = students.filter(s=>{
    const hit = containsLoose(`${s.studentId} ${s.name}`, q1);
    const hit2 = !f1 || containsLoose(`${s.grade} ${s.classroom}`, f1) || containsLoose(`${s.grade}-${s.classroom}`, f1);
    return hit && hit2;
  }).sort((a,b)=> (a.name||"").localeCompare(b.name||""));

  const tb = $("studentsTable").querySelector("tbody");
  tb.innerHTML = "";
  for(const s of filtered){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.studentId)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.grade||"")}</td>
      <td>${escapeHtml(s.classroom||"")}</td>
      <td>${escapeHtml(s.parentPhone||"")}</td>
      <td>
        <button class="btn" data-open="${s.studentId}">فتح</button>
        ${can(PERMS.STUDENTS_WRITE) ? `<button class="btn danger" data-del="${s.studentId}">حذف</button>` : ""}
      </td>
    `;
    tb.appendChild(tr);
  }

  // handlers
  tb.querySelectorAll("[data-open]").forEach(btn=>{
    btn.onclick = ()=> openStudentCard(btn.dataset.open);
  });
  tb.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      if(!confirm("تأكيد حذف الطالب؟")) return;
      await del(db, "students", btn.dataset.del);
      await audit("students.delete", `studentId=${btn.dataset.del}`);
      await renderStudentsTable();
      await updateDashboard();
    };
  });
}

async function openStudentCard(studentId){
  const s = await get(db, "students", studentId);
  if(!s) return alert("الطالب غير موجود");
  currentStudent = s;

  $("studentCard").hidden = false;
  $("scName").textContent = s.name;
  $("scMeta").textContent = `الهوية: ${s.studentId} • الصف: ${s.grade||"-"} • الشعبة: ${s.classroom||"-"} • ولي الأمر: ${s.parentPhone||"-"}`;

  // notes
  $("scNotes").value = s.notes || "";

  // load events
  await renderStudentEvents(s.studentId);

  await audit("students.open", `studentId=${s.studentId}`);
}

async function renderStudentEvents(studentId){
  const att = (await all(db, "attendance_events"))
    .filter(x=>x.studentId===studentId)
    .sort((a,b)=> (b.dateISO||"").localeCompare(a.dateISO||""));

  const beh = (await all(db, "behavior_events"))
    .filter(x=>x.studentId===studentId)
    .sort((a,b)=> (b.dateISO||"").localeCompare(a.dateISO||""));

  const attTb = $("scAttTable").querySelector("tbody");
  attTb.innerHTML = "";
  for(const x of att){
    attTb.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${x.dateISO}</td>
        <td>${escapeHtml(x.typeLabel||x.typeCode)}</td>
        <td>${escapeHtml(x.details||"")}</td>
        <td>${escapeHtml(x.suggestedText||"")}</td>
        <td>${x.needsApproval ? "نعم" : "لا"}</td>
      </tr>
    `);
  }

  const behTb = $("scBehTable").querySelector("tbody");
  behTb.innerHTML = "";
  for(const x of beh){
    behTb.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${x.dateISO}</td>
        <td>${escapeHtml(x.codeLabel||x.code)}</td>
        <td>${escapeHtml(x.severity||"")}</td>
        <td>${escapeHtml(x.suggestedText||"")}</td>
        <td>${x.needsApproval ? "نعم" : "لا"}</td>
      </tr>
    `);
  }
}

/* ---------------- Import ---------------- */

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length<2) return [];
  const headers = lines[0].split(",").map(h=>h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(","); // بسيط (إذا تحتاج دعم اقتباس أخبرني)
    const obj = {};
    headers.forEach((h,idx)=> obj[h]= (cols[idx]||"").trim());
    rows.push(obj);
  }
  return rows;
}

function mapStudentRow(r){
  // يدعم عناوين عربية/إنجليزية شائعة
  const pick = (...keys)=>{
    for(const k of keys){
      if(r[k] != null && String(r[k]).trim()!=="") return String(r[k]).trim();
    }
    return "";
  };

  const studentId = pick("studentId","الهوية","رقم الهوية","ID","NationalID","الهوية الوطنية","رقم السجل");
  const name = pick("name","الاسم","اسم الطالب","StudentName");
  const grade = pick("grade","الصف","المرحلة","Grade");
  const classroom = pick("classroom","الشعبة","الفصل","Section","Class");
  const parentPhone = pick("parentPhone","جوال ولي الأمر","جوال ولي الامر","رقم الجوال","Phone","ParentPhone");

  if(!studentId || !name) return null;
  return {
    studentId,
    name,
    grade,
    classroom,
    parentPhone,
    notes: "",
    createdAt: new Date().toISOString()
  };
}

async function importStudentsFromFile(file){
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if(ext === "csv"){
    const text = await file.text();
    const rows = parseCSV(text);
    let ok=0, bad=0;
    for(const r of rows){
      const s = mapStudentRow(r);
      if(!s){ bad++; continue; }
      await put(db, "students", s);
      ok++;
    }
    await audit("students.import", `csv ok=${ok} bad=${bad}`);
    alert(`تم الاستيراد: ${ok} طالب (متجاهل: ${bad})`);
    return;
  }

  // Excel
  if((ext==="xlsx" || ext==="xls") && window.XLSX){
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval:"" });

    let ok=0, bad=0;
    for(const r of json){
      const s = mapStudentRow(r);
      if(!s){ bad++; continue; }
      await put(db, "students", s);
      ok++;
    }
    await audit("students.import", `excel ok=${ok} bad=${bad}`);
    alert(`تم الاستيراد: ${ok} طالب (متجاهل: ${bad})`);
    return;
  }

  alert("لا يمكن قراءة Excel الآن. ضع ملف SheetJS محليًا: vendor/xlsx.full.min.js أو استخدم CSV.");
}

/* ---------------- Attendance ---------------- */

function loadAttendanceTypes(){
  const sel = $("attType");
  sel.innerHTML = "";
  for(const t of rules.attendance.types){
    const o = document.createElement("option");
    o.value = t.code;
    o.textContent = t.label;
    sel.appendChild(o);
  }
}

function refreshAttendanceSuggestion(){
  const typeCode = $("attType").value;
  const minutes = Number($("attMinutes").value || 0);
  const out = suggestAttendance(rules, { typeCode, minutes });
  $("attSuggested").textContent = out.text || "—";
}

async function saveAttendance(){
  if(!can(PERMS.ATT_WRITE)) return alert("لا تملك صلاحية");

  const studentId = $("attStudentId").value.trim();
  const s = await get(db, "students", studentId);
  if(!s) return alert("رقم الهوية غير موجود ضمن الطلاب");

  const dateISO = $("attDate").value || todayISO();
  const typeCode = $("attType").value;
  const typeLabel = rules.attendance.types.find(x=>x.code===typeCode)?.label || typeCode;
  const period = $("attPeriod").value.trim();
  const minutes = Number($("attMinutes").value || 0);
  const reason = $("attReason").value.trim();
  const sug = suggestAttendance(rules, { typeCode, minutes });

  const needsApproval = $("attNeedsApproval").checked || (typeCode==="ABSENT"); // مثال: غياب يحتاج متابعة

  const item = {
    id: uid("att"),
    createdAt: new Date().toISOString(),
    dateISO,
    studentId,
    studentName: s.name,
    grade: s.grade || "",
    classroom: s.classroom || "",
    typeCode,
    typeLabel,
    details: `حصة:${period||"-"} • دقائق:${minutes||0} • سبب:${reason||"-"}`,
    suggestedActions: sug.actions,
    suggestedText: sug.text,
    needsApproval,
    createdBy: currentUser.userId,
    createdByName: currentUser.name
  };
  await put(db, "attendance_events", item);
  await audit("attendance.add", `studentId=${studentId} type=${typeCode} date=${dateISO}`);

  alert("تم الحفظ");
  await updateDashboard();
}

/* ---------------- Behavior ---------------- */

function loadBehaviorCodes(){
  const sel = $("behCode");
  sel.innerHTML = "";
  for(const x of rules.behavior.infractions){
    const o = document.createElement("option");
    o.value = x.code;
    o.textContent = `${x.code} - ${x.label}`;
    sel.appendChild(o);
  }
}

function refreshBehaviorSuggestion(){
  const code = $("behCode").value;
  const severity = $("behSeverity").value;
  const out = suggestBehavior(rules, { code, severity });
  $("behSuggested").textContent = out.text || "—";
  $("behNeedsApproval").checked = out.requiresApproval;
}

async function fileToBase64(file){
  if(!file) return "";
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s=""; for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function saveBehavior(){
  if(!can(PERMS.BEH_WRITE)) return alert("لا تملك صلاحية");

  const studentId = $("behStudentId").value.trim();
  const s = await get(db, "students", studentId);
  if(!s) return alert("رقم الهوية غير موجود ضمن الطلاب");

  const dateISO = $("behDate").value || todayISO();
  const code = $("behCode").value;
  const codeObj = rules.behavior.infractions.find(x=>x.code===code);
  const codeLabel = codeObj?.label || code;
  const severity = $("behSeverity").value;
  const desc = $("behDesc").value.trim();

  const sug = suggestBehavior(rules, { code, severity });
  const needsApproval = $("behNeedsApproval").checked || sug.requiresApproval;

  let attachment = null;
  const f = $("behAttach").files?.[0] || null;
  if(f){
    attachment = {
      name: f.name,
      type: f.type,
      dataB64: await fileToBase64(f)
    };
  }

  const item = {
    id: uid("beh"),
    createdAt: new Date().toISOString(),
    dateISO,
    studentId,
    studentName: s.name,
    grade: s.grade || "",
    classroom: s.classroom || "",
    code,
    codeLabel,
    severity,
    details: desc || "-",
    suggestedActions: sug.actions,
    suggestedText: sug.text,
    needsApproval,
    attachment,
    createdBy: currentUser.userId,
    createdByName: currentUser.name
  };
  await put(db, "behavior_events", item);
  await audit("behavior.add", `studentId=${studentId} code=${code} date=${dateISO}`);

  alert("تم الحفظ");
  await updateDashboard();
}

/* ---------------- SMS UI ---------------- */

async function renderSmsQueue(){
  if(!can(PERMS.SMS_SEND)) return;

  const items = (await all(db, "sms_queue"))
    .sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));

  const tb = $("smsTable").querySelector("tbody");
  tb.innerHTML = "";
  for(const x of items){
    tb.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${x.createdAt.replace("T"," ").slice(0,19)}</td>
        <td>${escapeHtml(x.to)}</td>
        <td>${escapeHtml(x.body).slice(0,140)}${x.body.length>140?"…":""}</td>
        <td>${x.status}${x.lastError?` • ${escapeHtml(x.lastError)}`:""}</td>
        <td><button class="btn danger" data-rm="${x.id}">حذف</button></td>
      </tr>
    `);
  }

  tb.querySelectorAll("[data-rm]").forEach(b=>{
    b.onclick = async ()=>{
      await removeSms(db, b.dataset.rm);
      await audit("sms.remove", `id=${b.dataset.rm}`);
      await renderSmsQueue();
      await updateDashboard();
    };
  });
}

async function fillSmsTemplate(){
  const studentId = $("smsStudentId").value.trim();
  const s = studentId ? await get(db, "students", studentId) : null;

  if(s && !$("smsTo").value.trim()) $("smsTo").value = s.parentPhone || "";

  const tplKey = $("smsTemplate").value;
  const tpl = rules.smsTemplates[tplKey] || "";
  const date = todayISO();
  const body = renderTemplate(tpl, { name: s?.name || "الطالب", date });
  if(tplKey !== "custom") $("smsBody").value = body;
}

async function queueSmsFromUI(sendNow=false){
  if(!can(PERMS.SMS_SEND)) return alert("لا تملك صلاحية");

  const to = $("smsTo").value.trim();
  const body = $("smsBody").value.trim();
  if(!to || !body) return alert("أكمل رقم الجوال ونص الرسالة");

  const item = await queueSms(db, { to, body, meta:{ by: currentUser.userId } });
  await audit("sms.queue", `to=${to}`);

  if(sendNow){
    const out = await flushSmsQueue(db);
    await audit("sms.flush", JSON.stringify(out));
  }

  await renderSmsQueue();
  await updateDashboard();
  alert("تمت الإضافة للطابور");
}

/* ---------------- Users ---------------- */

async function renderUsers(){
  if(!can(PERMS.USERS_MANAGE)) return;

  const items = (await all(db, "users")).sort((a,b)=> (a.userId||"").localeCompare(b.userId||""));
  const tb = $("usersTable").querySelector("tbody");
  tb.innerHTML = "";
  for(const u of items){
    tb.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${escapeHtml(u.userId)}</td>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${u.active ? "نعم" : "لا"}</td>
        <td>
          <button class="btn" data-edit="${u.userId}">تعديل</button>
          ${u.userId!=="admin" ? `<button class="btn danger" data-del="${u.userId}">حذف</button>` : ""}
        </td>
      </tr>
    `);
  }

  tb.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick = async ()=>{
      const userId = b.dataset.edit;
      const u = await get(db, "users", userId);
      if(!u) return;

      const name = prompt("اسم الموظف:", u.name) ?? u.name;
      const role = prompt("الدور: admin/deputy/counselor/teacher/viewer", u.role) ?? u.role;
      const active = confirm("هل الموظف نشط؟ (موافق=نعم / إلغاء=لا)");

      u.name = name.trim();
      u.role = role.trim();
      u.active = active;
      await put(db, "users", u);
      await audit("users.edit", `userId=${u.userId}`);
      await renderUsers();
    };
  });

  tb.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick = async ()=>{
      if(!confirm("تأكيد حذف الموظف؟")) return;
      await del(db, "users", b.dataset.del);
      await audit("users.delete", `userId=${b.dataset.del}`);
      await renderUsers();
    };
  });
}

async function addUser(){
  if(!can(PERMS.USERS_MANAGE)) return alert("لا تملك صلاحية");

  const userId = (prompt("معرف الموظف (login):") || "").trim();
  const name = (prompt("اسم الموظف:") || "").trim();
  const role = (prompt("الدور: admin/deputy/counselor/teacher/viewer", "teacher") || "teacher").trim();
  const pass = (prompt("كلمة المرور:") || "").trim();
  if(!userId || !name || !pass) return;

  const exists = await get(db, "users", userId);
  if(exists) return alert("المعرف موجود");

  const { salt, hash } = await hashPassword(pass);
  await put(db, "users", {
    userId,
    name,
    role,
    active:true,
    passSalt:salt,
    passHash:hash,
    createdAt:new Date().toISOString()
  });
  await audit("users.add", `userId=${userId} role=${role}`);
  await renderUsers();
}

/* ---------------- Reports ---------------- */

async function runReport(){
  if(!can(PERMS.AUDIT_READ) && !can(PERMS.ATT_WRITE) && !can(PERMS.BEH_WRITE)) return;

  const from = $("repFrom").value || todayISO();
  const to = $("repTo").value || todayISO();
  const filt = $("repFilter").value || "";

  const att = await all(db, "attendance_events");
  const beh = await all(db, "behavior_events");

  const rows = [];
  for(const x of att){
    if(x.dateISO < from || x.dateISO > to) continue;
    if(filt && !(containsLoose(`${x.grade} ${x.classroom}`, filt) || containsLoose(`${x.grade}-${x.classroom}`, filt))) continue;
    rows.push({
      dateISO:x.dateISO,
      studentName:x.studentName,
      type:`مواظبة: ${x.typeLabel}`,
      details:x.details,
      by:x.createdByName
    });
  }
  for(const x of beh){
    if(x.dateISO < from || x.dateISO > to) continue;
    if(filt && !(containsLoose(`${x.grade} ${x.classroom}`, filt) || containsLoose(`${x.grade}-${x.classroom}`, filt))) continue;
    rows.push({
      dateISO:x.dateISO,
      studentName:x.studentName,
      type:`سلوك: ${x.code}`,
      details:x.details,
      by:x.createdByName
    });
  }

  rows.sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));

  const tb = $("repTable").querySelector("tbody");
  tb.innerHTML = "";
  for(const r of rows){
    tb.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${r.dateISO}</td>
        <td>${escapeHtml(r.studentName)}</td>
        <td>${escapeHtml(r.type)}</td>
        <td>${escapeHtml(r.details)}</td>
        <td>${escapeHtml(r.by)}</td>
      </tr>
    `);
  }

  await audit("reports.run", `from=${from} to=${to} filt=${filt}`);
}

function exportCsvFromReport(){
  const rows = [];
  qa("#repTable tbody tr").forEach(tr=>{
    const tds = qa("td", tr).map(td=> td.textContent.replace(/"/g,'""'));
    rows.push(`"${tds.join('","')}"`);
  });
  const csv = `التاريخ,الطالب,النوع,التفاصيل,المستخدم\n` + rows.join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `report_${todayISO()}.csv`;
  a.click();
}

/* ---------------- Backup/Restore ---------------- */

async function doBackup(){
  const obj = await makeBackup(db);
  const blob = new Blob([JSON.stringify(obj,null,2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rsd_backup_${todayISO()}.json`;
  a.click();
  await audit("backup.export", "json");
}

async function doRestoreFromFile(file){
  const text = await file.text();
  const obj = JSON.parse(text);
  await restoreBackup(db, obj);
  await audit("backup.restore", "json");
  alert("تمت الاستعادة");
  location.reload();
}

/* ---------------- Auth ---------------- */

async function login(){
  const userId = $("loginUser").value.trim();
  const pass = $("loginPass").value;

  const u = await get(db, "users", userId);
  if(!u || !u.active) return alert("بيانات الدخول غير صحيحة");

  const ok = await verifyPassword(pass, u.passSalt, u.passHash);
  if(!ok) return alert("بيانات الدخول غير صحيحة");

  currentUser = u;
  setAuthedUI(true);
  $("currentUserPill").textContent = `${u.name} • ${u.role}`;
  await audit("auth.login", `userId=${u.userId}`);
  showView("dashboard");
  await afterLogin();
}

async function logout(){
  await audit("auth.logout", `userId=${currentUser?.userId||""}`);
  currentUser = null;
  currentStudent = null;
  setAuthedUI(false);
  showView("login");
  $("studentCard").hidden = true;
}

/* ---------------- Settings ---------------- */

async function saveSchoolFromLogin(){
  const v = $("schoolInput").value.trim();
  await setSetting(db, "schoolName", v);
  await refreshSchool();
  alert("تم الحفظ");
}

async function saveSchoolFromSettings(){
  if(!can(PERMS.SETTINGS_MANAGE) && currentUser?.role!==ROLES.ADMIN) return alert("لا تملك صلاحية");
  const v = $("setSchoolName").value.trim();
  await setSetting(db, "schoolName", v);
  await refreshSchool();
  await audit("settings.school", v);
  alert("تم الحفظ");
}

async function saveSmsEndpoint(){
  if(!can(PERMS.SETTINGS_MANAGE) && currentUser?.role!==ROLES.ADMIN) return alert("لا تملك صلاحية");
  const v = $("setSmsEndpoint").value.trim();
  await setSetting(db, "smsEndpoint", v);
  await audit("settings.smsEndpoint", v);
  alert("تم الحفظ");
}

async function saveRules(){
  if(!can(PERMS.SETTINGS_MANAGE) && currentUser?.role!==ROLES.ADMIN) return alert("لا تملك صلاحية");

  try{
    const obj = JSON.parse($("rulesEditor").value);
    rules = obj;
    await setSetting(db, "rules", obj);
    loadAttendanceTypes();
    loadBehaviorCodes();
    refreshAttendanceSuggestion();
    refreshBehaviorSuggestion();
    await audit("rules.save", `version=${obj?.version||"?"}`);
    alert("تم حفظ القواعد");
  }catch(e){
    alert("خطأ في JSON: " + e.message);
  }
}

async function resetRules(){
  rules = DEFAULT_RULES;
  await setSetting(db, "rules", DEFAULT_RULES);
  await loadRulesToEditor();
  loadAttendanceTypes();
  loadBehaviorCodes();
  refreshAttendanceSuggestion();
  refreshBehaviorSuggestion();
  await audit("rules.reset", "default");
  alert("تمت الاستعادة");
}

async function changePassword(){
  const oldP = $("pwOld").value;
  const newP = $("pwNew").value;
  const new2 = $("pwNew2").value;
  if(!oldP || !newP || !new2) return alert("أكمل الحقول");
  if(newP !== new2) return alert("كلمة المرور غير متطابقة");

  const ok = await verifyPassword(oldP, currentUser.passSalt, currentUser.passHash);
  if(!ok) return alert("كلمة المرور الحالية غير صحيحة");

  const { salt, hash } = await hashPassword(newP);
  currentUser.passSalt = salt;
  currentUser.passHash = hash;
  await put(db, "users", currentUser);
  await audit("auth.changePassword", `userId=${currentUser.userId}`);
  alert("تم التحديث");
  $("pwOld").value = $("pwNew").value = $("pwNew2").value = "";
}

/* ---------------- Tabs (Student card) ---------------- */

function initTabs(){
  qa(".tab").forEach(btn=>{
    btn.onclick = ()=>{
      qa(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const id = btn.dataset.tab;
      ["tab-att","tab-beh","tab-notes"].forEach(x=>{
        $(x).hidden = (x !== id);
      });
    };
  });
}

/* ---------------- Navigation ---------------- */

async function afterLogin(){
  await refreshSchool();
  await loadRulesToEditor();
  $("setSmsEndpoint").value = await getSetting(db, "smsEndpoint", "");
  loadAttendanceTypes();
  loadBehaviorCodes();

  $("attDate").value = todayISO();
  $("behDate").value = todayISO();
  $("repFrom").value = todayISO();
  $("repTo").value = todayISO();

  refreshAttendanceSuggestion();
  refreshBehaviorSuggestion();

  await updateDashboard();
  await renderStudentsTable();
  await renderUsers();
  await renderSmsQueue();
}

function hookNav(){
  qa(".navItem").forEach(btn=>{
    btn.onclick = async ()=>{
      const v = btn.dataset.view;
      showView(v);
      if(v==="dashboard") await updateDashboard();
      if(v==="students") await renderStudentsTable();
      if(v==="users") await renderUsers();
      if(v==="sms") await renderSmsQueue();
    };
  });

  qa("[data-jump]").forEach(btn=>{
    btn.onclick = ()=> showView(btn.dataset.jump);
  });
}

/* ---------------- Install PWA ---------------- */

let deferredPrompt = null;
function setupInstall(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(()=>{});

  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    $("btnInstall").hidden = false;
  });

  $("btnInstall").onclick = async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("btnInstall").hidden = true;
  };
}

/* ---------------- Buttons wiring ---------------- */

function wireUI(){
  $("btnLogin").onclick = login;
  $("btnLogout").onclick = logout;

  $("btnSaveSchool").onclick = saveSchoolFromLogin;
  $("btnSetSchool").onclick = saveSchoolFromSettings;
  $("btnSetSms").onclick = saveSmsEndpoint;

  $("btnSaveRules").onclick = saveRules;
  $("btnResetRules").onclick = resetRules;
  $("btnChangePw").onclick = changePassword;

  $("studentSearch").oninput = renderStudentsTable;
  $("studentFilter").oninput = renderStudentsTable;

  $("btnImport").onclick = ()=>{
    if(!can(PERMS.STUDENTS_IMPORT)) return alert("لا تملك صلاحية");
    $("filePick").click();
  };
  $("filePick").onchange = async ()=>{
    const file = $("filePick").files?.[0];
    if(!file) return;
    await importStudentsFromFile(file);
    $("filePick").value = "";
    await renderStudentsTable();
    await updateDashboard();
  };

  $("btnAddStudent").onclick = async ()=>{
    if(!can(PERMS.STUDENTS_WRITE)) return alert("لا تملك صلاحية");
    const studentId = (prompt("رقم الهوية:") || "").trim();
    const name = (prompt("اسم الطالب:") || "").trim();
    const grade = (prompt("الصف (أول/ثاني/ثالث):") || "").trim();
    const classroom = (prompt("الشعبة:") || "").trim();
    const parentPhone = (prompt("جوال ولي الأمر:") || "").trim();
    if(!studentId || !name) return;

    await put(db, "students", { studentId, name, grade, classroom, parentPhone, notes:"", createdAt:new Date().toISOString() });
    await audit("students.add", `studentId=${studentId}`);
    await renderStudentsTable();
    await updateDashboard();
  };

  $("btnSaveNotes").onclick = async ()=>{
    if(!currentStudent) return;
    if(!can(PERMS.STUDENTS_WRITE)) return alert("لا تملك صلاحية");
    currentStudent.notes = $("scNotes").value || "";
    await put(db, "students", currentStudent);
    await audit("students.notes", `studentId=${currentStudent.studentId}`);
    alert("تم الحفظ");
  };

  // student card quick jumps
  $("btnScAttendance").onclick = ()=>{
    if(!currentStudent) return;
    showView("attendance");
    $("attStudentId").value = currentStudent.studentId;
  };
  $("btnScBehavior").onclick = ()=>{
    if(!currentStudent) return;
    showView("behavior");
    $("behStudentId").value = currentStudent.studentId;
  };
  $("btnScSms").onclick = async ()=>{
    if(!currentStudent) return;
    showView("sms");
    $("smsStudentId").value = currentStudent.studentId;
    $("smsTo").value = currentStudent.parentPhone || "";
    await fillSmsTemplate();
  };

  // attendance
  $("btnAttQuickToday").onclick = ()=> $("attDate").value = todayISO();
  $("attType").onchange = refreshAttendanceSuggestion;
  $("attMinutes").oninput = refreshAttendanceSuggestion;
  $("btnSaveAttendance").onclick = saveAttendance;

  $("btnAttToSms").onclick = async ()=>{
    const studentId = $("attStudentId").value.trim();
    const s = await get(db, "students", studentId);
    if(!s) return alert("أدخل هوية صحيحة");
    showView("sms");
    $("smsStudentId").value = s.studentId;
    $("smsTo").value = s.parentPhone || "";
    $("smsTemplate").value = $("attType").value === "ABSENT" ? "absent" : "late";
    await fillSmsTemplate();
    $("smsBody").value += ` (الصف: ${s.grade||"-"} / الشعبة: ${s.classroom||"-"})`;
  };

  // behavior
  $("btnBehQuickToday").onclick = ()=> $("behDate").value = todayISO();
  $("behCode").onchange = refreshBehaviorSuggestion;
  $("behSeverity").onchange = refreshBehaviorSuggestion;
  $("btnSaveBehavior").onclick = saveBehavior;

  $("btnBehToSms").onclick = async ()=>{
    const studentId = $("behStudentId").value.trim();
    const s = await get(db, "students", studentId);
    if(!s) return alert("أدخل هوية صحيحة");
    showView("sms");
    $("smsStudentId").value = s.studentId;
    $("smsTo").value = s.parentPhone || "";
    $("smsTemplate").value = "behavior";
    await fillSmsTemplate();
    $("smsBody").value += ` (الصف: ${s.grade||"-"} / الشعبة: ${s.classroom||"-"})`;
  };

  // sms
  $("btnSmsFill").onclick = fillSmsTemplate;
  $("btnSmsQueue").onclick = ()=> queueSmsFromUI(false);
  $("btnSmsSendNow").onclick = ()=> queueSmsFromUI(true);
  $("btnSmsFlush").onclick = async ()=>{
    const out = await flushSmsQueue(db);
    await audit("sms.flush", JSON.stringify(out));
    await renderSmsQueue();
    await updateDashboard();
    alert(`تم: إرسال ${out.sent} / فشل ${out.failed}${out.note?` (${out.note})`:""}`);
  };

  // reports
  $("btnRunReport").onclick = runReport;
  $("btnExportCsv").onclick = exportCsvFromReport;

  // users
  $("btnAddUser").onclick = addUser;

  // backup/restore
  $("btnBackup").onclick = doBackup;
  $("btnRestore").onclick = ()=> $("restorePick").click();
  $("restorePick").onchange = async ()=>{
    const file = $("restorePick").files?.[0];
    if(!file) return;
    if(!confirm("سيتم استبدال البيانات الحالية. متابعة؟")) return;
    await doRestoreFromFile(file);
  };
}

/* ---------------- Boot ---------------- */

async function boot(){
  setupInstall();
  db = await openDB();
  await ensureDefaults();

  initTabs();
  hookNav();
  wireUI();
  await refreshSchool();

  // start in login
  setAuthedUI(false);
  showView("login");

  // قواعد افتراضية
  await loadRulesToEditor();
  loadAttendanceTypes();
  loadBehaviorCodes();
  $("attDate").value = todayISO();
  $("behDate").value = todayISO();
  $("repFrom").value = todayISO();
  $("repTo").value = todayISO();
  refreshAttendanceSuggestion();
  refreshBehaviorSuggestion();

  // إظهار Endpoint إن وجد
  $("setSmsEndpoint").value = await getSetting(db, "smsEndpoint", "");
}

boot().catch(e=>{
  console.error(e);
  alert("خطأ تشغيل: " + e.message);
});
