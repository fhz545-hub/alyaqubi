// Public edge function: checks if a 10-digit civil_id exists in active teachers.
// Used during self-registration to gate sign-ups to known staff only.
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
    const civilId = String(body?.civil_id || "").replace(/\D/g, "");
    if (civilId.length !== 10) {
      return new Response(
        JSON.stringify({ exists: false, error: "رقم الهوية يجب أن يكون 10 أرقام" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await supabase
      .from("teachers")
      .select("full_name, civil_id, active")
      .eq("civil_id", civilId)
      .eq("active", true)
      .maybeSingle();
    if (error) {
      return new Response(JSON.stringify({ exists: false, error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!data) {
      return new Response(
        JSON.stringify({ exists: false, error: "رقم الهوية غير موجود في قاعدة بيانات المعلمين" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ exists: true, full_name: data.full_name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ exists: false, error: String(err?.message || err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});