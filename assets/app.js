/* Yaqubi RSD Offline PWA - v2 */
(function(){
  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
  const UI = {};

  function toast(msg, ms=2600){
    UI.toast.textContent = msg;
    UI.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>UI.toast.classList.remove("show"), ms);
  }

  function todayISO(){
    const d=new Date();
    const z = new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return z.toISOString().slice(0,10);
  }

  function hijriPlaceholder(){ return "١٤٤٧هـ"; } // editable in settings

  function safeText(s){ return String(s||"").replace(/[<>]/g,""); }

  // --- Seed loading ---
  async function ensureSeed(){
    const seeded = await DB.getMeta("seed_v2_done");
    const count = await DB.countStudents();
    if(count>0) return;
    // If empty and not seeded, auto-seed
    try{
      const res = await fetch("assets/students_seed.json", {cache:"no-store"});
      if(!res.ok) throw new Error("seed not found");
      const js = await res.json();
      const students = js.students || [];
      if(students.length){
        await DB.seedStudents(students);
        await DB.setMeta("seed_v2_done", true);
        toast(`تم تحميل قاعدة الطلاب (${students.length}) تلقائيًا ✅`);
      }
    }catch(e){
      // ignore: user can import manually
      console.warn(e);
    }
  }

  // --- Rules ---
  let RULES = null;
  async function loadRules(){
    RULES = await Rules.loadRules();
    UI.selInfraction.innerHTML = "";
    for(const inf of (RULES.behavior?.infractions||[])){
      const opt = document.createElement("option");
      opt.value = inf.code;
      opt.textContent = `${inf.code} — ${inf.label}`;
      UI.selInfraction.appendChild(opt);
    }
  }

  // --- Import/Export ---
  function parseCSV(text){
    // Simple CSV parser (handles quotes)
    const rows=[];
    let i=0, field="", row=[], inQ=false;
    const pushField=()=>{ row.push(field); field=""; };
    const pushRow=()=>{ if(row.length && row.some(c=>String(c).trim()!=="")) rows.push(row); row=[]; };
    while(i<text.length){
      const ch=text[i];
      if(inQ){
        if(ch === '"'){
          if(text[i+1] === '"'){ field+='"'; i+=2; continue; }
          inQ=false; i++; continue;
        }
        field+=ch; i++; continue;
      }else{
        if(ch === '"'){ inQ=true; i++; continue; }
        if(ch === ","){ pushField(); i++; continue; }
        if(ch === "\n"){ pushField(); pushRow(); i++; continue; }
        if(ch === "\r"){ i++; continue; }
        field+=ch; i++; continue;
      }
    }
    pushField(); pushRow();
    return rows;
  }

  function mapHeaders(h){
    return h.map(x=>String(x||"").trim());
  }

  function pick(obj, keys){
    for(const k of keys){
      if(k in obj && String(obj[k]||"").trim()!=="") return String(obj[k]).trim();
    }
    return "";
  }

  function normalizeDigits(s){ return String(s||"").replace(/\D+/g,""); }

  function rowsToStudents(rows){
    if(!rows.length) return [];
    const head = mapHeaders(rows[0]);
    const students=[];
    for(let r=1;r<rows.length;r++){
      const row = rows[r];
      const o={};
      for(let c=0;c<head.length;c++) o[head[c]] = row[c] ?? "";
      const name = pick(o, ["اسم الطالب","الاسم","name","StudentName","student_name"]);
      const idNumber = normalizeDigits(pick(o, ["رقم الهوية","الهوية","idNumber","NationalID","national_id","هوية الطالب"]));
      const gradeLabel = pick(o, ["الصف","الصف الدراسي","grade","Grade","المرحلة"]);
      const gradeCode = pick(o, ["رقم الصف","gradeCode","GradeCode"]) || gradeLabel;
      const section = pick(o, ["الشعبة","الفصل","section","Section","شعبة"]);
      const guardianPhone = normalizeDigits(pick(o, ["جوال ولي الامر","جوال ولي الأمر","phone","guardianPhone","Mobile"]));
      if(!name || !idNumber) continue;
      students.push({idNumber, name, gradeLabel, gradeCode, section, guardianPhone});
    }
    return students;
  }

  async function importStudentsFromFile(file){
    const txt = await file.text();
    const rows = parseCSV(txt);
    const students = rowsToStudents(rows);
    if(!students.length){
      throw new Error("لم يتم العثور على أعمدة مطابقة. جرّب قالب CSV (اسم الطالب + رقم الهوية + الصف + الشعبة).");
    }
    await DB.upsertStudents(students);
    toast(`تم استيراد ${students.length} طالب ✅`);
    await refreshStats();
  }

  async function exportBackup(){
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const a=document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yaqubi_rsd_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
  }

  async function importBackup(file){
    const txt = await file.text();
    const data = JSON.parse(txt);
    await DB.importAll(data);
    toast("تم استيراد النسخة الاحتياطية ✅");
    await refreshStats();
  }

  // --- Search & selection ---
  let selectedStudent = null;

  async function doSearch(){
    const q = UI.search.value.trim();
    if(!q){
      UI.results.innerHTML = `<div class="muted">اكتب اسم الطالب أو رقم الهوية للبحث…</div>`;
      return;
    }
    const res = await DB.searchStudents(q, 80);
    if(!res.length){
      UI.results.innerHTML = `<div class="muted">لا توجد نتائج.</div>`;
      return;
    }
    UI.results.innerHTML = "";
    for(const s of res){
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="name">${safeText(s.name)}</div>
        <div class="sub">
          <span class="badge">الصف: ${safeText(s.gradeLabel||"-")}</span>
          <span class="badge">الشعبة: ${safeText(s.section||"-")}</span>
          <span class="badge">${safeText(s.idNumber)}</span>
        </div>
      `;
      div.onclick = ()=>openStudent(s.idNumber);
      UI.results.appendChild(div);
    }
  }

  async function openStudent(idNumber){
    const s = await DB.getStudent(idNumber);
    if(!s) return;
    selectedStudent = s;
    const stats = await DB.statsForStudent(s.idNumber);
    UI.mName.textContent = s.name;
    UI.mMeta.innerHTML = `
      <span class="badge">الصف: ${safeText(s.gradeLabel||"-")}</span>
      <span class="badge">الشعبة: ${safeText(s.section||"-")}</span>
      <span class="badge">${safeText(s.idNumber)}</span>
      ${s.guardianPhone? `<span class="badge">جوال ولي الأمر: ${safeText(s.guardianPhone)}</span>`:""}
    `;
    UI.mBarcode.innerHTML = Barcode39.svg(s.idNumber, {height:42});
    UI.kLate.textContent = stats.late;
    UI.kAbsent.textContent = stats.absent;
    UI.kBeh.textContent = stats.behavior;
    UI.attDate.value = todayISO();
    UI.behDate.value = todayISO();
    await renderStudentHistory();
    UI.modal.classList.add("open");
  }

  async function renderStudentHistory(){
    const id = selectedStudent.idNumber;
    const at = (await DB.attendanceForStudent(id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const bh = (await DB.behaviorForStudent(id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    UI.history.innerHTML = "";

    const sec1 = document.createElement("div");
    sec1.innerHTML = `<h2>سجل المواظبة</h2>`;
    const tbl1 = document.createElement("table"); tbl1.className="table";
    tbl1.innerHTML = `<thead><tr><th>التاريخ</th><th>النوع</th><th>ملاحظة</th></tr></thead><tbody></tbody>`;
    const tb1 = tbl1.querySelector("tbody");
    for(const r of at.slice(0,40)){
      const tr=document.createElement("tr");
      tr.innerHTML = `<td>${safeText(r.date)}</td><td>${r.type==="LATE"?"تأخر":"غياب"}</td><td>${safeText(r.note||"")}</td>`;
      tb1.appendChild(tr);
    }
    sec1.appendChild(tbl1);

    const sec2 = document.createElement("div");
    sec2.innerHTML = `<h2>سجل السلوك</h2>`;
    const tbl2 = document.createElement("table"); tbl2.className="table";
    tbl2.innerHTML = `<thead><tr><th>التاريخ</th><th>الكود</th><th>الوصف</th><th>إجراء</th></tr></thead><tbody></tbody>`;
    const tb2 = tbl2.querySelector("tbody");
    for(const r of bh.slice(0,40)){
      const inf = (RULES?.behavior?.infractions||[]).find(x=>x.code===r.code);
      const label = inf ? inf.label : "";
      const tr=document.createElement("tr");
      tr.innerHTML = `<td>${safeText(r.date)}</td><td>${safeText(r.code)}</td><td>${safeText(label)}</td><td>${safeText((r.actions||[]).join("، "))}</td>`;
      tb2.appendChild(tr);
    }
    sec2.appendChild(tbl2);

    UI.history.appendChild(sec1);
    UI.history.appendChild(sec2);
  }

  async function addLate(){
    const date = UI.attDate.value || todayISO();
    const note = UI.attNote.value.trim();
    await DB.addAttendance({idNumber:selectedStudent.idNumber, date, type:"LATE", note, createdAt:new Date().toISOString()});
    UI.attNote.value="";
    toast("تم تسجيل التأخر ✅");
    await openStudent(selectedStudent.idNumber);
  }
  async function addAbsent(){
    const date = UI.attDate.value || todayISO();
    const note = UI.attNote.value.trim();
    await DB.addAttendance({idNumber:selectedStudent.idNumber, date, type:"ABSENT", note, createdAt:new Date().toISOString()});
    UI.attNote.value="";
    toast("تم تسجيل الغياب ✅");
    await openStudent(selectedStudent.idNumber);
  }

  function getInfraction(code){
    return (RULES?.behavior?.infractions||[]).find(x=>x.code===code) || null;
  }

  async function addBehavior(){
    const date = UI.behDate.value || todayISO();
    const code = UI.selInfraction.value;
    const note = UI.behNote.value.trim();
    const inf = getInfraction(code);
    const actions = inf ? (inf.defaultActions||[]) : [];
    const actionsLabels = actions.map(a=>RULES?.behavior?.actionsCatalog?.[a] || a);
    await DB.addBehavior({idNumber:selectedStudent.idNumber, date, code, note, actions: actionsLabels, createdAt:new Date().toISOString()});
    UI.behNote.value="";
    toast("تم تسجيل المخالفة ✅");
    await openStudent(selectedStudent.idNumber);
  }

  // --- Printing ---
  function weekStartISO(dISO){
    // week starts on Sunday
    const d=new Date(dISO+"T00:00:00");
    const day = d.getDay(); // 0 sun .. 6 sat
    const diff = day; // days since sunday
    const ws = new Date(d.getTime() - diff*86400000);
    return ws.toISOString().slice(0,10);
  }
  function addDays(iso, n){
    const d=new Date(iso+"T00:00:00");
    const x=new Date(d.getTime()+n*86400000);
    return x.toISOString().slice(0,10);
  }
  const DAYS_AR = [
    {k:0, label:"الأحد"},
    {k:1, label:"الاثنين"},
    {k:2, label:"الثلاثاء"},
    {k:3, label:"الأربعاء"},
    {k:4, label:"الخميس"}
  ];

  async function buildSheet(type){
    const school = await DB.getMeta("school_header") || "الإدارة العامة للتعليم بالمنطقة الشرقية — قطاع الخبر — ثانوية اليعقوبي الثانوية";
    const hijri = await DB.getMeta("hijri_year") || hijriPlaceholder();
    const term = await DB.getMeta("term") || "الفصل الدراسي الأول";
    const grade = UI.printGrade.value;
    const section = UI.printSection.value;

    const date = UI.printDate.value || todayISO();
    const ws = weekStartISO(date);

    const list = await DB.listStudentsByClass(grade, section);

    const title = (type==="LATE") ? "كشف متابعة التأخر" : "كشف متابعة الغياب";
    const gradeLabel = grade || "—";
    const sectionLabel = section || "—";

    let html = `
      <div class="printPage">
        <div class="printHeader">
          <div class="muted">${safeText(school)}</div>
          <div class="title">${title}</div>
          <div class="muted">${safeText(term)} — ${safeText(hijri)}</div>
        </div>
        <div class="muted" style="margin-bottom:8px">الصف: <b>${safeText(gradeLabel)}</b> — الشعبة: <b>${safeText(sectionLabel)}</b> — أسبوع يبدأ: <b>${safeText(ws)}</b></div>
        <table class="table">
          <thead>
            <tr>
              <th style="width:38px">م</th>
              <th>اسم الطالب</th>
              ${DAYS_AR.map(d=>`<th style="width:86px">${d.label}</th>`).join("")}
              <th style="width:180px">باركود (رقم الهوية)</th>
            </tr>
          </thead>
          <tbody>
    `;
    let i=1;
    for(const s of list){
      html += `<tr>
        <td>${i++}</td>
        <td><b>${safeText(s.name)}</b><div class="muted">${safeText(s.idNumber)}</div></td>
        ${DAYS_AR.map((d,idx)=>`<td style="height:34px"></td>`).join("")}
        <td>${Barcode39.svg(s.idNumber, {height:34, label:false})}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  async function buildCards(kind){
    // kind: late|absent|behavior
    if(!selectedStudent) throw new Error("اختر طالبًا أولاً.");
    const s = selectedStudent;
    const school = await DB.getMeta("school_short") || "ثانوية اليعقوبي الثانوية";
    const date = (kind==="behavior") ? (UI.behDate.value||todayISO()) : (UI.attDate.value||todayISO());
    const stats = await DB.statsForStudent(s.idNumber);

    let head = "";
    if(kind==="late") head = "كرت تأخر";
    if(kind==="absent") head = "كرت غياب";
    if(kind==="behavior") head = "كرت مخالفة سلوكية";

    let extra = "";
    if(kind==="behavior"){
      const code = UI.selInfraction.value;
      const inf = getInfraction(code);
      extra = `<div class="muted">المخالفة: <b>${safeText(code)}</b> — ${safeText(inf?inf.label:"")}</div>`;
    }

    return `
      <div class="printPage">
        <div class="cardsGrid">
          <div class="smallCard">
            <div>
              <div style="display:flex;justify-content:space-between;gap:8px">
                <b>${safeText(school)}</b>
                <b>${head}</b>
              </div>
              <div class="muted">التاريخ: <b>${safeText(date)}</b></div>
              <hr/>
              <div><b>${safeText(s.name)}</b></div>
              <div class="muted">الصف: <b>${safeText(s.gradeLabel||"-")}</b> — الشعبة: <b>${safeText(s.section||"-")}</b></div>
              ${extra}
              <div class="muted">الأرشيف: تأخر <b>${stats.late}</b> — غياب <b>${stats.absent}</b> — سلوك <b>${stats.behavior}</b></div>
            </div>
            <div>${Barcode39.svg(s.idNumber, {height:28})}</div>
          </div>
        </div>
      </div>
    `;
  }

  async function printSheet(type){
    UI.printArea.innerHTML = await buildSheet(type);
    window.print();
  }
  async function printCard(kind){
    UI.printArea.innerHTML = await buildCards(kind);
    window.print();
  }

  // --- Settings ---
  async function saveSettings(){
    await DB.setMeta("school_header", UI.setSchoolHeader.value.trim());
    await DB.setMeta("school_short", UI.setSchoolShort.value.trim());
    await DB.setMeta("term", UI.setTerm.value);
    await DB.setMeta("hijri_year", UI.setHijri.value.trim());
    await DB.setMeta("sms_proxy_url", UI.setProxyUrl.value.trim());
    await DB.setMeta("sms_proxy_key", UI.setProxyKey.value.trim());
    toast("تم حفظ الإعدادات ✅");
  }

  async function loadSettingsToUI(){
    UI.setSchoolHeader.value = (await DB.getMeta("school_header")) || "الإدارة العامة للتعليم بالمنطقة الشرقية — قطاع الخبر — ثانوية اليعقوبي الثانوية";
    UI.setSchoolShort.value  = (await DB.getMeta("school_short")) || "ثانوية اليعقوبي الثانوية";
    UI.setTerm.value         = (await DB.getMeta("term")) || "الفصل الدراسي الأول";
    UI.setHijri.value        = (await DB.getMeta("hijri_year")) || hijriPlaceholder();
    UI.setProxyUrl.value     = (await DB.getMeta("sms_proxy_url")) || "";
    UI.setProxyKey.value     = (await DB.getMeta("sms_proxy_key")) || "";
  }

  async function refreshStats(){
    const count = await DB.countStudents();
    UI.kTotal.textContent = count;
    await DB.refreshStudentsCache();
    // refresh grade/section options
    const all = DB._studentsCache || [];
    const grades = Array.from(new Set(all.map(s=>String(s.gradeCode||s.gradeLabel||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ar"));
    const sections = Array.from(new Set(all.map(s=>String(s.section||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ar"));
    UI.printGrade.innerHTML = `<option value="">كل الصفوف</option>` + grades.map(g=>`<option value="${safeText(g)}">${safeText(g)}</option>`).join("");
    UI.printSection.innerHTML = `<option value="">كل الشعب</option>` + sections.map(s=>`<option value="${safeText(s)}">${safeText(s)}</option>`).join("");
  }

  // --- SMS quick ---
  async function sendSmsToGuardian(){
    if(!selectedStudent) throw new Error("اختر طالبًا أولاً.");
    const phone = selectedStudent.guardianPhone;
    if(!phone) throw new Error("لا يوجد جوال ولي الأمر في بيانات الطالب.");
    const msg = UI.smsMsg.value.trim();
    if(!msg) throw new Error("اكتب نص الرسالة أولاً.");
    UI.btnSendSMS.disabled = true;
    UI.btnSendSMS.textContent = "جارٍ الإرسال…";
    try{
      await SMS.send(phone, msg);
      toast("تم إرسال الرسالة ✅");
      UI.smsMsg.value="";
    }finally{
      UI.btnSendSMS.disabled = false;
      UI.btnSendSMS.textContent = "إرسال SMS";
    }
  }

  // --- Tabs ---
  function showTab(key){
    for(const b of $$(".tab")) b.classList.toggle("active", b.dataset.tab===key);
    for(const p of $$(".panel")) p.style.display = (p.dataset.tab===key) ? "" : "none";
  }

  // --- Init ---
  async function init(){
    // Bind UI
    UI.toast = $("#toast");
    UI.search = $("#q");
    UI.results = $("#results");
    UI.kTotal = $("#kTotal");

    UI.modal = $("#modal");
    UI.mName = $("#mName");
    UI.mMeta = $("#mMeta");
    UI.mBarcode = $("#mBarcode");
    UI.kLate = $("#kLate");
    UI.kAbsent = $("#kAbsent");
    UI.kBeh = $("#kBeh");
    UI.history = $("#history");

    UI.attDate = $("#attDate");
    UI.attNote = $("#attNote");
    UI.btnLate = $("#btnLate");
    UI.btnAbsent = $("#btnAbsent");

    UI.behDate = $("#behDate");
    UI.selInfraction = $("#selInfraction");
    UI.behNote = $("#behNote");
    UI.btnBehavior = $("#btnBehavior");

    UI.printDate = $("#printDate");
    UI.printGrade = $("#printGrade");
    UI.printSection = $("#printSection");
    UI.btnPrintLate = $("#btnPrintLate");
    UI.btnPrintAbsent = $("#btnPrintAbsent");
    UI.btnPrintCardLate = $("#btnPrintCardLate");
    UI.btnPrintCardAbsent = $("#btnPrintCardAbsent");
    UI.btnPrintCardBehavior = $("#btnPrintCardBehavior");

    UI.fileStudents = $("#fileStudents");
    UI.btnImportStudents = $("#btnImportStudents");
    UI.btnLoadSeed = $("#btnLoadSeed");
    UI.btnExport = $("#btnExport");
    UI.fileImportBackup = $("#fileImportBackup");
    UI.btnImportBackup = $("#btnImportBackup");
    UI.btnClearAll = $("#btnClearAll");

    UI.setSchoolHeader = $("#setSchoolHeader");
    UI.setSchoolShort = $("#setSchoolShort");
    UI.setTerm = $("#setTerm");
    UI.setHijri = $("#setHijri");
    UI.setProxyUrl = $("#setProxyUrl");
    UI.setProxyKey = $("#setProxyKey");
    UI.btnSaveSettings = $("#btnSaveSettings");

    UI.smsMsg = $("#smsMsg");
    UI.btnSendSMS = $("#btnSendSMS");

    UI.printArea = $("#printArea");

    // events
    UI.search.addEventListener("input", ()=>{ clearTimeout(UI._st); UI._st=setTimeout(doSearch, 120); });
    $("#btnClearSearch").onclick = ()=>{ UI.search.value=""; doSearch(); UI.search.focus(); };

    $("#modalClose").onclick = ()=>UI.modal.classList.remove("open");
    UI.modal.addEventListener("click", (e)=>{ if(e.target===UI.modal) UI.modal.classList.remove("open"); });

    UI.btnLate.onclick = ()=>addLate().catch(e=>toast(e.message||"خطأ"));
    UI.btnAbsent.onclick = ()=>addAbsent().catch(e=>toast(e.message||"خطأ"));
    UI.btnBehavior.onclick = ()=>addBehavior().catch(e=>toast(e.message||"خطأ"));

    UI.btnPrintLate.onclick = ()=>printSheet("LATE").catch(e=>toast(e.message||"خطأ"));
    UI.btnPrintAbsent.onclick = ()=>printSheet("ABSENT").catch(e=>toast(e.message||"خطأ"));

    UI.btnPrintCardLate.onclick = ()=>printCard("late").catch(e=>toast(e.message||"خطأ"));
    UI.btnPrintCardAbsent.onclick = ()=>printCard("absent").catch(e=>toast(e.message||"خطأ"));
    UI.btnPrintCardBehavior.onclick = ()=>printCard("behavior").catch(e=>toast(e.message||"خطأ"));

    UI.btnImportStudents.onclick = ()=> UI.fileStudents.click();
    UI.fileStudents.onchange = async ()=>{
      const f = UI.fileStudents.files?.[0];
      UI.fileStudents.value="";
      if(!f) return;
      try{
        await importStudentsFromFile(f);
      }catch(e){
        toast(e.message||"تعذر الاستيراد");
      }
    };

    UI.btnLoadSeed.onclick = async ()=>{
      if(!confirm("سيتم تحميل قاعدة الطلاب الجاهزة واستبدال القائمة الحالية إن كانت فارغة. المتابعة؟")) return;
      const res = await fetch("assets/students_seed.json", {cache:"no-store"});
      if(!res.ok) return toast("لم يتم العثور على ملف القاعدة الجاهزة.");
      const js = await res.json();
      const students = js.students || [];
      if(!students.length) return toast("الملف موجود لكن بدون بيانات.");
      await DB.seedStudents(students);
      toast(`تم تحميل ${students.length} طالب ✅`);
      await refreshStats();
    };

    UI.btnExport.onclick = ()=>exportBackup().catch(e=>toast(e.message||"خطأ"));
    UI.btnImportBackup.onclick = ()=> UI.fileImportBackup.click();
    UI.fileImportBackup.onchange = async ()=>{
      const f = UI.fileImportBackup.files?.[0];
      UI.fileImportBackup.value="";
      if(!f) return;
      try{ await importBackup(f); }catch(e){ toast("ملف غير صالح"); }
    };

    UI.btnClearAll.onclick = async ()=>{
      if(!confirm("سيتم مسح جميع البيانات من هذا الجهاز. هل أنت متأكد؟")) return;
      // easiest: delete database by name
      UI.btnClearAll.disabled=true;
      await new Promise((resolve)=>{
        const req = indexedDB.deleteDatabase("yaqubi_rsd");
        req.onsuccess=req.onerror=req.onblocked=()=>resolve(true);
      });
      location.reload();
    };

    UI.btnSaveSettings.onclick = ()=>saveSettings().catch(e=>toast(e.message||"خطأ"));

    UI.btnSendSMS.onclick = ()=>sendSmsToGuardian().catch(e=>toast(e.message||"خطأ"));

    // tabs
    $$(".tab").forEach(t=> t.onclick = ()=>showTab(t.dataset.tab));

    // init db
    await DB.init();
    await ensureSeed();
    await loadRules();
    await loadSettingsToUI();
    await refreshStats();

    // defaults
    UI.printDate.value = todayISO();
    showTab("students");
    doSearch();

    toast("تم التشغيل بنجاح ✅");
  }

  // PWA SW
  async function registerSW(){
    if(!("serviceWorker" in navigator)) return;
    try{
      await navigator.serviceWorker.register("./sw.js");
    }catch(e){ console.warn(e); }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    init().catch(e=>{
      console.error(e);
      const el=document.getElementById("fatal");
      if(el) el.textContent = "تعذر تشغيل التطبيق: " + (e.message||e);
    });
    registerSW();
  });
})();
