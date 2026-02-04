// sms.js - outbound messaging (SMS/WhatsApp helpers)
// Important: sending SMS requires internet + an SMS gateway endpoint. The app can queue messages offline.

export function normalizeKSA(msisdn){
  let p = String(msisdn||"").trim().replace(/[^\d]/g,"");
  if(!p) return "";
  // common patterns: 05xxxxxxxx -> 9665xxxxxxxx
  if(p.startsWith("00")) p = p.slice(2);
  if(p.startsWith("9660")) p = "966" + p.slice(4);
  if(p.startsWith("0") && p.length===10 && p[1]==="5") p = "966" + p.slice(1);
  if(p.startsWith("5") && p.length===9) p = "966" + p;
  // if already 966...
  return p;
}

export function waLink(phone, text){
  const p = normalizeKSA(phone);
  const msg = encodeURIComponent(text||"");
  return `https://wa.me/${p}?text=${msg}`;
}

export function buildUrlFromTemplate(template, vars){
  let url = String(template||"");
  for(const [k,v] of Object.entries(vars||{})){
    url = url.replaceAll(`{${k}}`, encodeURIComponent(String(v ?? "")));
  }
  return url;
}

export async function sendSmsNoCors(url){
  if(!navigator.onLine) throw new Error("OFFLINE");
  // no-cors: we can't read response, but most gateways accept the request.
  await fetch(url, { method:"GET", mode:"no-cors", cache:"no-store" });
  return true;
}

/**
 * settings:
 *  - template: URL template with placeholders: {username},{password},{sender},{numbers},{message}
 *  - bulk: true -> send one request with numbers joined by comma
 */
export async function sendSmsBatch({settings, sender, username, password, items, onProgress}){
  const tmpl = settings?.template || "";
  if(!tmpl) throw new Error("NO_TEMPLATE");
  const bulk = !!settings?.bulk;

  if(bulk){
    const numbers = items.map(x=>normalizeKSA(x.phone)).filter(Boolean).join(",");
    const message = items[0]?.message || "";
    const url = buildUrlFromTemplate(tmpl, { sender, username, password, numbers, message });
    await sendSmsNoCors(url);
    onProgress && onProgress({ sent: items.length, total: items.length });
    return { sent: items.length, failed: 0 };
  }

  let sent = 0, failed = 0;
  for(let i=0;i<items.length;i++){
    const it = items[i];
    const numbers = normalizeKSA(it.phone);
    const message = it.message || "";
    const url = buildUrlFromTemplate(tmpl, { sender, username, password, numbers, message });
    try{
      await sendSmsNoCors(url);
      sent++;
    }catch(e){
      failed++;
    }
    onProgress && onProgress({ sent, failed, total: items.length, index: i+1 });
    // polite delay
    await sleep(250);
  }
  return { sent, failed };
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
