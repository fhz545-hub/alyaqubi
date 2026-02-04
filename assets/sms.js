
import { normalizePhone } from "./util.js";

export async function smsGetBalance(settings){
  const url = (settings.workerUrl || "").trim().replace(/\/$/,"");
  if(!url) throw new Error("ضع رابط الـ Worker أولًا");
  const res = await fetch(`${url}/balance`, {
    method:"GET",
    headers: {
      "X-App-Key": settings.appKey || ""
    }
  });
  const data = await safeJson(res);
  if(!res.ok) throw new Error(data?.message || "تعذر جلب الرصيد");
  return data;
}

export async function smsSend(settings, phone, message, sender){
  const url = (settings.workerUrl || "").trim().replace(/\/$/,"");
  if(!url) throw new Error("ضع رابط الـ Worker أولًا");
  const to = normalizePhone(phone);
  if(!to || to.length < 12) throw new Error("رقم الجوال غير صحيح");
  if(!message || String(message).trim().length < 2) throw new Error("اكتب نص الرسالة");
  const res = await fetch(`${url}/sms`, {
    method:"POST",
    headers: {
      "Content-Type":"application/json",
      "X-App-Key": settings.appKey || ""
    },
    body: JSON.stringify({
      to,
      message: String(message).trim(),
      sender: (sender || settings.sender || "").trim()
    })
  });
  const data = await safeJson(res);
  if(!res.ok) throw new Error(data?.message || "تعذر الإرسال");
  return data;
}

async function safeJson(res){
  try{ return await res.json(); }catch{ return {}; }
}

export function whatsappLink(phone, text){
  const to = normalizePhone(phone);
  const msg = encodeURIComponent(String(text||"").trim());
  // WhatsApp expects phone without + sign, usually country code
  return `https://wa.me/${to}?text=${msg}`;
}
