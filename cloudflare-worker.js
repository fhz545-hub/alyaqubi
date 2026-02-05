/**
 * yaqubi-sms-proxy (Cloudflare Worker)
 * Proxy آمن لواجهة Mobile.net.sa بدون كشف التوكن في GitHub أو داخل المتصفح.
 *
 * Secrets (Settings → Variables):
 *  - MOBILE_TOKEN  : Bearer token من مزود الـ SMS
 *  - PROXY_KEY     : مفتاح حماية ترسله من تطبيقك في الهيدر X-Proxy-Key
 *  - API_BASE      : https://app.mobile.net.sa/api/v1   (اختياري)
 *  - ALLOWED_ORIGINS : قائمة Origins مفصولة بفواصل (اختياري)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CORS
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s=>s.trim()).filter(Boolean);
    const corsOrigin = (allowed.includes("*") || allowed.includes(origin)) ? (origin || "*") : "null";

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, X-Proxy-Key",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- حماية بالمفتاح
    const clientKey = request.headers.get("X-Proxy-Key") || "";
    if (!env.PROXY_KEY || clientKey !== env.PROXY_KEY) {
      return new Response(JSON.stringify({ status: "Failed", message: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const API_BASE = env.API_BASE || "https://app.mobile.net.sa/api/v1";
    const path = url.pathname.replace(/\/+$/,"");

    // مسارات مبسطة:
    // POST /send            → /send
    // POST /get-balance     → /get-balance
    // POST /message-status  → /message-status/{id}
    // POST /message-report  → /message-report/{id}

    const routeMap = {
      "/send": "/send",
      "/get-balance": "/get-balance",
    };

    let targetPath = routeMap[path];
    if(!targetPath){
      // dynamic routes
      if(path.startsWith("/message-status/")){
        const id = path.split("/").pop();
        targetPath = "/message-status/" + encodeURIComponent(id);
      } else if(path.startsWith("/message-report/")){
        const id = path.split("/").pop();
        targetPath = "/message-report/" + encodeURIComponent(id);
      } else {
        return new Response(JSON.stringify({ status:"Failed", message:"Not found" }), {
          status: 404, headers: { "Content-Type":"application/json", ...corsHeaders }
        });
      }
    }

    const targetUrl = API_BASE + targetPath;

    const init = {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + env.MOBILE_TOKEN
      },
      body: request.method === "POST" ? await request.text() : undefined
    };

    const resp = await fetch(targetUrl, init);
    const text = await resp.text();

    return new Response(text, {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
