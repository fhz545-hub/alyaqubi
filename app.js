/* =====================  متابعة المواظبة والسلوك — PWA (Local)  ===================== */
(() => {
  const DB_KEY = "STUDENT_FOLLOWUP_V1";
  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const now = new Date();
  const pad = n => String(n).padStart(2,"0");
  const toISODate = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const toLocalDTInput = (d=new Date()) => {
    const x = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return x.toISOString().slice(0,16);
  };

  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const defaultDB = () => ({
    meta: { version: 1, updatedAt: Date.now() },
    settings: {
      schoolName: "مدرسة اليعقوبي الثانوية",
      academicYear: "1447هـ",
      recorderName: "مسجل",
      attendanceActions: [
        { threshold: 3, action: "تنبيه ولي الأمر" },
        { threshold: 5, action: "استدعاء ولي الأمر" },
        { threshold: 10, action: "رفع للجنة المواظبة / متابعة رسمية" }
      ]
    },
    students: [], // {id,name,nid,grade,section,guardian,note,active}
    attendance: {
      // dateISO: { studentId: {status, minutesLate, reason, action, by, at} }
    },
    behavior: [
      // {id, studentId, dt, cat, type, level, action, desc, by, at}
    ]
  });

  function loadDB(){
    try{
      const raw = localStorage.getItem(DB_KEY);
      if(!raw) return defaultDB();
      const db = JSON.parse(raw);
      // مهاجر بسيط إن احتاج
      if(!db.settings) return defaultDB();
      return db;
    }catch(e){
      console.warn("DB load error", e);
      return defaultDB();
    }
  }
  function saveDB(){
    db.meta.updatedAt = Date.now();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function toast(msg){
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `
      position:fixed;left:50%;bottom:92px;transform:translateX(-50%);
      background:#111;color:#fff;padding:10px 12px;border-radius:12px;
      font-weight:800;font-size:13px;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.25);
      max-width:92vw;text-align:center
    `;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .25s"; }, 1300);
    setTimeout(()=> el.remove(), 1700);
  }

  // =====================  State  =====================
  let db = loadDB();
  let nav = "dashboard";
  let editingStudentId = null;

  // =====================  Net + Header  =====================
  function updateHeader(){
    $("#schoolName").textContent = db.settings.schoolName || "متابعة المواظبة والسلوك";
    $("#subTitle").textContent = `العام الدراسي: ${db.settings.academicYear || "-"} — حفظ محلي على الجهاز`;
    $("#todayTxt").textContent = `${toISODate(new Date())}`;
    $("#netTxt").innerHTML = navigator.onLine ? "متصل" : "<span class='offline'>غير متصل</span>";
  }
  window.addEventListener("online", updateHeader);
  window.addEventListener("offline", updateHeader);

  // =====================  Views  =====================
  function showView(name){
    nav = name;
    $$(".view").forEach(v => v.style.display = "none");
    $(`#view-${name}`).style.display = "";
    $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
    render();
  }

  function render(){
    updateHeader();
    if(nav === "dashboard") renderDashboard();
    if(nav === "students") renderStudents();
    if(nav === "attendance") renderAttendance();
    if(nav === "behavior") renderBehavior();
    if(nav === "settings") renderSettings();
  }

  // =====================  Dashboard  =====================
  function renderDashboard(){
    const el = $("#view-dashboard");
    const today = toISODate(new Date());
    const attToday = db.attendance[today] || {};
    const activeStudents = db.students.filter(s => s.active !== false);

    let حاضر=0, غائب=0, متأخر=0, مستأذن=0, غيرمسجل=0;
    for(const s of activeStudents){
      const r = attToday[s.id];
      if(!r) { غيرمسجل++; continue; }
      if(r.status==="حاضر") حاضر++;
      if(r.status==="غائب") غائب++;
      if(r.status==="متأخر") متأخر++;
      if(r.status==="مستأذن") مستأذن++;
    }

    const lastBeh = [...db.behavior].sort((a,b)=> (b.at||0)-(a.at||0)).slice(0,8);

    el.innerHTML = `
      <div class="grid cols2">
        <div class="card">
          <div class="hd">
            <b>ملخص اليوم</b>
            <span class="tag info">📅 ${today}</span>
          </div>
          <div class="bd">
            <div class="kpis">
              <div class="kpi"><b>${activeStudents.length}</b><span>إجمالي الطلاب</span></div>
              <div class="kpi"><b>${حاضر}</b><span>حاضر</span></div>
              <div class="kpi"><b>${غائب}</b><span>غائب</span></div>
              <div class="kpi"><b>${غيرمسجل}</b><span>غير مُسجل اليوم</span></div>
            </div>
            <div class="row" style="margin-top:12px">
              <button class="btn primary" id="goAttendance">فتح مواظبة اليوم</button>
              <button class="btn" id="goBehavior">رصد سلوك</button>
              <span class="spacer"></span>
              <span class="hint">نصيحة تشغيلية: خذ نسخة احتياطية أسبوعيًا من الإعدادات.</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="hd">
            <b>آخر رصد سلوكي</b>
            <span class="tag warn">⚠️ ${db.behavior.length}</span>
          </div>
          <div class="bd">
            ${lastBeh.length ? `
              <table class="table">
                <thead><tr><th>الطالب</th><th>النوع</th><th>الدرجة</th></tr></thead>
                <tbody>
                  ${lastBeh.map(x=>{
                    const st = db.students.find(s=>s.id===x.studentId);
                    return `<tr>
                      <td>${escapeHtml(st?.name || "—")}</td>
                      <td>${escapeHtml(x.type || "—")}</td>
                      <td><span class="tag ${x.level==="عالية"?"bad":x.level==="متوسطة"?"warn":"info"}">${escapeHtml(x.level||"—")}</span></td>
                    </tr>`;
                  }).join("")}
                </tbody>
              </table>
            ` : `<div class="muted">لا يوجد رصد حتى الآن.</div>`}
          </div>
        </div>
      </div>
    `;

    $("#goAttendance").onclick = () => showView("attendance");
    $("#goBehavior").onclick = () => showView("behavior");
  }

  // =====================  Students  =====================
  function renderStudents(){
    const el = $("#view-students");
    const activeStudents = db.students.filter(s => s.active !== false);
    const q = (db._uiStudentsQ || "").trim().toLowerCase();

    const filtered = activeStudents.filter(s=>{
      const hay = `${s.name||""} ${s.nid||""} ${s.grade||""} ${s.section||""}`.toLowerCase();
      return !q || hay.includes(q);
    }).sort((a,b)=> (a.grade||"").localeCompare(b.grade||"") || (a.section||"").localeCompare(b.section||"") || (a.name||"").localeCompare(b.name||""));

    el.innerHTML = `
      <div class="card">
        <div class="hd">
          <b>الطلاب</b>
          <div class="row">
            <button class="btn small" id="btnAddStudent">➕ إضافة</button>
            <button class="btn small" id="btnImportExcel">⬆️ استيراد Excel/CSV</button>
            <button class="btn small" id="btnTemplate">📄 قالب Excel</button>
          </div>
        </div>
        <div class="bd">
          <div class="row" style="margin-bottom:10px">
            <input class="input" id="studentsSearch" placeholder="بحث بالاسم/الهوية/الصف/الشعبة..." value="${escapeAttr(db._uiStudentsQ||"")}"/>
            <button class="btn" id="btnClearSearch">مسح</button>
          </div>

          ${filtered.length ? `
            <div class="tableWrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الصف/الشعبة</th>
                    <th>ولي الأمر</th>
                    <th style="width:180px">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.map(s=>`
                    <tr>
                      <td>
                        <b>${escapeHtml(s.name||"—")}</b>
                        <div class="muted" style="font-size:12px">${escapeHtml(s.nid||"")}</div>
                      </td>
                      <td>${escapeHtml((s.grade||"—") + " / " + (s.section||"—"))}</td>
                      <td class="muted">${escapeHtml(s.guardian||"—")}</td>
                      <td>
                        <button class="btn small" data-edit-st="${s.id}">✏️ تعديل</button>
                        <button class="btn small info" data-wa="${s.id}">واتس</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          ` : `<div class="muted">لا يوجد طلاب. ابدأ بإضافة طالب أو استيراد Excel.</div>`}

          <input type="file" id="fileExcel" accept=".xlsx,.xls,.csv" style="display:none"/>
          <div class="hint" style="margin-top:10px">
            الأعمدة المقترحة للاستيراد: <b>اسم الطالب</b>، <b>رقم الهوية</b>، <b>الصف</b>، <b>الشعبة</b>، <b>جوال ولي الأمر</b>، <b>ملاحظات</b>.
          </div>
        </div>
      </div>
    `;

    $("#btnAddStudent").onclick = () => openStudentModal();
    $("#btnImportExcel").onclick = () => $("#fileExcel").click();
    $("#btnTemplate").onclick = downloadTemplateExcel;

    $("#studentsSearch").oninput = (e)=>{ db._uiStudentsQ = e.target.value; renderStudents(); };
    $("#btnClearSearch").onclick = ()=>{ db._uiStudentsQ=""; renderStudents(); };

    $$("#view-students [data-edit-st]").forEach(btn=>{
      btn.onclick = ()=> openStudentModal(btn.dataset.editSt);
    });

    $$("#view-students [data-wa]").forEach(btn=>{
      btn.onclick = ()=> openWhatsAppForStudent(btn.dataset.wa);
    });

    $("#fileExcel").onchange = async (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      try{
        const rows = await readExcelOrCSV(f);
        const imported = importStudentsRows(rows);
        saveDB();
        toast(`تم استيراد ${imported} طالب`);
        renderStudents();
      }catch(err){
        console.error(err);
        alert("تعذر الاستيراد. تأكد من الملف وأنه يحتوي بيانات.");
      }finally{
        e.target.value = "";
      }
    };
  }

  function openWhatsAppForStudent(studentId){
    const s = db.students.find(x=>x.id===studentId);
    if(!s) return;
    const phone = (s.guardian||"").replace(/\D/g,"");
    if(!phone){ alert("لا يوجد رقم ولي أمر مسجل."); return; }
    // تهيئة رقم سعودي إذا بدأ بـ 05
    let wa = phone;
    if(wa.startsWith("05")) wa = "966" + wa.slice(1);
    const today = toISODate(new Date());
    const msg = `السلام عليكم ورحمة الله وبركاته\nنفيدكم بخصوص الطالب: ${s.name}\nالتاريخ: ${today}\n(رسالة متابعة مواظبة/سلوك)\nشاكرين تعاونكم.`;
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  // =====================  Attendance  =====================
  function renderAttendance(){
    const el = $("#view-attendance");
    const today = toISODate(new Date());
    const activeStudents = db.students.filter(s=>s.active !== false);

    // UI filters
    const grade = db._uiAttGrade || "";
    const section = db._uiAttSection || "";
    const q = (db._uiAttQ || "").trim().toLowerCase();

    // build grade/section options
    const grades = uniq(activeStudents.map(s=>s.grade).filter(Boolean)).sort();
    const sections = uniq(activeStudents.filter(s=>!grade || s.grade===grade).map(s=>s.section).filter(Boolean)).sort();

    const list = activeStudents.filter(s=>{
      if(grade && s.grade!==grade) return false;
      if(section && s.section!==section) return false;
      const hay = `${s.name||""} ${s.nid||""}`.toLowerCase();
      if(q && !hay.includes(q)) return false;
      return true;
    }).sort((a,b)=> (a.name||"").localeCompare(b.name||""));

    if(!db.attendance[today]) db.attendance[today] = {};
    const att = db.attendance[today];

    el.innerHTML = `
      <div class="card">
        <div class="hd">
          <b>مواظبة اليوم</b>
          <span class="tag info">📅 ${today}</span>
        </div>
        <div class="bd">
          <div class="row" style="margin-bottom:10px">
            <div style="min-width:200px;flex:1">
              <input class="input" id="attSearch" placeholder="بحث باسم الطالب/الهوية..." value="${escapeAttr(db._uiAttQ||"")}"/>
            </div>
            <div style="min-width:170px">
              <select class="input" id="attGrade">
                <option value="">كل الصفوف</option>
                ${grades.map(g=>`<option ${g===grade?"selected":""} value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("")}
              </select>
            </div>
            <div style="min-width:170px">
              <select class="input" id="attSection">
                <option value="">كل الشعب</option>
                ${sections.map(s=>`<option ${s===section?"selected":""} value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("")}
              </select>
            </div>
            <button class="btn" id="btnPrintAtt">🖨️ طباعة</button>
            <button class="btn" id="btnExportAtt">⬇️ CSV</button>
          </div>

          ${list.length ? `
            <table class="table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الصف/الشعبة</th>
                  <th>الحالة</th>
                  <th style="width:340px">تسجيل سريع</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(s=>{
                  const r = att[s.id];
                  const st = r?.status || "غير مسجل";
                  const tagClass = st==="حاضر"?"good":st==="غائب"?"bad":st==="متأخر"?"warn":st==="مستأذن"?"info":"";
                  const extra = r?.status==="متأخر" ? ` • ${r.minutesLate||0}د` : "";
                  const reason = r?.reason ? ` • ${escapeHtml(r.reason)}` : "";
                  return `
                    <tr>
                      <td>
                        <b>${escapeHtml(s.name||"—")}</b>
                        <div class="muted" style="font-size:12px">${escapeHtml(s.nid||"")}</div>
                      </td>
                      <td class="muted">${escapeHtml((s.grade||"—")+" / "+(s.section||"—"))}</td>
                      <td><span class="tag ${tagClass}">${escapeHtml(st)}${extra}${reason}</span></td>
                      <td>
                        <div class="row">
                          <button class="btn small good" data-att="${s.id}" data-st="حاضر">حاضر</button>
                          <button class="btn small bad" data-att="${s.id}" data-st="غائب">غائب</button>
                          <button class="btn small warn" data-att="${s.id}" data-st="متأخر">متأخر</button>
                          <button class="btn small info" data-att="${s.id}" data-st="مستأذن">مستأذن</button>
                          <button class="btn small" data-att-more="${s.id}">تفاصيل</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          ` : `<div class="muted">لا يوجد طلاب مطابقين للفلاتر.</div>`}

          <div class="hint" style="margin-top:10px">
            * التوثيق هنا للمتابعة الداخلية. عند الحاجة لرفع رسمي/مراسلات، استخدم مسارات المدرسة المعتمدة.
          </div>
        </div>
      </div>
    `;

    $("#attSearch").oninput = (e)=>{ db._uiAttQ = e.target.value; renderAttendance(); };
    $("#attGrade").onchange = (e)=>{ db._uiAttGrade = e.target.value; db._uiAttSection=""; renderAttendance(); };
    $("#attSection").onchange = (e)=>{ db._uiAttSection = e.target.value; renderAttendance(); };
    $("#btnPrintAtt").onclick = ()=> window.print();
    $("#btnExportAtt").onclick = ()=> exportAttendanceCSV(today);

    $$("#view-attendance [data-att]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.att;
        const status = btn.dataset.st;
        setAttendanceQuick(today, id, status);
        renderAttendance();
      };
    });

    $$("#view-attendance [data-att-more]").forEach(btn=>{
      btn.onclick = ()=> openAttendanceDetails(today, btn.dataset.attMore);
    });
  }

  function setAttendanceQuick(dateISO, studentId, status){
    if(!db.attendance[dateISO]) db.attendance[dateISO] = {};
    const rec = db.attendance[dateISO][studentId] || {};
    rec.status = status;
    rec.by = db.settings.recorderName || "مسجل";
    rec.at = Date.now();
    // افتراضات
    if(status === "متأخر" && (rec.minutesLate==null)) rec.minutesLate = 5;
    if(status !== "متأخر") { delete rec.minutesLate; }
    db.attendance[dateISO][studentId] = rec;
    saveDB();
    toast(`تم تسجيل: ${status}`);
  }

  function openAttendanceDetails(dateISO, studentId){
    const s = db.students.find(x=>x.id===studentId);
    if(!s) return;
    if(!db.attendance[dateISO]) db.attendance[dateISO] = {};
    const rec = db.attendance[dateISO][studentId] || { status:"غير مسجل" };

    const minutes = rec.minutesLate ?? "";
    const reason = rec.reason ?? "";
    const action = rec.action ?? "";

    const html = `
      <div class="modal open" id="modalAttDetails">
        <div class="sheet">
          <div class="hd">
            <b>تفاصيل المواظبة — ${escapeHtml(s.name||"")}</b>
            <button class="btn small" id="closeAttDetails">إغلاق</button>
          </div>
          <div class="bd">
            <div class="two">
              <div>
                <label class="muted">الحالة</label>
                <select class="input" id="ad_status">
                  ${["حاضر","غائب","متأخر","مستأذن","غير مسجل"].map(x=>`<option ${x===rec.status?"selected":""} value="${x}">${x}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="muted">دقائق التأخر (إن وجد)</label>
                <input class="input" id="ad_minutes" type="number" min="0" placeholder="مثال: 10" value="${escapeAttr(String(minutes))}">
              </div>
              <div>
                <label class="muted">السبب/المبرر</label>
                <input class="input" id="ad_reason" placeholder="اختياري" value="${escapeAttr(reason)}">
              </div>
              <div>
                <label class="muted">إجراء متخذ</label>
                <input class="input" id="ad_action" placeholder="مثال: تنبيه/اتصال/استدعاء..." value="${escapeAttr(action)}">
              </div>
            </div>

            <div class="row" style="margin-top:12px">
              <button class="btn primary" id="saveAttDetails">حفظ</button>
              <button class="btn" id="waAtt">واتس لولي الأمر</button>
              <span class="spacer"></span>
              <span class="hint">* احرص على الموضوعية واختصار السبب بما يخدم المتابعة.</span>
            </div>
          </div>
        </div>
      </div>
    `;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    $("#closeAttDetails", wrap).onclick = ()=> wrap.remove();
    $("#saveAttDetails", wrap).onclick = ()=>{
      const st = $("#ad_status", wrap).value;
      const mins = Number($("#ad_minutes", wrap).value || 0);
      const rsn = $("#ad_reason", wrap).value.trim();
      const act = $("#ad_action", wrap).value.trim();

      const obj = db.attendance[dateISO][studentId] || {};
      obj.status = st;
      if(st === "متأخر") obj.minutesLate = mins;
      else delete obj.minutesLate;

      obj.reason = rsn || "";
      obj.action = act || "";
      obj.by = db.settings.recorderName || "مسجل";
      obj.at = Date.now();

      db.attendance[dateISO][studentId] = obj;
      saveDB();
      toast("تم حفظ التفاصيل");
      wrap.remove();
      renderAttendance();
    };

    $("#waAtt", wrap).onclick = ()=>{
      const status = $("#ad_status", wrap).value;
      const mins = $("#ad_minutes", wrap).value;
      const rsn = $("#ad_reason", wrap).value;
      const msg = `السلام عليكم ورحمة الله وبركاته\nنفيدكم بخصوص الطالب: ${s.name}\nالتاريخ: ${dateISO}\nالحالة: ${status}${status==="متأخر" ? ` (${mins||0} دقيقة)` : ""}\n${rsn?`السبب: ${rsn}\n`:""}شاكرين تعاونكم.`;
      openWhatsApp(s.guardian, msg);
    };
  }

  function exportAttendanceCSV(dateISO){
    const att = db.attendance[dateISO] || {};
    const rows = [["التاريخ","اسم الطالب","رقم الهوية","الصف","الشعبة","الحالة","دقائق التأخر","السبب","الإجراء","المسجل","وقت التسجيل"]];
    for(const s of db.students.filter(x=>x.active!==false)){
      const r = att[s.id] || {};
      rows.push([
        dateISO,
        s.name||"",
        s.nid||"",
        s.grade||"",
        s.section||"",
        r.status||"غير مسجل",
        r.minutesLate ?? "",
        r.reason||"",
        r.action||"",
        r.by||"",
        r.at ? new Date(r.at).toLocaleString("ar-SA") : ""
      ]);
    }
    downloadCSV(`مواظبة-${dateISO}.csv`, rows);
  }

  // =====================  Behavior  =====================
  function renderBehavior(){
    const el = $("#view-behavior");

    const q = (db._uiBehQ || "").trim().toLowerCase();
    const list = [...db.behavior].sort((a,b)=> (b.at||0)-(a.at||0)).filter(x=>{
      const st = db.students.find(s=>s.id===x.studentId);
      const hay = `${st?.name||""} ${x.type||""} ${x.cat||""} ${x.level||""}`.toLowerCase();
      return !q || hay.includes(q);
    }).slice(0,200);

    el.innerHTML = `
      <div class="card">
        <div class="hd">
          <b>السلوك والمخالفات</b>
          <div class="row">
            <button class="btn small warn" id="btnAddBehavior">⚠️ رصد جديد</button>
            <button class="btn small" id="btnExportBehavior">⬇️ CSV</button>
          </div>
        </div>
        <div class="bd">
          <div class="row" style="margin-bottom:10px">
            <input class="input" id="behSearch" placeholder="بحث (طالب/نوع/تصنيف/درجة)..." value="${escapeAttr(db._uiBehQ||"")}"/>
            <button class="btn" id="behClear">مسح</button>
          </div>

          ${list.length ? `
            <table class="table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الوقت</th>
                  <th>التصنيف</th>
                  <th>النوع</th>
                  <th>الدرجة</th>
                  <th>الإجراء</th>
                  <th style="width:120px">حذف</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(x=>{
                  const st = db.students.find(s=>s.id===x.studentId);
                  const lvl = x.level || "—";
                  const cls = lvl==="عالية"?"bad":lvl==="متوسطة"?"warn":"info";
                  return `
                    <tr>
                      <td><b>${escapeHtml(st?.name||"—")}</b><div class="muted" style="font-size:12px">${escapeHtml((st?.grade||"")+" / "+(st?.section||""))}</div></td>
                      <td class="muted">${x.dt ? new Date(x.dt).toLocaleString("ar-SA") : "—"}</td>
                      <td>${escapeHtml(x.cat||"—")}</td>
                      <td>${escapeHtml(x.type||"—")}</td>
                      <td><span class="tag ${cls}">${escapeHtml(lvl)}</span></td>
                      <td class="muted">${escapeHtml(x.action||"—")}</td>
                      <td><button class="btn small bad" data-del-bh="${x.id}">حذف</button></td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          ` : `<div class="muted">لا يوجد رصد حتى الآن.</div>`}

          <div class="hint" style="margin-top:10px">
            * يفضّل توثيق المخالفات وفق التنظيمات المعتمدة، وتسجيل الإجراء المتخذ بوضوح.
          </div>
        </div>
      </div>
    `;

    $("#behSearch").oninput = (e)=>{ db._uiBehQ = e.target.value; renderBehavior(); };
    $("#behClear").onclick = ()=>{ db._uiBehQ=""; renderBehavior(); };

    $("#btnAddBehavior").onclick = ()=> openBehaviorModal();
    $("#btnExportBehavior").onclick = ()=> exportBehaviorCSV();

    $$("#view-behavior [data-del-bh]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.delBh;
        if(!confirm("تأكيد حذف الرصد؟")) return;
        db.behavior = db.behavior.filter(x=>x.id!==id);
        saveDB();
        renderBehavior();
      };
    });
  }

  function openBehaviorModal(){
    const modal = $("#modalBehavior");
    const sel = $("#bh_student");
    const active = db.students.filter(s=>s.active!==false).sort((a,b)=> (a.name||"").localeCompare(b.name||""));
    sel.innerHTML = active.map(s=> `<option value="${s.id}">${escapeHtml(s.name)} — ${escapeHtml((s.grade||"")+" / "+(s.section||""))}</option>`).join("");
    $("#bh_dt").value = toLocalDTInput(new Date());
    $("#bh_type").value = "";
    $("#bh_level").value = "بسيطة";
    $("#bh_action").value = "";
    $("#bh_desc").value = "";
    modal.classList.add("open");

    $("#btnSaveBehavior").onclick = ()=>{
      const studentId = sel.value;
      const dt = new Date($("#bh_dt").value).getTime() || Date.now();
      const cat = $("#bh_cat").value;
      const type = $("#bh_type").value.trim();
      const level = $("#bh_level").value;
      const action = $("#bh_action").value.trim();
      const desc = $("#bh_desc").value.trim();

      if(!studentId){ alert("اختر الطالب"); return; }
      if(!type){ alert("اكتب نوع المخالفة"); return; }

      db.behavior.push({
        id: uid(),
        studentId,
        dt,
        cat,
        type,
        level,
        action,
        desc,
        by: db.settings.recorderName || "مسجل",
        at: Date.now()
      });
      saveDB();
      modal.classList.remove("open");
      toast("تم حفظ الرصد");
      renderBehavior();
    };
  }

  function exportBehaviorCSV(){
    const rows = [["الوقت","اسم الطالب","رقم الهوية","الصف","الشعبة","التصنيف","النوع","الدرجة","الإجراء","الوصف","المسجل"]];
    const list = [...db.behavior].sort((a,b)=> (b.at||0)-(a.at||0));
    for(const x of list){
      const st = db.students.find(s=>s.id===x.studentId) || {};
      rows.push([
        x.dt ? new Date(x.dt).toLocaleString("ar-SA") : "",
        st.name||"",
        st.nid||"",
        st.grade||"",
        st.section||"",
        x.cat||"",
        x.type||"",
        x.level||"",
        x.action||"",
        x.desc||"",
        x.by||""
      ]);
    }
    downloadCSV(`سلوك-المخالفات.csv`, rows);
  }

  // =====================  Settings  =====================
  function renderSettings(){
    const el = $("#view-settings");
    el.innerHTML = `
      <div class="grid cols2">
        <div class="card">
          <div class="hd"><b>إعدادات عامة</b></div>
          <div class="bd">
            <div class="two">
              <div>
                <label class="muted">اسم المدرسة</label>
                <input class="input" id="set_school" value="${escapeAttr(db.settings.schoolName||"")}"/>
              </div>
              <div>
                <label class="muted">العام الدراسي</label>
                <input class="input" id="set_year" value="${escapeAttr(db.settings.academicYear||"")}"/>
              </div>
              <div>
                <label class="muted">اسم المسجل (يظهر في السجلات)</label>
                <input class="input" id="set_rec" value="${escapeAttr(db.settings.recorderName||"")}"/>
              </div>
            </div>

            <div class="row" style="margin-top:12px">
              <button class="btn primary" id="btnSaveSettings">حفظ الإعدادات</button>
            </div>

            <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">

            <b style="font-size:13px">نسخ احتياطي</b>
            <div class="row" style="margin-top:10px">
              <button class="btn" id="btnExportJSON">⬇️ تصدير JSON</button>
              <button class="btn" id="btnImportJSON">⬆️ استيراد JSON</button>
              <button class="btn bad" id="btnReset">🗑️ تصفير البيانات</button>
            </div>
            <input type="file" id="fileJSON" accept=".json" style="display:none"/>

            <div class="hint" style="margin-top:10px">
              * البيانات محفوظة محليًا على هذا الجهاز. عند تغيير الجوال/المتصفح يلزم استيراد النسخة الاحتياطية.
            </div>
          </div>
        </div>

        <div class="card">
          <div class="hd"><b>ملاحظات تشغيلية</b></div>
          <div class="bd">
            <ul class="hint" style="margin:0;padding-right:18px">
              <li>يفضّل تحديد “اسم المسجل” (مثلاً: وكيل شؤون طلابية / رائد نشاط).</li>
              <li>استخدم “قالب Excel” لاستيراد الطلاب دفعة واحدة.</li>
              <li>للطباعة الرسمية: افتح مواظبة اليوم ثم “طباعة”.</li>
              <li>لضمان السجلات: خذ نسخة احتياطية أسبوعيًا.</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    $("#btnSaveSettings").onclick = ()=>{
      db.settings.schoolName = $("#set_school").value.trim() || db.settings.schoolName;
      db.settings.academicYear = $("#set_year").value.trim() || db.settings.academicYear;
      db.settings.recorderName = $("#set_rec").value.trim() || "مسجل";
      saveDB();
      toast("تم حفظ الإعدادات");
      render();
    };

    $("#btnExportJSON").onclick = ()=> {
      const blob = new Blob([JSON.stringify(db, null, 2)], {type:"application/json"});
      downloadBlob(`نسخة-احتياطية-مواظبة-وسلوك.json`, blob);
    };
    $("#btnImportJSON").onclick = ()=> $("#fileJSON").click();
    $("#fileJSON").onchange = async (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      try{
        const txt = await f.text();
        const obj = JSON.parse(txt);
        if(!obj || !obj.settings || !obj.students) throw new Error("Invalid");
        db = obj;
        saveDB();
        toast("تم الاستيراد بنجاح");
        render();
      }catch(err){
        alert("ملف غير صالح.");
      }finally{
        e.target.value="";
      }
    };

    $("#btnReset").onclick = ()=>{
      if(!confirm("سيتم حذف جميع البيانات من هذا الجهاز. تأكيد؟")) return;
      localStorage.removeItem(DB_KEY);
      db = loadDB();
      toast("تم تصفير البيانات");
      render();
    };
  }

  // =====================  Student Modal  =====================
  function openStudentModal(id=null){
    editingStudentId = id;
    const modal = $("#modalStudent");
    const isEdit = !!id;
    $("#modalStudentTitle").textContent = isEdit ? "تعديل طالب" : "إضافة طالب";

    const st = isEdit ? db.students.find(s=>s.id===id) : null;

    $("#st_name").value = st?.name || "";
    $("#st_nid").value = st?.nid || "";
    $("#st_grade").value = st?.grade || "";
    $("#st_section").value = st?.section || "";
    $("#st_guardian").value = st?.guardian || "";
    $("#st_note").value = st?.note || "";

    $("#btnDeleteStudent").style.display = isEdit ? "" : "none";
    modal.classList.add("open");

    $("#btnSaveStudent").onclick = ()=>{
      const name = $("#st_name").value.trim();
      if(!name){ alert("اكتب اسم الطالب"); return; }
      const obj = {
        id: isEdit ? st.id : uid(),
        name,
        nid: $("#st_nid").value.trim(),
        grade: $("#st_grade").value.trim(),
        section: $("#st_section").value.trim(),
        guardian: $("#st_guardian").value.trim(),
        note: $("#st_note").value.trim(),
        active: true
      };
      if(isEdit){
        const idx = db.students.findIndex(s=>s.id===st.id);
        db.students[idx] = obj;
      }else{
        db.students.push(obj);
      }
      saveDB();
      modal.classList.remove("open");
      toast("تم حفظ الطالب");
      renderStudents();
    };

    $("#btnDeleteStudent").onclick = ()=>{
      if(!confirm("تأكيد حذف الطالب؟ سيتم إبقاؤه غير نشط لتجنب فقدان السجلات.")) return;
      const s = db.students.find(x=>x.id===id);
      if(s) s.active = false;
      saveDB();
      modal.classList.remove("open");
      toast("تم إيقاف الطالب");
      renderStudents();
    };
  }

  // close modals
  $$("[data-close]").forEach(btn=>{
    btn.onclick = ()=> $("#"+btn.dataset.close).classList.remove("open");
  });

  // =====================  Excel Import  =====================
  async function readExcelOrCSV(file){
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if(ext === "csv"){
      const text = await file.text();
      return csvToRows(text);
    }
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:"array"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, {defval:""});
    return json; // array of objects
  }

  function importStudentsRows(rows){
    if(!rows || !rows.length) return 0;

    // detect object rows vs array rows
    // sheet_to_json returns objects keyed by header row
    let imported = 0;

    // helper to find column
    const pick = (obj, keys) => {
      for(const k of keys){
        const foundKey = Object.keys(obj).find(h => normalize(h) === normalize(k));
        if(foundKey != null) return obj[foundKey];
      }
      // try contains
      for(const k of keys){
        const foundKey = Object.keys(obj).find(h => normalize(h).includes(normalize(k)));
        if(foundKey != null) return obj[foundKey];
      }
      return "";
    };

    for(const r of rows){
      const name = String(pick(r, ["اسم الطالب","الاسم","StudentName","Name"])).trim();
      if(!name) continue;

      const nid = String(pick(r, ["رقم الهوية","الهوية","السجل المدني","رقم السجل","NationalID","ID"])).trim();
      const grade = String(pick(r, ["الصف","الصف الدراسي","Grade"])).trim();
      const section = String(pick(r, ["الشعبة","الفصل","Section","Class"])).trim();
      const guardian = String(pick(r, ["جوال ولي الأمر","جوال ولي الامر","هاتف ولي الأمر","GuardianPhone","Phone"])).trim();
      const note = String(pick(r, ["ملاحظات","ملاحظة","Note","Notes"])).trim();

      // dedupe by nid if exists, else by name+grade+section
      const exists = db.students.find(s=>{
        if(nid && s.nid && s.nid === nid) return true;
        return normalize(s.name)===normalize(name) && normalize(s.grade)===normalize(grade) && normalize(s.section)===normalize(section);
      });
      if(exists){
        // تحديث بسيط
        exists.guardian = guardian || exists.guardian;
        exists.note = note || exists.note;
        exists.grade = grade || exists.grade;
        exists.section = section || exists.section;
        exists.active = true;
        continue;
      }

      db.students.push({
        id: uid(),
        name,
        nid,
        grade,
        section,
        guardian,
        note,
        active: true
      });
      imported++;
    }
    return imported;
  }

  function downloadTemplateExcel(){
    // نولّد CSV بسيط كقالب (يدعم Excel)
    const rows = [
      ["اسم الطالب","رقم الهوية","الصف","الشعبة","جوال ولي الأمر","ملاحظات"],
      ["مثال: أحمد محمد","1234567890","ثالث ثانوي","3/2","05xxxxxxxx",""]
    ];
    downloadCSV("قالب-الطلاب.csv", rows);
  }

  // =====================  Utilities  =====================
  function openWhatsApp(guardianPhone, message){
    const phone = (guardianPhone||"").replace(/\D/g,"");
    if(!phone){ alert("لا يوجد رقم ولي أمر."); return; }
    let wa = phone;
    if(wa.startsWith("05")) wa = "966" + wa.slice(1);
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`, "_blank");
  }

  function downloadCSV(filename, rows){
    const csv = rows.map(r => r.map(cell=>{
      const s = String(cell ?? "");
      if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
      return s;
    }).join(",")).join("\n");
    downloadBlob(filename, new Blob([csv], {type:"text/csv;charset=utf-8"}));
  }

  function downloadBlob(filename, blob){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function csvToRows(text){
    // CSV بسيط (يفترض صف عناوين)
    const lines = text.split(/\r?\n/).filter(x=>x.trim().length);
    if(!lines.length) return [];
    const headers = parseCSVLine(lines[0]).map(h=>h.trim());
    const out = [];
    for(let i=1;i<lines.length;i++){
      const vals = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h,idx)=> obj[h] = vals[idx] ?? "");
      out.push(obj);
    }
    return out;
  }

  function parseCSVLine(line){
    const res = [];
    let cur = "", inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"' ){
        if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      }else if(ch === "," && !inQ){
        res.push(cur); cur="";
      }else{
        cur += ch;
      }
    }
    res.push(cur);
    return res;
  }

  function uniq(arr){
    const s = new Set(arr.map(x=>String(x)));
    return Array.from(s).map(x=>x==="undefined"?"":x).filter(Boolean);
  }

  function normalize(x){
    return String(x||"")
      .trim()
      .toLowerCase()
      .replace(/\s+/g," ")
      .replace(/[أإآ]/g,"ا")
      .replace(/ة/g,"ه")
      .replace(/ى/g,"ي");
  }

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }
  function escapeAttr(s){
    return escapeHtml(s).replace(/`/g,"&#096;");
  }

  // =====================  Nav bindings  =====================
  $$(".nav button").forEach(b=>{
    b.onclick = ()=> showView(b.dataset.nav);
  });

  // =====================  SW register  =====================
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  // init
  updateHeader();
  showView("dashboard");
})();
