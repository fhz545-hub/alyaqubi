
/**
 * Cloudflare Worker Proxy (Template)
 * - يمنع كشف توكن مزود الرسائل داخل التطبيق
 * - يسمح للتطبيق بالنداء على /balance و /sms
 *
 * الإعدادات (Workers → Settings → Variables / Secrets):
 * - APP_KEYS  (Variable)  مثال: key1,key2,key3   (مفاتيح مسموحة للتطبيق)
 * - PROVIDER_BASE_URL (Secret/Variable) مثال: https://api.example.com
 * - PROVIDER_TOKEN    (Secret)          توكن مزود الرسائل
 *
 * ملاحظة مهمة:
 * - الجزء الخاص بـ providerCall هو "قالب" — عدّل المسار/الحقول حسب مزودك.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-App-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    // App key auth
    const appKey = request.headers.get("X-App-Key") || "";
    const allowed = String(env.APP_KEYS || "").split(",").map(s=>s.trim()).filter(Boolean);
    if (!allowed.length || !allowed.includes(appKey)) {
      return json({ ok:false, message:"Unauthorized" }, 401, corsHeaders);
    }

    if (url.pathname === "/health") {
      return json({ ok:true }, 200, corsHeaders);
    }

    if (url.pathname === "/balance" && request.method === "GET") {
      // TODO: عدّل حسب مزودك (مثال)
      const data = await providerCall(env, {
        path: "/balance",
        method: "GET",
      });
      return json(data, data.ok ? 200 : 400, corsHeaders);
    }

    if (url.pathname === "/sms" && request.method === "POST") {
      const body = await request.json().catch(()=>null);
      if (!body?.to || !body?.message) {
        return json({ ok:false, message:"Missing to/message" }, 400, corsHeaders);
      }

      // TODO: عدّل حسب مزودك (مثال)
      const data = await providerCall(env, {
        path: "/sms/send",
        method: "POST",
        body: {
          to: body.to,
          message: body.message,
          sender: body.sender || "",
        }
      });
      return json(data, data.ok ? 200 : 400, corsHeaders);
    }

    return json({ ok:false, message:"Not Found" }, 404, corsHeaders);
  }
};

async function providerCall(env, { path, method="GET", body=null }) {
  const base = String(env.PROVIDER_BASE_URL || "").replace(/\/$/,"");
  const token = env.PROVIDER_TOKEN;
  if (!base || !token) {
    return { ok:false, message:"Provider config missing" };
  }

  // هذا مثال عام — عدّل Authorization حسب مزودك
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : null,
  });

  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    return { ok:false, message: data?.message || "Provider error", raw:data };
  }

  // حاول توحيد المخرجات
  return { ok:true, ...data };
}

function json(obj, status=200, headers={}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type":"application/json; charset=utf-8", ...headers }
  });
}
