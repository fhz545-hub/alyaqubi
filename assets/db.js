
const DB_NAME = "yaqubi_rsd_db";
const DB_VER = 1;

function promisifyRequest(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function open(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e)=>{
      const db = req.result;

      // Students
      if(!db.objectStoreNames.contains("students")){
        const st = db.createObjectStore("students", { keyPath:"nid" });
        st.createIndex("nameNorm","nameNorm",{unique:false});
        st.createIndex("grade","grade",{unique:false});
        st.createIndex("section","section",{unique:false});
        st.createIndex("active","active",{unique:false});
      }

      // Events (attendance/behavior)
      if(!db.objectStoreNames.contains("events")){
        const ev = db.createObjectStore("events", { keyPath:"id", autoIncrement:true });
        ev.createIndex("nid","nid",{unique:false});
        ev.createIndex("date","date",{unique:false});
        ev.createIndex("type","type",{unique:false});
        ev.createIndex("date_type","date_type",{unique:false}); // `${date}|${type}`
      }

      // Settings key/value
      if(!db.objectStoreNames.contains("settings")){
        db.createObjectStore("settings", { keyPath:"key" });
      }

      // Behavior rules list
      if(!db.objectStoreNames.contains("rules")){
        const r = db.createObjectStore("rules", { keyPath:"id", autoIncrement:true });
        r.createIndex("level","level",{unique:false});
      }

      // Recent ops (for home)
      if(!db.objectStoreNames.contains("recent")){
        const rec = db.createObjectStore("recent", { keyPath:"id", autoIncrement:true });
        rec.createIndex("ts","ts",{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function tx(db, storeNames, mode="readonly"){
  const t = db.transaction(storeNames, mode);
  const stores = {};
  for(const n of storeNames){
    stores[n]=t.objectStore(n);
  }
  return {t, stores};
}

export async function dbGetSetting(key){
  const db = await open();
  const {t, stores} = tx(db, ["settings"]);
  const v = await promisifyRequest(stores.settings.get(key));
  await promisifyRequest(t.done || t.complete || (t.oncomplete = ()=>{})); // no-op
  return v ? v.value : undefined;
}

export async function dbSetSetting(key, value){
  const db = await open();
  const {t, stores} = tx(db, ["settings"], "readwrite");
  await promisifyRequest(stores.settings.put({key, value}));
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbGetAllSettings(){
  const db = await open();
  const {t, stores} = tx(db, ["settings"]);
  const all = await promisifyRequest(stores.settings.getAll());
  return all.reduce((acc, x)=>{acc[x.key]=x.value; return acc;}, {});
}

export async function dbUpsertStudent(student){
  const db = await open();
  const {t, stores} = tx(db, ["students"], "readwrite");
  await promisifyRequest(stores.students.put(student));
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbGetStudent(nid){
  const db = await open();
  const {stores} = tx(db, ["students"]);
  return await promisifyRequest(stores.students.get(nid));
}

export async function dbDeleteStudent(nid){
  const db = await open();
  const {t, stores} = tx(db, ["students"], "readwrite");
  await promisifyRequest(stores.students.delete(nid));
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbListStudents({q="", grade="", section="", activeOnly=true, limit=500} = {}){
  const db = await open();
  const {stores} = tx(db, ["students"]);
  const all = await promisifyRequest(stores.students.getAll());
  const qq = (q||"").trim();
  const res = [];
  for(const s of all){
    if(activeOnly && s.active === false) continue;
    if(grade && (s.grade||"") !== grade) continue;
    if(section && (s.section||"") !== section) continue;

    if(qq){
      const hay = `${s.name||""} ${s.nid||""} ${s.grade||""} ${s.section||""} ${s.nameNorm||""}`.toLowerCase();
      if(!hay.includes(qq.toLowerCase())) continue;
    }
    res.push(s);
    if(res.length>=limit) break;
  }
  // sort by grade then section then name
  res.sort((a,b)=>{
    const ga=(a.grade||"").localeCompare(b.grade||"","ar");
    if(ga) return ga;
    const sa=(a.section||"").localeCompare(b.section||"","ar");
    if(sa) return sa;
    return (a.name||"").localeCompare(b.name||"","ar");
  });
  return res;
}

export async function dbAddEvent(ev){
  const db = await open();
  const {t, stores} = tx(db, ["events","recent"], "readwrite");
  const payload = {
    ...ev,
    ts: ev.ts || Date.now(),
    date_type: `${ev.date}|${ev.type}`
  };
  const id = await promisifyRequest(stores.events.add(payload));
  await promisifyRequest(stores.recent.add({
    ts: payload.ts,
    type: payload.type,
    nid: payload.nid,
    date: payload.date,
    title: payload.title || payload.ruleTitle || "",
    note: payload.note || ""
  }));
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(id);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbListEventsByDate(dateISO){
  const db = await open();
  const {stores} = tx(db, ["events"]);
  const idx = stores.events.index("date");
  const range = IDBKeyRange.only(dateISO);
  const req = idx.getAll(range);
  const all = await promisifyRequest(req);
  all.sort((a,b)=>b.ts-a.ts);
  return all;
}

export async function dbListEventsByDateType(dateISO, type){
  const db = await open();
  const {stores} = tx(db, ["events"]);
  const idx = stores.events.index("date_type");
  const key = `${dateISO}|${type}`;
  const all = await promisifyRequest(idx.getAll(IDBKeyRange.only(key)));
  all.sort((a,b)=>b.ts-a.ts);
  return all;
}

export async function dbListStudentEvents(nid, limit=200){
  const db = await open();
  const {stores} = tx(db, ["events"]);
  const idx = stores.events.index("nid");
  const all = await promisifyRequest(idx.getAll(IDBKeyRange.only(nid)));
  all.sort((a,b)=>b.ts-a.ts);
  return all.slice(0,limit);
}

export async function dbCountStudentEvents(nid){
  const evs = await dbListStudentEvents(nid, 10000);
  const counts = {LATE:0, ABSENT:0, BEHAVIOR:0};
  for(const e of evs){
    if(counts[e.type]!==undefined) counts[e.type]++;
  }
  return counts;
}

export async function dbGetRecent(limit=10){
  const db = await open();
  const {stores} = tx(db, ["recent"]);
  const all = await promisifyRequest(stores.recent.getAll());
  all.sort((a,b)=>b.ts-a.ts);
  return all.slice(0,limit);
}

/* Rules */
export async function dbEnsureDefaultRules(){
  const db = await open();
  const {t, stores} = tx(db, ["rules"], "readwrite");
  const existing = await promisifyRequest(stores.rules.getAll());
  if(existing && existing.length){
    return true;
  }
  const defaults = [
    {title:"مخالفة سلوكية (حسب دليل قواعد السلوك والمواظبة)", level:"low"},
    {title:"مخالفة سلوكية متوسطة (حسب الدليل)", level:"medium"},
    {title:"مخالفة سلوكية عالية (حسب الدليل)", level:"high"},
  ];
  for(const r of defaults){
    await promisifyRequest(stores.rules.add(r));
  }
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbListRules(){
  const db = await open();
  const {stores} = tx(db, ["rules"]);
  const all = await promisifyRequest(stores.rules.getAll());
  all.sort((a,b)=>a.title.localeCompare(b.title,"ar"));
  return all;
}

export async function dbAddRule(rule){
  const db = await open();
  const {t, stores} = tx(db, ["rules"], "readwrite");
  await promisifyRequest(stores.rules.add(rule));
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbDeleteRule(id){
  const db = await open();
  const {t, stores} = tx(db, ["rules"], "readwrite");
  await promisifyRequest(stores.rules.delete(id));
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

/* Backup */
export async function dbExportBackup(){
  const db = await open();
  const stores = ["students","events","settings","rules","recent"];
  const out = {};
  for(const name of stores){
    const {stores: ss} = tx(db,[name]);
    out[name] = await promisifyRequest(ss[name].getAll());
  }
  out.__meta = {exportedAt: new Date().toISOString(), version: DB_VER};
  return out;
}

export async function dbImportBackup(payload){
  if(!payload || typeof payload !== "object") throw new Error("ملف غير صالح");
  const db = await open();
  const stores = ["students","events","settings","rules","recent"];
  const {t, stores: ss} = tx(db, stores, "readwrite");
  for(const name of stores){
    if(Array.isArray(payload[name])){
      // clear then put
      await promisifyRequest(ss[name].clear());
      for(const item of payload[name]){
        await promisifyRequest(ss[name].put(item));
      }
    }
  }
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}

export async function dbWipeAll(){
  const db = await open();
  const stores = ["students","events","settings","rules","recent"];
  const {t, stores: ss} = tx(db, stores, "readwrite");
  for(const name of stores){
    await promisifyRequest(ss[name].clear());
  }
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve(true);
    t.onerror=()=>reject(t.error);
  });
}
