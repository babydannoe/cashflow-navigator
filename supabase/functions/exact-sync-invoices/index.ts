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
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const refreshRes = await fetch(`${SUPABASE_URL}/functions/v1/exact-auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(
      SUPABASE_URL,
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



      // ── Sales Invoices (AR) via ReceivablesList ──
      let arRecords: any[] = [];
      try {
        const arUrl = `${EXACT_BASE}/v1/${division}/read/financial/ReceivablesList?$select=HID,EntryNumber,InvoiceNumber,AccountName,Amount,DueDate,InvoiceDate,YourRef&$orderby=DueDate asc&$top=250`;
        const arItems = await fetchExactPaginated(arUrl, access_token);

        arRecords = arItems
          .filter((item: any) => (item.Amount ?? 0) > 0 && item.EntryNumber)
          .map((item: any) => ({
            exact_id: String(item.HID),
            bv_id: currentBvId,
            bron: "exact",
            type: "AR",
            factuurnummer: item.YourRef || (item.InvoiceNumber && item.InvoiceNumber !== 0 ? String(item.InvoiceNumber) : null) || String(item.EntryNumber),
            bedrag: Math.abs(item.Amount ?? 0),
            vervaldatum: item.DueDate
              ? new Date(parseInt(item.DueDate.replace(/\/Date\((\d+)\)\//, "$1"))).toISOString().split("T")[0]
              : null,
            boekingsdatum: item.InvoiceDate
              ? new Date(parseInt(item.InvoiceDate.replace(/\/Date\((\d+)\)\//, "$1"))).toISOString().split("T")[0]
              : null,
            status: "open",
            laatste_sync: new Date().toISOString(),
            counterparty_naam: item.AccountName ?? null,
          }));
      } catch (err) {
        console.error(`AR sync error for ${currentBvId}:`, err);
      }

      // ── Haal aanmaakdatums op uit PurchaseEntries ──
      const createdMap = new Map<number, string>();
      try {
        const createdItems = await fetchExactPaginated(
          `${EXACT_BASE}/v1/${division}/purchaseentry/PurchaseEntries?$select=EntryNumber,Created&$top=250&$orderby=Created desc`,
          access_token
        );
        for (const item of createdItems) {
          if (item.EntryNumber && item.Created) {
            const parsed = parseInt(item.Created.replace(/\/Date\((\d+)\)\//, "$1"));
            const date = isNaN(parsed)
              ? new Date(item.Created).toISOString().split("T")[0]
              : new Date(parsed).toISOString().split("T")[0];
            createdMap.set(item.EntryNumber, date);
          }
        }
      } catch (err) {
        console.error(`Created map error for ${currentBvId}:`, err);
      }

      // ── Purchase Invoices (AP) via PayablesList ──
      let apRecords: any[] = [];
      try {
        const apUrl = `${EXACT_BASE}/v1/${division}/read/financial/PayablesList?$select=HID,EntryNumber,InvoiceNumber,AccountName,AccountId,Amount,DueDate,InvoiceDate,YourRef,Description&$orderby=DueDate asc&$top=250`;
        const apItems = await fetchExactPaginated(apUrl, access_token);

        apRecords = apItems
          .filter((item: any) => {
            const amount = item.Amount ?? 0;
            return amount > 0 && item.EntryNumber;
          })
          .map((item: any) => ({
            exact_id: String(item.HID),
            bv_id: currentBvId,
            bron: "exact",
            type: "AP",
            factuurnummer: item.YourRef || (item.InvoiceNumber && item.InvoiceNumber !== 0 ? String(item.InvoiceNumber) : null) || String(item.EntryNumber),
            bedrag: Math.abs(item.Amount ?? 0),
            vervaldatum: item.DueDate
              ? new Date(parseInt(item.DueDate.replace(/\/Date\((\d+)\)\//, "$1"))).toISOString().split("T")[0]
              : null,
            boekingsdatum: item.InvoiceDate
              ? new Date(parseInt(item.InvoiceDate.replace(/\/Date\((\d+)\)\//, "$1"))).toISOString().split("T")[0]
              : null,
            aangemaakt_in_exact: createdMap.get(item.EntryNumber) ?? null,
            status: "open",
            laatste_sync: new Date().toISOString(),
            counterparty_naam: item.AccountName ?? null,
          }));
      } catch (err) {
        console.error(`AP sync error for ${currentBvId}:`, err);
      }

      // ── Koppel tegenpartijen voor AR records ──
      for (const inv of arRecords) {
        if (inv.counterparty_naam) {
          const { data: existingCP } = await supabase
            .from("counterparties")
            .select("id")
            .ilike("naam", inv.counterparty_naam)
            .maybeSingle();

          if (existingCP) {
            inv.counterparty_id = existingCP.id;
          } else {
            const { data: newCP } = await supabase
              .from("counterparties")
              .insert({ naam: inv.counterparty_naam, type: "debiteur" })
              .select("id")
              .single();
            inv.counterparty_id = newCP?.id ?? null;
          }
        }
        delete inv.counterparty_naam;
      }

      // ── Koppel tegenpartijen voor AP records ──
      for (const inv of apRecords) {
        if (inv.counterparty_naam) {
          const { data: existingCP } = await supabase
            .from("counterparties")
            .select("id")
            .ilike("naam", inv.counterparty_naam)
            .maybeSingle();

          if (existingCP) {
            inv.counterparty_id = existingCP.id;
          } else {
            const { data: newCP } = await supabase
              .from("counterparties")
              .insert({ naam: inv.counterparty_naam, type: "leverancier" })
              .select("id")
              .single();
            inv.counterparty_id = newCP?.id ?? null;
          }
        }
        delete inv.counterparty_naam;
      }

      // ── Upsert in batches of 50, preserving import_status ──
      const allInvoices = [...arRecords, ...apRecords];
      for (let i = 0; i < allInvoices.length; i += 50) {
        const batch = allInvoices.slice(i, i + 50);
        // For each invoice, check if it already exists to avoid overwriting import_status
        for (const inv of batch) {
          const { data: existing } = await supabase
            .from("invoices")
            .select("id")
            .eq("exact_id", inv.exact_id)
            .maybeSingle();

          if (existing) {
            // Haal huidige status en import_status op
            const { data: currentInv } = await supabase
              .from("invoices")
              .select("status, import_status")
              .eq("exact_id", inv.exact_id)
              .maybeSingle();

            // Nooit overschrijven als al verwerkt in ons systeem
            const beschermd = ['betaald', 'gecrediteerd'].includes(currentInv?.status ?? '');
            const afgehandeld = ['imported', 'dismissed'].includes(currentInv?.import_status ?? '');

            await supabase
              .from("invoices")
              .update({
                bedrag: inv.bedrag,
                vervaldatum: inv.vervaldatum,
                boekingsdatum: inv.boekingsdatum,
                aangemaakt_in_exact: inv.aangemaakt_in_exact,
                // Alleen status updaten als de factuur nog niet verwerkt is
                ...(beschermd || afgehandeld ? {} : { status: inv.status }),
                laatste_sync: inv.laatste_sync,
                factuurnummer: inv.factuurnummer,
                ...(inv.counterparty_id ? { counterparty_id: inv.counterparty_id } : {}),
              })
              .eq("exact_id", inv.exact_id);
          } else {
            // New invoice: insert with default import_status = 'pending'
            await supabase.from("invoices").insert({
              ...inv,
              import_status: 'pending',
            });
          }
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
