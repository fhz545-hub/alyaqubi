// sms.js - ربط اختياري مع مزود SMS (المدار التقني) عبر بوابة MobileNet
// تنبيه: بعض مزودي الرسائل يمنعون CORS من المتصفح. لهذا يوجد وضعان:
// 1) mode = 'fetch' (يرجع استجابة إن سمح CORS)
// 2) mode = 'ping'  (يرسل الطلب عبر Image بدون قراءة الاستجابة)
// يفضّل دائمًا استخدام وسيط Backend لحماية بيانات الدخول.

function buildMadarGWUrl({userName, userPassword, sender, apiKey}, to, msg){
  // وفق أمثلة بوابة MobileNet (بوابة الرسائل القصيرة) – قد تختلف الحقول حسب الاشتراك
  const base = "https://mobile.net.sa/sms/gw";
  const params = new URLSearchParams();
  if(apiKey) params.set("apiKey", apiKey);
  if(userName) params.set("userName", userName);
  if(userPassword) params.set("userPassword", userPassword);
  if(sender) params.set("userSender", sender);
  params.set("numbers", String(to).trim());
  params.set("msg", msg);
  return `${base}/?${params.toString()}`;
}

async function sendSMS(settings, to, msg){
  const url = buildMadarGWUrl(settings, to, msg);
  if(settings.mode === "fetch"){
    const res = await fetch(url, { method:"GET" });
    const text = await res.text();
    return { ok: res.ok, provider: "madar_gw", url, responseText: text.slice(0, 400) };
  }

  // ping mode: لا يقرأ الاستجابة (لتجاوز CORS)
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(true);
    img.src = url + "&_=" + Date.now();
  });
  return { ok: true, provider: "madar_gw", url, responseText: "PING_SENT" };
}

export { sendSMS, buildMadarGWUrl };
