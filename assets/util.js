
export function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export function fmtTs(ts){
  try{
    const d=new Date(ts);
    return d.toLocaleString("ar-SA",{hour:"2-digit",minute:"2-digit",year:"numeric",month:"2-digit",day:"2-digit"});
  }catch{
    return "";
  }
}

export function normalizeArabic(s){
  if(!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g,"")  // harakat
    .replace(/\u0640/g,"")                // tatweel
    .replace(/[إأآا]/g,"ا")
    .replace(/ى/g,"ي")
    .replace(/ة/g,"ه")
    .replace(/ؤ/g,"و")
    .replace(/ئ/g,"ي")
    .replace(/بن\s+/g,"بن ")
    .replace(/[^0-9a-z\u0600-\u06FF ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

export function safeNid(s){
  if(!s) return "";
  return String(s).replace(/\D/g,"").trim();
}

export function toast(msg, ms=2200){
  const el=document.getElementById("toast");
  el.textContent=msg;
  el.style.display="block";
  clearTimeout(window.__toastT);
  window.__toastT=setTimeout(()=>{el.style.display="none"}, ms);
}

export function downloadText(filename, text, mime="application/json"){
  const blob = new Blob([text], {type:mime});
  const a=document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 600);
}

export function readFileText(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=()=>reject(fr.error);
    fr.readAsText(file);
  });
}

export function readFileArrayBuffer(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=()=>reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
}

export function normalizePhone(p){
  if(!p) return "";
  let x = String(p).replace(/\D/g,"");
  // Saudi numbers often: 05xxxxxxxx, 9665xxxxxxxx
  if(x.startsWith("0") && x.length===10) x = "966" + x.slice(1);
  if(x.startsWith("9660")) x = "966" + x.slice(4);
  if(x.startsWith("5") && x.length===9) x = "966" + x;
  return x;
}
