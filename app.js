import { DB, normalizeArabic } from "./db.js";
import { DEFAULTS, fillTemplate, pointsForLevel, formatDate } from "./rules.js";
import { waLink, sendSmsBatch } from "./sms.js";

const APP_VERSION = "1.2.0";
const SCHOOL_NAME = "ثانوية اليعقوبي";

let db;
let state = {
  route: "home",
  currentUser: null,
  studentsCount: 0,
  lastSearch: "",
  searchResults: [],
  selectedStudent: null,
  installPrompt: null,
  online: navigator.onLine,
  smsSending: false,
};

const $ = (sel, root=document)=>root.querySelector(sel);

init();

async function init(){
  // basic DOM
  document.title = SCHOOL_NAME;
  $("#schoolName").textContent = SCHOOL_NAME;
  $("#appVer").textContent = `إصدار ${APP_VERSION}`;

  window.addEventListener("online", ()=>setOnline(true));
  window.addEventListener("offline", ()=>setOnline(false));
  setOnline(navigator.onLine);

  // install prompt
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    state.installPrompt = e;
    const btn = $("#btnInstall");
    if(btn) btn.hidden = false;
  });

  // service worker
  if("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register("./sw.js");
    }catch(e){
      // ignore; app still works online
    }
  }

  db = await DB.create();
  await ensureDefaults();

  state.studentsCount = await db.countStudents();
  updateCounters();

  // navigation
  document.body.addEventListener("click", (e)=>{
    const t = e.target.closest("[data-nav]");
    if(t){
      e.preventDefault();
      go(t.getAttribute("data-nav"));
      return;
    }
  });

  // initial route (login first)
  const savedUser = sessionStorage.getItem("yaq_user");
  if(savedUser){
    const u = await getUser(savedUser);
    if(u) state.currentUser = u;
  }
  if(!state.currentUser) state.route = "login";
  render();
}

function setOnline(isOnline){
  state.online = !!isOnline;
  const dot = $("#netDot");
  const label = $("#netLabel");
  if(!dot || !label) return;
  dot.className = "dot " + (state.online ? "ok":"bad");
  label.textContent = state.online ? "متصل" : "غير متصل";
}

async function ensureDefaults(){
  // settings
  const cfg = await db.getMeta("config");
  if(!cfg){
    await db.setMeta("config", {
      ...DEFAULTS,
      sms: {
        // Generic template. Update in الإعدادات حسب مزود الرسائل لديك.
        // placeholders: {username} {password} {sender} {numbers} {message}
        template: "",
        bulk: false,
        sender: "",
        username: "",
        password: ""
      }
    });
  }
  // users
  const users = await db.getMeta("users");
  if(!users || !Array.isArray(users) || users.length===0){
    const pinHash = await sha256("1234");
    await db.setMeta("users", [{ username:"admin", pinHash, role:"admin" }]);
  }
}

function updateCounters(){
  $("#studentsCount").textContent = String(state.studentsCount||0);
}

function go(route){
  state.route = route;
  // active tab
  document.querySelectorAll(".tab").forEach(t=>{
    const r = t.getAttribute("data-nav");
    t.classList.toggle("active", r===route);
  });
  render();
}

function toast(msg){
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("on");
  setTimeout(()=>el.classList.remove("on"), 2600);
}

function icon(name){
  // minimal inline svg set
  const common = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  if(name==="home") return `<svg class="icon" viewBox="0 0 24 24"><path ${common} d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>`;
  if(name==="search") return `<svg class="icon" viewBox="0 0 24 24"><circle ${common} cx="11" cy="11" r="7"/><path ${common} d="M20 20l-3.5-3.5"/></svg>`;
  if(name==="msg") return `<svg class="icon" viewBox="0 0 24 24"><path ${common} d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`;
  if(name==="settings") return `<svg class="icon" viewBox="0 0 24 24"><path ${common} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path ${common} d="M19.4 15a7.9 7.9 0 0 0 .1-1l2-1.2-2-3.5-2.3.7a7.2 7.2 0 0 0-1.7-1l-.3-2.4H11l-.3 2.4a7.2 7.2 0 0 0-1.7 1L6.7 9.3 4.7 12.8l2 1.2a7.9 7.9 0 0 0 0 2l-2 1.2 2 3.5 2.3-.7a7.2 7.2 0 0 0 1.7 1l.3 2.4h4l.3-2.4a7.2 7.2 0 0 0 1.7-1l2.3.7 2-3.5z"/></svg>`;
  if(name==="user") return `<svg class="icon" viewBox="0 0 24 24"><path ${common} d="M20 21a8 8 0 0 0-16 0"/><path ${common} d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/></svg>`;
  return "";
}

function render(){
  const main = $("#main");
  main.innerHTML = "";
  if(state.route==="login"){ main.appendChild(viewLogin()); return; }
  if(!state.currentUser){ state.route="login"; render(); return; }

  if(state.route==="home"){ main.appendChild(viewHome()); return; }
  if(state.route==="search"){ main.appendChild(viewSearch()); return; }
  if(state.route==="student"){ main.appendChild(viewStudent()); return; }
  if(state.route==="messages"){ main.appendChild(viewMessages()); return; }
  if(state.route==="settings"){ main.appendChild(viewSettings()); return; }
  main.appendChild(viewHome());
}

function viewLogin(){
  const wrap = el("div",{class:"card pad"});
  wrap.innerHTML = `
    <div class="hstack" style="justify-content:space-between">
      <div class="hstack">
        <div class="brand-badge">${SCHOOL_NAME.split(" ")[0]?.[0]||"ي"}</div>
        <div class="vstack" style="gap:4px">
          <div class="big">تسجيل الدخول</div>
          <div class="muted small">البيانات محفوظة داخل الجهاز فقط</div>
        </div>
      </div>
      <span class="badge">Offline</span>
    </div>
    <hr class="sep"/>
    <div class="grid2">
      <div class="field">
        <label>المستخدم</label>
        <select id="loginUser"></select>
      </div>
      <div class="field">
        <label>رمز الدخول (PIN)</label>
        <input id="loginPin" inputmode="numeric" type="password" placeholder="••••" autocomplete="current-password"/>
      </div>
    </div>
    <div class="hstack" style="margin-top:12px; gap:10px">
      <button class="btn primary" id="btnLogin">${icon("user")} دخول</button>
      <button class="btn ghost" id="btnReset">تهيئة التطبيق</button>
    </div>
    <div class="muted small" style="margin-top:12px">
      المستخدم الافتراضي: admin — PIN: 1234 (يُفضّل تغييره من الإعدادات)
    </div>
  `;
  // fill users
  (async()=>{
    const users = await db.getMeta("users") || [];
    const sel = $("#loginUser", wrap);
    sel.innerHTML = users.map(u=>`<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)}</option>`).join("");
  })();

  $("#btnLogin", wrap).addEventListener("click", async ()=>{
    const username = $("#loginUser", wrap).value;
    const pin = $("#loginPin", wrap).value.trim();
    if(!pin){ toast("أدخل رمز الدخول"); return; }
    const user = await getUser(username);
    if(!user){ toast("المستخدم غير موجود"); return; }
    const ok = (await sha256(pin)) === user.pinHash;
    if(!ok){ toast("رمز غير صحيح"); return; }
    state.currentUser = user;
    sessionStorage.setItem("yaq_user", user.username);
    state.route = "home";
    // activate nav bar now
    document.querySelectorAll(".tab").forEach(t=>t.hidden=false);
    go("home");
    toast("تم الدخول");
  });

  $("#btnReset", wrap).addEventListener("click", async ()=>{
    if(!confirm("سيتم حذف بيانات التطبيق من هذا الجهاز. هل أنت متأكد؟")) return;
    const dump = await db.exportAll();
    // wipe by importing empty
    await db.importAll({meta:[],students:[],attendance:[],behavior:[],outbox:[],audit:[]});
    sessionStorage.removeItem("yaq_user");
    state.currentUser = null;
    state.studentsCount = 0;
    updateCounters();
    await ensureDefaults();
    toast("تمت التهيئة");
    state.route="login";
    render();
    // keep a backup download
    downloadJSON(dump, `backup_${new Date().toISOString().slice(0,10)}.json`);
  });

  // hide nav tabs while logged out
  document.querySelectorAll(".tab").forEach(t=>t.hidden=true);

  return wrap;
}

function viewHome(){
  const wrap = el("div",{class:"vstack"});
  wrap.appendChild(card(`
    <div class="hstack" style="justify-content:space-between">
      <div class="vstack" style="gap:4px">
        <div class="big">لوحة المتابعة</div>
        <div class="muted small">البحث عن الطالب ثم رصد المواظبة/السلوك — الحفظ تلقائي</div>
      </div>
      <span class="badge">${escapeHtml(state.currentUser.username)} • ${escapeHtml(state.currentUser.role)}</span>
    </div>
    <div class="kpi" style="margin-top:12px">
      <div class="box">
        <div class="muted small">عدد الطلاب</div>
        <div class="big" id="kpiStudents">${state.studentsCount}</div>
      </div>
      <div class="box">
        <div class="muted small">آخر العمليات</div>
        <div class="small" id="kpiAudit">—</div>
      </div>
    </div>
    <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
      <button class="btn primary" data-nav="search">${icon("search")} بحث عن طالب</button>
      <button class="btn ghost" data-nav="messages">${icon("msg")} الرسائل</button>
      <button class="btn ghost" data-nav="settings">${icon("settings")} الإعدادات</button>
    </div>
  `));

  // recent audit
  (async()=>{
    const log = await db.recentAudit(6);
    const elAudit = $("#kpiAudit", wrap);
    if(!log.length){ elAudit.textContent = "لا يوجد"; return; }
    elAudit.textContent = log.map(x=>{
      const d = new Date(x.at).toLocaleString("ar-SA");
      return `${d} • ${x.type} • ${x.studentNo}`;
    }).join(" | ");
  })();

  // show install button if available
  const installCard = el("div",{class:"card pad"});
  installCard.innerHTML = `
    <div class="hstack" style="justify-content:space-between">
      <div class="vstack" style="gap:2px">
        <b>تثبيت التطبيق</b>
        <div class="muted small">على الجوال أو الكمبيوتر ليعمل كتطبيق مستقل</div>
      </div>
      <button class="btn primary small" id="btnInstall" hidden>تثبيت</button>
    </div>
  `;
  $("#btnInstall", installCard).addEventListener("click", async ()=>{
    if(!state.installPrompt){ toast("التثبيت غير متاح الآن"); return; }
    state.installPrompt.prompt();
    const choice = await state.installPrompt.userChoice;
    state.installPrompt = null;
    toast(choice?.outcome==="accepted" ? "تم بدء التثبيت" : "تم الإلغاء");
    $("#btnInstall", installCard).hidden = true;
  });
  wrap.appendChild(installCard);

  return wrap;
}

function viewSearch(){
  const wrap = el("div",{class:"vstack"});

  const header = card(`
    <div class="vstack" style="gap:8px">
      <div class="big">بحث عن طالب</div>
      <div class="muted small">لن تظهر أسماء الطلاب إلا بعد البحث (حماية للخصوصية)</div>
      <div class="grid2">
        <div class="field">
          <label>بحث بالاسم/رقم الطالب/الجوال</label>
          <input id="q" placeholder="اكتب جزءًا من الاسم أو رقم الطالب..." autocomplete="off" />
        </div>
        <div class="field">
          <label>النتائج</label>
          <input id="resCount" disabled value="—" />
        </div>
      </div>
      <div class="hstack" style="gap:10px; flex-wrap:wrap">
        <button class="btn primary" id="btnDoSearch">${icon("search")} بحث</button>
        <button class="btn ghost" id="btnClear">مسح</button>
      </div>
    </div>
  `);
  wrap.appendChild(header);

  const list = el("div",{class:"list", id:"results"});
  wrap.appendChild(list);

  const q = $("#q", header);
  q.value = state.lastSearch || "";
  q.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doSearch(); });

  $("#btnDoSearch", header).addEventListener("click", doSearch);
  $("#btnClear", header).addEventListener("click", ()=>{
    q.value=""; state.lastSearch=""; state.searchResults=[]; list.innerHTML=""; $("#resCount", header).value="—";
  });

  async function doSearch(){
    const term = q.value.trim();
    state.lastSearch = term;
    if(term.length < 2){ toast("اكتب حرفين على الأقل"); return; }
    list.innerHTML = `<div class="muted small">جارٍ البحث...</div>`;
    const res = await db.searchStudents(term, 60);
    state.searchResults = res;
    $("#resCount", header).value = `${res.length}`;
    if(!res.length){
      list.innerHTML = `<div class="card pad"><div class="muted">لا توجد نتائج</div></div>`;
      return;
    }
    list.innerHTML = "";
    for(const st of res){
      const it = el("div",{class:"item"});
      it.innerHTML = `
        <div class="title">${escapeHtml(st.name)}</div>
        <div class="sub">رقم الطالب: ${escapeHtml(st.studentNo)} • الفصل: ${escapeHtml(st.className||"")} • الصف: ${escapeHtml(st.grade||"")}</div>
        <div class="meta">
          ${st.phone ? `<span class="badge">جوال: ${escapeHtml(st.phone)}</span>` : `<span class="badge">لا يوجد جوال</span>`}
          <span class="badge">شعبة: ${escapeHtml(st.section||"")}</span>
        </div>
      `;
      it.addEventListener("click", async ()=>{
        state.selectedStudent = await db.getStudent(st.studentNo);
        state.route = "student";
        render();
      });
      list.appendChild(it);
    }
  }

  return wrap;
}

function viewStudent(){
  const st = state.selectedStudent;
  if(!st){ state.route="search"; render(); return el("div"); }

  const wrap = el("div",{class:"vstack"});

  wrap.appendChild(card(`
    <div class="hstack" style="justify-content:space-between; flex-wrap:wrap">
      <div class="vstack" style="gap:4px">
        <div class="big">${escapeHtml(st.name)}</div>
        <div class="muted small">رقم الطالب: ${escapeHtml(st.studentNo)} • ${escapeHtml(st.className||"")} • ${escapeHtml(st.grade||"")} • ${escapeHtml(st.section||"")}</div>
      </div>
      <div class="hstack" style="gap:8px">
        <button class="btn ghost small" data-nav="search">${icon("search")} رجوع</button>
        ${state.currentUser.role==="admin" ? `<button class="btn danger small" id="btnDel">حذف</button>` : ""}
      </div>
    </div>
    <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="btnAbs">تسجيل غياب</button>
      <button class="btn primary" id="btnLate">تسجيل تأخر</button>
      <button class="btn primary" id="btnBeh">تسجيل سلوك</button>
      <button class="btn ghost" id="btnMsg">إرسال رسالة</button>
    </div>
  `));

  // actions card
  const formCard = el("div",{class:"card pad", id:"formCard"});
  formCard.innerHTML = `<div class="muted">اختر عملية من الأعلى…</div>`;
  wrap.appendChild(formCard);

  // history
  const hist = el("div",{class:"card pad"});
  hist.innerHTML = `<div class="hstack" style="justify-content:space-between">
    <b>السجل</b>
    <span class="muted small">آخر 10</span>
  </div><div id="histList" class="list" style="margin-top:10px"></div>`;
  wrap.appendChild(hist);

  loadHistory();

  function setForm(html){
    formCard.innerHTML = html;
  }

  $("#btnAbs", wrap).addEventListener("click", ()=>renderAttendance("absent"));
  $("#btnLate", wrap).addEventListener("click", ()=>renderAttendance("late"));
  $("#btnBeh", wrap).addEventListener("click", ()=>renderBehavior());
  $("#btnMsg", wrap).addEventListener("click", ()=>renderDirectMessage());

  const btnDel = $("#btnDel", wrap);
  if(btnDel){
    btnDel.addEventListener("click", async ()=>{
      if(!confirm("حذف الطالب سيزيل سجلاته من هذا الجهاز. هل أنت متأكد؟")) return;
      await db.deleteStudent(st.studentNo);
      state.studentsCount = await db.countStudents();
      updateCounters();
      toast("تم الحذف");
      state.route="search";
      render();
    });
  }

  function renderAttendance(type){
    const today = new Date().toISOString().slice(0,10);
    setForm(`
      <div class="big">رصد المواظبة</div>
      <div class="muted small">يُحفظ تلقائيًا في الجهاز</div>
      <hr class="sep"/>
      <div class="grid2">
        <div class="field">
          <label>النوع</label>
          <select id="aType">
            <option value="absent" ${type==="absent"?"selected":""}>غياب</option>
            <option value="late" ${type==="late"?"selected":""}>تأخر</option>
            <option value="early" ${type==="early"?"selected":""}>انصراف مبكر</option>
          </select>
        </div>
        <div class="field">
          <label>التاريخ</label>
          <input id="aDate" type="date" value="${today}">
        </div>
      </div>
      <div class="grid2" style="margin-top:10px">
        <div class="field">
          <label>الدقائق (للتأخر/الانصراف)</label>
          <input id="aMin" inputmode="numeric" placeholder="مثال: 10">
        </div>
        <div class="field">
          <label>ملاحظة</label>
          <input id="aNote" placeholder="اختياري">
        </div>
      </div>
      <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
        <button class="btn primary" id="aSave">حفظ</button>
        <button class="btn ghost" id="aSaveMsg">حفظ + تجهيز رسالة</button>
      </div>
    `);

    $("#aType", formCard).addEventListener("change", ()=>{
      // keep
    });

    $("#aSave", formCard).addEventListener("click", async ()=>{
      await saveAttendance(false);
    });
    $("#aSaveMsg", formCard).addEventListener("click", async ()=>{
      await saveAttendance(true);
    });

    async function saveAttendance(goMsg){
      const aType = $("#aType", formCard).value;
      const aDate = $("#aDate", formCard).value;
      const minutes = Number($("#aMin", formCard).value || 0);
      const note = $("#aNote", formCard).value.trim();
      if(!aDate){ toast("اختر التاريخ"); return; }
      await db.addAttendance({
        studentNo: st.studentNo,
        type: aType,
        date: aDate,
        minutes: minutes || 0,
        note,
        by: state.currentUser.username
      });
      toast("تم الحفظ");
      await loadHistory();
      if(goMsg){
        renderDirectMessage({ kind:aType, date:aDate, minutes });
      }
    }
  }

  async function renderBehavior(){
    const today = new Date().toISOString().slice(0,10);
    const cfg = await db.getMeta("config") || DEFAULTS;
    const opts = (cfg.behaviorLevels || DEFAULTS.behaviorLevels)
      .map(x=>`<option value="${x.level}">المستوى ${x.level} — ${escapeHtml(x.title)} (${x.points} نقاط)</option>`)
      .join("");
    setForm(`
      <div class="big">رصد سلوك</div>
      <div class="muted small">وفق دليل المدرسة (قابل للتعديل من الإعدادات)</div>
      <hr class="sep"/>
      <div class="grid2">
        <div class="field">
          <label>التاريخ</label>
          <input id="bDate" type="date" value="${today}">
        </div>
        <div class="field">
          <label>المستوى</label>
          <select id="bLevel">${opts}</select>
        </div>
      </div>
      <div class="field" style="margin-top:10px">
        <label>وصف المخالفة/السلوك</label>
        <input id="bText" placeholder="مثال: استخدام الجوال أثناء الحصة">
      </div>
      <div class="field" style="margin-top:10px">
        <label>إجراء متخذ (اختياري)</label>
        <input id="bAction" placeholder="مثال: تنبيه + مصادرة + إشعار ولي الأمر">
      </div>
      <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
        <button class="btn primary" id="bSave">حفظ</button>
        <button class="btn ghost" id="bSaveMsg">حفظ + تجهيز رسالة</button>
      </div>
      <div class="muted small" id="bPoints" style="margin-top:8px"></div>
    `);

    const bLevel = $("#bLevel", formCard);
    const bPoints = $("#bPoints", formCard);
    const updatePts = async ()=>{
      const cfg = await db.getMeta("config") || DEFAULTS;
      const pts = pointsForLevel(Number(bLevel.value), cfg);
      bPoints.textContent = `النقاط المحسوبة: ${pts}`;
    };
    bLevel.addEventListener("change", updatePts);
    updatePts();

    $("#bSave", formCard).addEventListener("click", async ()=>save(false));
    $("#bSaveMsg", formCard).addEventListener("click", async ()=>save(true));

    async function save(goMsg){
      const date = $("#bDate", formCard).value;
      const level = Number($("#bLevel", formCard).value);
      const text = $("#bText", formCard).value.trim();
      const action = $("#bAction", formCard).value.trim();
      if(!text){ toast("أدخل وصف السلوك"); return; }
      const cfg = await db.getMeta("config") || DEFAULTS;
      const points = pointsForLevel(level, cfg);
      await db.addBehavior({
        studentNo: st.studentNo,
        date, level, points,
        text, action,
        by: state.currentUser.username
      });
      toast("تم الحفظ");
      await loadHistory();
      if(goMsg){
        renderDirectMessage({ kind:"behavior", date, behavior:text });
      }
    }
  }

  async function renderDirectMessage(prefill){
    const cfg = await db.getMeta("config") || DEFAULTS;
    const today = new Date().toISOString().slice(0,10);
    const kind = prefill?.kind || "custom";
    const date = prefill?.date || today;
    const minutes = prefill?.minutes || 0;
    const behavior = prefill?.behavior || "";

    const vars = {
      name: st.name,
      class: [st.className, st.grade, st.section].filter(Boolean).join(" • "),
      date: formatDate(date),
      minutes: minutes || "",
      behavior,
      text: ""
    };

    let suggested = "";
    if(kind==="absent") suggested = fillTemplate(cfg.templates.absent, vars);
    else if(kind==="late") suggested = fillTemplate(cfg.templates.late, vars);
    else if(kind==="behavior") suggested = fillTemplate(cfg.templates.behavior, vars);
    else suggested = "";

    setForm(`
      <div class="big">إرسال رسالة</div>
      <div class="muted small">SMS يحتاج إنترنت + إعداد مزود الرسائل. واتساب عبر فتح رابط الرسالة.</div>
      <hr class="sep"/>
      <div class="grid2">
        <div class="field">
          <label>قناة الإرسال</label>
          <select id="mChan">
            <option value="whatsapp">واتساب</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <div class="field">
          <label>جوال ولي الأمر</label>
          <input id="mPhone" inputmode="tel" placeholder="05xxxxxxxx" value="${escapeHtml(st.phone||"")}">
        </div>
      </div>
      <div class="field" style="margin-top:10px">
        <label>نص الرسالة</label>
        <textarea id="mText" placeholder="اكتب الرسالة...">${escapeHtml(suggested)}</textarea>
      </div>
      <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
        <button class="btn primary" id="mSend">إرسال</button>
        <button class="btn ghost" id="mQueue">حفظ في قائمة الإرسال</button>
      </div>
      <div class="muted small" style="margin-top:8px">ملاحظة: عند عدم وجود إنترنت يمكن حفظ الرسائل في القائمة ثم إرسالها لاحقًا.</div>
    `);

    $("#mSend", formCard).addEventListener("click", async ()=>{
      const chan = $("#mChan", formCard).value;
      const phone = $("#mPhone", formCard).value.trim();
      const text = $("#mText", formCard).value.trim();
      if(!phone){ toast("أدخل رقم الجوال"); return; }
      if(!text){ toast("اكتب نص الرسالة"); return; }

      if(chan==="whatsapp"){
        window.open(waLink(phone, text), "_blank");
        toast("تم فتح واتساب");
        return;
      }
      // sms
      const ok = await trySendSms([{ phone, message:text }]);
      toast(ok ? "تم إرسال SMS (تأكيد يعتمد على المزود)" : "تعذر إرسال SMS — تم حفظها بالقائمة");
      if(!ok){
        await db.enqueueMessage({ channel:"sms", phone, message:text, status:"queued", studentNo: st.studentNo });
      }
    });

    $("#mQueue", formCard).addEventListener("click", async ()=>{
      const chan = $("#mChan", formCard).value;
      const phone = $("#mPhone", formCard).value.trim();
      const text = $("#mText", formCard).value.trim();
      if(!phone || !text){ toast("أكمل الرقم والنص"); return; }
      await db.enqueueMessage({ channel:chan, phone, message:text, status:"queued", studentNo: st.studentNo });
      toast("تمت الإضافة لقائمة الإرسال");
    });
  }

  async function loadHistory(){
    const h = $("#histList", wrap);
    h.innerHTML = `<div class="muted small">تحميل...</div>`;
    const att = await db.getRecords("attendance", st.studentNo, 6);
    const beh = await db.getRecords("behavior", st.studentNo, 6);
    const merged = [
      ...att.map(x=>({kind:"attendance", at:x.createdAt, payload:x})),
      ...beh.map(x=>({kind:"behavior", at:x.createdAt, payload:x}))
    ].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,10);

    h.innerHTML = "";
    if(!merged.length){
      h.innerHTML = `<div class="muted small">لا يوجد سجلات</div>`;
      return;
    }
    for(const it of merged){
      const box = el("div",{class:"item"});
      const d = new Date(it.at).toLocaleString("ar-SA");
      if(it.kind==="attendance"){
        const p = it.payload;
        const title = p.type==="absent" ? "غياب" : (p.type==="late" ? "تأخر" : "انصراف مبكر");
        box.innerHTML = `
          <div class="title">${title}</div>
          <div class="sub">${escapeHtml(formatDate(p.date))} • ${escapeHtml(d)} • بواسطة ${escapeHtml(p.by||"")}</div>
          ${p.minutes ? `<div class="sub">الدقائق: ${escapeHtml(p.minutes)}</div>`:""}
          ${p.note ? `<div class="sub">ملاحظة: ${escapeHtml(p.note)}</div>`:""}
        `;
      }else{
        const p = it.payload;
        box.innerHTML = `
          <div class="title">سلوك (مستوى ${escapeHtml(p.level)})</div>
          <div class="sub">${escapeHtml(formatDate(p.date))} • ${escapeHtml(d)} • نقاط: ${escapeHtml(p.points)} • بواسطة ${escapeHtml(p.by||"")}</div>
          <div class="sub">${escapeHtml(p.text||"")}</div>
          ${p.action ? `<div class="sub">إجراء: ${escapeHtml(p.action)}</div>`:""}
        `;
      }
      h.appendChild(box);
    }
  }

  return wrap;
}

function viewMessages(){
  const wrap = el("div",{class:"vstack"});
  const cardTop = el("div",{class:"card pad"});
  cardTop.innerHTML = `
    <div class="hstack" style="justify-content:space-between">
      <div class="vstack" style="gap:4px">
        <div class="big">قائمة الإرسال</div>
        <div class="muted small">حفظ الرسائل ثم إرسالها لاحقًا (SMS/واتساب)</div>
      </div>
      <span class="badge">${state.online ? "متصل":"غير متصل"}</span>
    </div>
    <hr class="sep"/>
    <div class="hstack" style="gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="btnSendAll">إرسال الكل (SMS)</button>
      <button class="btn ghost" id="btnOpenWA">واتساب (التالي)</button>
      <button class="btn ghost" id="btnClearSent">حذف المرسلة</button>
    </div>
    <div class="muted small" style="margin-top:10px">
      * واتساب: لا يمكن الإرسال التلقائي دفعة واحدة لأسباب نظامية؛ سيتم فتح الرسائل واحدة تلو الأخرى.
    </div>
  `;
  wrap.appendChild(cardTop);

  const list = el("div",{class:"card pad"});
  list.innerHTML = `<b>الرسائل المعلقة</b><div id="outList" class="list" style="margin-top:10px"></div>`;
  wrap.appendChild(list);

  let waCursor = 0;
  refresh();

  $("#btnSendAll", cardTop).addEventListener("click", async ()=>{
    if(state.smsSending) return;
    const queued = await db.listOutbox("queued", 500);
    const smsItems = queued.filter(x=>x.channel==="sms");
    if(!smsItems.length){ toast("لا توجد رسائل SMS"); return; }
    const cfg = await db.getMeta("config") || DEFAULTS;
    if(!cfg.sms?.template){ toast("أكمل إعدادات مزود SMS من الإعدادات"); go("settings"); return; }
    state.smsSending = true;
    try{
      const items = smsItems.map(x=>({ phone:x.phone, message:x.message, id:x.id }));
      const res = await sendSmsBatch({
        settings: { template: cfg.sms.template, bulk: !!cfg.sms.bulk },
        sender: cfg.sms.sender || "",
        username: cfg.sms.username || "",
        password: cfg.sms.password || "",
        items,
        onProgress: (p)=> {
          $("#btnSendAll", cardTop).textContent = `إرسال... ${p.sent||0}/${p.total||items.length}`;
        }
      });
      // mark status
      for(const it of items){
        await db.updateOutbox(it.id, { status: "sent", sentAt: new Date().toISOString() });
      }
      toast(`تم إرسال ${res.sent} رسالة SMS`);
    }catch(e){
      toast("تعذر الإرسال — تحقق من الإعدادات والاتصال");
    }finally{
      $("#btnSendAll", cardTop).textContent = "إرسال الكل (SMS)";
      state.smsSending = false;
      await refresh();
    }
  });

  $("#btnOpenWA", cardTop).addEventListener("click", async ()=>{
    const queued = await db.listOutbox("queued", 500);
    const wa = queued.filter(x=>x.channel==="whatsapp");
    if(!wa.length){ toast("لا توجد رسائل واتساب"); return; }
    if(waCursor >= wa.length) waCursor = 0;
    const msg = wa[waCursor];
    window.open(waLink(msg.phone, msg.message), "_blank");
    await db.updateOutbox(msg.id, { status:"sent", sentAt: new Date().toISOString() });
    waCursor++;
    toast("تم فتح الرسالة التالية");
    refresh();
  });

  $("#btnClearSent", cardTop).addEventListener("click", async ()=>{
    await db.clearOutbox("sent");
    toast("تم حذف المرسلة");
    refresh();
  });

  async function refresh(){
    const out = $("#outList", wrap);
    const queued = await db.listOutbox("queued", 500);
    out.innerHTML = "";
    if(!queued.length){
      out.innerHTML = `<div class="muted small">لا توجد رسائل معلقة</div>`;
      return;
    }
    for(const m of queued){
      const it = el("div",{class:"item"});
      it.innerHTML = `
        <div class="title">${m.channel==="sms"?"SMS":"واتساب"} • ${escapeHtml(m.phone||"")}</div>
        <div class="sub">${escapeHtml(m.message||"")}</div>
        <div class="meta">
          <span class="badge">حالة: ${escapeHtml(m.status)}</span>
          ${m.studentNo ? `<span class="badge">طالب: ${escapeHtml(m.studentNo)}</span>`:""}
          <button class="btn small ghost" data-id="${m.id}">حذف</button>
        </div>
      `;
      it.querySelector("button").addEventListener("click", async ()=>{
        const id = Number(it.querySelector("button").getAttribute("data-id"));
        // delete by setting status=sent then clear? better: direct delete
        const tx = db.db.transaction("outbox","readwrite");
        tx.objectStore("outbox").delete(id);
        await new Promise(r=>tx.oncomplete=r);
        toast("تم الحذف");
        refresh();
      });
      out.appendChild(it);
    }
  }

  return wrap;
}

function viewSettings(){
  const wrap = el("div",{class:"vstack"});
  const top = el("div",{class:"card pad"});
  top.innerHTML = `
    <div class="hstack" style="justify-content:space-between; flex-wrap:wrap">
      <div class="vstack" style="gap:4px">
        <div class="big">الإعدادات</div>
        <div class="muted small">استيراد/نسخ احتياطي/مستخدمون/مزود الرسائل</div>
      </div>
      <button class="btn ghost small" id="btnLogout">خروج</button>
    </div>
  `;
  wrap.appendChild(top);

  $("#btnLogout", top).addEventListener("click", ()=>{
    sessionStorage.removeItem("yaq_user");
    state.currentUser = null;
    state.route = "login";
    render();
  });

  // import students
  const importCard = el("div",{class:"card pad"});
  importCard.innerHTML = `
    <b>استيراد الطلاب</b>
    <div class="muted small" style="margin-top:6px">يدعم CSV (يوصى به). يمكن البدء بالملف النموذجي المرفق.</div>
    <hr class="sep"/>
    <div class="hstack" style="gap:10px; flex-wrap:wrap">
      <input type="file" id="fileCsv" accept=".csv,text/csv" />
      <button class="btn primary" id="btnImport">استيراد</button>
      <button class="btn ghost" id="btnLoadSample">استيراد الملف النموذجي</button>
    </div>
    <div class="muted small" id="importHint" style="margin-top:10px"></div>
  `;
  wrap.appendChild(importCard);

  $("#btnLoadSample", importCard).addEventListener("click", async ()=>{
    try{
      const res = await fetch("./assets/StudentGuidance_clean.csv", { cache:"no-store" });
      if(!res.ok){
        const msg = `تعذر تحميل الملف النموذجي (رمز: ${res.status}). تأكد من وجود الملف داخل مجلد assets.`;
        $("#importHint", importCard).textContent = msg;
        toast("فشل التحميل");
        return;
      }
      const txt = await res.text();
      const parsed = parseCSV(txt);
      if(parsed.error){
        $("#importHint", importCard).textContent = parsed.error;
        toast("تعذر قراءة الملف");
        return;
      }
      const students = mapRowsToStudents(parsed.rows);
      if(!students.length){
        const cols = (parsed.headers||[]).slice(0,12).join("، ") || "(لا توجد عناوين أعمدة)";
        $("#importHint", importCard).textContent = `لم يتم التعرف على أعمدة (اسم الطالب/رقم الطالب). الأعمدة المكتشفة: ${cols}`;
        toast("لم يتم الاستيراد");
        return;
      }
      const inserted = await db.upsertStudents(students);
      state.studentsCount = await db.countStudents();
      updateCounters();
      $("#importHint", importCard).textContent = `تم استيراد: ${inserted} طالب (مقروء: ${students.length}، صفوف: ${parsed.rows.length})`;
      toast("تم الاستيراد");
    }catch(e){
      $("#importHint", importCard).textContent = "حدث خطأ أثناء التحميل. أعد المحاولة.";
      toast("خطأ");
    }
  });

  $("#btnImport", importCard).addEventListener("click", async ()=>{
    const f = $("#fileCsv", importCard).files?.[0];
    if(!f){ toast("اختر ملف CSV"); return; }
    // Enforce CSV to avoid reading Excel/HTML by mistake
    const name = (f.name||"").toLowerCase();
    if(!name.endsWith(".csv")){
      $("#importHint", importCard).textContent = "الملف المختار ليس CSV. يرجى تحويل ملف Excel إلى CSV ثم رفعه.";
      toast("اختر CSV");
      return;
    }
    const txt = await f.text();
    const parsed = parseCSV(txt);
    if(parsed.error){
      $("#importHint", importCard).textContent = parsed.error;
      toast("تعذر قراءة الملف");
      return;
    }
    const students = mapRowsToStudents(parsed.rows);
    if(!students.length){
      const cols = (parsed.headers||[]).slice(0,12).join("، ") || "(لا توجد عناوين أعمدة)";
      $("#importHint", importCard).textContent = `لم يتم التعرف على أعمدة (اسم الطالب/رقم الطالب). الأعمدة المكتشفة: ${cols}`;
      toast("لم يتم الاستيراد");
      return;
    }
    const inserted = await db.upsertStudents(students);
    state.studentsCount = await db.countStudents();
    updateCounters();
    const ignored = parsed.rows.length - students.length;
    $("#importHint", importCard).textContent = `تم استيراد: ${inserted} طالب (مقروء: ${students.length}، متجاهل: ${ignored})`;
    toast("تم الاستيراد");
  });

  
  // manual student add/edit
  const manualCard = el("div",{class:"card pad"});
  manualCard.innerHTML = `
    <b>إضافة/تعديل طالب يدويًا</b>
    <div class="muted small" style="margin-top:6px">للطالب المنقول أو الإضافة العاجلة (يتطلب صلاحية المدير)</div>
    <hr class="sep"/>
    <div class="grid2">
      <div class="field">
        <label>رقم الطالب</label>
        <input id="mStuNo" inputmode="numeric" placeholder="مثال: 11400000">
      </div>
      <div class="field">
        <label>اسم الطالب</label>
        <input id="mStuName" placeholder="الاسم الثلاثي">
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div class="field">
        <label>الجوال</label>
        <input id="mStuPhone" inputmode="tel" placeholder="05xxxxxxxx">
      </div>
      <div class="field">
        <label>الفصل/الشعبة</label>
        <input id="mStuClass" placeholder="مثال: ٣/١">
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div class="field">
        <label>الصف</label>
        <input id="mStuGrade" placeholder="أول/ثاني/ثالث">
      </div>
      <div class="field">
        <label>الشعبة (اختياري)</label>
        <input id="mStuSection" placeholder="أ/ب/ج">
      </div>
    </div>
    <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="btnUpsertStu">حفظ</button>
      <button class="btn danger" id="btnDeleteStu">حذف</button>
    </div>
    <div class="muted small" id="stuHint" style="margin-top:10px"></div>
  `;
  wrap.appendChild(manualCard);

  if(state.currentUser.role!=="admin"){
    manualCard.querySelectorAll("input,button").forEach(x=>x.disabled=true);
  }else{
    $("#btnUpsertStu", manualCard).addEventListener("click", async ()=>{
      const studentNo = $("#mStuNo", manualCard).value.trim();
      const name = $("#mStuName", manualCard).value.trim();
      if(!studentNo || !name){ toast("أكمل رقم الطالب والاسم"); return; }
      const st = {
        studentNo,
        name,
        phone: normalizePhone($("#mStuPhone", manualCard).value),
        className: $("#mStuClass", manualCard).value.trim(),
        grade: $("#mStuGrade", manualCard).value.trim(),
        section: $("#mStuSection", manualCard).value.trim(),
        classKey: [$("#mStuGrade", manualCard).value.trim(), $("#mStuClass", manualCard).value.trim()].join("|")
      };
      await db.upsertStudents([st]);
      state.studentsCount = await db.countStudents();
      updateCounters();
      $("#stuHint", manualCard).textContent = "تم الحفظ";
      toast("تم حفظ بيانات الطالب");
    });

    $("#btnDeleteStu", manualCard).addEventListener("click", async ()=>{
      const studentNo = $("#mStuNo", manualCard).value.trim();
      if(!studentNo){ toast("أدخل رقم الطالب"); return; }
      if(!confirm("سيتم حذف الطالب وسجلاته من هذا الجهاز. هل أنت متأكد؟")) return;
      await db.deleteStudent(studentNo);
      state.studentsCount = await db.countStudents();
      updateCounters();
      $("#stuHint", manualCard).textContent = "تم الحذف";
      toast("تم حذف الطالب");
    });
  }


// sms settings
  const smsCard = el("div",{class:"card pad"});
  smsCard.innerHTML = `
    <b>مزود الرسائل (SMS)</b>
    <div class="muted small" style="margin-top:6px">لأسباب أمنية: لا تضع بيانات مزود الرسائل في مستودع عام. هذه الإعدادات تُحفظ محليًا على الجهاز.</div>
    <hr class="sep"/>
    <div class="field">
      <label>قالب رابط الإرسال (URL Template)</label>
      <textarea id="smsTemplate" placeholder="مثال: https://api.example.com/send?u={username}&p={password}&sender={sender}&to={numbers}&msg={message}"></textarea>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div class="field">
        <label>اسم المرسل (Sender)</label>
        <input id="smsSender" placeholder="مثال: ALYAQUBI">
      </div>
      <div class="field">
        <label>إرسال جماعي</label>
        <select id="smsBulk">
          <option value="0">إرسال كل رقم لوحده</option>
          <option value="1">إرسال بأرقام مجمعة</option>
        </select>
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div class="field">
        <label>اسم المستخدم</label>
        <input id="smsUser" autocomplete="off">
      </div>
      <div class="field">
        <label>كلمة المرور</label>
        <input id="smsPass" type="password" autocomplete="off">
      </div>
    </div>
    <div class="hstack" style="margin-top:12px; gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="btnSaveSms">حفظ</button>
      <button class="btn ghost" id="btnTestSms">اختبار (رسالة واحدة)</button>
    </div>
    <div class="muted small" id="smsHint" style="margin-top:10px"></div>
  `;
  wrap.appendChild(smsCard);

  (async()=>{
    const cfg = await db.getMeta("config") || DEFAULTS;
    $("#smsTemplate", smsCard).value = cfg.sms?.template || "";
    $("#smsBulk", smsCard).value = cfg.sms?.bulk ? "1":"0";
    $("#smsSender", smsCard).value = cfg.sms?.sender || "";
    $("#smsUser", smsCard).value = cfg.sms?.username || "";
    $("#smsPass", smsCard).value = cfg.sms?.password || "";
  })();

  $("#btnSaveSms", smsCard).addEventListener("click", async ()=>{
    const cfg = await db.getMeta("config") || DEFAULTS;
    cfg.sms = {
      template: $("#smsTemplate", smsCard).value.trim(),
      bulk: $("#smsBulk", smsCard).value==="1",
      sender: $("#smsSender", smsCard).value.trim(),
      username: $("#smsUser", smsCard).value.trim(),
      password: $("#smsPass", smsCard).value.trim()
    };
    await db.setMeta("config", cfg);
    $("#smsHint", smsCard).textContent = "تم الحفظ";
    toast("تم حفظ إعدادات SMS");
  });

  $("#btnTestSms", smsCard).addEventListener("click", async ()=>{
    const cfg = await db.getMeta("config") || DEFAULTS;
    const phone = prompt("أدخل رقم جوالك للاختبار (05...):");
    if(!phone) return;
    const ok = await trySendSms([{ phone, message:`اختبار رسالة - ${SCHOOL_NAME}` }], cfg);
    $("#smsHint", smsCard).textContent = ok ? "تم إرسال الطلب للمزود (قد يلزم التحقق من لوحة المزود)" : "تعذر الإرسال — تحقق من الرابط/البيانات/الاتصال";
    toast(ok ? "تم إرسال طلب الاختبار" : "فشل الاختبار");
  });

  // users
  const usersCard = el("div",{class:"card pad"});
  usersCard.innerHTML = `
    <b>إدارة المستخدمين</b>
    <div class="muted small" style="margin-top:6px">إتاحة صلاحيات للموظفين للعمل على البرنامج</div>
    <hr class="sep"/>
    <div id="usersList" class="list"></div>
    <hr class="sep"/>
    <div class="grid2">
      <div class="field">
        <label>اسم مستخدم جديد</label>
        <input id="newUser" placeholder="مثال: counselor1">
      </div>
      <div class="field">
        <label>PIN</label>
        <input id="newPin" type="password" inputmode="numeric" placeholder="••••">
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div class="field">
        <label>الصلاحية</label>
        <select id="newRole">
          <option value="staff">موظف</option>
          <option value="admin">مدير</option>
          <option value="view">عرض فقط</option>
        </select>
      </div>
      <div class="field">
        <label>—</label>
        <button class="btn primary" id="btnAddUser">إضافة</button>
      </div>
    </div>
    <div class="muted small" style="margin-top:8px">ملاحظة: تغيير PIN يتم بحذف المستخدم وإضافته من جديد.</div>
  `;
  wrap.appendChild(usersCard);

  if(state.currentUser.role!=="admin"){
    usersCard.querySelectorAll("input,select,button").forEach(x=>x.disabled=true);
    usersCard.insertAdjacentHTML("afterbegin", `<div class="badge">صلاحيات المدير مطلوبة</div><hr class="sep"/>`);
  }else{
    renderUsers();
  }

  $("#btnAddUser", usersCard)?.addEventListener("click", async ()=>{
    const u = $("#newUser", usersCard).value.trim();
    const p = $("#newPin", usersCard).value.trim();
    const r = $("#newRole", usersCard).value;
    if(!u || !p){ toast("أكمل البيانات"); return; }
    const users = await db.getMeta("users") || [];
    if(users.some(x=>x.username===u)){ toast("المستخدم موجود"); return; }
    users.push({ username:u, pinHash: await sha256(p), role:r });
    await db.setMeta("users", users);
    $("#newUser", usersCard).value = "";
    $("#newPin", usersCard).value = "";
    toast("تمت الإضافة");
    renderUsers();
  });

  async function renderUsers(){
    const users = await db.getMeta("users") || [];
    const list = $("#usersList", usersCard);
    list.innerHTML = "";
    for(const u of users){
      const it = el("div",{class:"item"});
      it.innerHTML = `
        <div class="hstack" style="justify-content:space-between; gap:10px; flex-wrap:wrap">
          <div class="vstack" style="gap:2px">
            <div class="title">${escapeHtml(u.username)}</div>
            <div class="sub">الصلاحية: ${escapeHtml(u.role)}</div>
          </div>
          ${u.username==="admin" ? `<span class="badge">أساسي</span>` : `<button class="btn danger small">حذف</button>`}
        </div>
      `;
      const btn = it.querySelector("button");
      if(btn){
        btn.addEventListener("click", async ()=>{
          if(!confirm(`حذف المستخدم ${u.username}?`)) return;
          const next = users.filter(x=>x.username!==u.username);
          await db.setMeta("users", next);
          toast("تم الحذف");
          renderUsers();
        });
      }
      list.appendChild(it);
    }
  }

  // backup
  const backupCard = el("div",{class:"card pad"});
  backupCard.innerHTML = `
    <b>نسخ احتياطي واستعادة</b>
    <div class="muted small" style="margin-top:6px">يحفظ البيانات كملف JSON على جهازك.</div>
    <hr class="sep"/>
    <div class="hstack" style="gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="btnExport">تصدير نسخة</button>
      <input type="file" id="fileRestore" accept=".json,application/json"/>
      <button class="btn ghost" id="btnRestore">استعادة</button>
    </div>
    <div class="muted small" id="backupHint" style="margin-top:10px"></div>
  `;
  wrap.appendChild(backupCard);

  $("#btnExport", backupCard).addEventListener("click", async ()=>{
    const dump = await db.exportAll();
    downloadJSON(dump, `yaqubi_backup_${new Date().toISOString().slice(0,10)}.json`);
    toast("تم التصدير");
  });

  $("#btnRestore", backupCard).addEventListener("click", async ()=>{
    const f = $("#fileRestore", backupCard).files?.[0];
    if(!f){ toast("اختر ملف النسخة"); return; }
    const txt = await f.text();
    let dump;
    try{ dump = JSON.parse(txt); }catch(_){ toast("ملف غير صالح"); return; }
    await db.importAll(dump);
    state.studentsCount = await db.countStudents();
    updateCounters();
    toast("تمت الاستعادة");
    $("#backupHint", backupCard).textContent = `تمت الاستعادة: ${state.studentsCount} طالب`;
  });

  return wrap;
}

// ------- SMS send helper -------
async function trySendSms(items, cfgOverride){
  const cfg = cfgOverride || await db.getMeta("config") || DEFAULTS;
  if(!cfg.sms?.template) return false;
  try{
    await sendSmsBatch({
      settings: { template: cfg.sms.template, bulk: !!cfg.sms.bulk },
      sender: cfg.sms.sender || "",
      username: cfg.sms.username || "",
      password: cfg.sms.password || "",
      items
    });
    return true;
  }catch(e){
    return false;
  }
}

// ------- CSV parsing -------

function parseCSV(text){
  const raw0 = String(text||"");
  const raw = raw0.replace(/^\uFEFF/, "");

  // Guard: sometimes a wrong URL / file returns HTML instead of CSV
  const head = raw.slice(0, 220).toLowerCase();
  if(head.includes("<!doctype html") || head.includes("<html")){
    return { rows: [], error: "يبدو أن المحتوى HTML وليس CSV. تأكد من رفع ملف CSV الصحيح (وليس صفحة موقع/خطأ 404)." };
  }

  const linesAll = raw.split(/\r?\n/)
    .map(l=>l.replace(/\u0000/g,""))
    .filter(l=>l.trim().length>0);
  if(!linesAll.length) return { rows: [] };

  // Find header line by scoring (بعض ملفات نور/الإرشاد تحتوي أسطر معلومات قبل العناوين)
  // Scan up to 800 lines (or full file if smaller)
  const scanN = Math.min(800, linesAll.length);
  let bestIdx = 0;
  let bestScore = -1;
  for(let i=0;i<scanN;i++){
    const line = linesAll[i];
    // must look like a delimited row
    const dCounts = [",",";","\t"].map(d=>count(line,d));
    if(Math.max(...dCounts) < 2) continue;

    const n = normalizeArabic(line);
    let score = 0;
    if(n.includes("اسم") && (n.includes("الطالب") || n.includes("طالب"))) score += 4;
    if((n.includes("رقم") || n.includes("هويه") || n.includes("السجل") || n.includes("id")) && (n.includes("الطالب") || n.includes("طالب"))) score += 4;
    if(n.includes("جوال") || n.includes("الهاتف") || n.includes("الفصل") || n.includes("الشعبه") || n.includes("الصف")) score += 1;
    if(n.includes("رقم") && n.includes("الصف")) score += 1;

    if(score > bestScore){
      bestScore = score;
      bestIdx = i;
      // perfect enough
      if(score >= 9) break;
    }
  }

  const headerIdx = bestScore >= 4 ? bestIdx : 0;
  const headerLine = linesAll[headerIdx];
  const delim = [",",";","\t"].sort((a,b)=>count(headerLine,b)-count(headerLine,a))[0] || ",";
  const headers = splitCSVLine(headerLine, delim).map(x=>String(x??"").trim());

  const rows = [];
  for(let i=headerIdx+1;i<linesAll.length;i++){
    const parts = splitCSVLine(linesAll[i], delim);
    if(parts.every(x=>String(x||"").trim()==="")) continue;
    const obj = {};
    for(let c=0;c<headers.length;c++){
      const key = headers[c] || `col${c}`;
      obj[key] = String(parts[c] ?? "").trim();
    }
    // ignore obvious summary rows
    if(Object.keys(obj).length<=2) continue;
    rows.push(obj);
  }

  return { rows, headers, delim, headerIdx, headerScore: bestScore };
}


function count(s,ch){ return (String(s).match(new RegExp("\\"+ch,"g"))||[]).length; }

function splitCSVLine(line, delim){
  const out = [];
  let cur = "", inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if(ch === delim && !inQ){
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function mapRowsToStudents(rows){
  const out = [];
  for(const r of rows){
    // Accept multiple header variants
    const name = pick(r, [
      "اسم الطالب","اسم","الاسم","اسم_الطالب","student_name","name","full_name","الاسم الرباعي","الاسم رباعي"
    ]);
    const studentNo = pick(r, [
      "رقم الطالب","رقم","student_no","student id","id","studentId",
      "رقم الهوية","رقم الهويه","الهوية","الهويه","السجل المدني","رقم السجل","الاقامة","رقم الإقامة","رقم الاقامه"
    ]);
    const phone = pick(r, [
      "الجوال","جوال","رقم الجوال","هاتف","الهاتف","phone","mobile","mobile_no"
    ]);
    const className = pick(r, [
      "الفصل","الشعبة","الشعبه","الفصل/الشعبة","الفصل/الشعبه","class","classroom","section"
    ]);
    const grade = pick(r, [
      "رقم الصف","الصف","المرحلة","المرحله","grade","level"
    ]);
    const section = inferSection(className);

    const sNo = String(studentNo||"").trim();
    const nm = String(name||"").trim();
    if(!sNo || !nm) continue;

    out.push({
      studentNo: sNo,
      name: nm,
      phone: normalizePhone(phone),
      className: String(className||"").trim(),
      grade: String(grade||"").trim(),
      section,
      classKey: [String(grade||"").trim(), String(className||"").trim()].join("|")
    });
  }
  return out;
}

function pick(obj, keys){
  for(const k of keys){
    if(k in obj && String(obj[k]).trim()!=="") return obj[k];
  }
  // also try fuzzy match
  const all = Object.keys(obj||{});
  for(const k of keys){
    const kk = normalizeArabic(k);
    const found = all.find(x=>normalizeArabic(x)===kk);
    if(found && String(obj[found]).trim()!=="") return obj[found];
  }
  return "";
}

function inferSection(className){
  // try to extract Arabic letter after a dash or space
  const s = String(className||"");
  const m = s.match(/[\/\-]\s*([أ-ي])/);
  return m ? m[1] : "";
}
function normalizePhone(p){
  const s = String(p||"").replace(/[^\d]/g,"");
  if(!s) return "";
  if(s.length===10 && s.startsWith("05")) return s;
  if(s.length===9 && s.startsWith("5")) return "0"+s;
  if(s.startsWith("966") && s.length>=12) return "0"+s.slice(3);
  return s;
}

// ------- utilities -------
function el(tag, attrs={}){
  const e = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==="class") e.className = v;
    else e.setAttribute(k, v);
  }
  return e;
}
function card(html){
  const c = el("div",{class:"card pad"});
  c.innerHTML = html;
  // inject icons into buttons if present
  c.querySelectorAll("button").forEach(btn=>{
    if(btn.innerHTML.includes("<svg")) return;
  });
  return c;
}
function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
async function sha256(text){
  const enc = new TextEncoder().encode(String(text));
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getUser(username){
  const users = await db.getMeta("users") || [];
  return users.find(u=>u.username===username) || null;
}
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
}
