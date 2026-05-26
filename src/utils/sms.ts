import { supabase } from "@/integrations/supabase/client";
import { formatSaudiPhone } from "@/utils/whatsapp";

interface SmsSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SmsBalanceResponse {
  success: boolean;
  balance?: number;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const getAuthToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
};

const getApiTokenFromSettings = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from("school_settings")
      .select("value")
      .eq("key", "sms_api_token")
      .maybeSingle();

    if (error) return null;
    const token = String(data?.value ?? "").trim();
    return token || null;
  } catch {
    return null;
  }
};

const getDirectBalance = async (apiToken: string): Promise<number | null> => {
  const endpoints = [
    { url: "https://app.mobile.net.sa/api/v1/get-balance", method: "POST" as const, body: {} },
    { url: "https://app.mobile.net.sa/api/v1/account/balance", method: "GET" as const },
    { url: "https://app.mobile.net.sa/api/v1/balance", method: "GET" as const },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: ep.method === "POST" ? JSON.stringify(ep.body ?? {}) : undefined,
      });

      if (!res.ok) continue;
      const d = await res.json();
      const bal = d?.data?.balance ?? d?.balance;
      if (bal !== undefined && bal !== null) {
        const parsed = Number(bal);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const invokeFn = async (
  fnName: string,
  body?: Record<string, unknown>,
  timeoutMs: number = 10000,
): Promise<{ data: unknown; error: string | null }> => {
  const token = await getAuthToken();
  if (!token) return { data: null, error: "غير مسجل الدخول" };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { data: null, error: "إعدادات الاتصال غير مكتملة" };

  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const raw = await res.text();
    const json = raw ? JSON.parse(raw) : null;

    if (!res.ok) {
      return { data: null, error: json?.error || json?.message || `خطأ ${res.status}` };
    }

    return { data: json, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: "انتهت مهلة الاتصال بالخدمة" };
    }
    const msg = err instanceof Error ? err.message : "فشل الاتصال بالخدمة";
    return { data: null, error: msg };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const sendSmsToGuardian = async (phone: string, message: string): Promise<SmsSendResponse> => {
  try {
    const normalizedPhone = formatSaudiPhone(phone);

    const { data, error } = await invokeFn("send-sms", {
      phone: normalizedPhone,
      message,
    });

    if (error) {
      return { success: false, error };
    }

    const result = data as { success?: boolean; messageId?: string; error?: string } | null;
    if (!result?.success) {
      return { success: false, error: result?.error || "تعذر إرسال الرسالة" };
    }

    return { success: true, messageId: result.messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطأ غير متوقع أثناء الإرسال";
    return { success: false, error: msg };
  }
};

export const getSmsBalance = async (): Promise<SmsBalanceResponse> => {
  try {
    const apiToken = await getApiTokenFromSettings();
    if (apiToken) {
      const directBalance = await getDirectBalance(apiToken);
      if (directBalance !== null) {
        return { success: true, balance: directBalance };
      }
    }

    const { data, error } = await invokeFn("get-sms-balance");

    if (error) {
      return { success: false, error };
    }

    const result = data as { success?: boolean; balance?: number; error?: string } | null;
    if (!result?.success || typeof result.balance !== "number") {
      return { success: false, error: result?.error || "تعذر قراءة الرصيد" };
    }

    return { success: true, balance: result.balance };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطأ غير متوقع أثناء جلب الرصيد";
    return { success: false, error: msg };
  }
};
