// Sends a password-reset request notification to the school principal.
// Public function (no JWT) — invoked from the login screen by users who
// forgot their password. We do NOT email them directly; the principal
// reviews and resets via the existing admin-reset-password flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const civilId = String(body?.civil_id || "").replace(/\D/g, "");
    const fullName = String(body?.full_name || "").trim();
    const phone = String(body?.phone || "").trim();

    if (!email && !civilId) {
      return new Response(
        JSON.stringify({ ok: false, error: "يرجى إدخال البريد أو رقم الهوية" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: principals } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("is_principal", true)
      .limit(5);

    if (!principals || principals.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "تعذر العثور على حساب مدير المدرسة" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const title = "طلب إعادة تعيين كلمة المرور";
    const bodyText = [
      `الاسم: ${fullName || "غير محدد"}`,
      `البريد: ${email || "غير محدد"}`,
      `رقم الهوية: ${civilId || "غير محدد"}`,
      `الجوال: ${phone || "غير محدد"}`,
      "يرجى مراجعة الطلب وإعادة تعيين كلمة المرور من إدارة المستخدمين.",
    ].join("\n");

    const rows = principals.map((p) => ({
      user_id: p.user_id,
      title,
      body: bodyText,
      type: "password_reset_request",
    }));

    const { error: insErr } = await supabase.from("notifications").insert(rows);
    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});