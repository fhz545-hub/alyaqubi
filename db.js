export const DB_NAME = "rsd_offline_db";
export const DB_VER = 1;

export const STORES = [
  "students",
  "attendance_events",
  "behavior_events",
  "users",
  "sms_queue",
  "audit_log",
  "settings"
];

export function uid(prefix="id"){
  return `${prefix}_${crypto.randomUUID()}`;
}

export function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = ()=>{
      const db = req.result;

      const students = db.createObjectStore("students", { keyPath:"studentId" });
      students.createIndex("byName", "name");
      students.createIndex("byClass", ["grade","classroom"]);

      const att = db.createObjectStore("attendance_events", { keyPath:"id" });
      att.createIndex("byStudentDate", ["studentId","dateISO"]);
      att.createIndex("byDate", "dateISO");

      const beh = db.createObjectStore("behavior_events", { keyPath:"id" });
      beh.createIndex("byStudentDate", ["studentId","dateISO"]);
      beh.createIndex("byDate", "dateISO");

      db.createObjectStore("users", { keyPath:"userId" });
      db.createObjectStore("sms_queue", { keyPath:"id" });
      db.createObjectStore("audit_log", { keyPath:"id" });
      db.createObjectStore("settings", { keyPath:"key" });
    };

    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}

export function tx(db, store, mode, fn){
  return new Promise((resolve, reject)=>{
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = ()=>resolve(out);
    t.onerror = ()=>reject(t.error);
  });
}

export async function put(db, store, value){
  await tx(db, store, "readwrite", s=>s.put(value));
}

export async function get(db, store, key){
  return new Promise((resolve, reject)=>{
    const t = db.transaction(store, "readonly");
    const s = t.objectStore(store);
    const r = s.get(key);
    r.onsuccess = ()=>resolve(r.result || null);
    r.onerror = ()=>reject(r.error);
  });
}

export async function del(db, store, key){
  await tx(db, store, "readwrite", s=>s.delete(key));
}

export async function all(db, store){
  return new Promise((resolve, reject)=>{
    const t = db.transaction(store, "readonly");
    const s = t.objectStore(store);
    const r = s.getAll();
    r.onsuccess = ()=>resolve(r.result || []);
    r.onerror = ()=>reject(r.error);
  });
}

export async function byIndexRange(db, store, indexName, lower, upper){
  return new Promise((resolve, reject)=>{
    const t = db.transaction(store, "readonly");
    const s = t.objectStore(store).index(indexName);
    const range = IDBKeyRange.bound(lower, upper);
    const r = s.getAll(range);
    r.onsuccess = ()=>resolve(r.result || []);
    r.onerror = ()=>reject(r.error);
  });
}

export async function setSetting(db, key, value){
  await put(db, "settings", { key, value });
}
export async function getSetting(db, key, fallback=null){
  const item = await get(db, "settings", key);
  return item ? item.value : fallback;
}
