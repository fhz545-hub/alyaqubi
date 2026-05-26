import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://app.mobile.net.sa/api/v1";

type AuthVariant = {
  mode: "bearer" | "raw";
  headerValue: string;
};

const jsonReply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonSafe = (raw: string): any => {
  try { return JSON.parse(raw); } catch { return null; }
};

const toAuthVariants = (token: string): AuthVariant[] => {
  const rawToken = token.replace(/^bearer\s+/i, "").trim();
  return [
    { mode: "bearer", headerValue: `Bearer ${rawToken}` },
    { mode: "raw", headerValue: rawToken },
  ];
};

const extractBalance = (data: any): number | null => {
  const value = data?.data?.balance ?? data?.balance;
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawToken = String(Deno.env.get("SMS_API_TOKEN") ?? "");
    const token = rawToken.replace(/^[\s"']+|[\s"']+$/g, "").replace(/[\r\n\t]/g, "");
    if (!token) {
      return jsonReply({ success: false, error: "SMS_API_TOKEN غير مضبوط" }, 500);
    }

    const authVariants = toAuthVariants(token);
    const senderName = String(Deno.env.get("SMS_SENDER_NAME") ?? "").trim();

    const endpoints: Array<{ url: string; method: "POST" | "GET"; body?: Record<string, unknown> }> = [
      {
        url: `${BASE_URL}/get-balance`,
        method: "POST",
        body: senderName ? { senderName } : {},
      },
      { url: `${BASE_URL}/get-balance`, method: "POST", body: {} },
      { url: `${BASE_URL}/account/balance`, method: "GET" },
    ];

    const attempts: Array<{ endpoint: string; authMode: string; status: number; response: string }> = [];

    for (const ep of endpoints) {
      for (const variant of authVariants) {
        try {
          const res = await fetch(ep.url, {
            method: ep.method,
            headers: {
              Authorization: variant.headerValue,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: ep.method === "POST" ? JSON.stringify(ep.body ?? {}) : undefined,
          });

          const raw = await res.text();
          const data = parseJsonSafe(raw);
          const balance = extractBalance(data);

          console.log(
            `[SMS-Balance] ${ep.method} ${ep.url} auth=${variant.mode} => ${res.status}: ${raw.substring(0, 200)}`,
          );

          attempts.push({
            endpoint: `${ep.method} ${ep.url}`,
            authMode: variant.mode,
            status: res.status,
            response: raw.substring(0, 200),
          });

          if (res.ok && balance !== null) {
            return jsonReply({ success: true, balance });
          }
        } catch (e) {
          console.log(`[SMS-Balance] ${ep.method} ${ep.url} auth=${variant.mode} => error: ${e}`);
        }
      }
    }

    return jsonReply(
      {
        success: false,
        error: "تعذر جلب الرصيد من Orbit",
        attempts,
      },
      502,
    );
  } catch (err) {
    console.error("[SMS-Balance] Unexpected:", err);
    return jsonReply({ success: false, error: err instanceof Error ? err.message : "خطأ غير متوقع" }, 500);
  }
});
