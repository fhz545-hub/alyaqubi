// db.js — Offline-first storage (IndexedDB) + optional Cloud Sync
// © Yaqubi School tools (local app). No tokens are stored in GitHub.

const DB_NAME = "yaqubi_students_v1";
const DB_VERSION = 1;

const nowISO = () => new Date().toISOString();
const randId = (prefix="") => prefix + (crypto?.randomUUID ? crypto.randomUUID() : (Math.random().toString(16).slice(2)+Date.now()));

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      if(!db.objectStoreNames.contains("students")){
        const st = db.createObjectStore("students", { keyPath:"nid" });
        st.createIndex("name", "name");
        st.createIndex("grade", "grade");
        st.createIndex("section", "section");
      }

      if(!db.objectStoreNames.contains("logs")){
        const st = db.createObjectStore("logs", { keyPath:"id" });
        st.createIndex("nid", "nid");
        st.createIndex("type", "type");
        st.createIndex("at", "at");
      }

      if(!db.objectStoreNames.contains("meta")){
        db.createObjectStore("meta", { keyPath:"key" });
      }

      if(!db.objectStoreNames.contains("outbox")){
        db.createObjectStore("outbox", { keyPath:"id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise(req){
  return new Promise((resolve, reject)=>{
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getMeta(db, key, fallback=null){
  try{
    const tx = db.transaction("meta","readonly");
    const st = tx.objectStore("meta");
    const res = await reqToPromise(st.get(key));
    return res ? res.value : fallback;
  }catch(e){ return fallback; }
}
async function setMeta(db, key, value){
  const tx = db.transaction("meta","readwrite");
  const st = tx.objectStore("meta");
  await reqToPromise(st.put({key, value}));
  return true;
}
async function delMeta(db, key){
  const tx = db.transaction("meta","readwrite");
  const st = tx.objectStore("meta");
  await reqToPromise(st.delete(key));
  return true;
}

async function putMany(db, storeName, items){
  const tx = db.transaction(storeName, "readwrite");
  const st = tx.objectStore(storeName);
  for(const it of items) st.put(it);
  await new Promise((resolve, reject)=>{
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function clearStore(db, storeName){
  const tx = db.transaction(storeName, "readwrite");
  const st = tx.objectStore(storeName);
  await reqToPromise(st.clear());
}

async function getAll(db, storeName){
  const tx = db.transaction(storeName, "readonly");
  const st = tx.objectStore(storeName);
  return await reqToPromise(st.getAll());
}

async function getRecentByIndex(db, storeName, indexName, limit=5000){
  const tx = db.transaction(storeName, "readonly");
  const st = tx.objectStore(storeName).index(indexName);
  const res = [];
  return await new Promise((resolve, reject)=>{
    const cur = st.openCursor(null, "prev");
    cur.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(!cursor) return resolve(res);
      res.push(cursor.value);
      if(res.length >= limit) return resolve(res);
      cursor.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

async function getOutbox(db, limit=200){
  const tx = db.transaction("outbox", "readonly");
  const st = tx.objectStore("outbox");
  const res = [];
  return await new Promise((resolve, reject)=>{
    const cur = st.openCursor();
    cur.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(!cursor) return resolve(res);
      res.push(cursor.value);
      if(res.length >= limit) return resolve(res);
      cursor.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

async function delOutboxMany(db, ids){
  const tx = db.transaction("outbox","readwrite");
  const st = tx.objectStore("outbox");
  ids.forEach(id=>st.delete(id));
  await new Promise((resolve, reject)=>{
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function cleanDigits(v){
  return String(v||"").replace(/[^\d]/g,"").trim();
}

export const Store = {
  db: null,
  listeners: new Set(),

  state: {
    students: [],
    logs: [],
    settings: {
      schoolName: "ثانوية اليعقوبي الثانوية بالخبر",
      educationOffice: "الإدارة العامة للتعليم بالمنطقة الشرقية • قطاع التعليم بالخبر",
      hijriYear: "1447",
      term: "الأول",
      proxyUrl: "",
      proxyKey: "",
      smsSender: "Mobile.SA",
      allowedLateMinutes: 10
    },
    cloud: {
      enabled: false,
      url: "",
      token: "",
      role: "",
      user: "",
      lastSyncAt: ""
    }
  },

  on(fn){ this.listeners.add(fn); return ()=>this.listeners.delete(fn); },
  emit(){ for(const fn of this.listeners) try{ fn(this.state); }catch(e){} },

  async load(){
    this.db = await openDB();

    // device id
    let deviceId = await getMeta(this.db, "deviceId", "");
    if(!deviceId){
      deviceId = randId("dev_");
      await setMeta(this.db, "deviceId", deviceId);
    }
    this.deviceId = deviceId;

    const settings = await getMeta(this.db, "settings", null);
    if(settings) this.state.settings = {...this.state.settings, ...settings};

    const cloud = await getMeta(this.db, "cloud", null);
    if(cloud) this.state.cloud = {...this.state.cloud, ...cloud};

    // Load students (all)
    this.state.students = await getAll(this.db, "students");

    // Load recent logs (limit)
    this.state.logs = await getRecentByIndex(this.db, "logs", "at", 5000);

    this.emit();
  },

  async saveSettings(patch){
    this.state.settings = {...this.state.settings, ...(patch||{})};
    await setMeta(this.db, "settings", this.state.settings);
    this.emit();
  },

  hasStudents(){ return (this.state.students?.length||0) > 0; },

  async setStudents(list){
    list = Array.isArray(list) ? list : [];
    // normalize
    const normalized = [];
    for(const s of list){
      const nid = cleanDigits(s.nid);
      const name = String(s.name||"").trim();
      if(!nid || !name) continue;
      normalized.push({
        name,
        nid,
        phone: cleanDigits(s.phone || ""),
        grade: String(s.grade||"").trim(),
        section: String(s.section||"").trim()
      });
    }

    await clearStore(this.db, "students");
    await putMany(this.db, "students", normalized);
    this.state.students = normalized;

    // If cloud enabled, enqueue as a bulk op (admin only on server; client can still queue)
    this.enqueueOp("students.replace", { students: normalized });

    this.emit();
  },

  async upsertStudent(s){
    const nid = cleanDigits(s.nid);
    const name = String(s.name||"").trim();
    if(!nid || !name) return false;

    const item = {
      name,
      nid,
      phone: cleanDigits(s.phone || ""),
      grade: String(s.grade||"").trim(),
      section: String(s.section||"").trim()
    };

    const i = this.state.students.findIndex(x=>x.nid===nid);
    if(i>=0) this.state.students[i] = {...this.state.students[i], ...item};
    else this.state.students.push(item);

    await putMany(this.db, "students", [item]);

    this.enqueueOp("student.upsert", { student: item });

    this.emit();
    return true;
  },

  async deleteStudent(nid){
    nid = cleanDigits(nid);
    if(!nid) return false;
    // delete student
    const tx = this.db.transaction("students","readwrite");
    const st = tx.objectStore("students");
    await reqToPromise(st.delete(nid));
    // delete logs? keep logs but they refer; we keep logs and mark student deleted
    this.state.students = this.state.students.filter(s=>s.nid!==nid);

    this.enqueueOp("student.delete", { nid });

    this.emit();
    return true;
  },

  async addLog(log){
    const id = randId("L_");
    const item = { id, at: nowISO(), ...log };
    // persist
    await putMany(this.db, "logs", [item]);

    // update memory cache
    this.state.logs.unshift(item);
    if(this.state.logs.length > 5000) this.state.logs.length = 5000;

    this.enqueueOp("log.add", { log: item });

    this.emit();
    return item;
  },

  // lightweight counts (from cached logs only)
  getCounts(nid){
    const logs = this.state.logs.filter(l=>String(l.nid)===String(nid));
    const late = logs.filter(l=>l.type==="LATE").length;
    const absent = logs.filter(l=>l.type==="ABSENT").length;
    const behavior = logs.filter(l=>l.type==="BEHAVIOR").length;
    return {late, absent, behavior};
  },

  exportBackup(){
    return {
      exportedAt: nowISO(),
      students: this.state.students,
      logs: this.state.logs,
      settings: this.state.settings
    };
  },

  async importBackup(obj){
    if(!obj) return false;
    const students = Array.isArray(obj.students) ? obj.students : [];
    const logs = Array.isArray(obj.logs) ? obj.logs : [];
    const settings = obj.settings || {};

    await clearStore(this.db, "students");
    await clearStore(this.db, "logs");

    await putMany(this.db, "students", students.map(s=>({
      name: String(s.name||"").trim(),
      nid: cleanDigits(s.nid),
      phone: cleanDigits(s.phone||""),
      grade: String(s.grade||"").trim(),
      section: String(s.section||"").trim()
    })).filter(x=>x.name && x.nid));

    await putMany(this.db, "logs", logs);

    this.state.students = await getAll(this.db, "students");
    this.state.logs = await getRecentByIndex(this.db, "logs", "at", 5000);
    await this.saveSettings(settings);

    this.emit();
    return true;
  },

  normalizeName(s){
    return String(s||"")
      .replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
      .replace(/[^\p{L}\p{N}\s]+/gu," ")
      .replace(/\s+/g," ")
      .trim()
      .toLowerCase();
  },

  searchStudents(q, limit=20){
    q = String(q||"").trim();
    if(!q) return [];
    const qDigits = q.replace(/[^\d]/g,"");
    const qNorm = this.normalizeName(q);
    let res = this.state.students.filter(s=>{
      if(qDigits && String(s.nid||"").includes(qDigits)) return true;
      const n = this.normalizeName(s.name||"");
      return n.includes(qNorm);
    });
    // best match first
    res.sort((a,b)=> (a.name||"").localeCompare(b.name||"", "ar"));
    return res.slice(0, limit);
  },

  // ---------------- Cloud Sync (optional) ----------------
  async setCloudConfig({url, token}){
    url = String(url||"").trim().replace(/\/+$/,"");
    token = String(token||"").trim();
    this.state.cloud = {...this.state.cloud, enabled: !!(url && token), url, token};
    await setMeta(this.db, "cloud", this.state.cloud);
    this.emit();
  },

  async disconnectCloud(){
    this.state.cloud = {...this.state.cloud, enabled:false, url:"", token:"", role:"", user:""};
    await setMeta(this.db, "cloud", this.state.cloud);
    await delMeta(this.db, "cursor");
    this.emit();
  },

  cloudHeaders(){
    const h = {"Content-Type":"application/json", "Accept":"application/json"};
    if(this.state.cloud.token) h["Authorization"] = "Bearer " + this.state.cloud.token;
    h["X-Device-Id"] = this.deviceId || "";
    return h;
  },

  enqueueOp(kind, payload){
    if(!this.db) return;
    if(!this.state.cloud.enabled) return; // no cloud, no outbox
    const op = {
      id: randId("op_"),
      at: nowISO(),
      kind,
      payload,
      deviceId: this.deviceId
    };
    const tx = this.db.transaction("outbox","readwrite");
    tx.objectStore("outbox").put(op);
  },

  async whoami(){
    if(!this.state.cloud.enabled) return null;
    const url = this.state.cloud.url + "/auth/whoami";
    const res = await fetch(url, {headers: this.cloudHeaders()});
    const data = await res.json().catch(()=>null);
    if(!res.ok) throw new Error(data?.message || ("فشل التحقق (HTTP "+res.status+")"));
    this.state.cloud = {...this.state.cloud, role:data.role||"", user:data.name||data.user||""};
    await setMeta(this.db, "cloud", this.state.cloud);
    this.emit();
    return data;
  },

  async syncNow(){
    if(!this.state.cloud.enabled) return {ok:false, message:"المزامنة غير مفعّلة"};
    const summary = {ok:true, pushed:0, pulled:0};

    // Push
    const pending = await getOutbox(this.db, 200);
    if(pending.length){
      const res = await fetch(this.state.cloud.url + "/sync/push", {
        method:"POST",
        headers: this.cloudHeaders(),
        body: JSON.stringify({ops: pending})
      });
      const data = await res.json().catch(()=> ({}));
      if(!res.ok) throw new Error(data?.message || ("فشل الإرسال (HTTP "+res.status+")"));
      const ack = Array.isArray(data.ack) ? data.ack : [];
      await delOutboxMany(this.db, ack);
      summary.pushed = ack.length;
    }

    // Pull
    const cursor = await getMeta(this.db, "cursor", 0);
    const pullUrl = this.state.cloud.url + "/sync/pull?since=" + encodeURIComponent(String(cursor||0));
    const res2 = await fetch(pullUrl, {headers: this.cloudHeaders()});
    const data2 = await res2.json().catch(()=> ({}));
    if(!res2.ok) throw new Error(data2?.message || ("فشل الاستقبال (HTTP "+res2.status+")"));

    const ops = Array.isArray(data2.ops) ? data2.ops : [];
    if(ops.length) await this.applyRemoteOps(ops);
    await setMeta(this.db, "cursor", data2.cursor || cursor);
    summary.pulled = ops.length;

    this.state.cloud = {...this.state.cloud, lastSyncAt: nowISO()};
    await setMeta(this.db, "cloud", this.state.cloud);
    this.emit();

    return summary;
  },

  async applyRemoteOps(ops){
    // Apply in order
    for(const op of ops){
      if(op.deviceId && op.deviceId === this.deviceId) continue; // skip echo
      const k = op.kind;
      const p = op.payload || {};
      if(k==="student.upsert" && p.student){
        const s = p.student;
        await putMany(this.db, "students", [s]);
      }else if(k==="student.delete" && p.nid){
        const tx = this.db.transaction("students","readwrite");
        await reqToPromise(tx.objectStore("students").delete(p.nid));
      }else if(k==="students.replace" && Array.isArray(p.students)){
        await clearStore(this.db, "students");
        await putMany(this.db, "students", p.students);
      }else if(k==="log.add" && p.log){
        try{
          await putMany(this.db, "logs", [p.log]);
        }catch(e){}
      }else if(k==="settings.update" && p.settings){
        this.state.settings = {...this.state.settings, ...p.settings};
        await setMeta(this.db, "settings", this.state.settings);
      }
    }

    // refresh caches
    this.state.students = await getAll(this.db, "students");
    this.state.logs = await getRecentByIndex(this.db, "logs", "at", 5000);
  },

  async clearAll(){
    await clearStore(this.db, "students");
    await clearStore(this.db, "logs");
    await clearStore(this.db, "outbox");
    await delMeta(this.db, "cursor");
    // keep defaults, clear secrets
    this.state.students = [];
    this.state.logs = [];
    this.state.settings = {...this.state.settings, proxyUrl:"", proxyKey:""};
    await setMeta(this.db, "settings", this.state.settings);
    this.emit();
  }
};
