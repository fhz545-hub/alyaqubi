import { openDB, dbGet, dbPut, dbDelete, dbAll, metaGet, metaSet } from "./db.js";
import { DEFAULT_ATTENDANCE, DEFAULT_BEHAVIOR_LEVELS } from "./rules.js";
import { sendSMS } from "./sms.js";

/* -----------------------
  Utils
------------------------ */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const toastEl = $("#toast");
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=>toastEl.classList.remove("on"), 2800);
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[s]));
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function downloadText(filename, text){
  const blob = new Blob([text], {type:"application/json;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function normalizePhone(s){
  const digits = String(s ?? "").replace(/\D/g, "");
  // نُبقي كما هو (قد يكون 966xxxxxxxxx)
  return digits;
}

/* -----------------------
  App State
------------------------ */
let db = null;
let currentUser = null;

/* Permissions */
const PERMS = {
  dashboard: "dashboard",
  students: "students",
  attendance: "attendance",
  behavior: "behavior",
  statistics: "statistics",
  reports: "reports",
  sms: "sms",
  users: "users",
  settings: "settings",
  help: "help",
};

const ROLE_DEFAULTS = {
  admin: Object.values(PERMS),
  counselor: [PERMS.dashboard, PERMS.students, PERMS.attendance, PERMS.behavior, PERMS.statistics, PERMS.reports, PERMS.sms],
  supervisor: [PERMS.dashboard, PERMS.students, PERMS.attendance, PERMS.behavior, PERMS.statistics, PERMS.reports],
  teacher: [PERMS.dashboard, PERMS.students, PERMS.attendance, PERMS.behavior],
};

/* Navigation */
const NAV = [
  {key:PERMS.dashboard, label:"الرئيسية", icon:"🏠", route:"#/dashboard"},
  {key:PERMS.statistics, label:"الإحصائيات", icon:"📊", route:"#/statistics"},
  {key:PERMS.attendance, label:"الغياب والتأخر", icon:"📝", route:"#/attendance"},
  {key:PERMS.behavior, label:"السلوك", icon:"⚑", route:"#/behavior"},
  {key:PERMS.students, label:"الطلاب", icon:"👥", route:"#/students"},
  {key:PERMS.reports, label:"التقارير", icon:"📄", route:"#/reports"},
  {key:PERMS.users, label:"إدارة الموظفين", icon:"👤", route:"#/users"},
  {key:PERMS.settings, label:"الإعدادات", icon:"⚙️", route:"#/settings"},
  {key:PERMS.help, label:"الدعم الفني", icon:"❓", route:"#/help"},
];

/* -----------------------
  Boot
------------------------ */
init();

async function init(){
  db = await openDB();
  await ensureAdminSeed();
  await loadSchoolName();
  await registerSW();
  restoreSession();
  renderShell();
  route();
  window.addEventListener("hashchange", route);

  $("#btnToggle").addEventListener("click", () => document.body.classList.toggle("sidebar-on"));
  $("#btnLogout").addEventListener("click", logout);
  $("#btnBackup").addEventListener("click", backupAll);
  $("#btnQuickAdd").addEventListener("click", () => { location.hash = "#/attendance?quick=1"; });
}

async function registerSW(){
  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){}
  }
}

async function loadSchoolName(){
  const name = await metaGet(db, "schoolName");
  $("#schoolName").textContent = name || "مدرسة";
}

async function ensureAdminSeed(){
  const users = await dbAll(db, "users");
  if(users.length) return;

  const passHash = await sha256("1234");
  const admin = { username:"admin", passHash, role:"admin", perms: ROLE_DEFAULTS.admin, createdAt: Date.now() };
  await dbPut(db, "users", admin);
  toast("تم إنشاء حساب المدير الافتراضي: admin / 1234 (غيّره من الإعدادات).");
}

function restoreSession(){
  try{
    const raw = localStorage.getItem("rsd_session");
    if(!raw) return;
    const s = JSON.parse(raw);
    currentUser = s;
  }catch(e){}
}

function saveSession(user){
  localStorage.setItem("rsd_session", JSON.stringify({ username:user.username, role:user.role, perms:user.perms }));
  currentUser = { username:user.username, role:user.role, perms:user.perms };
}

function logout(){
  localStorage.removeItem("rsd_session");
  currentUser = null;
  toast("تم تسجيل الخروج.");
  routeTo("#/login");
}

function routeTo(hash){
  location.hash = hash;
}

/* -----------------------
  Rendering
------------------------ */
function renderShell(){
  const navEl = $("#nav");
  navEl.innerHTML = "";

  if(!currentUser){
    $("#userBox").innerHTML = '<div class="name">غير مسجل</div><div class="role">يرجى تسجيل الدخول</div>';
    $("#btnLogout").style.display = "none";
    navEl.innerHTML = "";
    return;
  }

  $("#btnLogout").style.display = "";
  $("#userBox").innerHTML = `<div class="name">${escapeHtml(currentUser.username)}</div><div class="role">${escapeHtml(roleLabel(currentUser.role))}</div>`;

  const allowed = new Set(currentUser.perms || []);
  const links = NAV.filter(item => allowed.has(item.key));
  for(const item of links){
    const a = document.createElement("a");
    a.href = item.route;
    a.innerHTML = `<span class="icon">${item.icon}</span><span>${item.label}</span>`;
    navEl.appendChild(a);
  }
  highlightActiveNav();
}

function highlightActiveNav(){
  const h = location.hash.split("?")[0] || "#/dashboard";
  $$("#nav a").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href") === h);
  });
}

function setTopTitle(text){ $("#topTitle").textContent = text; }

/* -----------------------
  Router
------------------------ */
async function route(){
  const hash = location.hash || "#/dashboard";
  const path = hash.split("?")[0];

  if(!currentUser && path !== "#/login"){
    return routeTo("#/login");
  }

  renderShell();
  highlightActiveNav();

  if(path === "#/login") return renderLogin();
  if(path === "#/dashboard") return renderDashboard();
  if(path === "#/students") return renderStudents();
  if(path === "#/attendance") return renderAttendance();
  if(path === "#/behavior") return renderBehavior();
  if(path === "#/statistics") return renderStatistics();
  if(path === "#/reports") return renderReports();
  if(path === "#/users") return renderUsers();
  if(path === "#/settings") return renderSettings();
  if(path === "#/help") return renderHelp();

  // student detail: #/student/123
  if(path.startsWith("#/student/")){
    const studentNo = decodeURIComponent(path.replace("#/student/",""));
    return renderStudentDetail(studentNo);
  }

  routeTo("#/dashboard");
}

/* -----------------------
  Pages
------------------------ */

async function renderLogin(){
  setTopTitle("تسجيل الدخول");
  $("#btnBackup").style.display = "none";
  $("#btnQuickAdd").style.display = "none";
  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">تسجيل الدخول</h3>
      <p class="cardSub">لأول مرة: استخدم (admin / 1234) ثم غيّر كلمة المرور من الإعدادات.</p>
      <div class="row">
        <input class="input" id="lgUser" placeholder="اسم المستخدم" autocomplete="username" />
        <input class="input" id="lgPass" placeholder="كلمة المرور/الرمز" type="password" autocomplete="current-password" />
        <button class="btn" id="lgBtn" type="button">دخول</button>
      </div>
      <p class="small">ملاحظة: هذا التطبيق يعمل محليًا؛ احرص على حماية الجهاز وكلمة المرور.</p>
    </div>
  `;
  $("#lgBtn").addEventListener("click", doLogin);
  $("#lgPass").addEventListener("keydown", (e)=>{ if(e.key==="Enter") doLogin(); });

  async function doLogin(){
    const u = $("#lgUser").value.trim();
    const p = $("#lgPass").value;
    if(!u || !p) return toast("أدخل اسم المستخدم وكلمة المرور.");

    const user = await dbGet(db, "users", u);
    if(!user) return toast("بيانات الدخول غير صحيحة.");
    const hash = await sha256(p);
    if(hash !== user.passHash) return toast("بيانات الدخول غير صحيحة.");

    saveSession(user);
    toast("تم تسجيل الدخول.");
    $("#btnBackup").style.display = "";
    $("#btnQuickAdd").style.display = "";
    renderShell();
    routeTo("#/dashboard");
  }
}

async function renderDashboard(){
  setTopTitle("الرئيسية");
  $("#btnBackup").style.display = "";
  $("#btnQuickAdd").style.display = "";

  const students = await dbAll(db, "students");
  const attendance = await dbAll(db, "attendance");
  const behavior = await dbAll(db, "behavior");

  const today = todayISO();
  const todayAbs = attendance.filter(x=>x.date===today && x.type==="absent").length;
  const todayLate = attendance.filter(x=>x.date===today && x.type==="late").length;
  const todayBeh = behavior.filter(x=>x.date===today).length;

  $("#main").innerHTML = `
    <div class="grid3">
      <div class="kpi"><div><div class="t">إجمالي الطلاب</div><div class="n">${students.length}</div></div><span class="badge good">مستمر</span></div>
      <div class="kpi"><div><div class="t">غياب اليوم</div><div class="n">${todayAbs}</div></div><span class="badge bad">اليوم</span></div>
      <div class="kpi"><div><div class="t">تأخر اليوم</div><div class="n">${todayLate}</div></div><span class="badge warn">اليوم</span></div>
    </div>

    <div class="card">
      <h3 class="cardTitle">إجراءات سريعة</h3>
      <div class="row">
        <button class="btn" type="button" id="goAttendance">رصد الغياب/التأخر</button>
        <button class="btn btn-ghost" type="button" id="goBehavior">رصد سلوك</button>
        <button class="btn btn-ghost" type="button" id="goStudents">بحث طالب</button>
      </div>
      <hr class="sep"/>
      <p class="small">تنبيه تربوي: احرص على توثيق السلوك/المواظبة وإشعار ولي الأمر وفق الإجراءات المعتمدة.</p>
    </div>

    <div class="card">
      <h3 class="cardTitle">ملخص اليوم (${today})</h3>
      <table class="table">
        <thead><tr><th>البند</th><th>العدد</th></tr></thead>
        <tbody>
          <tr><td>غياب</td><td>${todayAbs}</td></tr>
          <tr><td>تأخر</td><td>${todayLate}</td></tr>
          <tr><td>سلوك</td><td>${todayBeh}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  $("#goAttendance").addEventListener("click", ()=>routeTo("#/attendance"));
  $("#goBehavior").addEventListener("click", ()=>routeTo("#/behavior"));
  $("#goStudents").addEventListener("click", ()=>routeTo("#/students"));
}

async function renderStudents(){
  setTopTitle("الطلاب");
  const students = await dbAll(db, "students");

  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">إدارة الطلاب</h3>
      <p class="cardSub">بحث بالاسم أو رقم الطالب. يمكن استيراد ملف CSV (أو Excel إذا تم إضافة SheetJS محليًا).</p>
      <div class="row">
        <input class="input" id="stQuery" placeholder="بحث..." />
        <button class="btn btn-ghost" id="stImportSample" type="button">استيراد ملف الإرشاد (المرفق)</button>
        <label class="btn btn-ghost" for="stFile">استيراد ملف</label>
        <input id="stFile" type="file" accept=".csv,.xls,.xlsx" style="display:none" />
        <button class="btn" id="stExport" type="button">تصدير الطلاب CSV</button>
      </div>
    </div>

    <div class="card">
      <h3 class="cardTitle">القائمة (${students.length})</h3>
      <div class="small">اضغط على الطالب لفتح ملفه.</div>
      <div style="overflow:auto;margin-top:10px">
        <table class="table" id="stTable">
          <thead><tr><th>رقم الطالب</th><th>اسم الطالب</th><th>الفصل</th><th>رقم الصف</th><th>الجوال</th></tr></thead>
          <tbody>${students.slice(0,200).map(r=>rowStudent(r)).join("")}</tbody>
        </table>
      </div>
      <div class="small" style="margin-top:8px">عرض أول 200 طالب لتسريع الواجهة. استخدم البحث للعثور على الطالب.</div>
    </div>
  `;

  $("#stQuery").addEventListener("input", async (e)=>{
    const q = e.target.value.trim();
    const all = await dbAll(db, "students");
    const filtered = q ? all.filter(s=>{
      const name = (s.name||"");
      return name.includes(q) || (s.studentNo||"").includes(q) || (s.phone||"").includes(q);
    }) : all;

    const tbody = $("#stTable tbody");
    tbody.innerHTML = filtered.slice(0,200).map(r=>rowStudent(r)).join("");
    attachStudentRowClicks();
  });

  $("#stFile").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    await importStudentsFile(file);
    e.target.value = "";
    route(); // refresh
  });

  $("#stImportSample").addEventListener("click", async ()=>{
    await importSampleCSV();
    route();
  });

  $("#stExport").addEventListener("click", async ()=>{
    const all = await dbAll(db, "students");
    const lines = ["رقم الطالب,اسم الطالب,الفصل,رقم الصف,الجوال"];
    for(const s of all){
      lines.push([s.studentNo, csvSafe(s.name), s.className, s.gradeNo, s.phone].join(","));
    }
    downloadText("students_export.csv", "\ufeff"+lines.join("\n"));
  });

  attachStudentRowClicks();
}

function rowStudent(s){
  return `<tr data-student="${escapeHtml(s.studentNo)}" style="cursor:pointer">
    <td>${escapeHtml(s.studentNo)}</td>
    <td>${escapeHtml(s.name)}</td>
    <td>${escapeHtml(s.className)}</td>
    <td>${escapeHtml(s.gradeNo)}</td>
    <td>${escapeHtml(s.phone)}</td>
  </tr>`;
}
function attachStudentRowClicks(){
  $$("#stTable tbody tr").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const id = tr.getAttribute("data-student");
      routeTo("#/student/" + encodeURIComponent(id));
    });
  });
}
function csvSafe(v){
  const s = String(v ?? "").replaceAll('"','""');
  if(/[\n,"]/.test(s)) return `"${s}"`;
  return s;
}

async function renderStudentDetail(studentNo){
  setTopTitle("ملف الطالب");
  const student = await dbGet(db, "students", studentNo);
  if(!student){
    $("#main").innerHTML = `<div class="card"><h3 class="cardTitle">غير موجود</h3><p class="cardSub">لم يتم العثور على الطالب.</p></div>`;
    return;
  }

  const attendanceAll = await dbAll(db, "attendance");
  const behaviorAll = await dbAll(db, "behavior");
  const attendance = attendanceAll.filter(x=>x.studentNo===studentNo).sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  const behavior = behaviorAll.filter(x=>x.studentNo===studentNo).sort((a,b)=> (b.date||"").localeCompare(a.date||""));

  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">${escapeHtml(student.name)}</h3>
      <div class="row">
        <span class="badge">رقم الطالب: ${escapeHtml(student.studentNo)}</span>
        <span class="badge">الفصل: ${escapeHtml(student.className || "-")}</span>
        <span class="badge">رقم الصف: ${escapeHtml(student.gradeNo || "-")}</span>
        <span class="badge">الجوال: ${escapeHtml(student.phone || "-")}</span>
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="backStudents" type="button">عودة للطلاب</button>
      </div>
      <p class="small" style="margin-top:10px">ملف الطالب يحفظ السلوك والمواظبة بشكل تراكمي.</p>
    </div>

    <div class="grid2">
      <div class="card">
        <h3 class="cardTitle">إضافة مواظبة</h3>
        <div class="row">
          <input class="input" id="attDate" type="date" value="${todayISO()}" />
          <select id="attType">
            <option value="absent">غياب</option>
            <option value="late">تأخر</option>
            <option value="earlyLeave">استئذان/انصراف</option>
          </select>
        </div>
        <div class="row" style="margin-top:10px">
          <input class="input" id="attMinutes" placeholder="الدقائق (للتأخر) اختياري" inputmode="numeric"/>
          <input class="input" id="attReason" placeholder="السبب/العذر (اختياري)" />
        </div>
        <div class="row" style="margin-top:10px">
          <textarea id="attNote" placeholder="ملاحظة (اختياري)"></textarea>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="btnAddAtt" type="button">حفظ</button>
          <button class="btn btn-ghost" id="btnSmsAtt" type="button">إرسال SMS لولي الأمر</button>
        </div>
        <div class="small" id="attActions" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <h3 class="cardTitle">إضافة سلوك</h3>
        <div class="row">
          <input class="input" id="bhDate" type="date" value="${todayISO()}" />
          <select id="bhLevel">
            ${DEFAULT_BEHAVIOR_LEVELS.map(l=>`<option value="${l.level}">درجة ${l.level}: ${escapeHtml(l.label)}</option>`).join("")}
          </select>
        </div>
        <div class="row" style="margin-top:10px">
          <input class="input" id="bhCategory" placeholder="تصنيف/نوع المخالفة" />
          <input class="input" id="bhAction" placeholder="الإجراء المتخذ (اختياري)" />
        </div>
        <div class="row" style="margin-top:10px">
          <textarea id="bhDesc" placeholder="وصف مختصر للواقعة (بدون إساءة)"></textarea>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="btnAddBh" type="button">حفظ</button>
          <button class="btn btn-ghost" id="btnSmsBh" type="button">إرسال SMS لولي الأمر</button>
        </div>
        <div class="small" id="bhActions" style="margin-top:10px"></div>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3 class="cardTitle">سجل المواظبة (${attendance.length})</h3>
        <div style="overflow:auto">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الدقائق</th><th>السبب</th><th></th></tr></thead>
            <tbody>
              ${attendance.slice(0,50).map(a=>`
                <tr>
                  <td>${escapeHtml(a.date)}</td>
                  <td>${escapeHtml(attLabel(a.type))}</td>
                  <td>${escapeHtml(a.minutes||"")}</td>
                  <td>${escapeHtml(a.reason||"")}</td>
                  <td><button class="btn btn-ghost" data-del-att="${a.id}">حذف</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="small">يعرض آخر 50 سجل.</div>
      </div>

      <div class="card">
        <h3 class="cardTitle">سجل السلوك (${behavior.length})</h3>
        <div style="overflow:auto">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>الدرجة</th><th>التصنيف</th><th>الإجراء</th><th></th></tr></thead>
            <tbody>
              ${behavior.slice(0,50).map(b=>`
                <tr>
                  <td>${escapeHtml(b.date)}</td>
                  <td>${escapeHtml(b.level)}</td>
                  <td>${escapeHtml(b.category||"")}</td>
                  <td>${escapeHtml(b.actionTaken||"")}</td>
                  <td><button class="btn btn-ghost" data-del-bh="${b.id}">حذف</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="small">يعرض آخر 50 سجل.</div>
      </div>
    </div>
  `;

  $("#backStudents").addEventListener("click", ()=>routeTo("#/students"));

  function updateAttActions(){
    const type = $("#attType").value;
    const cfg = DEFAULT_ATTENDANCE[type];
    $("#attActions").innerHTML = cfg ? ("<b>إجراءات مقترحة:</b><ul style='margin:6px 0 0 0;padding:0 18px;line-height:1.8'>" + cfg.actions.map(x=>`<li>${escapeHtml(x)}</li>`).join("") + "</ul>") : "";
  }
  function updateBhActions(){
    const lvl = Number($("#bhLevel").value);
    const cfg = DEFAULT_BEHAVIOR_LEVELS.find(x=>x.level===lvl);
    $("#bhActions").innerHTML = cfg ? ("<b>إجراءات مقترحة:</b><ul style='margin:6px 0 0 0;padding:0 18px;line-height:1.8'>" + cfg.actions.map(x=>`<li>${escapeHtml(x)}</li>`).join("") + "</ul>") : "";
  }
  $("#attType").addEventListener("change", updateAttActions);
  $("#bhLevel").addEventListener("change", updateBhActions);
  updateAttActions();
  updateBhActions();

  $("#btnAddAtt").addEventListener("click", async ()=>{
    const rec = {
      studentNo,
      date: $("#attDate").value || todayISO(),
      type: $("#attType").value,
      minutes: ($("#attMinutes").value||"").trim(),
      reason: ($("#attReason").value||"").trim(),
      note: ($("#attNote").value||"").trim(),
      by: currentUser.username,
      createdAt: Date.now()
    };
    await dbPut(db, "attendance", rec);
    toast("تم حفظ سجل المواظبة.");
    route(); // refresh
  });

  $("#btnAddBh").addEventListener("click", async ()=>{
    const rec = {
      studentNo,
      date: $("#bhDate").value || todayISO(),
      level: Number($("#bhLevel").value || 1),
      category: ($("#bhCategory").value||"").trim(),
      actionTaken: ($("#bhAction").value||"").trim(),
      desc: ($("#bhDesc").value||"").trim(),
      by: currentUser.username,
      createdAt: Date.now()
    };
    await dbPut(db, "behavior", rec);
    toast("تم حفظ سجل السلوك.");
    route();
  });

  $("#btnSmsAtt").addEventListener("click", async ()=>{
    await smsAttendance(student, $("#attType").value, $("#attDate").value || todayISO(), $("#attMinutes").value);
  });
  $("#btnSmsBh").addEventListener("click", async ()=>{
    await smsBehavior(student, Number($("#bhLevel").value||1), $("#bhDate").value || todayISO(), $("#bhCategory").value);
  });

  // delete handlers
  $("#main").addEventListener("click", async (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;
    const delAtt = btn.getAttribute("data-del-att");
    const delBh = btn.getAttribute("data-del-bh");
    if(delAtt){
      await dbDelete(db, "attendance", Number(delAtt));
      toast("تم حذف السجل.");
      route();
    }
    if(delBh){
      await dbDelete(db, "behavior", Number(delBh));
      toast("تم حذف السجل.");
      route();
    }
  }, { once:true });
}

function attLabel(t){
  return t==="absent" ? "غياب" : t==="late" ? "تأخر" : "استئذان/انصراف";
}

/* Attendance page */
async function renderAttendance(){
  setTopTitle("الغياب والتأخر");
  const students = await dbAll(db, "students");
  const today = todayISO();

  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">رصد سريع</h3>
      <p class="cardSub">اختر التاريخ ثم ابحث عن الطالب وسجل الحالة. (مناسب للرصد اليومي داخل المدرسة)</p>
      <div class="row">
        <input class="input" id="aDate" type="date" value="${today}" />
        <select id="aType">
          <option value="absent">غياب</option>
          <option value="late">تأخر</option>
          <option value="earlyLeave">استئذان/انصراف</option>
        </select>
        <input class="input" id="aQuery" placeholder="بحث طالب (اسم/رقم الطالب)" />
      </div>
      <div class="row" style="margin-top:10px">
        <input class="input" id="aMinutes" placeholder="الدقائق (للتأخر) اختياري" inputmode="numeric" />
        <input class="input" id="aReason" placeholder="السبب/العذر (اختياري)" />
        <button class="btn" id="aSave" type="button">حفظ للطالب المحدد</button>
      </div>
      <div class="small" id="aHint" style="margin-top:10px">ابحث ثم اختر طالبًا.</div>
    </div>

    <div class="card">
      <h3 class="cardTitle">نتائج البحث</h3>
      <div style="overflow:auto">
        <table class="table" id="aTable">
          <thead><tr><th>رقم الطالب</th><th>اسم الطالب</th><th>الفصل</th><th>رقم الصف</th><th>فتح الملف</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  let selectedStudentNo = null;

  function renderResults(list){
    const tbody = $("#aTable tbody");
    tbody.innerHTML = list.slice(0,80).map(s=>`
      <tr data-id="${escapeHtml(s.studentNo)}" style="cursor:pointer">
        <td>${escapeHtml(s.studentNo)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.className||"")}</td>
        <td>${escapeHtml(s.gradeNo||"")}</td>
        <td><a class="btn btn-ghost" href="#/student/${encodeURIComponent(s.studentNo)}">فتح</a></td>
      </tr>
    `).join("");

    $$("#aTable tbody tr").forEach(tr=>{
      tr.addEventListener("click", ()=>{
        selectedStudentNo = tr.getAttribute("data-id");
        $("#aHint").innerHTML = `تم اختيار: <b>${escapeHtml(selectedStudentNo)}</b>`;
        $$("#aTable tbody tr").forEach(x=>x.style.background="");
        tr.style.background = "#e9fbfd";
      });
    });
  }

  $("#aQuery").addEventListener("input", (e)=>{
    const q = e.target.value.trim();
    if(!q){ renderResults([]); selectedStudentNo=null; return; }
    const filtered = students.filter(s=> (s.name||"").includes(q) || (s.studentNo||"").includes(q));
    renderResults(filtered);
  });

  $("#aSave").addEventListener("click", async ()=>{
    if(!selectedStudentNo) return toast("اختر طالبًا من النتائج أولًا.");
    const rec = {
      studentNo: selectedStudentNo,
      date: $("#aDate").value || todayISO(),
      type: $("#aType").value,
      minutes: ($("#aMinutes").value||"").trim(),
      reason: ($("#aReason").value||"").trim(),
      note: "",
      by: currentUser.username,
      createdAt: Date.now()
    };
    await dbPut(db, "attendance", rec);
    toast("تم حفظ الرصد.");
    $("#aMinutes").value=""; $("#aReason").value="";
  });
}

/* Behavior page */
async function renderBehavior(){
  setTopTitle("السلوك");
  const students = await dbAll(db, "students");
  const today = todayISO();
  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">رصد سلوك</h3>
      <p class="cardSub">ابحث عن الطالب ثم حدد درجة المخالفة ووصف مختصر، مع الإجراء المتخذ.</p>

      <div class="row">
        <input class="input" id="bDate" type="date" value="${today}" />
        <select id="bLevel">
          ${DEFAULT_BEHAVIOR_LEVELS.map(l=>`<option value="${l.level}">درجة ${l.level}: ${escapeHtml(l.label)}</option>`).join("")}
        </select>
        <input class="input" id="bQuery" placeholder="بحث طالب (اسم/رقم الطالب)" />
      </div>

      <div class="row" style="margin-top:10px">
        <input class="input" id="bCategory" placeholder="تصنيف/نوع المخالفة" />
        <input class="input" id="bAction" placeholder="الإجراء المتخذ (اختياري)" />
      </div>

      <div class="row" style="margin-top:10px">
        <textarea id="bDesc" placeholder="وصف مختصر للواقعة (اختياري)"></textarea>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn" id="bSave" type="button">حفظ</button>
        <div class="small" id="bHint">ابحث ثم اختر طالبًا.</div>
      </div>

      <div class="small" id="bActions" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h3 class="cardTitle">نتائج البحث</h3>
      <div style="overflow:auto">
        <table class="table" id="bTable">
          <thead><tr><th>رقم الطالب</th><th>اسم الطالب</th><th>الفصل</th><th>فتح الملف</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  let selectedStudentNo = null;

  function updateActions(){
    const lvl = Number($("#bLevel").value);
    const cfg = DEFAULT_BEHAVIOR_LEVELS.find(x=>x.level===lvl);
    $("#bActions").innerHTML = cfg ? ("<b>إجراءات مقترحة:</b><ul style='margin:6px 0 0 0;padding:0 18px;line-height:1.8'>" + cfg.actions.map(x=>`<li>${escapeHtml(x)}</li>`).join("") + "</ul>") : "";
  }
  $("#bLevel").addEventListener("change", updateActions);
  updateActions();

  function renderResults(list){
    const tbody = $("#bTable tbody");
    tbody.innerHTML = list.slice(0,80).map(s=>`
      <tr data-id="${escapeHtml(s.studentNo)}" style="cursor:pointer">
        <td>${escapeHtml(s.studentNo)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.className||"")}</td>
        <td><a class="btn btn-ghost" href="#/student/${encodeURIComponent(s.studentNo)}">فتح</a></td>
      </tr>
    `).join("");
    $$("#bTable tbody tr").forEach(tr=>{
      tr.addEventListener("click", ()=>{
        selectedStudentNo = tr.getAttribute("data-id");
        $("#bHint").innerHTML = `تم اختيار: <b>${escapeHtml(selectedStudentNo)}</b>`;
        $$("#bTable tbody tr").forEach(x=>x.style.background="");
        tr.style.background = "#e9fbfd";
      });
    });
  }

  $("#bQuery").addEventListener("input", (e)=>{
    const q = e.target.value.trim();
    if(!q){ renderResults([]); selectedStudentNo=null; return; }
    const filtered = students.filter(s=> (s.name||"").includes(q) || (s.studentNo||"").includes(q));
    renderResults(filtered);
  });

  $("#bSave").addEventListener("click", async ()=>{
    if(!selectedStudentNo) return toast("اختر طالبًا من النتائج أولًا.");
    const rec = {
      studentNo: selectedStudentNo,
      date: $("#bDate").value || todayISO(),
      level: Number($("#bLevel").value || 1),
      category: ($("#bCategory").value||"").trim(),
      actionTaken: ($("#bAction").value||"").trim(),
      desc: ($("#bDesc").value||"").trim(),
      by: currentUser.username,
      createdAt: Date.now()
    };
    await dbPut(db, "behavior", rec);
    toast("تم حفظ السلوك.");
    $("#bCategory").value=""; $("#bAction").value=""; $("#bDesc").value="";
  });
}

/* Statistics page */
async function renderStatistics(){
  setTopTitle("الإحصائيات");
  const students = await dbAll(db, "students");
  const attendance = await dbAll(db, "attendance");
  const behavior = await dbAll(db, "behavior");

  const byType = (t)=> attendance.filter(x=>x.type===t).length;
  const byLevel = (lvl)=> behavior.filter(x=>x.level===lvl).length;

  $("#main").innerHTML = `
    <div class="grid3">
      <div class="kpi"><div><div class="t">سجلات الغياب</div><div class="n">${byType("absent")}</div></div><span class="badge bad">إجمالي</span></div>
      <div class="kpi"><div><div class="t">سجلات التأخر</div><div class="n">${byType("late")}</div></div><span class="badge warn">إجمالي</span></div>
      <div class="kpi"><div><div class="t">سجلات السلوك</div><div class="n">${behavior.length}</div></div><span class="badge">إجمالي</span></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3 class="cardTitle">السلوك حسب الدرجة</h3>
        <table class="table">
          <thead><tr><th>الدرجة</th><th>العدد</th></tr></thead>
          <tbody>
            ${[1,2,3,4,5,6].map(l=>`<tr><td>${l}</td><td>${byLevel(l)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3 class="cardTitle">المواظبة حسب النوع</h3>
        <table class="table">
          <thead><tr><th>النوع</th><th>العدد</th></tr></thead>
          <tbody>
            <tr><td>غياب</td><td>${byType("absent")}</td></tr>
            <tr><td>تأخر</td><td>${byType("late")}</td></tr>
            <tr><td>استئذان</td><td>${byType("earlyLeave")}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 class="cardTitle">ملاحظة</h3>
      <p class="cardSub">يمكن استخراج تقارير مفصلة من صفحة التقارير (حسب الفترة/الشعبة/الطالب).</p>
    </div>
  `;
}

/* Reports page */
async function renderReports(){
  setTopTitle("التقارير");
  const students = await dbAll(db, "students");
  const attendance = await dbAll(db, "attendance");
  const behavior = await dbAll(db, "behavior");

  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">تقرير فترة</h3>
      <p class="cardSub">اختر تاريخ البداية والنهاية ثم قم بتصدير CSV.</p>
      <div class="row">
        <input class="input" id="rFrom" type="date" value="${todayISO()}" />
        <input class="input" id="rTo" type="date" value="${todayISO()}" />
        <button class="btn" id="rExportAtt" type="button">تصدير المواظبة CSV</button>
        <button class="btn btn-ghost" id="rExportBh" type="button">تصدير السلوك CSV</button>
      </div>
      <p class="small" style="margin-top:10px">يمكن فتح ملفات CSV عبر Excel أو Google Sheets.</p>
    </div>
  `;

  function inRange(d, from, to){ return d>=from && d<=to; }

  $("#rExportAtt").addEventListener("click", ()=>{
    const from = $("#rFrom").value;
    const to = $("#rTo").value;
    const rows = attendance.filter(x=>x.date && inRange(x.date, from, to));
    const lines = ["التاريخ,رقم الطالب,اسم الطالب,النوع,الدقائق,السبب,الرّاصد"];
    for(const r of rows){
      const st = students.find(s=>s.studentNo===r.studentNo);
      lines.push([r.date, r.studentNo, csvSafe(st?.name||""), attLabel(r.type), r.minutes||"", csvSafe(r.reason||""), r.by||""].join(","));
    }
    downloadText(`attendance_${from}_to_${to}.csv`, "\ufeff"+lines.join("\n"));
  });

  $("#rExportBh").addEventListener("click", ()=>{
    const from = $("#rFrom").value;
    const to = $("#rTo").value;
    const rows = behavior.filter(x=>x.date && inRange(x.date, from, to));
    const lines = ["التاريخ,رقم الطالب,اسم الطالب,الدرجة,التصنيف,الإجراء,الرّاصد,الوصف"];
    for(const r of rows){
      const st = students.find(s=>s.studentNo===r.studentNo);
      lines.push([r.date, r.studentNo, csvSafe(st?.name||""), r.level, csvSafe(r.category||""), csvSafe(r.actionTaken||""), r.by||"", csvSafe(r.desc||"")].join(","));
    }
    downloadText(`behavior_${from}_to_${to}.csv`, "\ufeff"+lines.join("\n"));
  });
}

/* Users page */
async function renderUsers(){
  setTopTitle("إدارة الموظفين");
  if(!currentUser.perms.includes(PERMS.users)) return deny();

  const users = await dbAll(db, "users");
  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">حسابات الموظفين</h3>
      <p class="cardSub">أنشئ حسابات ومنح صلاحيات حسب المهام. (البيانات محلية على الجهاز)</p>
      <div class="row">
        <input class="input" id="uName" placeholder="اسم المستخدم (بالإنجليزية أو أرقام)" />
        <input class="input" id="uPass" placeholder="كلمة المرور/الرمز" type="password" />
        <select id="uRole">
          <option value="teacher">معلم</option>
          <option value="counselor">مرشد طلابي</option>
          <option value="supervisor">مشرف/وكيل</option>
          <option value="admin">مدير (صلاحيات كاملة)</option>
        </select>
        <button class="btn" id="uAdd" type="button">إضافة/تحديث</button>
      </div>
      <div class="small" style="margin-top:10px">يمكن تعديل الصلاحيات التفصيلية من خلال اختيار الدور (يمكن التوسع لاحقًا).</div>
    </div>

    <div class="card">
      <h3 class="cardTitle">القائمة</h3>
      <div style="overflow:auto">
        <table class="table" id="uTable">
          <thead><tr><th>المستخدم</th><th>الدور</th><th>الصلاحيات</th><th></th></tr></thead>
          <tbody>
            ${users.map(u=>`
              <tr>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(roleLabel(u.role))}</td>
                <td>${escapeHtml((u.perms||[]).length)} صلاحية</td>
                <td>
                  <button class="btn btn-ghost" data-u-edit="${escapeHtml(u.username)}">تعديل</button>
                  ${u.username!=="admin" ? `<button class="btn btn-danger" data-u-del="${escapeHtml(u.username)}">حذف</button>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $("#uAdd").addEventListener("click", async ()=>{
    const username = $("#uName").value.trim();
    const pass = $("#uPass").value;
    const role = $("#uRole").value;
    if(!username) return toast("أدخل اسم مستخدم.");
    const perms = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.teacher;

    const existing = await dbGet(db, "users", username);
    const passHash = pass ? await sha256(pass) : (existing?.passHash || null);
    if(!passHash) return toast("أدخل كلمة مرور عند إنشاء حساب جديد.");

    await dbPut(db, "users", { username, role, perms, passHash, createdAt: existing?.createdAt || Date.now() });
    toast("تم حفظ المستخدم.");
    $("#uPass").value="";
    route();
  });

  $("#main").addEventListener("click", async (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;
    const edit = btn.getAttribute("data-u-edit");
    const del = btn.getAttribute("data-u-del");
    if(edit){
      const u = await dbGet(db, "users", edit);
      if(!u) return;
      $("#uName").value = u.username;
      $("#uRole").value = u.role;
      $("#uPass").value = "";
      toast("أدخل كلمة مرور جديدة لتغييرها، أو اتركها فارغة للإبقاء عليها.");
    }
    if(del){
      await dbDelete(db, "users", del);
      toast("تم حذف المستخدم.");
      route();
    }
  }, { once:true });
}

/* Settings page */
async function renderSettings(){
  setTopTitle("الإعدادات");
  if(!currentUser.perms.includes(PERMS.settings)) return deny();

  const schoolName = await metaGet(db, "schoolName") || "مدرسة";
  const smsSettings = await metaGet(db, "smsSettings") || { provider:"madar_gw", mode:"ping", enabled:false };
  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">بيانات المدرسة</h3>
      <div class="row">
        <input class="input" id="sSchool" value="${escapeHtml(schoolName)}" placeholder="اسم المدرسة"/>
        <button class="btn" id="sSaveSchool" type="button">حفظ</button>
      </div>
      <p class="small" style="margin-top:10px">سيظهر الاسم في القائمة والتقارير.</p>
    </div>

    <div class="card">
      <h3 class="cardTitle">ربط رسائل SMS (المدار التقني)</h3>
      <p class="cardSub">الربط اختياري. يفضل حفظ بيانات الدخول في جهاز موثوق فقط.</p>

      <div class="row">
        <label class="badge"><input type="checkbox" id="smsEnabled" ${smsSettings.enabled ? "checked":""} /> تفعيل</label>
        <select id="smsMode">
          <option value="ping" ${smsSettings.mode==="ping"?"selected":""}>Ping (تجاوز CORS)</option>
          <option value="fetch" ${smsSettings.mode==="fetch"?"selected":""}>Fetch (قراءة الاستجابة)</option>
        </select>
      </div>

      <div class="row" style="margin-top:10px">
        <input class="input" id="smsUser" placeholder="userName" value="${escapeHtml(smsSettings.userName||"")}" />
        <input class="input" id="smsPass" placeholder="userPassword" value="${escapeHtml(smsSettings.userPassword||"")}" />
        <input class="input" id="smsSender" placeholder="userSender (اسم المرسل)" value="${escapeHtml(smsSettings.sender||"")}" />
        <input class="input" id="smsApiKey" placeholder="apiKey (إن وجد)" value="${escapeHtml(smsSettings.apiKey||"")}" />
        <button class="btn" id="smsSave" type="button">حفظ الإعدادات</button>
      </div>

      <hr class="sep"/>
      <div class="row">
        <input class="input" id="smsTestTo" placeholder="رقم جوال للاختبار (مثال: 9665xxxxxxx)" />
        <input class="input" id="smsTestMsg" placeholder="نص الرسالة للاختبار" />
        <button class="btn btn-ghost" id="smsTest" type="button">إرسال اختبار</button>
      </div>

      <p class="small" style="margin-top:10px">
        إذا لم يتم الإرسال من المتصفح بسبب سياسة CORS، استخدم وضع Ping أو وفّر وسيط Backend.
      </p>
    </div>

    <div class="card">
      <h3 class="cardTitle">صيانة البيانات</h3>
      <div class="row">
        <button class="btn btn-ghost" id="btnExportAll" type="button">تصدير نسخة احتياطية JSON</button>
        <label class="btn" for="importJson">استيراد نسخة JSON</label>
        <input id="importJson" type="file" accept=".json" style="display:none"/>
        <button class="btn btn-danger" id="btnWipe" type="button">مسح كل البيانات</button>
      </div>
      <p class="small" style="margin-top:10px">تحذير: المسح لا يمكن التراجع عنه.</p>
    </div>
  `;

  $("#sSaveSchool").addEventListener("click", async ()=>{
    const v = $("#sSchool").value.trim() || "مدرسة";
    await metaSet(db, "schoolName", v);
    $("#schoolName").textContent = v;
    toast("تم حفظ اسم المدرسة.");
  });

  $("#smsSave").addEventListener("click", async ()=>{
    const s = {
      provider:"madar_gw",
      enabled: $("#smsEnabled").checked,
      mode: $("#smsMode").value,
      userName: $("#smsUser").value.trim(),
      userPassword: $("#smsPass").value.trim(),
      sender: $("#smsSender").value.trim(),
      apiKey: $("#smsApiKey").value.trim()
    };
    await metaSet(db, "smsSettings", s);
    toast("تم حفظ إعدادات SMS.");
  });

  $("#smsTest").addEventListener("click", async ()=>{
    const s = await metaGet(db, "smsSettings");
    if(!s?.enabled) return toast("فعّل SMS أولًا من الإعدادات.");
    const to = normalizePhone($("#smsTestTo").value);
    const msg = ($("#smsTestMsg").value||"").trim();
    if(!to || !msg) return toast("أدخل رقمًا ونصًا.");
    const res = await sendSMS(s, to, msg);
    toast(res.ok ? "تم إرسال طلب الرسالة." : "تعذر الإرسال.");
  });

  $("#btnExportAll").addEventListener("click", backupAll);

  $("#importJson").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await restoreAll(data);
    toast("تم استيراد النسخة الاحتياطية.");
    route();
    e.target.value="";
  });

  $("#btnWipe").addEventListener("click", async ()=>{
    if(!confirm("تأكيد مسح جميع البيانات؟")) return;
    await wipeAll();
    toast("تم مسح البيانات.");
    logout();
  });
}

/* Help page */
async function renderHelp(){
  setTopTitle("الدعم الفني");
  $("#main").innerHTML = `
    <div class="card">
      <h3 class="cardTitle">إرشادات سريعة</h3>
      <ul style="margin:0;padding:0 18px;line-height:1.9">
        <li>ابدأ باستيراد الطلاب من (الطلاب ← استيراد ملف الإرشاد).</li>
        <li>للرصد اليومي: استخدم (الغياب والتأخر) و(السلوك).</li>
        <li>كل طالب لديه ملف مستقل يحفظ السلوك والمواظبة بشكل تراكمي.</li>
        <li>التقارير: تصدير CSV للفترة المختارة.</li>
        <li>لإضافة دعم Excel: ضع SheetJS محليًا باسم <b>vendor/xlsx.full.min.js</b> ثم ألغِ التعليق عنه في index.html.</li>
        <li>للنسخ الاحتياطي: الإعدادات ← تصدير/استيراد JSON.</li>
      </ul>
      <hr class="sep"/>
      <p class="small">مراعاة الخصوصية: البيانات تحفظ داخل الجهاز فقط. احرص على حماية الجهاز وعدم مشاركة النسخ الاحتياطية إلا للضرورة.</p>
    </div>
  `;
}

function deny(){
  $("#main").innerHTML = `<div class="card"><h3 class="cardTitle">لا تملك الصلاحية</h3><p class="cardSub">يرجى مراجعة مدير النظام لمنح الصلاحية.</p></div>`;
}

/* -----------------------
  Import Students
------------------------ */
async function importSampleCSV(){
  const res = await fetch("./assets/StudentGuidance_clean.csv");
  const text = await res.text();
  const rows = parseCSV(text);
  const mapped = rowsToStudents(rows);
  await upsertStudents(mapped);
  toast(`تم استيراد ${mapped.length} طالب من ملف الإرشاد (المرفق).`);
}

async function importStudentsFile(file){
  const name = file.name.toLowerCase();
  if(name.endsWith(".csv")){
    const text = await file.text();
    const rows = parseCSV(text);
    const mapped = rowsToStudents(rows);
    await upsertStudents(mapped);
    toast(`تم استيراد ${mapped.length} طالب من CSV.`);
    return;
  }

  // Excel: requires XLSX
  if(!window.XLSX){
    toast("لا يمكن قراءة Excel الآن. فعّل SheetJS محليًا (vendor/xlsx.full.min.js) أو استخدم CSV.");
    return;
  }

  const ab = await file.arrayBuffer();
  const wb = window.XLSX.read(ab, { type:"array" });
  const sheetName = wb.SheetNames.includes("Sheet2") ? "Sheet2" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = window.XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
  const { headerRowIndex, headerMap } = findHeader(aoa);
  if(headerRowIndex === -1){
    toast("تعذر تحديد صف العناوين في الملف.");
    return;
  }
  const dataRows = aoa.slice(headerRowIndex+1).filter(r=>r.some(c=>String(c).trim()!==""));
  const students = dataRows.map(r=>{
    const get = (key)=> r[headerMap[key]] ?? "";
    return {
      studentNo: String(get("studentNo")).replace(/\D/g,""),
      name: String(get("name")).trim(),
      className: String(get("className")).trim(),
      gradeNo: String(get("gradeNo")).trim(),
      phone: normalizePhone(get("phone"))
    };
  }).filter(s=>s.studentNo && s.name);

  await upsertStudents(students);
  toast(`تم استيراد ${students.length} طالب من Excel.`);
}

function findHeader(aoa){
  // يبحث عن صف يحتوي "اسم الطالب" و "رقم الطالب" (كما في ملف الإرشاد المرفق)
  let idx = -1;
  for(let i=0;i<Math.min(aoa.length, 30);i++){
    const row = aoa[i].map(x=>String(x).trim());
    if(row.includes("اسم الطالب") && row.includes("رقم الطالب")){
      idx = i; break;
    }
  }
  if(idx === -1) return { headerRowIndex:-1, headerMap:{} };

  const row = aoa[idx].map(x=>String(x).trim());
  const map = {};
  map.phone = row.indexOf("الجوال") !== -1 ? row.indexOf("الجوال") : row.indexOf("رقم الجوال");
  map.className = row.indexOf("الفصل");
  map.gradeNo = row.indexOf("رقم الصف");
  map.name = row.indexOf("اسم الطالب");
  map.studentNo = row.indexOf("رقم الطالب");
  return { headerRowIndex: idx, headerMap: map };
}

function parseCSV(text){
  // CSV بسيط يدعم الفاصلة والاقتباس
  const lines = text.replace(/^\ufeff/,"").split(/\r?\n/).filter(l=>l.trim()!=="");
  if(!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h=>h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    header.forEach((h, j)=> obj[h] = (cols[j] ?? "").trim());
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line){
  const out = [];
  let cur = "";
  let inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    }else if(ch === "," && !inQ){
      out.push(cur); cur="";
    }else{
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function rowsToStudents(rows){
  // يدعم رؤوس عربية مثل ملف الإرشاد: الجوال, الفصل, رقم الصف, اسم الطالب, رقم الطالب
  // أو رؤوس إنجليزية: phone,class,gradeNo,name,studentNo
  const pick = (r, keys)=> {
    for(const k of keys){ if(r[k] !== undefined) return r[k]; }
    return "";
  };

  return rows.map(r=>({
    studentNo: String(pick(r, ["رقم الطالب","studentNo","StudentNo","ID","id"])).replace(/\D/g,""),
    name: String(pick(r, ["اسم الطالب","name","StudentName"])).trim(),
    className: String(pick(r, ["الفصل","class","Class","الشعبة"])).trim(),
    gradeNo: String(pick(r, ["رقم الصف","gradeNo","GradeNo","الصف"])).trim(),
    phone: normalizePhone(pick(r, ["الجوال","phone","Mobile","رقم الجوال"]))
  })).filter(s=>s.studentNo && s.name);
}

async function upsertStudents(list){
  for(const s of list){
    const existing = await dbGet(db, "students", s.studentNo);
    await dbPut(db, "students", {
      studentNo: s.studentNo,
      name: s.name,
      className: s.className,
      gradeNo: s.gradeNo,
      phone: s.phone,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });
  }
}

/* -----------------------
  SMS Templates
------------------------ */
async function smsAttendance(student, type, date, minutes){
  const s = await metaGet(db, "smsSettings");
  if(!s?.enabled) return toast("SMS غير مفعّل. فعّله من الإعدادات.");
  const to = normalizePhone(student.phone);
  if(!to) return toast("لا يوجد رقم جوال مسجّل للطالب.");

  const typeLabel = type==="absent" ? "غياب" : type==="late" ? "تأخر" : "استئذان/انصراف مبكر";
  const mins = (type==="late" && minutes) ? ` (${String(minutes).trim()} دقيقة)` : "";
  const msg = `ولي الأمر الكريم، نود إفادتكم بـ ${typeLabel}${mins} للطالب ${student.name} بتاريخ ${date}. نأمل تزويد المدرسة بما يلزم من عذر/توضيح، شاكرين تعاونكم.`;
  const res = await sendSMS(s, to, msg);
  toast(res.ok ? "تم إرسال طلب SMS." : "تعذر إرسال SMS.");
}

async function smsBehavior(student, level, date, category){
  const s = await metaGet(db, "smsSettings");
  if(!s?.enabled) return toast("SMS غير مفعّل. فعّله من الإعدادات.");
  const to = normalizePhone(student.phone);
  if(!to) return toast("لا يوجد رقم جوال مسجّل للطالب.");

  const lvl = DEFAULT_BEHAVIOR_LEVELS.find(x=>x.level===level);
  const lvlLabel = lvl ? `درجة ${level} (${lvl.label})` : `درجة ${level}`;
  const cat = (category||"").trim();
  const msg = `ولي الأمر الكريم، نود إشعاركم بتسجيل ملاحظة سلوكية (${lvlLabel}${cat?` - ${cat}`:""}) على الطالب ${student.name} بتاريخ ${date}. نأمل تعاونكم لمتابعة الطالب، ويمكنكم التواصل مع المدرسة عند الحاجة.`;
  const res = await sendSMS(s, to, msg);
  toast(res.ok ? "تم إرسال طلب SMS." : "تعذر إرسال SMS.");
}

/* -----------------------
  Backup / Restore / Wipe
------------------------ */
async function backupAll(){
  const data = {
    meta: await dbAll(db, "meta"),
    users: await dbAll(db, "users"),
    students: await dbAll(db, "students"),
    attendance: await dbAll(db, "attendance"),
    behavior: await dbAll(db, "behavior"),
    sms: await dbAll(db, "sms"),
    exportedAt: new Date().toISOString()
  };
  downloadText(`rsd_backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(data, null, 2));
  toast("تم تنزيل النسخة الاحتياطية.");
}

async function restoreAll(data){
  // Restore by upserting; minimal validation
  if(data?.meta) for(const x of data.meta) await dbPut(db, "meta", x);
  if(data?.users) for(const x of data.users) await dbPut(db, "users", x);
  if(data?.students) for(const x of data.students) await dbPut(db, "students", x);
  if(data?.attendance) for(const x of data.attendance) await dbPut(db, "attendance", x);
  if(data?.behavior) for(const x of data.behavior) await dbPut(db, "behavior", x);
  if(data?.sms) for(const x of data.sms) await dbPut(db, "sms", x);
  await loadSchoolName();
}

async function wipeAll(){
  // delete each store entries (simpler than deleting DB)
  for(const store of ["meta","users","students","attendance","behavior","sms"]){
    const all = await dbAll(db, store);
    for(const item of all){
      const key = store==="meta" ? item.key : store==="attendance"||store==="behavior"||store==="sms" ? item.id : item.username || item.studentNo;
      if(key !== undefined && key !== null){
        try{ await dbDelete(db, store, key); }catch(e){}
      }
    }
  }
}

function roleLabel(role){
  return role==="admin" ? "مدير" : role==="counselor" ? "مرشد طلابي" : role==="supervisor" ? "مشرف/وكيل" : "معلم";
}
