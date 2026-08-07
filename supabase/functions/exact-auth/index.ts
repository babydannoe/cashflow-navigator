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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Exact Online geeft per app-registratie + gebruiker één token-keten uit.
 * Alle BV's delen dus dezelfde access/refresh tokens; alleen de division verschilt.
 * Daarom: altijd de nieuwste rij als bron gebruiken en na een refresh de tokens
 * naar ALLE rijen wegschrijven, zodat de keten nooit breekt.
 */
async function getChainRow(supabase: any) {
  const { data } = await supabase
    .from("exact_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function propagateTokens(
  supabase: any,
  tokens: { access_token: string; refresh_token: string; expires_at: string }
) {
  await supabase
    .from("exact_tokens")
    .update({ ...tokens, refresh_lock: null })
    .not("id", "is", null);
}

/** Vernieuwt de gedeelde token-keten. Gebruikt een lock zodat parallelle calls
 *  de (eenmalig bruikbare) refresh_token niet twee keer verbruiken. */
async function refreshChain(supabase: any, clientId: string, clientSecret: string) {
  let row = await getChainRow(supabase);
  if (!row) return { ok: false, needsAuth: true, error: "Geen Exact koppeling gevonden" };

  // Nog ruim geldig? Dan niets doen.
  if (new Date(row.expires_at).getTime() > Date.now() + 120_000) {
    return { ok: true, expires_at: row.expires_at, refreshed: false };
  }

  // Lock claimen (max 30s oud)
  const lockCutoff = new Date(Date.now() - 30_000).toISOString();
  const { data: locked } = await supabase
    .from("exact_tokens")
    .update({ refresh_lock: new Date().toISOString() })
    .eq("id", row.id)
    .or(`refresh_lock.is.null,refresh_lock.lt.${lockCutoff}`)
    .select("id");

  if (!locked || locked.length === 0) {
    // Andere call is bezig: kort wachten en resultaat teruggeven
    await sleep(3000);
    row = await getChainRow(supabase);
    const stillValid = row && new Date(row.expires_at).getTime() > Date.now();
    return { ok: !!stillValid, expires_at: row?.expires_at, refreshed: false, waited: true };
  }

  const res = await fetch("https://start.exactonline.nl/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Refresh failed:", errText);
    await supabase.from("exact_tokens").update({ refresh_lock: null }).eq("id", row.id);
    return { ok: false, needsAuth: true, error: "Token refresh mislukt", details: errText };
  }

  const data = await res.json();
  const expires_at = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  await propagateTokens(supabase, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at,
  });

  return { ok: true, expires_at, refreshed: true };
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
        { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } }
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
          { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } }
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

      const expires_at = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

      const { error: upsertError } = await supabase.from("exact_tokens").upsert(
        {
          bv_id: state,
          access_token,
          refresh_token,
          division,
          available_divisions: availableDivisions,
          expires_at,
          refresh_lock: null,
        },
        { onConflict: "bv_id" }
      );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        return jsonResponse({ error: "Tokens opslaan mislukt", details: upsertError.message }, 500);
      }

      // Een nieuwe autorisatie maakt oudere token-ketens ongeldig:
      // deel dezelfde tokens daarom met alle andere gekoppelde BV's.
      await supabase
        .from("exact_tokens")
        .update({ access_token, refresh_token, expires_at, refresh_lock: null })
        .neq("bv_id", state);

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Exact Online gekoppeld</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center">
<p>Exact Online is gekoppeld. Je kunt dit venster sluiten.</p>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'exact-connected' }, '*');
      window.close();
    } else {
      window.location.replace(${JSON.stringify(`${FRONTEND_URL}/instellingen?exact=success`)});
    }
  } catch (e) {
    window.location.replace(${JSON.stringify(`${FRONTEND_URL}/instellingen?exact=success`)});
  }
</script>
</body></html>`;

      return new Response(html, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ── Route 3: /refresh (en /ensure) ──
    if (path.endsWith("/refresh") || path.endsWith("/ensure")) {
      const result = await refreshChain(supabase, EXACT_CLIENT_ID, EXACT_CLIENT_SECRET);
      return jsonResponse(
        { success: result.ok, ...result },
        result.ok ? 200 : result.needsAuth ? 200 : 502
      );
    }

    // ── Route 4: /status ──
    if (path.endsWith("/status")) {
      const { data: rows } = await supabase
        .from("exact_tokens")
        .select("bv_id, division, expires_at, updated_at");
      const chain = await getChainRow(supabase);
      const connected = !!chain && new Date(chain.expires_at).getTime() > Date.now();
      return jsonResponse({
        connected,
        needsAuth: !chain,
        expires_at: chain?.expires_at ?? null,
        bvs: rows ?? [],
      });
    }

    return jsonResponse({ error: "Onbekende route" }, 404);
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Interne serverfout", details: String(err) }, 500);
  }
});
