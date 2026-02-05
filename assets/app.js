
/* Yaqubi RSD Offline PWA - v1
   - Offline first with IndexedDB
   - Seed 600 students from assets/students_seed.json
   - Attendance + Behavior logs
   - Print rosters and cards (A4 + small cards)
   - SMS via Proxy (Cloudflare Worker) + WhatsApp deep link
*/
(function(){
  "use strict";

  const $ = (sel, root=document)=>root.querySelector(sel);
  const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));

  const UI = {
    tabs: {
      home: $("#tab-home"),
      search: $("#tab-search"),
      record: $("#tab-record"),
      print: $("#tab-print"),
      settings: $("#tab-settings"),
    },
    navBtns: $$(".nav button[data-tab]"),
    screens: $$(".screen[data-screen]"),
    toastWrap: $("#toast"),
    toastText: $("#toastText"),

    schoolTitle: $("#schoolTitle"),
    schoolSub: $("#schoolSub"),

    // Home
    homeStats: $("#homeStats"),
    recentList: $("#recentList"),
    quickSearch: $("#quickSearch"),
    quickResults: $("#quickResults"),

    // Search
    searchInput: $("#searchInput"),
    searchResults: $("#searchResults"),
    studentView: $("#studentView"),

    // Record
    recordSearch: $("#recordSearch"),
    recordResults: $("#recordResults"),
    recordHint: $("#recordHint"),

    // Print
    printGrade: $("#printGrade"),
    printSection: $("#printSection"),
    printTerm: $("#printTerm"),
    printHijri: $("#printHijri"),
    btnPrintLate: $("#btnPrintLate"),
    btnPrintAbsent: $("#btnPrintAbsent"),
    btnPrintLateCards: $("#btnPrintLateCards"),
    btnPrintBehaviorCards: $("#btnPrintBehaviorCards"),
    btnExportRosterCSV: $("#btnExportRosterCSV"),

    // Settings
    btnResetSeed: $("#btnResetSeed"),
    btnExport: $("#btnExport"),
    btnImport: $("#btnImport"),
    importFile: $("#importFile"),
    btnImportStudents: $("#btnImportStudents"),
    importStudentsFile: $("#importStudentsFile"),
    btnClearData: $("#btnClearData"),
    schoolName: $("#schoolName"),
    smsProxyUrl: $("#smsProxyUrl"),
    smsAppKey: $("#smsAppKey"),
    smsSender: $("#smsSender"),
    btnSaveSettings: $("#btnSaveSettings"),

    // Modal
    modalBack: $("#modalBack"),
    modalTitle: $("#modalTitle"),
    modalBody: $("#modalBody"),
    modalClose: $("#modalClose"),
  };

  function toast(msg){
    UI.toastText.textContent = msg;
    UI.toastWrap.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>UI.toastWrap.classList.add("hidden"), 2800);
  }

  function fmtDateISO(d=new Date()){
    const pad=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, s=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
  }

  // ---------- IndexedDB ----------
  const DB = (function(){
    const DB_NAME = "yaqubi_rsd_db";
    const DB_VER = 2;
    let db;

    function open(){
      return new Promise((resolve,reject)=>{
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (ev)=>{
          db = req.result;
          // students
          if(!db.objectStoreNames.contains("students")){
            const s = db.createObjectStore("students",{keyPath:"studentId"});
            s.createIndex("name","name",{unique:false});
            s.createIndex("idNumber","idNumber",{unique:false});
            s.createIndex("gradeCode","gradeCode",{unique:false});
            s.createIndex("section","section",{unique:false});
            s.createIndex("classKey","classKey",{unique:false});
          }
          // attendance
          if(!db.objectStoreNames.contains("attendance")){
            const a = db.createObjectStore("attendance",{keyPath:"id", autoIncrement:true});
            a.createIndex("studentId","studentId",{unique:false});
            a.createIndex("date","date",{unique:false});
            a.createIndex("type","type",{unique:false});
          }
          // behavior
          if(!db.objectStoreNames.contains("behavior")){
            const b = db.createObjectStore("behavior",{keyPath:"id", autoIncrement:true});
            b.createIndex("studentId","studentId",{unique:false});
            b.createIndex("date","date",{unique:false});
            b.createIndex("code","code",{unique:false});
          }
          // logs
          if(!db.objectStoreNames.contains("logs")){
            const l = db.createObjectStore("logs",{keyPath:"id", autoIncrement:true});
            l.createIndex("ts","ts",{unique:false});
          }
          // settings
          if(!db.objectStoreNames.contains("settings")){
            db.createObjectStore("settings",{keyPath:"key"});
          }
          // rules
          if(!db.objectStoreNames.contains("rules")){
            db.createObjectStore("rules",{keyPath:"key"});
          }
        };
        req.onsuccess = ()=>{
          db = req.result;
          resolve(db);
        };
        req.onerror = ()=>reject(req.error);
      });
    }

    function tx(store, mode="readonly"){
      const t = db.transaction(store, mode);
      return t.objectStore(store);
    }

    async function getSetting(key, fallback=null){
      return new Promise((resolve,reject)=>{
        const req = tx("settings").get(key);
        req.onsuccess=()=> resolve(req.result ? req.result.value : fallback);
        req.onerror=()=>reject(req.error);
      });
    }
    async function setSetting(key, value){
      return new Promise((resolve,reject)=>{
        const req = tx("settings","readwrite").put({key, value});
        req.onsuccess=()=>resolve(true);
        req.onerror=()=>reject(req.error);
      });
    }

    async function countStudents(){
      return new Promise((resolve,reject)=>{
        const req = tx("students").count();
        req.onsuccess=()=>resolve(req.result||0);
        req.onerror=()=>reject(req.error);
      });
    }

    async function clearStore(name){
      return new Promise((resolve,reject)=>{
        const req = tx(name,"readwrite").clear();
        req.onsuccess=()=>resolve(true);
        req.onerror=()=>reject(req.error);
      });
    }

    async function bulkPut(storeName, rows, onProgress){
      return new Promise((resolve,reject)=>{
        const store = tx(storeName,"readwrite");
        let i=0;
        function step(){
          if(i>=rows.length){ resolve(true); return; }
          const r = store.put(rows[i]);
          r.onsuccess = ()=>{
            i++;
            if(onProgress && (i%50===0 || i===rows.length)) onProgress(i, rows.length);
            step();
          };
          r.onerror = ()=>reject(r.error);
        }
        step();
      });
    }

    async function getStudent(studentId){
      return new Promise((resolve,reject)=>{
        const req = tx("students").get(studentId);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
    }

    async function searchStudents(q, limit=30){
      q = (q||"").trim();
      if(!q) return [];
      const isDigits = /^[0-9]+$/.test(q);
      const out = [];
      const store = tx("students");
      // naive scan (fast enough for 600)
      return new Promise((resolve,reject)=>{
        const req = store.openCursor();
        req.onsuccess = ()=>{
          const cur = req.result;
          if(!cur){ resolve(out.slice(0,limit)); return; }
          const s = cur.value;
          const hay = (s.name || "").replace(/\s+/g," ").toLowerCase();
          if(isDigits){
            if((s.idNumber||"").includes(q)) out.push(s);
          }else{
            const qq = q.toLowerCase();
            if(hay.includes(qq)) out.push(s);
          }
          if(out.length>=limit){ resolve(out); return; }
          cur.continue();
        };
        req.onerror = ()=>reject(req.error);
      });
    }

    async function listClasses(){
      // returns {gradeCode, section, classKey, count}
      const map = new Map();
      return new Promise((resolve,reject)=>{
        const req = tx("students").openCursor();
        req.onsuccess=()=>{
          const cur=req.result;
          if(!cur){
            const arr = Array.from(map.values()).sort((a,b)=> (a.gradeCode+a.section).localeCompare(b.gradeCode+b.section));
            resolve(arr);
            return;
          }
          const s=cur.value;
          const key = s.classKey || (s.gradeCode+"-"+s.section);
          if(!map.has(key)){
            map.set(key,{gradeCode:s.gradeCode, section:s.section, classKey:key, count:1});
          }else{
            map.get(key).count++;
          }
          cur.continue();
        };
        req.onerror=()=>reject(req.error);
      });
    }

    async function listStudentsInClass(gradeCode, section){
      const out=[];
      return new Promise((resolve,reject)=>{
        const req = tx("students").openCursor();
        req.onsuccess=()=>{
          const cur=req.result;
          if(!cur){
            out.sort((a,b)=> (a.name||"").localeCompare(b.name||"","ar"));
            resolve(out);
            return;
          }
          const s=cur.value;
          if(String(s.gradeCode)===String(gradeCode) && String(s.section)===String(section)){
            out.push(s);
          }
          cur.continue();
        };
        req.onerror=()=>reject(req.error);
      });
    }

    async function addAttendance(studentId, type, dateISO, note=""){
      const rec = {studentId, type, date: dateISO, note, ts: Date.now()};
      return new Promise((resolve,reject)=>{
        const req = tx("attendance","readwrite").add(rec);
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
    }

    async function addBehavior(studentId, code, label, dateISO, note=""){
      const rec = {studentId, code, label, date: dateISO, note, ts: Date.now()};
      return new Promise((resolve,reject)=>{
        const req = tx("behavior","readwrite").add(rec);
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
    }

    async function getStats(studentId){
      const [late, absent, beh] = await Promise.all([
        countBy("attendance", "studentId", studentId, (r)=>r.type==="LATE"),
        countBy("attendance", "studentId", studentId, (r)=>r.type==="ABSENT"),
        countBy("behavior", "studentId", studentId, ()=>true)
      ]);
      return {late, absent, behavior: beh};
    }

    function countBy(storeName, indexName, key, predicate){
      return new Promise((resolve,reject)=>{
        let count=0;
        const store = tx(storeName);
        const idx = store.index(indexName);
        const range = IDBKeyRange.only(key);
        const req = idx.openCursor(range);
        req.onsuccess=()=>{
          const cur=req.result;
          if(!cur){ resolve(count); return; }
          const v=cur.value;
          if(predicate(v)) count++;
          cur.continue();
        };
        req.onerror=()=>reject(req.error);
      });
    }

    async function recentLogs(limit=12){
      // combine attendance + behavior by timestamp
      const out = [];
      const grab = (storeName, kind)=>{
        return new Promise((resolve,reject)=>{
          const store = tx(storeName);
          const req = store.openCursor(null, "prev");
          const arr=[];
          req.onsuccess=()=>{
            const cur=req.result;
            if(!cur){ resolve(arr); return; }
            const v=cur.value;
            arr.push({kind, ...v});
            if(arr.length>=limit){ resolve(arr); return; }
            cur.continue();
          };
          req.onerror=()=>reject(req.error);
        });
      };
      const [a,b] = await Promise.all([grab("attendance","att"), grab("behavior","beh")]);
      out.push(...a,...b);
      out.sort((x,y)=> (y.ts||0)-(x.ts||0));
      return out.slice(0,limit);
    }

    async function exportAll(){
      const dump = {};
      for(const storeName of ["students","attendance","behavior","settings","rules"]){
        dump[storeName] = await new Promise((resolve,reject)=>{
          const arr=[];
          const req = tx(storeName).openCursor();
          req.onsuccess=()=>{
            const cur=req.result;
            if(!cur){ resolve(arr); return; }
            arr.push(cur.value);
            cur.continue();
          };
          req.onerror=()=>reject(req.error);
        });
      }
      dump._meta = {exportedAt: new Date().toISOString(), app:"yaqubi_rsd"};
      return dump;
    }

    async function importAll(dump){
      if(!dump || typeof dump!=="object") throw new Error("ملف غير صالح");
      for(const storeName of ["students","attendance","behavior","settings","rules"]){
        await clearStore(storeName);
        if(Array.isArray(dump[storeName]) && dump[storeName].length){
          await bulkPut(storeName, dump[storeName]);
        }
      }
      return true;
    }

    return {
      open, getSetting, setSetting, countStudents, clearStore, bulkPut,
      getStudent, searchStudents, listClasses, listStudentsInClass,
      addAttendance, addBehavior, getStats, recentLogs, exportAll, importAll
    };
  })();

  // ---------- Rules ----------
  async function ensureRules(){
    const current = await DB.getSetting("rulesVersion", 0);
    if(current >= 1) return;

    const res = await fetch("assets/rules_seed.json", {cache:"no-store"});
    const rules = await res.json();
    await DB.setSetting("rulesVersion", rules.version || 1);
    await DB.setSetting("rulesData", rules);
  }

  async function getRules(){
    return await DB.getSetting("rulesData", null);
  }

  // ---------- Seed Students ----------
  async function ensureSeed(){
    const n = await DB.countStudents();
    if(n>0) return {seeded:false, count:n};

    toast("جاري تجهيز بيانات الطلاب لأول مرة…");
    const res = await fetch("assets/students_seed.json", {cache:"no-store"});
    const seed = await res.json();

    // store default grade labels
    await DB.setSetting("gradeLabels", seed.gradeLabels || {});
    await DB.setSetting("schoolName", seed.school?.name || "ثانوية اليعقوبي الثانوية");

    const rows = (seed.students||[]).map(s=>{
      const gradeCode = String(s.gradeCode||"");
      const section = String(s.section||"");
      const classKey = gradeCode + "-" + section;
      return {
        studentId: String(s.studentId||s.idNumber||"").trim(),
        name: String(s.name||"").trim(),
        idNumber: String(s.idNumber||"").trim(),
        phone: String(s.phone||"").trim(),
        gradeCode,
        section,
        classKey,
        barcodeSvg: String(s.barcodeSvg||"").trim(),
        isActive: true,
        createdAt: Date.now()
      };
    });

    await DB.bulkPut("students", rows, (i,total)=> toast(`استيراد الطلاب: ${i}/${total}`));
    toast(`تم تجهيز بيانات الطلاب (${rows.length})`);
    return {seeded:true, count: rows.length};
  }

  // ---------- UI Rendering ----------
  function setActiveTab(tabName){
    for(const btn of UI.navBtns){
      btn.classList.toggle("active", btn.dataset.tab===tabName);
    }
    for(const sc of UI.screens){
      sc.classList.toggle("hidden", sc.dataset.screen!==tabName);
    }
  }

  async function loadHeader(){
    const schoolName = await DB.getSetting("schoolName","ثانوية اليعقوبي الثانوية");
    UI.schoolTitle.textContent = schoolName;
    UI.schoolSub.textContent = "رصد | مواظبة وسلوك (بدون إنترنت)";
    UI.schoolName.value = schoolName;

    UI.smsProxyUrl.value = await DB.getSetting("smsProxyUrl","");
    UI.smsAppKey.value = await DB.getSetting("smsAppKey","");
    UI.smsSender.value = await DB.getSetting("smsSender","");
  }

  function renderStudentLine(s){
    const grade = State.gradeLabel(s.gradeCode);
    const sec = `شعبة ${escapeHtml(s.section)}`;
    const phone = s.phone ? `جوال ولي الأمر: ${escapeHtml(s.phone)}` : "لا يوجد جوال";
    return `
      <div class="item" data-open-student="${escapeHtml(s.studentId)}">
        <div class="main">
          <b>${escapeHtml(s.name)}</b>
          <small>${escapeHtml(grade)} • ${sec} • ${escapeHtml(s.idNumber)}</small>
          <small>${phone}</small>
        </div>
        <div class="right">
          <span class="kbd">فتح</span>
        </div>
      </div>
    `;
  }

  const State = {
    gradeLabels: {},
    async refreshGradeLabels(){
      this.gradeLabels = await DB.getSetting("gradeLabels", {});
    },
    gradeLabel(code){
      return this.gradeLabels[String(code)] || `الصف (${code})`;
    }
  };

  async function renderHome(){
    const count = await DB.countStudents();
    const recents = await DB.recentLogs(10);

    UI.homeStats.innerHTML = `
      <div class="row">
        <span class="badge ok"><strong>${count}</strong> طالب</span>
        <span class="badge"><strong>${fmtDateISO()}</strong> اليوم</span>
        <span class="badge"><strong>بحث</strong> بالاسم أو رقم الهوية</span>
      </div>
      <div class="print-note">لن تظهر أي أسماء إلا بعد البحث (حماية للخصوصية).</div>
    `;

    if(!recents.length){
      UI.recentList.innerHTML = `<div class="print-note">لا توجد عمليات مسجلة بعد.</div>`;
      return;
    }
    const items = await Promise.all(recents.map(async r=>{
      const s = await DB.getStudent(r.studentId);
      const who = s ? s.name : r.studentId;
      const date = r.date || "";
      if(r.kind==="att"){
        const label = r.type==="LATE" ? "تأخر" : "غياب";
        return `<div class="item">
          <div class="main"><b>${escapeHtml(label)} — ${escapeHtml(who)}</b><small>${escapeHtml(date)}${r.note?` • ${escapeHtml(r.note)}`:""}</small></div>
          <div class="right"><span class="badge">${label==="غياب"?"ABSENT":"LATE"}</span></div>
        </div>`;
      }else{
        return `<div class="item">
          <div class="main"><b>سلوك — ${escapeHtml(who)}</b><small>${escapeHtml(r.code||"")} • ${escapeHtml(r.label||"")} • ${escapeHtml(date)}</small></div>
          <div class="right"><span class="badge warn">سلوك</span></div>
        </div>`;
      }
    }));
    UI.recentList.innerHTML = items.join("");
  }

  async function renderSearchResults(where, results){
    where.innerHTML = results.length ? results.map(renderStudentLine).join("") : `<div class="print-note">لا توجد نتائج.</div>`;
  }

  async function openStudent(studentId){
    const s = await DB.getStudent(studentId);
    if(!s){ toast("تعذر فتح الطالب"); return; }
    const stats = await DB.getStats(studentId);
    const grade = State.gradeLabel(s.gradeCode);
    const sec = `شعبة ${s.section}`;
    const barcode = s.barcodeSvg ? `<div class="card" style="border-radius:14px;box-shadow:none">
      <div class="bd" style="padding:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="min-width:180px">
            <div style="font-weight:800">${escapeHtml(s.idNumber)}</div>
            <div class="print-note" style="margin:2px 0 0">باركود الهوية (للمسح)</div>
          </div>
          <div style="max-width:320px">${s.barcodeSvg}</div>
        </div>
      </div>
    </div>` : "";

    UI.studentView.innerHTML = `
      <div class="card">
        <div class="hd">
          <div>
            <h2>${escapeHtml(s.name)}</h2>
            <div class="sub">${escapeHtml(grade)} • شعبة ${escapeHtml(s.section)} • ${escapeHtml(s.idNumber)}</div>
          </div>
          <div class="btns">
            <button class="btn small" id="btnCard">طباعة كرت</button>
            <button class="btn danger small" id="btnDelete">حذف/نقل</button>
          </div>
        </div>
        <div class="bd">
          <div class="row">
            <span class="badge"><strong>تأخر:</strong> ${stats.late}</span>
            <span class="badge"><strong>غياب:</strong> ${stats.absent}</span>
            <span class="badge warn"><strong>سلوك:</strong> ${stats.behavior}</span>
          </div>
          <div class="hr"></div>
          <div class="row">
            <div class="field" style="flex:1 1 220px">
              <label>جوال ولي الأمر</label>
              <input id="stPhone" value="${escapeHtml(s.phone||"")}" placeholder="مثال: 9665xxxxxxxx"/>
            </div>
            <div class="field" style="flex:1 1 220px">
              <label>ملاحظة سريعة</label>
              <input id="stNote" placeholder="اختياري"/>
            </div>
          </div>
          <div class="btns" style="margin-top:10px">
            <button class="btn primary" id="btnLate">تسجيل تأخر (اليوم)</button>
            <button class="btn primary" id="btnAbsent">تسجيل غياب (اليوم)</button>
            <button class="btn" id="btnBehavior">تسجيل مخالفة سلوكية</button>
            <button class="btn" id="btnSms">إرسال SMS</button>
            <button class="btn" id="btnWa">واتساب</button>
          </div>
          <div class="print-note">تسجل العمليات محليًا على جهازك. لإرسال SMS تحتاج Proxy وسيط (Cloudflare Worker) لحماية التوكن.</div>
          <div class="hr"></div>
          ${barcode}
        </div>
      </div>
    `;

    // wire buttons
    $("#btnLate").onclick = async ()=>{
      const note = $("#stNote").value.trim();
      await DB.addAttendance(s.studentId, "LATE", fmtDateISO(), note);
      toast("تم تسجيل التأخر");
      renderHome();
    };
    $("#btnAbsent").onclick = async ()=>{
      const note = $("#stNote").value.trim();
      await DB.addAttendance(s.studentId, "ABSENT", fmtDateISO(), note);
      toast("تم تسجيل الغياب");
      renderHome();
    };
    $("#btnBehavior").onclick = ()=> openBehaviorModal(s.studentId);
    $("#btnSms").onclick = ()=> openSmsModal(s.studentId);
    $("#btnWa").onclick = ()=> openWhatsApp(s.studentId);
    $("#btnCard").onclick = ()=> Print.printStudentCard(s.studentId);
    $("#btnDelete").onclick = ()=> openDeleteModal(s.studentId);
  }

  // ---------- Modals ----------
  function openModal(title, html){
    UI.modalTitle.textContent = title;
    UI.modalBody.innerHTML = html;
    UI.modalBack.classList.add("on");
  }
  function closeModal(){
    UI.modalBack.classList.remove("on");
    UI.modalTitle.textContent="";
    UI.modalBody.innerHTML="";
  }
  UI.modalClose.onclick = closeModal;
  UI.modalBack.addEventListener("click", (e)=>{
    if(e.target === UI.modalBack) closeModal();
  });

  async function openBehaviorModal(studentId){
    const rules = await getRules();
    const cats = rules?.behavior?.categories || [];
    const options = cats.flatMap(c => c.items.map(it => ({
      code: it.code, label: it.label, group: c.name
    })));
    const optHtml = options.map(o=>`<option value="${escapeHtml(o.code)}">${escapeHtml(o.code)} — ${escapeHtml(o.label)} (${escapeHtml(o.group)})</option>`).join("");
    openModal("تسجيل مخالفة سلوكية", `
      <div class="field">
        <label>المخالفة</label>
        <select id="behCode">${optHtml}</select>
      </div>
      <div class="field">
        <label>التاريخ</label>
        <input id="behDate" type="date" value="${fmtDateISO()}"/>
      </div>
      <div class="field">
        <label>ملاحظة</label>
        <textarea id="behNote" rows="3" placeholder="اختياري"></textarea>
      </div>
      <div class="btns" style="margin-top:10px">
        <button class="btn primary" id="behSave">حفظ</button>
        <button class="btn" id="behCancel">إلغاء</button>
      </div>
      <div class="print-note">يمكن تعديل قائمة المخالفات من الإعدادات لتطابق الدليل المعتمد بالكامل.</div>
    `);
    $("#behCancel").onclick = closeModal;
    $("#behSave").onclick = async ()=>{
      const code = $("#behCode").value;
      const label = options.find(x=>x.code===code)?.label || "";
      const date = $("#behDate").value || fmtDateISO();
      const note = $("#behNote").value.trim();
      await DB.addBehavior(studentId, code, label, date, note);
      toast("تم تسجيل المخالفة");
      closeModal();
      renderHome();
    };
  }

  async function openSmsModal(studentId){
    const s = await DB.getStudent(studentId);
    const proxyUrl = await DB.getSetting("smsProxyUrl","");
    const appKey = await DB.getSetting("smsAppKey","");
    const sender = await DB.getSetting("smsSender","");
    openModal("إرسال رسالة SMS", `
      <div class="field">
        <label>رقم الجوال (ولي الأمر)</label>
        <input id="smsTo" value="${escapeHtml(s.phone||"")}" placeholder="9665xxxxxxxx"/>
      </div>
      <div class="field">
        <label>نص الرسالة</label>
        <textarea id="smsMsg" rows="4" placeholder="اكتب الرسالة بشكل تربوي مختصر">${escapeHtml(`نحيطكم علمًا بأن الطالب (${s.name}) لديه ملاحظة (مواظبة/سلوك). نأمل المتابعة. شاكرين تعاونكم.`)}</textarea>
      </div>
      <div class="row">
        <div class="field">
          <label>Proxy URL</label>
          <input id="smsProxy" value="${escapeHtml(proxyUrl)}" placeholder="https://xxxx.workers.dev"/>
        </div>
        <div class="field">
          <label>App Key (حماية)</label>
          <input id="smsKey" value="${escapeHtml(appKey)}" placeholder="مفتاح داخلي للتطبيق"/>
        </div>
        <div class="field">
          <label>Sender (اختياري)</label>
          <input id="smsSenderIn" value="${escapeHtml(sender)}" placeholder="مثل: YAQUBI"/>
        </div>
      </div>
      <div class="btns" style="margin-top:10px">
        <button class="btn primary" id="smsSend">إرسال</button>
        <button class="btn" id="smsSaveOnly">حفظ الإعدادات فقط</button>
        <button class="btn" id="smsCancel">إلغاء</button>
      </div>
      <div class="print-note">مهم: لا ترسل التوكن مباشرة من داخل التطبيق. استخدم Proxy وسيط لحماية بيانات مزود الرسائل.</div>
    `);

    $("#smsCancel").onclick = closeModal;
    $("#smsSaveOnly").onclick = async ()=>{
      await saveSmsSettingsFromModal();
      toast("تم حفظ إعدادات الرسائل");
      closeModal();
    };
    $("#smsSend").onclick = async ()=>{
      const to = ($("#smsTo").value||"").trim();
      const msg = ($("#smsMsg").value||"").trim();
      if(!to || to.length < 10){ toast("رقم الجوال غير صحيح"); return; }
      await saveSmsSettingsFromModal();
      const proxy = await DB.getSetting("smsProxyUrl","");
      const key = await DB.getSetting("smsAppKey","");
      const snd = await DB.getSetting("smsSender","");
      if(!proxy){ toast("أدخل Proxy URL أولاً"); return; }
      try{
        toast("جاري الإرسال…");
        const r = await fetch(proxy.replace(/\/+$/,"") + "/send", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ to, message: msg, sender: snd || undefined, appKey: key || undefined })
        });
        const data = await r.json().catch(()=>({}));
        if(!r.ok){
          throw new Error(data?.error || "فشل الإرسال");
        }
        toast("تم الإرسال بنجاح");
        closeModal();
      }catch(err){
        toast("تعذر الإرسال: " + err.message);
      }
    };

    async function saveSmsSettingsFromModal(){
      await DB.setSetting("smsProxyUrl", ($("#smsProxy").value||"").trim());
      await DB.setSetting("smsAppKey", ($("#smsKey").value||"").trim());
      await DB.setSetting("smsSender", ($("#smsSenderIn").value||"").trim());
      await loadHeader();
    }
  }

  async function openWhatsApp(studentId){
    const s = await DB.getStudent(studentId);
    if(!s.phone){ toast("لا يوجد رقم جوال"); return; }
    const msg = `السلام عليكم ورحمة الله وبركاته، نحيطكم علمًا بأن الطالب (${s.name}) لديه ملاحظة (مواظبة/سلوك). شاكرين تعاونكم.`;
    const phone = s.phone.replace(/\D/g,"");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function openDeleteModal(studentId){
    const s = await DB.getStudent(studentId);
    openModal("حذف/نقل طالب", `
      <div class="print-note">للسلامة: سيتم إيقاف الطالب (نقل) بدل الحذف النهائي. ويمكن لاحقًا تصدير نسخة احتياطية كاملة.</div>
      <div class="hr"></div>
      <div><b>${escapeHtml(s.name)}</b><div class="print-note">${escapeHtml(s.idNumber)} • ${escapeHtml(State.gradeLabel(s.gradeCode))} • شعبة ${escapeHtml(s.section)}</div></div>
      <div class="btns" style="margin-top:12px">
        <button class="btn danger" id="delDisable">تأكيد: نقل/إيقاف الطالب</button>
        <button class="btn" id="delCancel">إلغاء</button>
      </div>
    `);
    $("#delCancel").onclick = closeModal;
    $("#delDisable").onclick = async ()=>{
      // mark as inactive
      const updated = {...s, isActive:false, disabledAt:Date.now()};
      await DB.bulkPut("students",[updated]);
      toast("تم إيقاف الطالب (نقل)");
      closeModal();
      UI.studentView.innerHTML = `<div class="print-note">تم إيقاف هذا الطالب.</div>`;
      renderHome();
    };
  }

  // ---------- Printing ----------
  const Print = (function(){
    function openPrintWindow(html, title="طباعة"){
      const w = window.open("", "_blank", "noopener,noreferrer");
      if(!w){ toast("المتصفح منع نافذة الطباعة"); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.document.title = title;
      w.focus();
      // delay to allow svg render
      setTimeout(()=>w.print(), 350);
    }

    function printCss(){
      return `
        <style>
          body{font-family: ui-sans-serif, system-ui, Tahoma, Arial; direction:rtl; margin:0; color:#0f172a}
          .page{padding:14mm}
          .hdr{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10mm}
          .hdr .r b{display:block;font-size:14px}
          .hdr .r small{display:block;font-size:12px;color:#475569;margin-top:2px}
          h1{font-size:16px;margin:0 0 10px}
          table{width:100%;border-collapse:collapse;font-size:12px}
          th,td{border:1px solid #cbd5e1;padding:6px 6px;vertical-align:middle}
          th{background:#f1f5f9}
          .barcode svg{height:20mm; width:55mm}
          .muted{color:#475569;font-size:12px}
          @page{size:A4; margin:10mm}
          .cards{display:grid;grid-template-columns:repeat(2, 1fr);gap:6mm}
          .card{border:1px solid #cbd5e1;border-radius:4mm;padding:4mm}
          .card h2{margin:0 0 3mm;font-size:13px}
          .card .line{display:flex;justify-content:space-between;gap:10px;font-size:12px}
          .card .barcode svg{height:14mm;width:60mm}
          .small-note{margin-top:2mm;font-size:11px;color:#475569}
        </style>
      `;
    }

    async function printRoster(type){
      const gradeCode = UI.printGrade.value;
      const section = UI.printSection.value;
      const term = UI.printTerm.value;
      const hijri = UI.printHijri.value;
      if(!gradeCode || !section){ toast("اختر الصف والشعبة"); return; }

      const students = await DB.listStudentsInClass(gradeCode, section);
      const schoolName = await DB.getSetting("schoolName","ثانوية اليعقوبي الثانوية");
      const gradeLabel = State.gradeLabel(gradeCode);

      const title = (type==="LATE") ? "كشف التأخر" : "كشف الغياب";
      const days = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس"];

      const rows = students.map((s, idx)=>{
        return `<tr>
          <td style="width:10mm;text-align:center">${idx+1}</td>
          <td>${escapeHtml(s.name)}</td>
          <td style="width:32mm;text-align:center">${escapeHtml(s.idNumber)}</td>
          ${days.map(()=>`<td style="width:18mm;height:9mm"></td>`).join("")}
          <td class="barcode" style="width:60mm">${s.barcodeSvg||""}</td>
        </tr>`;
      }).join("");

      const html = `
        <!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
        ${printCss()}
        </head><body>
          <div class="page">
            <div class="hdr">
              <div class="r">
                <b>${escapeHtml(schoolName)}</b>
                <small>${escapeHtml(gradeLabel)} • شعبة ${escapeHtml(section)} • الفصل ${escapeHtml(term)} • ${escapeHtml(hijri)}</small>
              </div>
              <div class="muted">التاريخ: ____ / ____ / ${escapeHtml(hijri.replace(/\D/g,"")||"")} هـ</div>
            </div>
            <h1 style="text-align:center">${escapeHtml(title)}</h1>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم الطالب</th>
                  <th>رقم الهوية</th>
                  ${days.map(d=>`<th>${d}</th>`).join("")}
                  <th>باركود الهوية</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="muted" style="margin-top:8mm">ملاحظة: خانة اليوم تُستخدم للتوثيق اليدوي (✓/✗) وفق سجلات المدرسة.</div>
          </div>
        </body></html>
      `;
      openPrintWindow(html, title);
    }

    async function printStudentCard(studentId){
      const s = await DB.getStudent(studentId);
      const stats = await DB.getStats(studentId);
      const schoolName = await DB.getSetting("schoolName","ثانوية اليعقوبي الثانوية");
      const gradeLabel = State.gradeLabel(s.gradeCode);
      const html = `
        <!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width,initial-scale=1"/>
          <style>
            body{font-family: ui-sans-serif, system-ui, Tahoma, Arial; direction:rtl; margin:0;color:#0f172a}
            @page{size: 90mm 55mm; margin:3mm}
            .card{border:1px solid #cbd5e1;border-radius:4mm;padding:3mm}
            h1{font-size:12px;margin:0 0 2mm}
            h2{font-size:12px;margin:0 0 1.5mm}
            .muted{color:#475569;font-size:10px}
            .row{display:flex;justify-content:space-between;gap:4mm;align-items:center}
            .barcode svg{height:14mm;width:62mm}
            .badges{display:flex;gap:3mm;flex-wrap:wrap;margin-top:1mm}
            .b{border:1px solid #cbd5e1;border-radius:999px;padding:1mm 2mm;font-size:10px}
          </style>
        </head><body>
          <div class="card">
            <h1>${escapeHtml(schoolName)}</h1>
            <h2>${escapeHtml(s.name)}</h2>
            <div class="muted">${escapeHtml(gradeLabel)} • شعبة ${escapeHtml(s.section)} • ${escapeHtml(s.idNumber)}</div>
            <div class="badges">
              <div class="b">تأخر: ${stats.late}</div>
              <div class="b">غياب: ${stats.absent}</div>
              <div class="b">سلوك: ${stats.behavior}</div>
            </div>
            <div class="row" style="margin-top:2mm">
              <div class="barcode">${s.barcodeSvg||""}</div>
            </div>
            <div class="muted" style="margin-top:1mm">هذا الكرت للمسح السريع في السجلات الورقية.</div>
          </div>
        </body></html>
      `;
      openPrintWindow(html, "كرت الطالب");
    }

    async function printCardsByClass(kind){
      const gradeCode = UI.printGrade.value;
      const section = UI.printSection.value;
      if(!gradeCode || !section){ toast("اختر الصف والشعبة"); return; }
      const students = await DB.listStudentsInClass(gradeCode, section);
      const schoolName = await DB.getSetting("schoolName","ثانوية اليعقوبي الثانوية");
      const gradeLabel = State.gradeLabel(gradeCode);

      const cards = await Promise.all(students.map(async s=>{
        const stats = await DB.getStats(s.studentId);
        const title = (kind==="LATE") ? "كرت تأخر/مواظبة" : "كرت سلوك";
        return `<div class="card">
          <h2>${escapeHtml(title)}</h2>
          <div class="line"><b>${escapeHtml(s.name)}</b><span>${escapeHtml(s.idNumber)}</span></div>
          <div class="small-note">${escapeHtml(schoolName)} • ${escapeHtml(gradeLabel)} • شعبة ${escapeHtml(section)}</div>
          <div class="small-note">تأخر: ${stats.late} | غياب: ${stats.absent} | سلوك: ${stats.behavior}</div>
          <div class="barcode" style="margin-top:3mm">${s.barcodeSvg||""}</div>
          <div class="small-note">تاريخ الإجراء: ____ / ____ / ____ هـ</div>
        </div>`;
      }));

      const html = `
        <!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        ${printCss()}
        <style>@page{size:A4;margin:10mm}</style>
        </head><body>
          <div class="page">
            <div class="hdr">
              <div class="r">
                <b>${escapeHtml(schoolName)}</b>
                <small>${escapeHtml(gradeLabel)} • شعبة ${escapeHtml(section)}</small>
              </div>
              <div class="muted">عدد البطاقات: ${cards.length}</div>
            </div>
            <h1 style="text-align:center">${escapeHtml(kind==="LATE"?"بطاقات المواظبة":"بطاقات السلوك")}</h1>
            <div class="cards">${cards.join("")}</div>
          </div>
        </body></html>
      `;
      openPrintWindow(html, "بطاقات");
    }

    // CSV roster export
    async function exportRosterCSV(type){
      const gradeCode = UI.printGrade.value;
      const section = UI.printSection.value;
      const term = UI.printTerm.value;
      const hijri = UI.printHijri.value;
      if(!gradeCode || !section){ toast("اختر الصف والشعبة"); return; }
      const students = await DB.listStudentsInClass(gradeCode, section);
      const gradeLabel = State.gradeLabel(gradeCode);
      const header = ["اسم الطالب","رقم الهوية","الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","باركود(موجود في الطباعة)"].join(",");
      const rows = students.map(s=>{
        return [s.name,s.idNumber,"","","","","",""].map(x=> `"${String(x||"").replace(/"/g,'""')}"`).join(",");
      });
      const csv = "\uFEFF" + `# ${type==="LATE"?"كشف التأخر":"كشف الغياب"} - ${gradeLabel} - شعبة ${section} - الفصل ${term} - ${hijri}\n` + header + "\n" + rows.join("\n");
      const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${type==="LATE"?"كشف-تاخر":"كشف-غياب"}-${gradeCode}-شعبة-${section}.csv`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
    }

    return { printRoster, printStudentCard, printCardsByClass, exportRosterCSV };
  })();

  window.Print = Print; // allow openStudent to call

  // ---------- Import Students (CSV only) ----------
  async function importStudentsFromFile(file){
    const text = await file.text();
    // very simple CSV parser (supports commas, quotes)
    function parseCSV(str){
      const rows=[];
      let row=[], cur="", inQ=false;
      for(let i=0;i<str.length;i++){
        const c=str[i];
        if(inQ){
          if(c==='"' && str[i+1]==='"'){ cur+='"'; i++; }
          else if(c==='"'){ inQ=false; }
          else cur+=c;
        }else{
          if(c==='"'){ inQ=true; }
          else if(c===','){ row.push(cur); cur=""; }
          else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
          else if(c==='\r'){ /*skip*/ }
          else cur+=c;
        }
      }
      if(cur.length || row.length){ row.push(cur); rows.push(row); }
      return rows;
    }
    const rows = parseCSV(text);
    if(rows.length < 2) throw new Error("ملف CSV فارغ");
    const header = rows[0].map(h=>h.trim());
    const get = (obj, keys)=>{
      for(const k of keys){
        const idx = header.indexOf(k);
        if(idx>=0) return obj[idx];
      }
      return "";
    };
    const mapped = rows.slice(1).filter(r=>r.some(x=>String(x).trim()!=="")).map(r=>{
      const name = (get(r, ["اسم الطالب","name","Name"])||"").trim();
      const idNumber = (get(r, ["رقم الهوية","رقم الطالب","idNumber","ID"])||"").replace(/\D/g,"").trim();
      const phone = (get(r, ["الجوال","جوال","phone","Mobile"])||"").replace(/\D/g,"").trim();
      const gradeCode = (get(r, ["رقم الصف","الصف","gradeCode"])||"").trim();
      const section = (get(r, ["الفصل","الشعبة","section"])||"").trim();
      const classKey = gradeCode + "-" + section;
      if(!name || !idNumber) return null;
      return {studentId:idNumber, name, idNumber, phone, gradeCode, section, classKey, isActive:true, createdAt:Date.now(), barcodeSvg:""};
    }).filter(Boolean);
    if(!mapped.length) throw new Error("لم يتم العثور على طلاب في الملف");
    // Note: barcode for imported students is empty (can be generated by re-importing seed / or keep)
    await DB.bulkPut("students", mapped, (i,t)=>toast(`استيراد CSV: ${i}/${t}`));
    toast("تم استيراد الطلاب من CSV");
  }

  // ---------- Events ----------
  document.addEventListener("click", async (e)=>{
    const openId = e.target.closest("[data-open-student]")?.dataset?.openStudent;
    if(openId){
      setActiveTab("search");
      await openStudent(openId);
    }
  });

    // tab navigation (any element with data-tab)
  document.addEventListener("click", (e)=>{
    const t = e.target.closest("[data-tab]");
    if(!t) return;
    const tab = t.dataset.tab;
    if(!tab) return;
    setActiveTab(tab);
    if(tab==="home") renderHome();
    if(tab==="print") renderPrint();
  });


  // quick search (home)
  UI.quickSearch.addEventListener("input", async ()=>{
    const q = UI.quickSearch.value.trim();
    if(q.length < 2 && !/^\d{3,}$/.test(q)){ UI.quickResults.innerHTML = ""; return; }
    const results = await DB.searchStudents(q, 10);
    UI.quickResults.innerHTML = results.map(renderStudentLine).join("");
  });

  // search tab
  UI.searchInput.addEventListener("input", async ()=>{
    const q = UI.searchInput.value.trim();
    if(q.length < 2 && !/^\d{3,}$/.test(q)){ UI.searchResults.innerHTML = `<div class="print-note">اكتب حرفين على الأقل أو 3 أرقام للبحث.</div>`; return; }
    const results = await DB.searchStudents(q, 30);
    await renderSearchResults(UI.searchResults, results);
  });

  // record tab: search and show small actions
  UI.recordSearch.addEventListener("input", async ()=>{
    const q = UI.recordSearch.value.trim();
    if(q.length < 2 && !/^\d{3,}$/.test(q)){ UI.recordResults.innerHTML = ""; UI.recordHint.classList.remove("hidden"); return; }
    UI.recordHint.classList.add("hidden");
    const results = await DB.searchStudents(q, 10);
    UI.recordResults.innerHTML = results.map(s=>`
      <div class="item">
        <div class="main">
          <b>${escapeHtml(s.name)}</b>
          <small>${escapeHtml(State.gradeLabel(s.gradeCode))} • شعبة ${escapeHtml(s.section)} • ${escapeHtml(s.idNumber)}</small>
        </div>
        <div class="right">
          <button class="btn small primary" data-act="late" data-id="${escapeHtml(s.studentId)}">تأخر</button>
          <button class="btn small primary" data-act="absent" data-id="${escapeHtml(s.studentId)}">غياب</button>
          <button class="btn small" data-act="beh" data-id="${escapeHtml(s.studentId)}">سلوك</button>
        </div>
      </div>
    `).join("");
  });

  UI.recordResults.addEventListener("click", async (e)=>{
    const btn = e.target.closest("button[data-act]");
    if(!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if(act==="late"){ await DB.addAttendance(id,"LATE",fmtDateISO(),""); toast("تم تسجيل التأخر"); renderHome(); }
    if(act==="absent"){ await DB.addAttendance(id,"ABSENT",fmtDateISO(),""); toast("تم تسجيل الغياب"); renderHome(); }
    if(act==="beh"){ await openBehaviorModal(id); }
  });

  // print tab actions
  UI.btnPrintLate.onclick = ()=> Print.printRoster("LATE");
  UI.btnPrintAbsent.onclick = ()=> Print.printRoster("ABSENT");
  UI.btnPrintLateCards.onclick = ()=> Print.printCardsByClass("LATE");
  UI.btnPrintBehaviorCards.onclick = ()=> Print.printCardsByClass("BEH");
  UI.btnExportRosterCSV.onclick = ()=> Print.exportRosterCSV("LATE"); // export template for late (works for absent too by change)

  async function renderPrint(){
    // fill classes dropdowns
    const classes = await DB.listClasses();
    const grades = Array.from(new Set(classes.map(c=>String(c.gradeCode)))).sort((a,b)=>a.localeCompare(b));
    // populate grade
    UI.printGrade.innerHTML = `<option value="">اختر الصف</option>` + grades.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(State.gradeLabel(g))}</option>`).join("");
    UI.printSection.innerHTML = `<option value="">اختر الشعبة</option>`;
    UI.printGrade.onchange = ()=>{
      const g = UI.printGrade.value;
      const secs = classes.filter(c=>String(c.gradeCode)===String(g)).map(c=>String(c.section)).sort((a,b)=>a.localeCompare(b));
      UI.printSection.innerHTML = `<option value="">اختر الشعبة</option>` + secs.map(s=>`<option value="${escapeHtml(s)}">شعبة ${escapeHtml(s)}</option>`).join("");
    };
  }

  // settings actions
  UI.btnSaveSettings.onclick = async ()=>{
    await DB.setSetting("schoolName", UI.schoolName.value.trim() || "ثانوية اليعقوبي الثانوية");
    await DB.setSetting("smsProxyUrl", UI.smsProxyUrl.value.trim());
    await DB.setSetting("smsAppKey", UI.smsAppKey.value.trim());
    await DB.setSetting("smsSender", UI.smsSender.value.trim());
    await loadHeader();
    toast("تم حفظ الإعدادات");
  };

  UI.btnResetSeed.onclick = async ()=>{
    if(!confirm("سيتم حذف بيانات الطلاب الحالية وإعادة استيراد ملف الطلاب الأساسي (600 طالب). هل أنت متأكد؟")) return;
    await DB.clearStore("students");
    await ensureSeed();
    await State.refreshGradeLabels();
    await loadHeader();
    await renderHome();
  };

  UI.btnClearData.onclick = async ()=>{
    if(!confirm("سيتم حذف جميع السجلات (مواظبة + سلوك) مع بقاء الطلاب. هل أنت متأكد؟")) return;
    await DB.clearStore("attendance");
    await DB.clearStore("behavior");
    toast("تم حذف السجلات");
    renderHome();
  };

  UI.btnExport.onclick = async ()=>{
    const dump = await DB.exportAll();
    const blob = new Blob([JSON.stringify(dump)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yaqubi_rsd_backup_${fmtDateISO()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
  };

  UI.btnImport.onclick = ()=> UI.importFile.click();
  UI.importFile.onchange = async ()=>{
    const file = UI.importFile.files && UI.importFile.files[0];
    if(!file) return;
    try{
      const text = await file.text();
      const dump = JSON.parse(text);
      await DB.importAll(dump);
      toast("تم الاستيراد");
      await State.refreshGradeLabels();
      await loadHeader();
      await renderHome();
    }catch(err){
      toast("فشل الاستيراد: " + err.message);
    }finally{
      UI.importFile.value = "";
    }
  };

  UI.btnImportStudents.onclick = ()=> UI.importStudentsFile.click();
  UI.importStudentsFile.onchange = async ()=>{
    const file = UI.importStudentsFile.files && UI.importStudentsFile.files[0];
    if(!file) return;
    try{
      await importStudentsFromFile(file);
      await renderHome();
    }catch(err){
      toast("فشل استيراد الطلاب: " + err.message);
    }finally{
      UI.importStudentsFile.value = "";
    }
  };

  // ---------- Service Worker ----------
  async function registerSW(){
    if(!("serviceWorker" in navigator)) return;
    try{
      await navigator.serviceWorker.register("./sw.js", {scope:"./"});
    }catch(e){
      // ignore
    }
  }

  // ---------- Init ----------
  async function init(){
    setActiveTab("home");
    await DB.open();
    await ensureRules();
    await ensureSeed();
    await State.refreshGradeLabels();
    await loadHeader();
    await registerSW();

    // default print values
    UI.printTerm.value = "الأول";
    UI.printHijri.value = "١٤٤٧هـ";

    // first render
    UI.searchResults.innerHTML = `<div class="print-note">اكتب حرفين على الأقل أو 3 أرقام للبحث.</div>`;
    UI.recordHint.classList.remove("hidden");
    await renderHome();
  }

  init().catch(err=>{
    console.error(err);
    toast("حدث خطأ: " + err.message);
  });

})();
