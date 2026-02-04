
export function detectDelimiter(text){
  const line = (text.split(/\r?\n/).find(l=>l.trim().length) || "");
  const candidates = [",",";","\t","|"];
  let best=",", bestCount=-1;
  for(const c of candidates){
    const n = line.split(c).length;
    if(n>bestCount){
      bestCount=n;
      best=c;
    }
  }
  return best;
}

export function parseCSV(text){
  // Simple CSV parser with quote handling
  const delim = detectDelimiter(text);
  const rows=[];
  let i=0, field="", row=[], inQ=false;
  const pushField=()=>{ row.push(field); field=""; };
  const pushRow=()=>{ rows.push(row); row=[]; };
  while(i<text.length){
    const ch=text[i];
    if(inQ){
      if(ch === '"'){
        if(text[i+1] === '"'){ field+='"'; i+=2; continue; }
        inQ=false; i++; continue;
      }
      field+=ch; i++; continue;
    }else{
      if(ch === '"'){ inQ=true; i++; continue; }
      if(ch === delim){ pushField(); i++; continue; }
      if(ch === "\n"){
        pushField(); pushRow(); i++; continue;
      }
      if(ch === "\r"){ i++; continue; }
      field+=ch; i++; continue;
    }
  }
  pushField(); pushRow();

  // remove empty trailing rows
  while(rows.length && rows[rows.length-1].every(x=>String(x||"").trim()==="")) rows.pop();

  const headers = (rows.shift()||[]).map(h=>String(h||"").trim());
  const data = rows.map(r=>{
    const o={};
    for(let j=0;j<headers.length;j++){
      o[headers[j] || `col_${j+1}`] = (r[j]??"").toString().trim();
    }
    return o;
  });
  return {headers, data, delim};
}

export function guessHeader(headers, kind){
  const h = headers.map(x=>String(x||""));
  const norm = s => s.replace(/\s+/g,"").toLowerCase();
  const H = h.map(norm);
  const pick = (...cands)=>{
    for(const c of cands){
      const idx = H.findIndex(x=>x.includes(norm(c)));
      if(idx>=0) return h[idx];
    }
    return "";
  };
  if(kind==="name") return pick("اسم الطالب","الاسم","name","studentname","student_name");
  if(kind==="nid") return pick("رقم الهوية","الهوية","رقم السجل","nid","nationalid","student_id","رقمالهوية");
  if(kind==="grade") return pick("الصف","المرحلة","grade","class","الصف الدراسي");
  if(kind==="section") return pick("الشعبة","فصل","section","group","الشعبه");
  return "";
}
