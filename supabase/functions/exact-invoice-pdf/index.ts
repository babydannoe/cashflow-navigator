import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXACT_BASE = "https://start.exactonline.nl/api";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getValidToken(supabase: any, bv_id: string, supabaseUrl: string, anonKey: string) {
  const { data: tokenRow, error } = await supabase
    .from("exact_tokens")
    .select("*")
    .eq("bv_id", bv_id)
    .maybeSingle();

  if (error || !tokenRow) return null;

  if (new Date(tokenRow.expires_at).getTime() < Date.now() + 60_000) {
    const refreshRes = await fetch(`${supabaseUrl}/functions/v1/exact-auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ bv_id }),
    });
    if (!refreshRes.ok) return null;
    const { data: updated } = await supabase
      .from("exact_tokens")
      .select("*")
      .eq("bv_id", bv_id)
      .maybeSingle();
    return updated;
  }

  return tokenRow;
}

async function exactGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error("Exact GET failed", url, res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return json?.d?.results ?? json?.d ?? null;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let invoice_id: string | null = null;
    try {
      const body = await req.json();
      invoice_id = typeof body?.invoice_id === "string" ? body.invoice_id : null;
    } catch {
      // no body
    }
    if (!invoice_id) return jsonResponse({ error: "invoice_id ontbreekt" }, 400);

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, bv_id, exact_id, type, factuurnummer")
      .eq("id", invoice_id)
      .maybeSingle();

    if (!invoice) return jsonResponse({ error: "Factuur niet gevonden" }, 404);
    if (!invoice.exact_id) {
      return jsonResponse({ error: "Deze factuur komt niet uit Exact Online, dus er is geen PDF beschikbaar." }, 404);
    }

    const tokens = await getValidToken(supabase, invoice.bv_id, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!tokens) return jsonResponse({ error: "Geen actieve Exact-koppeling voor deze BV" }, 400);

    const { data: bvRow } = await supabase
      .from("bv")
      .select("exact_division_code")
      .eq("id", invoice.bv_id)
      .maybeSingle();
    const division = bvRow?.exact_division_code ?? tokens.division;
    if (!division) return jsonResponse({ error: "Geen Exact divisie ingesteld voor deze BV" }, 400);

    const token = tokens.access_token;
    const isAP = invoice.type === "AP";
    const listName = isAP ? "PayablesList" : "ReceivablesList";

    // 1. HID → EntryNumber
    const listRes = await exactGet(
      `${EXACT_BASE}/v1/${division}/read/financial/${listName}?$filter=HID eq ${Number(invoice.exact_id)}&$select=HID,EntryNumber`,
      token
    );
    const entryNumber = Array.isArray(listRes) ? listRes[0]?.EntryNumber : null;
    if (!entryNumber) {
      return jsonResponse({ error: "Boeking niet gevonden in Exact Online" }, 404);
    }

    // 2. EntryNumber → Document GUID
    const entryEndpoint = isAP
      ? `purchaseentry/PurchaseEntries`
      : `salesentry/SalesEntries`;
    const entryRes = await exactGet(
      `${EXACT_BASE}/v1/${division}/${entryEndpoint}?$filter=EntryNumber eq ${entryNumber}&$select=EntryNumber,Document`,
      token
    );
    const documentId = Array.isArray(entryRes) ? entryRes[0]?.Document : null;
    if (!documentId) {
      return jsonResponse(
        { error: "Er hangt geen document aan deze boeking in Exact Online." },
        404
      );
    }

    // 3. Document → attachment
    const attRes = await exactGet(
      `${EXACT_BASE}/v1/${division}/documents/DocumentAttachments?$filter=Document eq guid'${documentId}'&$select=FileName,Url`,
      token
    );
    const attachment = Array.isArray(attRes) ? attRes[0] : null;
    if (!attachment?.Url) {
      return jsonResponse({ error: "Geen bijlage gevonden bij deze factuur in Exact Online." }, 404);
    }

    // 4. Download bytes
    const fileRes = await fetch(attachment.Url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) {
      console.error("Attachment download failed", fileRes.status, await fileRes.text());
      return jsonResponse({ error: "Bijlage kon niet worden gedownload uit Exact Online." }, 502);
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const fileName: string = attachment.FileName || `${invoice.factuurnummer ?? "factuur"}.pdf`;
    const contentType =
      fileRes.headers.get("Content-Type") ||
      (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");

    return jsonResponse({
      fileName,
      contentType,
      data: toBase64(bytes),
    });
  } catch (e) {
    console.error("exact-invoice-pdf error:", e);
    return jsonResponse({ error: (e as Error).message || "Onbekende fout" }, 500);
  }
});
