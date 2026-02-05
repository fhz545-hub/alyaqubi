
/**
 * Cloudflare Worker: SMS Proxy (يحمي توكن مزود الرسائل)
 *
 * ✅ المبدأ:
 * - التطبيق (PWA) يرسل: to + message + sender + appKey إلى /send
 * - الـ Worker يتحقق من appKey
 * - ثم يرسل الطلب إلى مزود الـ SMS باستخدام التوكن (Secret) المخزن في Cloudflare فقط
 *
 * إعدادات (Variables / Secrets):
 * - APP_KEY            (Secret)  : مفتاح داخلي للتطبيق (طابقه مع إعدادات التطبيق)
 * - MOBILE_TOKEN       (Secret)  : توكن مزود الرسائل
 * - SMS_SEND_URL       (Variable): رابط الإرسال الكامل لدى المزود (مثال: https://app.mobile.net.sa/api/v1/messages )
 * - ALLOWED_ORIGINS    (Variable): نطاقات مسموحة (اختياري) مفصولة بفواصل
 *
 * ملاحظة:
 * - إن اختلفت صيغة المزود (payload/headers) عدّل دالة forwardToProvider فقط.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), request, env);
    }

    if (url.pathname === "/health") {
      return cors(json({ ok: true, name: "sms-proxy", time: new Date().toISOString() }), request, env);
    }

    if (url.pathname !== "/send") {
      return cors(json({ error: "Not Found" }, 404), request, env);
    }

    if (request.method !== "POST") {
      return cors(json({ error: "Method Not Allowed" }, 405), request, env);
    }

    // Optional: origin allowlist
    if (!originAllowed(request, env)) {
      return cors(json({ error: "Origin not allowed" }, 403), request, env);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return cors(json({ error: "Invalid JSON" }, 400), request, env);
    }

    const to = (body.to || "").toString().replace(/\D/g, "");
    const message = (body.message || "").toString().trim();
    const sender = (body.sender || "").toString().trim();
    const appKey = (body.appKey || "").toString().trim();

    if (!to || to.length < 9) return cors(json({ error: "Invalid 'to' number" }, 400), request, env);
    if (!message || message.length < 2) return cors(json({ error: "Empty message" }, 400), request, env);

    if (env.APP_KEY && appKey !== env.APP_KEY) {
      return cors(json({ error: "Unauthorized (bad appKey)" }, 401), request, env);
    }

    if (!env.MOBILE_TOKEN) {
      return cors(json({ error: "Missing provider token (MOBILE_TOKEN)" }, 500), request, env);
    }
    if (!env.SMS_SEND_URL) {
      return cors(json({ error: "Missing SMS_SEND_URL" }, 500), request, env);
    }

    try {
      const providerRes = await forwardToProvider(env, { to, message, sender });
      return cors(providerRes, request, env);
    } catch (err) {
      return cors(json({ error: err.message || "Provider error" }, 502), request, env);
    }
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function cors(res, request, env) {
  const origin = request.headers.get("Origin") || "*";
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean) : null;
  const allowOrigin = allowed ? (allowed.includes(origin) ? origin : "null") : "*";

  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}

function originAllowed(request, env) {
  if (!env.ALLOWED_ORIGINS) return true;
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}

async function forwardToProvider(env, { to, message, sender }) {
  // ⚠️ عدّل هذه الدالة إذا كان مزودك يحتاج صيغة مختلفة
  const payload = sender ? { to, message, sender } : { to, message };

  const res = await fetch(env.SMS_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.MOBILE_TOKEN
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error || data?.message || ("HTTP " + res.status);
    throw new Error(msg);
  }

  return json({ ok: true, provider: data }, 200);
}
