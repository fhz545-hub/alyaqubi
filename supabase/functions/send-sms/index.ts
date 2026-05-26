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

type ProviderAttempt = {
  endpoint: string;
  authMode: "bearer" | "raw";
  status: number;
  raw: string;
  data: any;
};

const normalizeSaudiNumber = (phone: string): string => {
  let clean = (phone || "").replace(/[^0-9]/g, "").trim();
  if (clean.startsWith("00")) clean = clean.slice(2);
  if (clean.startsWith("9660")) clean = `966${clean.slice(4)}`;
  else if (clean.startsWith("0")) clean = `966${clean.slice(1)}`;
  else if (clean.startsWith("5")) clean = `966${clean}`;
  else if (!clean.startsWith("966")) clean = `966${clean}`;

  if (clean.length !== 12 || !clean.startsWith("9665")) {
    console.warn(`[SMS] Phone number may be invalid: ${clean} (length=${clean.length})`);
  }

  return clean;
};

const jsonReply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonSafe = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const toAuthVariants = (token: string): AuthVariant[] => {
  const rawToken = token.replace(/^bearer\s+/i, "").trim();
  return [
    { mode: "bearer", headerValue: `Bearer ${rawToken}` },
    { mode: "raw", headerValue: rawToken },
  ];
};

const isProviderSuccess = (data: any, status: number): boolean => {
  if (status < 200 || status >= 300 || !data) return false;
  return data.status === "Success" || Boolean(data.data);
};

const callProviderWithAuthFallback = async (
  endpoint: string,
  body: Record<string, unknown>,
  authVariants: AuthVariant[],
): Promise<{ success: boolean; attempt?: ProviderAttempt; attempts: ProviderAttempt[] }> => {
  const attempts: ProviderAttempt[] = [];

  for (const variant of authVariants) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: variant.headerValue,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    const data = parseJsonSafe(raw);

    console.log(`[SMS] ${endpoint} auth=${variant.mode} status=${res.status} => ${raw.substring(0, 300)}`);

    const record: ProviderAttempt = {
      endpoint,
      authMode: variant.mode,
      status: res.status,
      raw,
      data,
    };
    attempts.push(record);

    if (isProviderSuccess(data, res.status)) {
      return { success: true, attempt: record, attempts };
    }
  }

  return { success: false, attempts };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawToken = String(Deno.env.get("SMS_API_TOKEN") ?? "");
    // Strip any hidden chars: quotes, newlines, whitespace, BOM
    const SMS_API_TOKEN = rawToken.replace(/^[\s"']+|[\s"']+$/g, "").replace(/[\r\n\t]/g, "");
    const hasHiddenChars = rawToken !== SMS_API_TOKEN;
    const tokenPreview = SMS_API_TOKEN.length > 8 
      ? `${SMS_API_TOKEN.substring(0, 4)}...${SMS_API_TOKEN.substring(SMS_API_TOKEN.length - 4)}` 
      : `[len=${SMS_API_TOKEN.length}]`;
    console.log(`[SMS] Token preview: ${tokenPreview}, length=${SMS_API_TOKEN.length}, rawLength=${rawToken.length}, hiddenChars=${hasHiddenChars}`);
    if (!SMS_API_TOKEN) {
      return jsonReply({ success: false, error: "SMS_API_TOKEN غير مضبوط" }, 500);
    }

    const SMS_SENDER_NAME = String(Deno.env.get("SMS_SENDER_NAME") ?? "").trim();
    if (!SMS_SENDER_NAME) {
      return jsonReply({ success: false, error: "SMS_SENDER_NAME غير مضبوط" }, 500);
    }

    const { phone, message } = await req.json();
    if (!phone || !message) {
      return jsonReply({ success: false, error: "phone و message مطلوبان" }, 400);
    }

    const normalizedPhone = normalizeSaudiNumber(String(phone));
    const authVariants = toAuthVariants(SMS_API_TOKEN);

    const sendBody = {
      number: normalizedPhone,
      senderName: SMS_SENDER_NAME,
      sendAtOption: "Now",
      messageBody: String(message),
      allow_duplicate: true,
    };

    console.log(
      `[SMS] Sending SMS => phone=${normalizedPhone}, sender=${SMS_SENDER_NAME}, msgLen=${String(message).length}`,
    );

    const sendResult = await callProviderWithAuthFallback("/send", sendBody, authVariants);
    if (sendResult.success && sendResult.attempt) {
      const data = sendResult.attempt.data;
      const msgData = data?.data?.message || data?.data;
      return jsonReply({
        success: true,
        messageId: msgData?.id || null,
        providerStatus: msgData?.status || data?.status || "Success",
      });
    }

    const bulkBody = {
      numbers: [normalizedPhone],
      senderName: SMS_SENDER_NAME,
      sendAtOption: "Now",
      messageBody: String(message),
      allow_duplicate: true,
    };

    const bulkResult = await callProviderWithAuthFallback("/send-bulk", bulkBody, authVariants);
    if (bulkResult.success && bulkResult.attempt) {
      const data = bulkResult.attempt.data;
      const msgData = Array.isArray(data?.data)
        ? data.data[0]
        : data?.data?.message || data?.data;
      return jsonReply({
        success: true,
        messageId: msgData?.id || null,
        providerStatus: msgData?.status || data?.status || "Success",
      });
    }

    const allAttempts = [...sendResult.attempts, ...bulkResult.attempts];
    const errorDetail =
      allAttempts.map((a) => a?.data?.message).find(Boolean) ||
      "فشل الإرسال من مزود الخدمة";

    const all500 = allAttempts.length > 0 && allAttempts.every((a) => a.status === 500);
    const hasAuthError = allAttempts.some((a) => a.status === 401 || a.status === 403);

    const hint = hasAuthError
      ? "تحقق من API Token وصلاحياته في حساب Orbit"
      : all500
        ? "مزود الخدمة أعاد Server Error. غالباً اسم المرسل غير معتمد أو الحساب غير مفعّل للإرسال عبر API"
        : "تحقق من اسم المرسل، تنسيق الرقم، وتفعيل API في حساب Orbit";

    console.warn(
      `[SMS] Provider rejected message. status=${hasAuthError ? 401 : allAttempts[0]?.status ?? 500}, hint=${hint}`,
    );

    return jsonReply(
      {
        success: false,
        error: errorDetail,
        hint,
        providerStatus: hasAuthError ? 401 : allAttempts.find((a) => a.status >= 400)?.status ?? 500,
        attempts: allAttempts.map((a) => ({
          endpoint: a.endpoint,
          authMode: a.authMode,
          status: a.status,
          response: a.raw.substring(0, 200),
        })),
      },
      200,
    );
  } catch (err) {
    console.error("[SMS] Unexpected error:", err);
    return jsonReply(
      {
        success: false,
        error: err instanceof Error ? err.message : "خطأ غير متوقع",
      },
      500,
    );
  }
});