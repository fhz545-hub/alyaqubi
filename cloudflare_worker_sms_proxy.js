/**
 * Cloudflare Worker: SMS Proxy for mobile.net.sa (or similar)
 * - hides vendor token (MOBILE_TOKEN) from the client
 * - CORS enabled
 * - protected by X-Proxy-Key header (PROXY_KEY)
 *
 * Required Secrets/Vars:
 * - MOBILE_TOKEN (Secret)
 * - API_BASE (Variable) e.g. https://app.mobile.net.sa/api/v1
 * - PROXY_KEY (Secret) any strong random string
 * - ALLOW_ORIGINS (Variable, optional) e.g. https://fhz545.workers.dev,https://your-gh-pages-domain
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const origin = request.headers.get("Origin") || "";
    const allowList = (env.ALLOW_ORIGINS || "*").split(",").map(s=>s.trim()).filter(Boolean);
    const allowOrigin = allowList.includes("*") ? "*" : (allowList.includes(origin) ? origin : allowList[0] || "*");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowOrigin),
      });
    }

    // Basic routing
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "yaqubi-sms-proxy" }, 200, allowOrigin);
    }

    if (url.pathname !== "/send") {
      return json({ ok:false, error:"Not Found" }, 404, allowOrigin);
    }

    if (request.method !== "POST") {
      return json({ ok:false, error:"Method Not Allowed" }, 405, allowOrigin);
    }

    // حماية بمفتاح
    const key = request.headers.get("X-Proxy-Key") || request.headers.get("x-proxy-key") || "";
    if (!env.PROXY_KEY || key !== env.PROXY_KEY) {
      return json({ ok:false, error:"Unauthorized" }, 401, allowOrigin);
    }

    // Parse payload
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok:false, error:"Invalid JSON" }, 400, allowOrigin);
    }

    const to = String(body.to || body.number || "").trim();
    const message = String(body.message || body.text || "").trim();

    if (!to || !message) {
      return json({ ok:false, error:"to/message required" }, 400, allowOrigin);
    }

    // Vendor call (adjust endpoint/fields per mobile.net.sa docs)
    const apiBase = (env.API_BASE || "https://app.mobile.net.sa/api/v1").replace(/\/$/, "");
    const vendorUrl = apiBase + "/messages"; // قد تحتاج تغييره حسب توثيق المزود

    const vendorRes = await fetch(vendorUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + env.MOBILE_TOKEN,
      },
      body: JSON.stringify({
        to,
        message,
      }),
    });

    const vendorText = await vendorRes.text();
    let vendorJson = null;
    try { vendorJson = JSON.parse(vendorText); } catch(e) {}

    if (!vendorRes.ok) {
      return json({ ok:false, error:"Vendor error", status: vendorRes.status, details: vendorJson || vendorText }, 502, allowOrigin);
    }

    return json({ ok:true, vendor: vendorJson || vendorText }, 200, allowOrigin);
  }
};

function corsHeaders(allowOrigin){
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "content-type, x-proxy-key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, allowOrigin){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", ...corsHeaders(allowOrigin) }
  });
}
