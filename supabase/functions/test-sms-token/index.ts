import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = String(Deno.env.get("SMS_API_TOKEN") ?? "").trim();
    const tokenTest = String(Deno.env.get("SMS_API_TOKEN_TEST") ?? "").trim();
    
    const useToken = tokenTest || token;
    
    console.log(`[Test] Token length=${useToken.length}, preview=${useToken.substring(0,4)}...${useToken.substring(useToken.length-4)}`);
    console.log(`[Test] Token hex bytes:`, Array.from(new TextEncoder().encode(useToken.substring(0,8))).map(b => b.toString(16).padStart(2,'0')).join(' '));
    
    // Test 1: Exactly like Postman - minimal headers
    const res1 = await fetch("https://app.mobile.net.sa/api/v1/get-balance", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${useToken}`,
        "Accept": "application/json",
      },
    });
    const text1 = await res1.text();
    console.log(`[Test1] No body, minimal headers => status=${res1.status}, body=${text1.substring(0,200)}`);

    // Test 2: With Content-Type but no body
    const res2 = await fetch("https://app.mobile.net.sa/api/v1/get-balance", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${useToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });
    const text2 = await res2.text();
    console.log(`[Test2] No body, with Content-Type => status=${res2.status}, body=${text2.substring(0,200)}`);

    // Test 3: With empty JSON body
    const res3 = await fetch("https://app.mobile.net.sa/api/v1/get-balance", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${useToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const text3 = await res3.text();
    console.log(`[Test3] With empty JSON body => status=${res3.status}, body=${text3.substring(0,200)}`);

    return new Response(JSON.stringify({
      tokenPreview: `${useToken.substring(0,4)}...${useToken.substring(useToken.length-4)}`,
      tokenLength: useToken.length,
      test1: { status: res1.status, body: text1.substring(0, 300) },
      test2: { status: res2.status, body: text2.substring(0, 300) },
      test3: { status: res3.status, body: text3.substring(0, 300) },
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
