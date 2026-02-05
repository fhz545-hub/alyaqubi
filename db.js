/* IndexedDB storage for students, attendance, behavior, weekly archives */
(function(){
  const DB_NAME = "yaqubi_rsd";
  const DB_VER  = 1;

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e)=>{
        const db = req.result;
        if(!db.objectStoreNames.contains("students")){
          const st = db.createObjectStore("students", { keyPath:"idNumber" });
          st.createIndex("by_grade", "gradeCode", { unique:false });
          st.createIndex("by_section", "section", { unique:false });
        }
        if(!db.objectStoreNames.contains("attendance")){
          const st = db.createObjectStore("attendance", { keyPath:"id", autoIncrement:true });
          st.createIndex("by_student", "idNumber", { unique:false });
          st.createIndex("by_date", "date", { unique:false });
          st.createIndex("by_type", "type", { unique:false });
        }
        if(!db.objectStoreNames.contains("behavior")){
          const st = db.createObjectStore("behavior", { keyPath:"id", autoIncrement:true });
          st.createIndex("by_student", "idNumber", { unique:false });
          st.createIndex("by_date", "date", { unique:false });
          st.createIndex("by_code", "code", { unique:false });
        }
        if(!db.objectStoreNames.contains("archives")){
          const st = db.createObjectStore("archives", { keyPath:"id" }); // id = weekStartISO
          st.createIndex("by_week", "weekStart", { unique:true });
        }
        if(!db.objectStoreNames.contains("meta")){
          db.createObjectStore("meta", { keyPath:"key" });
        }
      };
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    });
  }

  function tx(db, store, mode="readonly"){
    return db.transaction(store, mode).objectStore(store);
  }

  async function getAll(store){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const out=[];
      const req = tx(db, store).openCursor();
      req.onsuccess = ()=>{
        const c = req.result;
        if(!c) return resolve(out);
        out.push(c.value);
        c.continue();
      };
      req.onerror = ()=>reject(req.error);
    });
  }

  async function clearStore(store){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const req = tx(db, store, "readwrite").clear();
      req.onsuccess = ()=>resolve(true);
      req.onerror = ()=>reject(req.error);
    });
  }

  async function putMany(store, items){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const st = tx(db, store, "readwrite");
      let i=0;
      function next(){
        if(i>=items.length) return resolve(true);
        const req = st.put(items[i++]);
        req.onsuccess = next;
        req.onerror = ()=>reject(req.error);
      }
      next();
    });
  }

  async function countStore(store){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const req = tx(db, store).count();
      req.onsuccess = ()=>resolve(req.result||0);
      req.onerror = ()=>reject(req.error);
    });
  }

  async function getByKey(store, key){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const req = tx(db, store).get(key);
      req.onsuccess = ()=>resolve(req.result || null);
      req.onerror = ()=>reject(req.error);
    });
  }

  async function addOne(store, item){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const req = tx(db, store, "readwrite").add(item);
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    });
  }

  async function listByIndex(store, indexName, value){
    const db = await DB._dbP;
    return new Promise((resolve,reject)=>{
      const out=[];
      const idx = tx(db, store).index(indexName);
      const req = idx.openCursor(IDBKeyRange.only(value));
      req.onsuccess = ()=>{
        const c = req.result;
        if(!c) return resolve(out);
        out.push(c.value);
        c.continue();
      };
      req.onerror = ()=>reject(req.error);
    });
  }

  // DB API
  const DB = {
    _dbP: null,
    _studentsCache: null,

    async init(){
      if(!DB._dbP) DB._dbP = openDB();
      const db = await DB._dbP;
      // warm cache
      DB._studentsCache = await getAll("students");
      return db;
    },

    async refreshStudentsCache(){
      DB._studentsCache = await getAll("students");
      return DB._studentsCache;
    },

    async countStudents(){ return countStore("students"); },

    async seedStudents(students){
      await clearStore("students");
      await putMany("students", students);
      await DB.refreshStudentsCache();
    },

    async upsertStudents(students){
      await putMany("students", students);
      await DB.refreshStudentsCache();
    },

    async searchStudents(q, limit=50){
      q = String(q||"").trim();
      if(!q) return [];
      const nq = DB.normalize(q);
      const res = [];
      const list = DB._studentsCache || (await DB.refreshStudentsCache());
      for(const s of list){
        const hay = DB.normalize(`${s.name||""} ${s.idNumber||""} ${s.gradeLabel||""} ${s.section||""}`);
        if(hay.includes(nq)){
          res.push(s);
          if(res.length>=limit) break;
        }
      }
      return res;
    },

    async getStudent(idNumber){ return getByKey("students", String(idNumber)); },

    async listStudentsByClass(gradeCode, section){
      const list = DB._studentsCache || (await DB.refreshStudentsCache());
      return list.filter(s=>{
        const okG = !gradeCode || String(s.gradeCode||"")===String(gradeCode);
        const okS = !section || String(s.section||"")===String(section);
        return okG && okS;
      }).sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
    },

    async addAttendance(rec){
      return addOne("attendance", rec);
    },
    async addBehavior(rec){
      return addOne("behavior", rec);
    },

    async attendanceForStudent(idNumber){
      return listByIndex("attendance","by_student", String(idNumber));
    },
    async behaviorForStudent(idNumber){
      return listByIndex("behavior","by_student", String(idNumber));
    },

    async statsForStudent(idNumber){
      const at = await DB.attendanceForStudent(idNumber);
      const bh = await DB.behaviorForStudent(idNumber);
      let late=0, absent=0;
      for(const r of at){
        if(r.type==="LATE") late++;
        if(r.type==="ABSENT") absent++;
      }
      return {late, absent, behavior: bh.length};
    },

    async exportAll(){
      const students = await getAll("students");
      const attendance = await getAll("attendance");
      const behavior = await getAll("behavior");
      const meta = await getAll("meta");
      return {version:1, exportedAt: new Date().toISOString(), students, attendance, behavior, meta};
    },

    async importAll(payload){
      if(!payload || typeof payload!=="object") throw new Error("ملف غير صالح");
      if(Array.isArray(payload.students)) await DB.upsertStudents(payload.students);
      if(Array.isArray(payload.attendance)){
        await clearStore("attendance");
        await putMany("attendance", payload.attendance.map(x=>({...x, id: x.id||undefined})));
      }
      if(Array.isArray(payload.behavior)){
        await clearStore("behavior");
        await putMany("behavior", payload.behavior.map(x=>({...x, id: x.id||undefined})));
      }
    },

    async setMeta(key, value){
      const db = await DB._dbP;
      return new Promise((resolve,reject)=>{
        const req = tx(db,"meta","readwrite").put({key, value});
        req.onsuccess = ()=>resolve(true);
        req.onerror = ()=>reject(req.error);
      });
    },
    async getMeta(key){
      const r = await getByKey("meta", key);
      return r ? r.value : null;
    },

    normalize(s){
      return String(s||"")
        .toLowerCase()
        .replace(/[أإآ]/g,"ا")
        .replace(/ى/g,"ي")
        .replace(/ة/g,"ه")
        .replace(/بن/g,"")
        .replace(/\s+/g,"")
        .trim();
    }
  };

  window.DB = DB;
})();
