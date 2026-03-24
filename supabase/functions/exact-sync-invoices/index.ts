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

const EXACT_BASE = "https://start.exactonline.nl/api";

const STATUS_MAP_AR: Record<number, string> = {
  10: "ter_goedkeuring",
  20: "open",
  50: "betaald",
};

const STATUS_MAP_AP: Record<number, string> = {
  20: "open",
  50: "betaald",
};

async function getValidToken(supabase: any, bv_id: string) {
  const { data: tokenRow, error } = await supabase
    .from("exact_tokens")
    .select("*")
    .eq("bv_id", bv_id)
    .single();

  if (error || !tokenRow) return null;

  // Refresh if expiring within 60 seconds
  if (new Date(tokenRow.expires_at).getTime() < Date.now() + 60_000) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const refreshRes = await fetch(`${SUPABASE_URL}/functions/v1/exact-auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bv_id }),
    });
    if (!refreshRes.ok) {
      console.error("Token refresh failed:", await refreshRes.text());
      return null;
    }
    // Re-fetch updated tokens
    const { data: updated } = await supabase
      .from("exact_tokens")
      .select("*")
      .eq("bv_id", bv_id)
      .single();
    return updated;
  }

  return tokenRow;
}

async function fetchExactPaginated(
  url: string,
  accessToken: string,
  maxRetries = 2
): Promise<any[]> {
  const results: any[] = [];
  let currentUrl: string | null = url;

  while (currentUrl) {
    let res: Response | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      res = await fetch(currentUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (res.ok) break;

      if (res.status === 429) {
        console.warn("Rate limited, waiting 1s...");
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (res.status === 401) {
        throw new Error("TOKEN_EXPIRED");
      }

      const errText = await res.text();
      throw new Error(`Exact API error ${res.status}: ${errText}`);
    }

    if (!res || !res.ok) {
      throw new Error("Exact API request failed after retries");
    }

    const json = await res.json();
    const items = json.d?.results ?? [];
    results.push(...items);

    currentUrl = json.d?.__next ?? null;
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let bv_id: string | null = null;
    try {
      const body = await req.json();
      bv_id = body.bv_id ?? null;
    } catch {
      // no body
    }

    // If no bv_id, sync all BVs with tokens
    let bvIds: string[] = [];
    if (bv_id) {
      bvIds = [bv_id];
    } else {
      const { data: allTokens } = await supabase
        .from("exact_tokens")
        .select("bv_id");
      bvIds = (allTokens ?? []).map((t: any) => t.bv_id);
    }

    if (bvIds.length === 0) {
      return jsonResponse({ error: "Geen Exact koppeling gevonden" }, 404);
    }

    const allResults: any[] = [];

    for (const currentBvId of bvIds) {
      const tokens = await getValidToken(supabase, currentBvId);
      if (!tokens) {
        allResults.push({ bv_id: currentBvId, error: "Geen Exact koppeling voor deze BV" });
        continue;
      }

      const { access_token, division: tokenDivision } = tokens;

      // Use per-BV division from bv table if set, otherwise fallback to token division
      const { data: bvRow } = await supabase
        .from("bv")
        .select("exact_division_code")
        .eq("id", currentBvId)
        .single();

      const division = bvRow?.exact_division_code ?? tokenDivision;

      if (!division) {
        allResults.push({ bv_id: currentBvId, error: "Geen Exact divisie ingesteld voor deze BV" });
        continue;
      }
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sinceDate = sixMonthsAgo.toISOString().split("T")[0];

      // ── Sales Invoices (AR) ──
      let arRecords: any[] = [];
      try {
        const arUrl = `${EXACT_BASE}/v1/${division}/salesinvoice/SalesInvoices?$filter=InvoiceDate gt datetime'${sinceDate}'&$select=InvoiceID,InvoiceNumber,OrderedByName,AmountDC,InvoiceDate,DueDate,Status&$orderby=InvoiceDate desc&$top=100`;
        const arItems = await fetchExactPaginated(arUrl, access_token);

        arRecords = arItems.map((item: any) => ({
          exact_id: String(item.InvoiceID),
          bv_id: currentBvId,
          bron: "exact",
          type: "AR",
          factuurnummer: item.InvoiceNumber ? String(item.InvoiceNumber) : null,
          bedrag: Math.abs(item.AmountDC ?? 0),
          vervaldatum: item.DueDate
            ? new Date(parseInt(item.DueDate.replace(/\/Date\((\d+)\)\//, "$1"))).toISOString().split("T")[0]
            : null,
          status: STATUS_MAP_AR[item.Status] ?? "ter_goedkeuring",
          laatste_sync: new Date().toISOString(),
        }));
      } catch (err) {
        console.error(`AR sync error for ${currentBvId}:`, err);
      }

      // ── Purchase Entries (AP) ──
      let apRecords: any[] = [];
      try {
        const apUrl = `${EXACT_BASE}/v1/${division}/purchaseentry/PurchaseEntries?$filter=EntryDate gt datetime'${sinceDate}'&$select=EntryID,EntryNumber,SupplierName,AmountDC,EntryDate,DueDate,Status&$orderby=EntryDate desc&$top=100`;
        const apItems = await fetchExactPaginated(apUrl, access_token);

        apRecords = apItems.map((item: any) => ({
          exact_id: String(item.EntryID),
          bv_id: currentBvId,
          bron: "exact",
          type: "AP",
          factuurnummer: item.EntryNumber ? String(item.EntryNumber) : null,
          bedrag: Math.abs(item.AmountDC ?? 0),
          vervaldatum: item.DueDate
            ? new Date(parseInt(item.DueDate.replace(/\/Date\((\d+)\)\//, "$1"))).toISOString().split("T")[0]
            : null,
          status: STATUS_MAP_AP[item.Status] ?? "ter_goedkeuring",
          laatste_sync: new Date().toISOString(),
        }));
      } catch (err) {
        console.error(`AP sync error for ${currentBvId}:`, err);
      }

      // ── Upsert in batches of 50 ──
      const allInvoices = [...arRecords, ...apRecords];
      for (let i = 0; i < allInvoices.length; i += 50) {
        const batch = allInvoices.slice(i, i + 50);
        const { error: upsertErr } = await supabase
          .from("invoices")
          .upsert(batch, { onConflict: "exact_id" });

        if (upsertErr) {
          console.error("Upsert error:", upsertErr);
        }
      }

      allResults.push({
        bv_id: currentBvId,
        success: true,
        synced_ar: arRecords.length,
        synced_ap: apRecords.length,
        division_used: division,
        synced_at: new Date().toISOString(),
      });
    }

    if (allResults.length === 1) {
      return jsonResponse(allResults[0]);
    }
    return jsonResponse({ results: allResults });
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Interne serverfout", details: String(err) }, 500);
  }
});
