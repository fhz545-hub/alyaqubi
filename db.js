const LS_KEY = "rsd_v4";
const nowISO = () => new Date().toISOString();

export const Store = {
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
      allowedLateMinutes: 10,
      managerName: "فهد حامد الزهراني",
      deputyName: "عدنان علي الزريق",
      counselorName: "عادل علي السبعان"
    }
  },

  load(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        const obj = JSON.parse(raw);
        this.state.students = obj.students || [];
        this.state.logs = obj.logs || [];
        this.state.settings = {...this.state.settings, ...(obj.settings||{})};
      }
    }catch(e){}
  },

  save(){
    localStorage.setItem(LS_KEY, JSON.stringify({
      students: this.state.students,
      logs: this.state.logs,
      settings: this.state.settings
    }));
  },

  hasStudents(){ return (this.state.students?.length||0) > 0; },

  setStudents(list){
    this.state.students = Array.isArray(list) ? list : [];
    this.save();
  },

  upsertStudent(s){
    const nid = String(s.nid||"").trim();
    if(!nid) return;
    const i = this.state.students.findIndex(x=>x.nid===nid);
    if(i>=0) this.state.students[i] = {...this.state.students[i], ...s};
    else this.state.students.push(s);
    this.save();
  },

  addLog(log){
    const id = "L"+Math.random().toString(16).slice(2)+Date.now();
    const item = { id, at: nowISO(), ...log };
    this.state.logs.unshift(item);
    // keep last 5000 by default
    if(this.state.logs.length > 5000) this.state.logs.length = 5000;
    this.save();
    return item;
  },

  getStudent(nid){
    nid = String(nid||"").trim();
    return this.state.students.find(s=>String(s.nid)===nid) || null;
  },

  normalizeName(s){
    return String(s||"")
      .replace(/[إأآا]/g,"ا")
      .replace(/ى/g,"ي")
      .replace(/ة/g,"ه")
      .replace(/[^\p{L}\p{N}]+/gu,"")
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
    res = res.slice(0, limit);
    return res;
  },

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
      ...this.state
    };
  },

  importBackup(obj){
    if(!obj) throw new Error("ملف النسخة غير صالح");
    const students = obj.students || [];
    const logs = obj.logs || [];
    const settings = obj.settings || {};
    this.state.students = students;
    this.state.logs = logs;
    this.state.settings = {...this.state.settings, ...settings};
    this.save();
  },

  clearAll(){
    localStorage.removeItem(LS_KEY);
    this.state.students = [];
    this.state.logs = [];
    // keep defaults
    this.state.settings = {...this.state.settings, proxyUrl:"", proxyKey:""};
    this.save();
  }
};
