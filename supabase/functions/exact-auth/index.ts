import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const EXACT_CLIENT_ID = Deno.env.get("EXACT_CLIENT_ID")!;
  const EXACT_CLIENT_SECRET = Deno.env.get("EXACT_CLIENT_SECRET")!;
  const EXACT_REDIRECT_URI = Deno.env.get("EXACT_REDIRECT_URI")!;
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // ── Route 1: /authorize ──
    if (path.endsWith("/authorize")) {
      const bv_id = url.searchParams.get("bv_id");
      if (!bv_id) return jsonResponse({ error: "bv_id is verplicht" }, 400);

      const authUrl = `https://start.exactonline.nl/api/oauth2/auth?client_id=${EXACT_CLIENT_ID}&redirect_uri=${encodeURIComponent(EXACT_REDIRECT_URI)}&response_type=code&state=${bv_id}&force_login=0`;

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authUrl },
      });
    }

    // ── Route 2: /callback ──
    if (path.endsWith("/callback")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state"); // bv_id
      if (!code || !state) {
        return jsonResponse({ error: "code en state zijn verplicht" }, 400);
      }

      // Exchange code for tokens
      const tokenRes = await fetch("https://start.exactonline.nl/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: EXACT_CLIENT_ID,
          client_secret: EXACT_CLIENT_SECRET,
          redirect_uri: EXACT_REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Token exchange failed:", errText);
        return jsonResponse({ error: "Token exchange mislukt", details: errText }, 502);
      }

      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_in } = tokenData;

      // Get current division
      const meRes = await fetch(
        "https://start.exactonline.nl/api/v1/current/Me?$select=CurrentDivision",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: "application/json",
          },
        }
      );

      if (!meRes.ok) {
        const errText = await meRes.text();
        console.error("Me endpoint failed:", errText);
        return jsonResponse({ error: "Kan division niet ophalen", details: errText }, 502);
      }

      const meData = await meRes.json();
      const division = meData.d?.results?.[0]?.CurrentDivision ?? meData.d?.CurrentDivision;

      // Fetch all available divisions
      let availableDivisions: any[] = [];
      try {
        const divRes = await fetch(
          `https://start.exactonline.nl/api/v1/${division}/system/Divisions?$select=Code,Description,CustomerName`,
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
              Accept: "application/json",
            },
          }
        );
        if (divRes.ok) {
          const divData = await divRes.json();
          availableDivisions = (divData.d?.results ?? []).map((d: any) => ({
            Code: d.Code,
            Description: d.Description,
            CustomerName: d.CustomerName,
          }));
        } else {
          console.error("Divisions fetch failed:", await divRes.text());
        }
      } catch (e) {
        console.error("Divisions fetch error:", e);
      }

      // Upsert tokens
      const { error: upsertError } = await supabase
        .from("exact_tokens")
        .upsert(
          {
            bv_id: state,
            access_token,
            refresh_token,
            division,
            available_divisions: availableDivisions,
            expires_at: new Date(Date.now() + (expires_in - 10) * 1000).toISOString(),
          },
          { onConflict: "bv_id" }
        );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        return jsonResponse({ error: "Tokens opslaan mislukt", details: upsertError.message }, 500);
      }

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `${FRONTEND_URL}/instellingen?exact=success` },
      });
    }

    // ── Route 3: /refresh ──
    if (path.endsWith("/refresh")) {
      if (req.method !== "POST") {
        return jsonResponse({ error: "Alleen POST toegestaan" }, 405);
      }

      const { bv_id } = await req.json();
      if (!bv_id) return jsonResponse({ error: "bv_id is verplicht" }, 400);

      // Get current tokens
      const { data: tokenRow, error: fetchErr } = await supabase
        .from("exact_tokens")
        .select("*")
        .eq("bv_id", bv_id)
        .single();

      if (fetchErr || !tokenRow) {
        return jsonResponse({ error: "Geen tokens gevonden voor deze BV" }, 404);
      }

      // Refresh
      const refreshRes = await fetch("https://start.exactonline.nl/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenRow.refresh_token,
          client_id: EXACT_CLIENT_ID,
          client_secret: EXACT_CLIENT_SECRET,
        }),
      });

      if (!refreshRes.ok) {
        const errText = await refreshRes.text();
        console.error("Refresh failed:", errText);
        return jsonResponse({ error: "Token refresh mislukt", details: errText }, 502);
      }

      const refreshData = await refreshRes.json();
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in - 10) * 1000).toISOString();

      const { error: updateErr } = await supabase
        .from("exact_tokens")
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: newExpiresAt,
        })
        .eq("bv_id", bv_id);

      if (updateErr) {
        return jsonResponse({ error: "Tokens updaten mislukt", details: updateErr.message }, 500);
      }

      return jsonResponse({ success: true, expires_at: newExpiresAt });
    }

    return jsonResponse({ error: "Onbekende route" }, 404);
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Interne serverfout", details: String(err) }, 500);
  }
});
