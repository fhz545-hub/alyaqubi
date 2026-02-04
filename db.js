// db.js - IndexedDB wrapper (offline persistent storage)
const DB_NAME = "yaqubi_rsd_db";
const DB_VERSION = 3;

function reqToPromise(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
function txDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
    tx.onabort = ()=>reject(tx.error || new Error("Transaction aborted"));
  });
}

export async function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      // meta store (settings, users, etc.)
      if(!db.objectStoreNames.contains("meta")){
        db.createObjectStore("meta", { keyPath: "key" });
      }
      // students: key by studentNo (string)
      if(!db.objectStoreNames.contains("students")){
        const s = db.createObjectStore("students", { keyPath: "studentNo" });
        s.createIndex("name", "name", { unique:false });
        s.createIndex("classKey", "classKey", { unique:false });
      }
      // attendance records
      if(!db.objectStoreNames.contains("attendance")){
        const a = db.createObjectStore("attendance", { keyPath: "id", autoIncrement:true });
        a.createIndex("studentNo", "studentNo", { unique:false });
        a.createIndex("date", "date", { unique:false });
      }
      // behavior records
      if(!db.objectStoreNames.contains("behavior")){
        const b = db.createObjectStore("behavior", { keyPath: "id", autoIncrement:true });
        b.createIndex("studentNo", "studentNo", { unique:false });
        b.createIndex("date", "date", { unique:false });
      }
      // outbound message queue (SMS)
      if(!db.objectStoreNames.contains("outbox")){
        const o = db.createObjectStore("outbox", { keyPath:"id", autoIncrement:true });
        o.createIndex("status", "status", { unique:false }); // queued, sent, failed
        o.createIndex("channel", "channel", { unique:false }); // sms, whatsapp
        o.createIndex("createdAt", "createdAt", { unique:false });
      }
      // audit log
      if(!db.objectStoreNames.contains("audit")){
        const l = db.createObjectStore("audit", { keyPath:"id", autoIncrement:true });
        l.createIndex("at", "at", { unique:false });
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

export class DB {
  constructor(db){ this.db = db; }

  static async create(){
    return new DB(await openDB());
  }

  // ------- meta helpers -------
  async getMeta(key){
    const tx = this.db.transaction("meta","readonly");
    const store = tx.objectStore("meta");
    const res = await reqToPromise(store.get(key));
    await txDone(tx);
    return res ? res.value : undefined;
  }

  async setMeta(key, value){
    const tx = this.db.transaction("meta","readwrite");
    const store = tx.objectStore("meta");
    store.put({ key, value });
    await txDone(tx);
    return true;
  }

  // ------- students -------
  async upsertStudents(students){
    const tx = this.db.transaction(["students"], "readwrite");
    const store = tx.objectStore("students");
    let inserted = 0;
    for(const st of students){
      if(!st || !st.studentNo || !st.name) continue;
      store.put(st);
      inserted++;
    }
    await txDone(tx);
    return inserted;
  }

  async countStudents(){
    const tx = this.db.transaction("students","readonly");
    const store = tx.objectStore("students");
    const c = await reqToPromise(store.count());
    await txDone(tx);
    return c;
  }

  async getStudent(studentNo){
    const tx = this.db.transaction("students","readonly");
    const store = tx.objectStore("students");
    const st = await reqToPromise(store.get(String(studentNo)));
    await txDone(tx);
    return st || null;
  }

  async deleteStudent(studentNo){
    const key = String(studentNo);
    const tx = this.db.transaction(["students","attendance","behavior"],"readwrite");
    tx.objectStore("students").delete(key);

    // also remove related records (best effort)
    for(const storeName of ["attendance","behavior"]){
      const store = tx.objectStore(storeName);
      const idx = store.index("studentNo");
      const req = idx.openCursor(IDBKeyRange.only(key));
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(cur){ cur.delete(); cur.continue(); }
      };
    }
    await txDone(tx);
    return true;
  }

  async searchStudents(query, limit=40){
    const q = String(query||"").trim();
    if(!q || q.length < 2) return [];
    const qNorm = normalizeArabic(q);
    const out = [];
    const tx = this.db.transaction("students","readonly");
    const store = tx.objectStore("students");

    // Fast path: if mostly digits, match studentNo contains
    const digits = q.replace(/\D/g,"");
    if(digits.length >= 4){
      const req = store.openCursor();
      await new Promise((resolve)=>{
        req.onsuccess = (e)=>{
          const cur = e.target.result;
          if(!cur) return resolve();
          const st = cur.value;
          if(String(st.studentNo).includes(digits) || String(st.phone||"").includes(digits)){
            out.push(st);
          }
          if(out.length >= limit) return resolve();
          cur.continue();
        };
        req.onerror = ()=>resolve();
      });
      await txDone(tx);
      return out;
    }

    // Name search (contains)
    const req = store.openCursor();
    await new Promise((resolve)=>{
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(!cur) return resolve();
        const st = cur.value;
        const n = normalizeArabic(st.name||"");
        if(n.includes(qNorm)) out.push(st);
        if(out.length >= limit) return resolve();
        cur.continue();
      };
      req.onerror = ()=>resolve();
    });
    await txDone(tx);
    return out;
  }

  // ------- attendance / behavior -------
  async addAttendance(rec){
    const tx = this.db.transaction(["attendance","audit"],"readwrite");
    rec.createdAt = rec.createdAt || new Date().toISOString();
    tx.objectStore("attendance").add(rec);
    tx.objectStore("audit").add({ at: rec.createdAt, type:"attendance", studentNo: rec.studentNo, payload: rec });
    await txDone(tx);
    return true;
  }

  async addBehavior(rec){
    const tx = this.db.transaction(["behavior","audit"],"readwrite");
    rec.createdAt = rec.createdAt || new Date().toISOString();
    tx.objectStore("behavior").add(rec);
    tx.objectStore("audit").add({ at: rec.createdAt, type:"behavior", studentNo: rec.studentNo, payload: rec });
    await txDone(tx);
    return true;
  }

  async recentAudit(limit=20){
    const tx = this.db.transaction("audit","readonly");
    const store = tx.objectStore("audit");
    const idx = store.index("at");
    const res = [];
    await new Promise((resolve)=>{
      const req = idx.openCursor(null, "prev");
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(!cur) return resolve();
        res.push(cur.value);
        if(res.length >= limit) return resolve();
        cur.continue();
      };
      req.onerror = ()=>resolve();
    });
    await txDone(tx);
    return res;
  }

  async getRecords(storeName, studentNo, limit=50){
    const key = String(studentNo);
    const tx = this.db.transaction(storeName,"readonly");
    const store = tx.objectStore(storeName);
    const idx = store.index("studentNo");
    const res = [];
    await new Promise((resolve)=>{
      const req = idx.openCursor(IDBKeyRange.only(key), "prev");
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(!cur) return resolve();
        res.push(cur.value);
        if(res.length >= limit) return resolve();
        cur.continue();
      };
      req.onerror = ()=>resolve();
    });
    await txDone(tx);
    return res;
  }

  // ------- outbox (sms/whatsapp queued) -------
  async enqueueMessage(msg){
    const tx = this.db.transaction("outbox","readwrite");
    const store = tx.objectStore("outbox");
    msg.createdAt = msg.createdAt || new Date().toISOString();
    msg.status = msg.status || "queued";
    store.add(msg);
    await txDone(tx);
    return true;
  }

  async listOutbox(status="queued", limit=200){
    const tx = this.db.transaction("outbox","readonly");
    const store = tx.objectStore("outbox");
    const idx = store.index("status");
    const res = [];
    await new Promise((resolve)=>{
      const req = idx.openCursor(IDBKeyRange.only(status), "next");
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(!cur) return resolve();
        res.push(cur.value);
        if(res.length >= limit) return resolve();
        cur.continue();
      };
      req.onerror = ()=>resolve();
    });
    await txDone(tx);
    return res;
  }

  async updateOutbox(id, patch){
    const tx = this.db.transaction("outbox","readwrite");
    const store = tx.objectStore("outbox");
    const cur = await reqToPromise(store.get(id));
    if(!cur){ await txDone(tx); return false; }
    const next = { ...cur, ...patch };
    store.put(next);
    await txDone(tx);
    return true;
  }

  async clearOutbox(status="sent"){
    const tx = this.db.transaction("outbox","readwrite");
    const store = tx.objectStore("outbox");
    const idx = store.index("status");
    const req = idx.openCursor(IDBKeyRange.only(status));
    req.onsuccess = (e)=>{
      const cur = e.target.result;
      if(cur){ cur.delete(); cur.continue(); }
    };
    await txDone(tx);
    return true;
  }

  // ------- backup / restore -------
  async exportAll(){
    const dump = {};
    for(const name of ["meta","students","attendance","behavior","outbox","audit"]){
      dump[name] = await this._dumpStore(name);
    }
    dump._exportedAt = new Date().toISOString();
    dump._app = "yaqubi-rsd";
    return dump;
  }

  async importAll(dump){
    const tx = this.db.transaction(["meta","students","attendance","behavior","outbox","audit"],"readwrite");
    for(const name of ["meta","students","attendance","behavior","outbox","audit"]){
      const store = tx.objectStore(name);
      await new Promise((resolve)=>{
        const req = store.clear();
        req.onsuccess = ()=>resolve(true);
        req.onerror = ()=>resolve(true);
      });
      const arr = Array.isArray(dump?.[name]) ? dump[name] : [];
      for(const row of arr){
        try{ store.put(row); }catch(_){}
      }
    }
    await txDone(tx);
    return true;
  }

  async _dumpStore(name){
    const tx = this.db.transaction(name,"readonly");
    const store = tx.objectStore(name);
    const res = [];
    await new Promise((resolve)=>{
      const req = store.openCursor();
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if(!cur) return resolve();
        res.push(cur.value);
        cur.continue();
      };
      req.onerror = ()=>resolve();
    });
    await txDone(tx);
    return res;
  }
}

// ---- helpers ----
export function normalizeArabic(str){
  return String(str||"")
    .toLowerCase()
    .replace(/[إأآا]/g,"ا")
    .replace(/ى/g,"ي")
    .replace(/ؤ/g,"و")
    .replace(/ئ/g,"ي")
    .replace(/ة/g,"ه")
    .replace(/ـ/g,"")
    .replace(/[^\u0600-\u06FF0-9a-z\s]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
