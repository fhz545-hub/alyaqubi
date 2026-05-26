import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Hard guard: if a principal already exists, this endpoint must do nothing
    // and must not leak whether one exists.  This protects the one-time-setup
    // path from being abused by unauthenticated callers.
    const { data: existingPrincipal } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_principal", true)
      .limit(1);

    if (existingPrincipal && existingPrincipal.length > 0) {
      // Generic 403 — do not disclose principal existence to unauthenticated callers.
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First-time setup is gated by a server-side shared secret only the
    // operator knows.  Without the secret no principal account can be created.
    const setupSecret = Deno.env.get("PRINCIPAL_SETUP_SECRET");
    const provided = req.headers.get("x-setup-secret") ?? "";
    if (!setupSecret || provided !== setupSecret) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string" || password.length < 12) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the principal user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create principal profile
    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: authData.user.id,
      full_name: "فهد حامد الزهراني",
      role_title: "مدير المدرسة",
      national_id: "1024193532",
      phone: "0504532489",
      approved: true,
      is_principal: true,
    });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "تم إنشاء حساب المدير بنجاح" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
