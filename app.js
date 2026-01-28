/* متابعة الطلاب — PWA (IndexedDB) */
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const hasArabic = (s) => /[\u0600-\u06FF]/.test(String(s||""));
  const nowLocalInput = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2,"0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };
  const safeUUID = () => (crypto?.randomUUID ? crypto.randomUUID() : ("id-" + Math.random().toString(16).slice(2) + Date.now().toString(16)));
  const fmtDT = (iso) => {
    try{
      const d = new Date(iso);
      return d.toLocaleString("ar-SA", { dateStyle:"medium", timeStyle:"short" });
    }catch(e){ return iso || ""; }
  };
  const dl = (filename, blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  const normalizeMobile = (raw, countryCode="966") => {
    let s = String(raw||"").trim();
    if (!s) return "";
    s = s.replace(/[\s\-()]/g, "");
    // remove leading + 
    if (s.startsWith("+")) s = s.slice(1);
    // convert 05xxxxxxxx to 9665xxxxxxxx
    if (s.startsWith("05")) s = countryCode + s.slice(1);
    // convert 5xxxxxxxx to 9665xxxxxxxx
    if (/^5\d{8}$/.test(s)) s = countryCode + s;
    // already starts with 966 and has 12 digits
    if (s.startsWith(countryCode)) return s;
    // fallback: return as-is digits only
    return s.replace(/\D/g,"");
  };

  const channelLink = (channel, mobileE164, message) => {
    const m = mobileE164 || "";
    const text = encodeURIComponent(message || "");
    if (!m) return "";
    if (channel === "whatsapp") return `https://wa.me/${m}?text=${text}`;
    if (channel === "sms") {
      // iOS uses &body=, Android often uses ?body=
      return `sms:${m}?&body=${text}`;
    }
    if (channel === "call") return `tel:${m}`;
    return "";
  };

  // ---------- Behavior taxonomy (prefilled, editable from Settings) ----------
  const DEFAULT_TAXONOMY = {
    degrees: {
      "1": { points: 1, actions: "تنبيه تربوي + توثيق + إشعار ولي الأمر عند التكرار/الحاجة." },
      "2": { points: 2, actions: "تحويل للإدارة + إشعار ولي الأمر هاتفياً + خصم درجتين + تعهد/خطة تعديل + متابعة." },
      "3": { points: 3, actions: "دعوة ولي الأمر + خطة تعديل + خصم 3 درجات + إنذار كتابي عند التكرار + لجنة التوجيه + متابعة." },
      "4": { points: 10, actions: "إحالة عاجلة للجنة التوجيه + خصم 10 درجات + إشعار ولي الأمر + إجراءات نظامية حسب الواقعة." },
      "5": { points: 15, actions: "إجراءات عاجلة + خصم 15 درجة + محاضر + جهات مختصة حسب الواقعة + متابعة." }
    },
    violations: {
      "1": [
        "التأخر الصباحي",
        "عدم حضور الاصطفاف الصباحي (مع التواجد داخل المدرسة)",
        "التأخر عن الاصطفاف الصباحي / العبث بالممتلكات البسيطة"
      ],
      "2": [
        "عدم حضور الحصة الدراسية/الهروب",
        "الدخول أو الخروج من الفصل دون استئذان",
        "دخول فصل آخر دون استئذان",
        "إثارة الفوضى داخل الفصل/المدرسة/وسائل النقل"
      ],
      "3": [
        "عدم التقيد بالزي المدرسي",
        "الشجار أو الاشتراك في مضاربة جماعية",
        "الإشارة بحركات مخلة بالآداب",
        "التلفظ بألفاظ سلبية/تهديد/سخرية",
        "إلحاق الضرر المتعمد بممتلكات الطلبة",
        "العبث بتجهيزات المدرسة أو ممتلكاتها",
        "حيازة/تداول مواد إعلامية ممنوعة (مقروءة/مسموعة/مرئية)",
        "إهمال الكتب الدراسية/الإضرار بها"
      ],
      "4": [
        "إصابة أحد الطلبة بالضرب (يد/أداة) بما يسبب إصابة",
        "سرقة شيء من ممتلكات الطلبة أو المدرسة",
        "التصوير أو التسجيل الصوتي للطلبة",
        "إتلاف/إلحاق ضرر متعمد بتجهيزات المدرسة أو ممتلكاتها"
      ],
      "5": [
        "الإساءة أو الاستخفاف بالدين/شعائر الإسلام",
        "الإساءة للدولة أو رموزها",
        "بث/ترويج أفكار متطرفة/تكفيرية/إلحادية",
        "الإساءة إلى الأديان السماوية أو إثارة العنصرية/الفتن القبلية/الطائفية",
        "تزوير/استخدام/استفادة من وثائق أو أختام رسمية بطريقة غير مشروعة",
        "الجرائم المعلوماتية بكافة أنواعها",
        "ابتزاز الطلبة",
        "التنمر بجميع أنواعه وأشكاله"
      ]
    }
  };

  // ---------- IndexedDB mini wrapper ----------
  const DB_NAME = "student-followup-db";
  const DB_VER = 1;
  let dbp = null;

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        const mk = (name, opts, idx=[]) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, opts);
            idx.forEach(([key, path, unique=false]) => store.createIndex(key, path, { unique }));
          }
        };
        mk("students", { keyPath:"id" }, [["by_name","name"],["by_idNumber","idNumber"]]);
        mk("events", { keyPath:"id" }, [["by_student","studentId"],["by_type","type"],["by_when","when"]]);
        mk("messages", { keyPath:"id" }, [["by_student","studentId"],["by_when","when"],["by_channel","channel"]]);
        mk("settings", { keyPath:"key" });
        mk("taxonomy", { keyPath:"key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(storeName, mode="readonly") {
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function getSetting(key, fallback=null) {
    const store = await tx("settings");
    return new Promise((res) => {
      const r = store.get(key);
      r.onsuccess = () => res(r.result?.value ?? fallback);
      r.onerror = () => res(fallback);
    });
  }
  async function setSetting(key, value) {
    const store = await tx("settings","readwrite");
    return new Promise((res,rej) => {
      const r = store.put({key, value});
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }

  async function getTaxonomy() {
    const store = await tx("taxonomy");
    return new Promise((res) => {
      const r = store.get("taxonomy");
      r.onsuccess = () => res(r.result?.value ?? DEFAULT_TAXONOMY);
      r.onerror = () => res(DEFAULT_TAXONOMY);
    });
  }
  async function setTaxonomy(obj) {
    const store = await tx("taxonomy","readwrite");
    return new Promise((res,rej) => {
      const r = store.put({key:"taxonomy", value: obj});
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }

  async function upsertStudent(st) {
    const store = await tx("students","readwrite");
    return new Promise((res,rej) => {
      const r = store.put(st);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }
  async function deleteStudent(id) {
    const store = await tx("students","readwrite");
    return new Promise((res,rej) => {
      const r = store.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }
  async function listStudents() {
    const store = await tx("students");
    return new Promise((res) => {
      const out=[];
      const r = store.openCursor();
      r.onsuccess = () => {
        const cur = r.result;
        if (!cur) return res(out);
        out.push(cur.value);
        cur.continue();
      };
      r.onerror = () => res(out);
    });
  }
  async function getStudent(id) {
    const store = await tx("students");
    return new Promise((res) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  }

  async function addEvent(ev) {
    const store = await tx("events","readwrite");
    return new Promise((res,rej) => {
      const r = store.put(ev);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }

  async function addMessage(msg) {
    const store = await tx("messages","readwrite");
    return new Promise((res,rej) => {
      const r = store.put(msg);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }

  async function listLog(filter="all", limit=200) {
    const db = await openDB();
    const out = [];
    // events + messages merged (basic)
    const evs = await new Promise((res) => {
      const store = db.transaction("events","readonly").objectStore("events");
      const r = store.index("by_when").openCursor(null, "prev");
      const arr=[];
      r.onsuccess = () => {
        const cur = r.result;
        if (!cur || arr.length>=limit) return res(arr);
        arr.push(cur.value);
        cur.continue();
      };
      r.onerror = () => res(arr);
    });
    const msgs = await new Promise((res) => {
      const store = db.transaction("messages","readonly").objectStore("messages");
      const r = store.index("by_when").openCursor(null, "prev");
      const arr=[];
      r.onsuccess = () => {
        const cur = r.result;
        if (!cur || arr.length>=limit) return res(arr);
        arr.push(cur.value);
        cur.continue();
      };
      r.onerror = () => res(arr);
    });

    const merged = [
      ...evs.map(e => ({kind:"event", ...e})),
      ...msgs.map(m => ({kind:"message", ...m}))
    ].sort((a,b)=> String(b.when).localeCompare(String(a.when)));

    for (const item of merged) {
      if (filter === "all") out.push(item);
      else if (filter === "attendance" && item.kind==="event" && item.type==="attendance") out.push(item);
      else if (filter === "behavior" && item.kind==="event" && item.type==="behavior") out.push(item);
      else if (filter === "message" && item.kind==="message") out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }

  async function exportAll() {
    const db = await openDB();
    const dump = {};
    for (const name of ["students","events","messages","settings","taxonomy"]) {
      dump[name] = await new Promise((res) => {
        const store = db.transaction(name,"readonly").objectStore(name);
        const r = store.openCursor();
        const arr=[];
        r.onsuccess = () => {
          const cur = r.result;
          if (!cur) return res(arr);
          arr.push(cur.value);
          cur.continue();
        };
        r.onerror = () => res(arr);
      });
    }
    dump._exportedAt = new Date().toISOString();
    dump._app = "student-followup-pwa";
    return dump;
  }

  async function importAll(dump) {
    const db = await openDB();
    const stores = ["students","events","messages","settings","taxonomy"];
    const tx = db.transaction(stores, "readwrite");
    await Promise.all(stores.map((name) => new Promise((res) => {
      const store = tx.objectStore(name);
      store.clear();
      const arr = Array.isArray(dump[name]) ? dump[name] : [];
      for (const row of arr) store.put(row);
      res(true);
    })));
    return new Promise((res,rej) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  async function resetAll() {
    const db = await openDB();
    const tx = db.transaction(["students","events","messages","settings","taxonomy"], "readwrite");
    for (const name of ["students","events","messages","settings","taxonomy"]) tx.objectStore(name).clear();
    return new Promise((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
  }

  // ---------- Messaging templates ----------
  function makeAttendanceMessage(st, status, whenISO, excused, note, settings) {
    const school = settings.schoolName || "المدرسة";
    const dateStr = fmtDT(whenISO);
    const parent = st.parentName ? `ولي أمر الطالب ${st.name} (${st.parentName})` : `ولي أمر الطالب ${st.name}`;
    const cls = st.className ? ` (${st.className})` : "";
    const base = `السلام عليكم ورحمة الله وبركاته
${parent}
نفيدكم بأنه تم رصد حالة الطالب ${st.name}${cls} بـ: ${statusLabel(status)} بتاريخ ${dateStr}.`;
    const ex = (excused==="yes") ? "بعذر" : "بدون عذر";
    const more = status==="present" ? "" : `\nالحالة: ${ex}${note ? `\nملاحظة: ${note}` : ""}`;
    const closing = `\n\nنأمل المتابعة والتعاون لضمان الانضباط.\n${school}`;
    return base + more + closing;
  }

  function makeBehaviorMessage(st, degree, violation, whenISO, note, settings, taxonomy) {
    const school = settings.schoolName || "المدرسة";
    const dateStr = fmtDT(whenISO);
    const parent = st.parentName ? `ولي أمر الطالب ${st.name} (${st.parentName})` : `ولي أمر الطالب ${st.name}`;
    const points = taxonomy.degrees?.[String(degree)]?.points ?? 0;
    const actions = taxonomy.degrees?.[String(degree)]?.actions ?? "";
    const cls = st.className ? ` (${st.className})` : "";
    const base = `السلام عليكم ورحمة الله وبركاته
${parent}
نفيدكم بأنه تم رصد حالة الطالب ${st.name}${cls} بـ: ${statusLabel(status)} بتاريخ ${dateStr}.`;
    const body = `\nالتصنيف: درجة (${degree}) — ${violation}\nالخصم المقترح من السلوك: ${points} درجة/درجات.`;
    const extra = note ? `\nتفاصيل: ${note}` : "";
    const act = actions ? `\n\nالإجراءات التربوية المقترحة: ${actions}` : "";
    const closing = `\n\nنأمل تعاونكم ودعمكم لتعديل السلوك وتعزيز الانضباط.\n${school}`;
    return base + body + extra + act + closing;
  }

  const statusLabel = (s) => ({
    present:"حضور",
    absent:"غياب",
    late:"تأخر",
    early:"خروج مبكر"
  }[s] || s);

  // ---------- UI state ----------
  let students = [];
  let settings = {
    schoolName: "",
    principalName: "",
    countryCode: "966",
    defaultChannel: "whatsapp"
  };
  let taxonomy = DEFAULT_TAXONOMY;

  // ---------- Views ----------
  function setView(viewId) {
    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#${viewId}`).classList.add("active");
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === viewId));
  }

  function studentCard(st) {
    const parentOk = st.parentMobile ? "ok" : "warn";
    const parentTxt = st.parentMobile ? "جوال ولي الأمر: جاهز" : "جوال ولي الأمر: غير مُسجل";
    const idTxt = st.idNumber ? `هوية/إقامة: ${st.idNumber}` : (st.studentRecord ? `سجل: ${st.studentRecord}` : "—");
    const cls = st.className ? ` • ${st.className}` : (st.classCode ? ` • رمز صف ${st.classCode}` : "");
    const first = String(st.name||"").trim().charAt(0) || "👤";
    return `
      <div class="card">
        <div class="studentRow">
          <div class="studentLeft">
            <div class="avatar" aria-hidden="true">${escapeHTML(first)}</div>
            <div class="studentInfo">
              <div class="studentName">${escapeHTML(st.name || "")}</div>
              <div class="studentMeta">${escapeHTML(idTxt)}${escapeHTML(cls)}</div>
              <div class="row" style="margin-top:10px">
                <span class="pill ${parentOk}">${parentTxt}</span>
              </div>
            </div>
          </div>

          <div class="studentActions">
            <button class="btn" data-act="present" data-id="${st.id}">حضور</button>
            <button class="btn" data-act="absent" data-id="${st.id}">غياب</button>
            <button class="btn" data-act="late" data-id="${st.id}">تأخر</button>
            <button class="btn" data-act="behavior" data-id="${st.id}">سلوك</button>
            <button class="btn ghost" data-act="edit" data-id="${st.id}">تعديل</button>
          </div>
        </div>
      </div>`;
  }

  function renderStudentsList() {
    const q = String($("#studentSearch").value || "").trim();
    const cf = $("#classFilter") ? String($("#classFilter").value || "all") : "all";

    const list = students.filter(s => {
      const hay = `${s.name||""} ${s.idNumber||""} ${s.studentNo||""}`.toLowerCase();
      const okSearch = !q || hay.includes(q.toLowerCase());
      const okClass = (cf === "all") || String(s.className||"") === cf;
      return okSearch && okClass;
    });

    $("#studentsList").innerHTML = list.length
      ? list.map(studentCard).join("")
      : `<div class="card"><div class="muted">لا توجد نتائج.</div></div>`;

    if ($("#countLine")) {
      const total = students.length;
      const shown = list.length;
      $("#countLine").textContent = `إجمالي الطلاب: ${total} — المعروض: ${shown}`;
    }
  }

  async function renderLog() {
    const filter = $("#logFilter").value;
    const items = await listLog(filter, 250);
    const byId = new Map(students.map(s => [s.id, s]));
    const html = items.map((it) => {
      if (it.kind === "event") {
        const st = byId.get(it.studentId);
        const title = it.type === "attendance" ? `متابعة: ${statusLabel(it.status)}` : `سلوك: درجة ${it.degree}`;
        const sub = it.type === "attendance"
          ? `${it.excused==="yes"?"بعذر":"بدون عذر"}${it.note?` • ${escapeHTML(it.note)}`:""}`
          : `${escapeHTML(it.violation||"")}${it.note?` • ${escapeHTML(it.note)}`:""}`;
        return `
          <div class="card">
            <div class="cardTitle">${escapeHTML(title)} — ${escapeHTML(st?.name || "طالب")}</div>
            <div class="muted small">${fmtDT(it.when)} • ${sub}</div>
          </div>`;
      } else {
        const st = byId.get(it.studentId);
        return `
          <div class="card">
            <div class="cardTitle">رسالة (${escapeHTML(it.channel)}) — ${escapeHTML(st?.name || "طالب")}</div>
            <div class="muted small">${fmtDT(it.when)} • إلى: ${escapeHTML(it.to||"")}</div>
            <div style="margin-top:8px; white-space:pre-wrap">${escapeHTML(it.text||"")}</div>
          </div>`;
      }
    }).join("");
    $("#logList").innerHTML = html || `<div class="card"><div class="muted">لا يوجد سجل بعد.</div></div>`;
  }

  // ---------- Dialogs ----------
  function openDlg(dlg) { dlg.showModal(); }
  function closeDlg(dlg) { try { dlg.close(); } catch(e){} }

  function fillStudentDlg(st) {
    $("#dlgStudentTitle").textContent = st?.id ? "تعديل بيانات الطالب" : "إضافة طالب";
    $("#stInternalId").value = st?.id || "";
    $("#stName").value = st?.name || "";
    $("#stIdNumber").value = st?.idNumber || "";
    $("#stClass").value = st?.className || "";
    $("#stNotes").value = st?.notes || "";
    $("#stParentName").value = st?.parentName || "";
    $("#stParentMobile").value = st?.parentMobile || "";
    $("#btnDeleteStudent").style.display = st?.id ? "inline-flex" : "none";
  }

  async function openAttendanceDlg(studentId, forcedStatus=null) {
    const st = await getStudent(studentId);
    if (!st) return;
    $("#attStudentLine").textContent = `الطالب: ${st.name}`;
    $("#attStudentId").value = st.id;
    $("#attStatus").value = forcedStatus || "present";
    $("#attWhen").value = nowLocalInput();
    $("#attExcused").value = "no";
    $("#attNote").value = "";
    $("#attMsg").value = makeAttendanceMessage(st, $("#attStatus").value, $("#attWhen").value, $("#attExcused").value, "", settings);
    openDlg($("#dlgAttendance"));
  }

  async function openBehaviorDlg(studentId) {
    const st = await getStudent(studentId);
    if (!st) return;
    $("#behStudentLine").textContent = `الطالب: ${st.name}`;
    $("#behStudentId").value = st.id;
    $("#behDegree").value = "1";
    $("#behWhen").value = nowLocalInput();
    $("#behNote").value = "";
    await refreshViolationOptions();
    refreshBehaviorMeta();
    $("#behMsg").value = makeBehaviorMessage(st, $("#behDegree").value, $("#behViolation").value, $("#behWhen").value, "", settings, taxonomy);
    openDlg($("#dlgBehavior"));
  }

  function refreshBehaviorMeta() {
    const degree = String($("#behDegree").value);
    const points = taxonomy.degrees?.[degree]?.points ?? 0;
    const actions = taxonomy.degrees?.[degree]?.actions ?? "";
    $("#behPointsPill").textContent = `خصم: ${points}`;
    $("#behActionsLine").textContent = actions ? `الإجراءات: ${actions}` : "";
  }

  async function refreshViolationOptions() {
    taxonomy = await getTaxonomy();
    const degree = String($("#behDegree").value);
    const list = taxonomy.violations?.[degree] || [];
    const sel = $("#behViolation");
    sel.innerHTML = list.map(v => `<option value="${escapeAttr(v)}">${escapeHTML(v)}</option>`).join("") || `<option value="مخالفة غير مصنفة">مخالفة غير مصنفة</option>`;
  }

  // ---------- Import students (Noor Excel) ----------
  async function importNoorExcel(file) {
    if (!window.XLSX) throw new Error("لم يتم تحميل مكتبة Excel بعد. تأكد من الاتصال بالإنترنت مرة واحدة.");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array" });
    let added = 0;
    const seen = new Set();

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:"" });
      if (!rows || !rows.length) continue;

      // find header row containing "اسم الطالب" or "Student's Name"
      let h = -1;
      for (let i=0;i<Math.min(rows.length, 60);i++){
        const row = rows[i].map(x => String(x||""));
        if (row.some(c => c.includes("اسم الطالب") || c.includes("Student's Name"))) { h = i; break; }
      }
      if (h < 0) continue;

      const h1 = rows[h] || [];
      const h2 = rows[h+1] || [];
      const labels = [];
      const width = Math.max(h1.length, h2.length);
      for (let c=0;c<width;c++){
        const a = String(h1[c]||"").trim();
        const b = String(h2[c]||"").trim();
        labels[c] = `${a} ${b}`.trim();
      }

      const findCol = (pred) => {
        for (let c=0;c<labels.length;c++){
          const t = labels[c];
          if (pred(t)) return c;
        }
        return -1;
      };

      const colName = findCol(t => t.includes("اسم الطالب") || t.includes("Student's Name"));
      const colIdNum = findCol(t => t.includes("رقمها") || /\bID\b/i.test(t) || t.includes("هوية") || t.includes("الإقامة"));
      const colIdType = findCol(t => t.includes("نوعها"));
      const colDob = findCol(t => t.includes("تاريخ الميلاد") || t.includes("Date of birth"));
      const colNat = findCol(t => t.includes("الجنسية") || t.includes("Nationality"));

      for (let r=h+2; r<rows.length; r++){
        const row = rows[r];
        const name = String(row[colName]||"").trim();
        if (!name) continue;
        if (!hasArabic(name)) continue; // skip duplicate English rows
        const idNumber = String((colIdNum>=0?row[colIdNum]:"")||"").trim();
        const key = (idNumber || name).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const st = {
          id: safeUUID(),
          name,
          idNumber,
          idType: String((colIdType>=0?row[colIdType]:"")||"").trim(),
          dob: String((colDob>=0?row[colDob]:"")||"").trim(),
          nationality: String((colNat>=0?row[colNat]:"")||"").trim(),
          className: "",
          studentNo: "",
          parentName: "",
          parentMobile: "",
          notes: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        // Upsert by idNumber if exists: try match existing
        if (idNumber) {
          const existing = students.find(s => s.idNumber && s.idNumber === idNumber);
          if (existing) st.id = existing.id;
        }
        await upsertStudent(st);
        added++;
      }
    }
    await loadStudents();
    return added;
  }


  // ---------- Import parents (Excel of parent mobiles) ----------
  async function importParentsExcel(file) {
    if (!window.XLSX) throw new Error("لم يتم تحميل مكتبة Excel بعد. تأكد من الاتصال بالإنترنت مرة واحدة.");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array" });

    const normalizeHeader = (s) => String(s||"").trim().replace(/\s+/g," ");
    const headerRowIndex = (rows) => {
      for (let i=0;i<Math.min(rows.length, 40);i++){
        const row = rows[i].map(x => normalizeHeader(x));
        if (row.some(c => c.includes("جوال") || c.toLowerCase().includes("mobile") || c.includes("ولي الأمر") || c.includes("رقم الهوية") || c.includes("الإقامة"))) {
          return i;
        }
      }
      return 0;
    };

    const byId = new Map(students.filter(s => s.idNumber).map(s => [String(s.idNumber).trim(), s]));

    let updated = 0;
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:"" });
      if (!rows || !rows.length) continue;

      const h = headerRowIndex(rows);
      const headers = (rows[h] || []).map(x => normalizeHeader(x));

      const findColH = (pred) => {
        for (let c=0;c<headers.length;c++){
          const t = headers[c];
          if (pred(t)) return c;
        }
        return -1;
      };

      const colId = findColH(t => t.includes("رقم الهوية") || t.includes("رقم الإقامة") || t.includes("الهوية") || t.includes("الإقامة") || /\bID\b/i.test(t));
      const colName = findColH(t => t.includes("اسم الطالب") || /student/i.test(t) || t.includes("الطالب"));
      const colPName = findColH(t => t.includes("اسم ولي") || t.includes("ولي الأمر") || /parent/i.test(t));
      const colPMobile = findColH(t => t.includes("جوال") || t.toLowerCase().includes("mobile") || t.includes("الهاتف"));

      if (colId < 0 || colPMobile < 0) continue;

      for (let r=h+1; r<rows.length; r++){
        const row = rows[r];
        const idNumber = String(row[colId]||"").trim();
        const pmobile = String(row[colPMobile]||"").trim();
        if (!idNumber || !pmobile) continue;

        const st = byId.get(idNumber);
        if (!st) continue;

        const next = { ...st };
        if (colName >= 0) {
          const nm = String(row[colName]||"").trim();
          if (nm) next.name = nm;
        }
        if (colPName >= 0) {
          const pn = String(row[colPName]||"").trim();
          if (pn) next.parentName = pn;
        }
        next.parentMobile = pmobile;
        next.updatedAt = new Date().toISOString();

        await upsertStudent(next);
        byId.set(idNumber, next);
        updated++;
      }
    }

    await loadStudents();
    return updated;
  }

  // ---------- Export Excel ----------
  async function exportLogToXlsx() {
    if (!window.XLSX) throw new Error("لم يتم تحميل مكتبة Excel بعد.");
    const items = await listLog("all", 500);
    const byId = new Map(students.map(s => [s.id, s]));
    const rows = items.map(it => {
      const st = byId.get(it.studentId);
      if (it.kind === "event") {
        return {
          النوع: it.type === "attendance" ? "حضور/مواظبة" : "سلوك",
          الطالب: st?.name || "",
          التاريخ: fmtDT(it.when),
          الحالة: it.type === "attendance" ? statusLabel(it.status) : `درجة ${it.degree}`,
          المخالفة: it.violation || "",
          بعذر: it.excused || "",
          ملاحظة: it.note || ""
        };
      } else {
        return {
          النوع: "رسالة",
          الطالب: st?.name || "",
          التاريخ: fmtDT(it.when),
          الحالة: it.channel || "",
          المخالفة: "",
          بعذر: "",
          ملاحظة: it.text || ""
        };
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "السجل");
    const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
    dl(`سجل-المتابعة-${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([out], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  }

  // ---------- Security (PIN) ----------
  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
  }

  async function checkPINFlow() {
    const pinHash = await getSetting("pinHash", "");
    if (!pinHash) return;

    const lock = $("#lockScreen");
    lock.classList.remove("hidden");
    lock.setAttribute("aria-hidden","false");

    $("#pinInput").value = "";
    $("#pinErr").classList.add("hidden");

    const tryUnlock = async () => {
      const v = String($("#pinInput").value||"").trim();
      const h = await sha256(v);
      if (h === pinHash) {
        lock.classList.add("hidden");
        lock.setAttribute("aria-hidden","true");
      } else {
        $("#pinErr").classList.remove("hidden");
      }
    };

    $("#btnUnlock").onclick = tryUnlock;
    $("#pinInput").onkeydown = (e) => { if (e.key==="Enter") { e.preventDefault(); tryUnlock(); } };
  }

  // ---------- Escape ----------
  function escapeHTML(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function escapeAttr(s){ return escapeHTML(s).replace(/"/g,"&quot;"); }

  // ---------- Load / Init ----------
  async function loadSettings() {
    settings.schoolName = await getSetting("schoolName", "");
    settings.principalName = await getSetting("principalName", "");
    settings.countryCode = await getSetting("countryCode", "966");
    settings.defaultChannel = await getSetting("defaultChannel", "whatsapp");
    $("#setSchoolName").value = settings.schoolName;
    $("#setPrincipalName").value = settings.principalName;
    $("#setCountryCode").value = settings.countryCode;
    $("#setDefaultChannel").value = settings.defaultChannel;
  }

  async function loadStudents() {
    students = await listStudents();
    students.sort((a,b)=> String(a.name||"").localeCompare(String(b.name||""), "ar"));

    // تحديث قائمة الصفوف/الأقسام
    const sel = $("#classFilter");
    if (sel) {
      const prev = String(sel.value || "all");
      const uniq = [...new Set(students.map(s => String(s.className||"").trim()).filter(Boolean))];
      uniq.sort((a,b)=> a.localeCompare(b, "ar"));
      sel.innerHTML = `<option value="all">كل الصفوف</option>` + uniq.map(v => `<option value="${escapeAttr(v)}">${escapeHTML(v)}</option>`).join("");
      sel.value = uniq.includes(prev) ? prev : "all";
    }


  // ---------- Quick stats (dashboard) ----------
  async function updateStats() {
    try{
      if (!$("#statTotal")) return;
      const total = students.length;
      const ready = students.filter(s => String(s.parentMobile||"").trim().length >= 9).length;

      $("#statTotal").textContent = String(total);
      $("#statParentsReady").textContent = String(ready);

      const today = new Date();
      today.setHours(0,0,0,0);
      const startISO = today.toISOString();

      let absent = 0;
      let behavior = 0;

      const db = await openDB();
      await new Promise((res) => {
        const store = db.transaction("events","readonly").objectStore("events");
        const idx = store.index("by_when");
        const req = idx.openCursor(null, "prev");
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return res();
          const ev = cur.value;
          const when = String(ev.when || "");
          if (when < startISO) return res(); // stop (older than today)
          if (ev.type === "attendance" && ev.status === "absent") absent++;
          if (ev.type === "behavior") behavior++;
          cur.continue();
        };
        req.onerror = () => res();
      });

      $("#statAbsentToday").textContent = String(absent);
      $("#statBehaviorToday").textContent = String(behavior);
    }catch(e){
      // ignore stats failures
    }
  }


    renderStudentsList();
    await updateStats();
  }

  function bindTabs() {
    $$(".tab").forEach(btn => {
      btn.addEventListener("click", async () => {
        setView(btn.dataset.view);
        if (btn.dataset.view === "viewLog") await renderLog();
      });
    });
  }

  function bindButtons() {
    $("#btnAddStudent").addEventListener("click", () => {
      fillStudentDlg(null);
      openDlg($("#dlgStudent"));
    });

    $("#studentsList").addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (!id || !act) return;

      if (act === "edit") {
        const st = await getStudent(id);
        fillStudentDlg(st);
        openDlg($("#dlgStudent"));
        return;
      }
      if (act === "behavior") { await openBehaviorDlg(id); return; }
      if (["present","absent","late","early"].includes(act)) { await openAttendanceDlg(id, act); return; }
    });

    $("#studentSearch").addEventListener("input", renderStudentsList);
    if ($("#classFilter")) $("#classFilter").addEventListener("change", renderStudentsList);

    // Save student
    $("#btnSaveStudent").addEventListener("click", async (e) => {
      e.preventDefault();
      const id = $("#stInternalId").value || safeUUID();
      const st = {
        id,
        name: $("#stName").value.trim(),
        idNumber: $("#stIdNumber").value.trim(),
        className: $("#stClass").value.trim(),
        notes: $("#stNotes").value.trim(),
        parentName: $("#stParentName").value.trim(),
        parentMobile: $("#stParentMobile").value.trim(),
        updatedAt: new Date().toISOString(),
        createdAt: (await getStudent(id))?.createdAt || new Date().toISOString()
      };
      if (!st.name) return;
      await upsertStudent(st);
      closeDlg($("#dlgStudent"));
      await loadStudents();
    });

    // Delete student
    $("#btnDeleteStudent").addEventListener("click", async (e) => {
      e.preventDefault();
      const id = $("#stInternalId").value;
      if (!id) return;
      if (!confirm("تأكيد حذف الطالب من قاعدة البيانات المحلية؟")) return;
      await deleteStudent(id);
      closeDlg($("#dlgStudent"));
      await loadStudents();
    });

    // Attendance change re-generate message
    ["attStatus","attWhen","attExcused","attNote"].forEach(id => {
      $(`#${id}`).addEventListener("input", async () => {
        const st = await getStudent($("#attStudentId").value);
        if (!st) return;
        $("#attMsg").value = makeAttendanceMessage(st, $("#attStatus").value, $("#attWhen").value, $("#attExcused").value, $("#attNote").value, settings);
      });
    });

    // Behavior change re-generate
    $("#behDegree").addEventListener("change", async () => {
      await refreshViolationOptions();
      refreshBehaviorMeta();
      const st = await getStudent($("#behStudentId").value);
      if (!st) return;
      $("#behMsg").value = makeBehaviorMessage(st, $("#behDegree").value, $("#behViolation").value, $("#behWhen").value, $("#behNote").value, settings, taxonomy);
    });
    ["behViolation","behWhen","behNote"].forEach(id => {
      $(`#${id}`).addEventListener("input", async () => {
        refreshBehaviorMeta();
        const st = await getStudent($("#behStudentId").value);
        if (!st) return;
        $("#behMsg").value = makeBehaviorMessage(st, $("#behDegree").value, $("#behViolation").value, $("#behWhen").value, $("#behNote").value, settings, taxonomy);
      });
    });

    // Save/Send attendance
    $("#btnAttSave").addEventListener("click", async (e) => {
      e.preventDefault();
      await saveAttendance(false);
    });
    $("#btnAttSend").addEventListener("click", async (e) => {
      e.preventDefault();
      await saveAttendance(true);
    });

    async function saveAttendance(doSend) {
      const studentId = $("#attStudentId").value;
      const st = await getStudent(studentId);
      if (!st) return;
      const ev = {
        id: safeUUID(),
        kind:"event",
        type:"attendance",
        studentId,
        status: $("#attStatus").value,
        when: $("#attWhen").value || new Date().toISOString(),
        excused: $("#attExcused").value,
        note: $("#attNote").value.trim(),
        createdAt: new Date().toISOString()
      };
      await addEvent(ev);

      const msgText = $("#attMsg").value.trim();
      if (msgText) {
        const to = normalizeMobile(st.parentMobile, settings.countryCode);
        const channel = settings.defaultChannel;
        const msg = {
          id: safeUUID(),
          kind:"message",
          studentId,
          eventId: ev.id,
          channel,
          to,
          text: msgText,
          when: new Date().toISOString()
        };
        await addMessage(msg);
        if (doSend && to) {
          const link = channelLink(channel, to, msgText);
          if (link) window.open(link, "_blank");
        }
      }
      closeDlg($("#dlgAttendance"));
      await renderLog();
      await updateStats();
    }

    // Save/Send behavior
    $("#btnBehSave").addEventListener("click", async (e) => {
      e.preventDefault();
      await saveBehavior(false);
    });
    $("#btnBehSend").addEventListener("click", async (e) => {
      e.preventDefault();
      await saveBehavior(true);
    });

    async function saveBehavior(doSend) {
      const studentId = $("#behStudentId").value;
      const st = await getStudent(studentId);
      if (!st) return;

      taxonomy = await getTaxonomy();
      const degree = String($("#behDegree").value);
      const points = taxonomy.degrees?.[degree]?.points ?? 0;

      const ev = {
        id: safeUUID(),
        kind:"event",
        type:"behavior",
        studentId,
        degree,
        points,
        violation: $("#behViolation").value,
        when: $("#behWhen").value || new Date().toISOString(),
        note: $("#behNote").value.trim(),
        createdAt: new Date().toISOString()
      };
      await addEvent(ev);

      const msgText = $("#behMsg").value.trim();
      if (msgText) {
        const to = normalizeMobile(st.parentMobile, settings.countryCode);
        const channel = settings.defaultChannel;
        const msg = {
          id: safeUUID(),
          kind:"message",
          studentId,
          eventId: ev.id,
          channel,
          to,
          text: msgText,
          when: new Date().toISOString()
        };
        await addMessage(msg);
        if (doSend && to) {
          const link = channelLink(channel, to, msgText);
          if (link) window.open(link, "_blank");
        }
      }

      closeDlg($("#dlgBehavior"));
      await renderLog();
      await updateStats();
    }

    // Settings save
    ["setSchoolName","setPrincipalName","setCountryCode","setDefaultChannel"].forEach(id => {
      $(`#${id}`).addEventListener("change", async () => {
        settings.schoolName = $("#setSchoolName").value.trim();
        settings.principalName = $("#setPrincipalName").value.trim();
        settings.countryCode = $("#setCountryCode").value.trim() || "966";
        settings.defaultChannel = $("#setDefaultChannel").value;
        await setSetting("schoolName", settings.schoolName);
        await setSetting("principalName", settings.principalName);
        await setSetting("countryCode", settings.countryCode);
        await setSetting("defaultChannel", settings.defaultChannel);
      });
    });

    // PIN
    $("#btnSavePin").addEventListener("click", async () => {
      const v = String($("#setPin").value||"").trim();
      if (v.length < 4) return alert("الرمز يجب ألا يقل عن 4 أرقام.");
      const h = await sha256(v);
      await setSetting("pinHash", h);
      $("#setPin").value = "";
      alert("تم حفظ الرمز.");
    });
    $("#btnClearPin").addEventListener("click", async () => {
      if (!confirm("إزالة القفل؟")) return;
      await setSetting("pinHash", "");
      alert("تمت الإزالة.");
    });

    // Taxonomy editor
    $("#btnOpenTaxonomy").addEventListener("click", async () => {
      taxonomy = await getTaxonomy();
      $("#taxJson").value = JSON.stringify(taxonomy, null, 2);
      openDlg($("#dlgTaxonomy"));
    });
    $("#btnSaveTax").addEventListener("click", async (e) => {
      e.preventDefault();
      try{
        const obj = JSON.parse($("#taxJson").value);
        await setTaxonomy(obj);
        taxonomy = obj;
        closeDlg($("#dlgTaxonomy"));
        alert("تم حفظ التصنيف.");
      }catch(err){
        alert("ملف JSON غير صالح.");
      }
    });

    // Backup modal
    $("#btnBackup").addEventListener("click", () => openDlg($("#dlgBackup")));
    $("#btnDoBackup").addEventListener("click", async (e) => {
      e.preventDefault();
      const dump = await exportAll();
      const blob = new Blob([JSON.stringify(dump, null, 2)], {type:"application/json"});
      dl(`student-followup-backup-${new Date().toISOString().slice(0,10)}.json`, blob);
    });
    $("#restoreFile").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try{
        const txt = await f.text();
        const dump = JSON.parse(txt);
        await importAll(dump);
        await loadSettings();
        await loadStudents();
        closeDlg($("#dlgBackup"));
        alert("تمت الاستعادة.");
      }catch(err){
        alert("تعذر الاستعادة: ملف غير صالح.");
      } finally {
        e.target.value = "";
      }
    });

    // Import students
    $("#btnImport").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try{
        const n = await importNoorExcel(f);
        alert(`تم استيراد/تحديث ${n} طالب.`);
      }catch(err){
        console.error(err);
        alert(String(err?.message || err));
      } finally {
        e.target.value = "";
      }
    });

    // Import parents (mobiles)
    $("#btnImportParents").addEventListener("click", () => $("#parentImportFile").click());
    $("#parentImportFile").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try{
        const n = await importParentsExcel(f);
        alert(`تم تحديث بيانات أولياء الأمور لـ ${n} طالب.`);
      }catch(err){
        console.error(err);
        alert(String(err?.message || err));
      } finally {
        e.target.value = "";
      }
    });


    // Reset
    $("#btnResetDemo").addEventListener("click", async () => {
      if (!confirm("سيتم حذف جميع البيانات من هذا الجهاز. متابعة؟")) return;
      await resetAll();
      settings = { schoolName:"", principalName:"", countryCode:"966", defaultChannel:"whatsapp" };
      await loadSettings();
      await loadStudents();
      alert("تمت إعادة الضبط.");
    });

    // Log filter
    $("#logFilter").addEventListener("change", renderLog);
    $("#btnExportXlsx").addEventListener("click", async () => {
      try{ await exportLogToXlsx(); } catch(err){ alert(String(err?.message||err)); }
    });
  }

  async function seedIfEmpty() {
    const list = await listStudents();
    if (list.length) return;

    // محاولة تحميل قائمة الطلاب المرفقة (Seed)
    try{
      const res = await fetch("./students-seed.json", { cache:"no-store" });
      if (res.ok) {
        const seed = await res.json();
        if (Array.isArray(seed) && seed.length) {
          for (const s of seed) {
            const st = {
              id: safeUUID(),
              name: String(s.name||"").trim(),
              idNumber: String(s.idNumber||"").trim(),
              idType: String(s.idType||"").trim(),
              studentNo: String(s.studentNo||"").trim(),
              studentRecord: String(s.studentRecord||"").trim(),
              dob: String(s.dob||"").trim(),
              nationality: String(s.nationality||"").trim(),
              enrollStatus: String(s.enrollStatus||"").trim(),
              className: String(s.className||"").trim(),
              parentName: String(s.parentName||"").trim(),
              parentMobile: String(s.parentMobile||"").trim(),
              notes: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            if (st.name) await upsertStudent(st);
          }
          return;
        }
      }
    }catch(e){ /* ignore */ }

    // احتياطي: بيانات تجريبية
    const demo = [
      { id:safeUUID(), name:"طالب تجريبي 1", idNumber:"", className:"", notes:"", parentName:"", parentMobile:"", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
      { id:safeUUID(), name:"طالب تجريبي 2", idNumber:"", className:"", notes:"", parentName:"", parentMobile:"", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }
    ];
    for (const st of demo) await upsertStudent(st);
  }

  async function init() {
    // Register service worker
    if ("serviceWorker" in navigator) {
      try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){}
    }

    await openDB();
    await seedIfEmpty();
    await loadSettings();
    taxonomy = await getTaxonomy();
    await loadStudents();
    bindTabs();
    bindButtons();

    // default view
    setView("viewStudents");

    // PIN lock
    await checkPINFlow();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
