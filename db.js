// db.js - IndexedDB wrapper (بدون مكتبات)
const DB_NAME = "rsd_offline_db";
const DB_VERSION = 1;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      // meta: { key, value }
      const meta = db.createObjectStore("meta", { keyPath: "key" });

      // users: { username, passHash, role, perms, createdAt }
      const users = db.createObjectStore("users", { keyPath: "username" });

      // students: { studentNo, name, className, gradeNo, phone, createdAt, updatedAt }
      const students = db.createObjectStore("students", { keyPath: "studentNo" });
      students.createIndex("by_name", "name", { unique: false });
      students.createIndex("by_class", "className", { unique: false });

      // attendance logs
      const attendance = db.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
      attendance.createIndex("by_student", "studentNo", { unique: false });
      attendance.createIndex("by_date", "date", { unique: false });
      attendance.createIndex("by_type", "type", { unique: false });

      // behavior logs
      const behavior = db.createObjectStore("behavior", { keyPath: "id", autoIncrement: true });
      behavior.createIndex("by_student", "studentNo", { unique: false });
      behavior.createIndex("by_date", "date", { unique: false });
      behavior.createIndex("by_level", "level", { unique: false });

      // sms queue (optional)
      const sms = db.createObjectStore("sms", { keyPath: "id", autoIncrement: true });
      sms.createIndex("by_status", "status", { unique: false });
      sms.createIndex("by_student", "studentNo", { unique: false });

      // Create defaults (first run)
      meta.put({ key: "schoolName", value: "مدرسة" });
      meta.put({ key: "smsSettings", value: { provider: "madar_gw", mode: "ping", userName:"", userPassword:"", sender:"", apiKey:"", enabled:false }});
      meta.put({ key: "rulesVersion", value: 1 });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode="readonly"){ return db.transaction(store, mode).objectStore(store); }

async function dbGet(db, store, key){
  return new Promise((resolve, reject) => {
    const r = tx(db, store).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
async function dbPut(db, store, value){
  return new Promise((resolve, reject) => {
    const r = tx(db, store, "readwrite").put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbDelete(db, store, key){
  return new Promise((resolve, reject) => {
    const r = tx(db, store, "readwrite").delete(key);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}
async function dbAll(db, store){
  return new Promise((resolve, reject) => {
    const r = tx(db, store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function metaGet(db, key){
  const item = await dbGet(db, "meta", key);
  return item ? item.value : null;
}
async function metaSet(db, key, value){
  await dbPut(db, "meta", { key, value });
  return true;
}

export { openDB, dbGet, dbPut, dbDelete, dbAll, metaGet, metaSet };
