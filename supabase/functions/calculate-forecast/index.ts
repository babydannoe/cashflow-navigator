import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { bv_id, weeks = 12 } = await req.json();

    // Determine which BVs to process
    let bvIds: string[] = [];
    if (bv_id) {
      bvIds = [bv_id];
    } else {
      const { data: bvList } = await supabase
        .from("bv")
        .select("id")
        .eq("actief", true);
      bvIds = (bvList || []).map((b: any) => b.id);
    }

    // Fetch all needed data
    const [
      { data: accounts },
      { data: invoices },
      { data: pipeline },
      { data: recurring },
      { data: existingCashflowItems },
      { data: counterparties },
      { data: bvs },
      { data: betaaldRecurringItems },
    ] = await Promise.all([
      supabase.from("bank_accounts").select("*").in("bv_id", bvIds),
      supabase.from("invoices").select("*").in("bv_id", bvIds).eq("status", "open").eq("import_status", "imported"),
      supabase.from("mt_pipeline_items").select("*").in("bv_id", bvIds),
      supabase.from("recurring_rules").select("*").in("bv_id", bvIds).eq("actief", true),
      supabase.from("cashflow_items").select("*").in("bv_id", bvIds).neq("status", "betaald"),
      supabase.from("counterparties").select("*"),
      supabase.from("bv").select("*").in("id", bvIds),
      supabase.from("cashflow_items").select("ref_id, week").in("bv_id", bvIds).eq("bron", "recurring").eq("status", "betaald"),
    ]);

    const counterpartyMap = new Map(
      (counterparties || []).map((c: any) => [c.id, c])
    );
    const bvMap = new Map((bvs || []).map((b: any) => [b.id, b]));

    // Calculate opening balance per BV or total
    const balancePerBV: Record<string, number> = {};
    for (const a of accounts || []) {
      balancePerBV[a.bv_id] = (balancePerBV[a.bv_id] || 0) + Number(a.huidig_saldo || 0);
    }
    const openingBalance = bv_id
      ? (balancePerBV[bv_id] || 0)
      : Object.values(balancePerBV).reduce((s, v) => s + v, 0);

    // Generate week buckets
    const now = new Date();
    const weekStart = getISOWeekStart(now);
    const weekBuckets: { weekDate: string; label: string }[] = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i * 7);
      const isoWeek = getISOWeek(d);
      const monthDay = d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
      weekBuckets.push({
        weekDate: d.toISOString().split("T")[0],
        label: `Wk ${isoWeek} · ${monthDay}`,
      });
    }

    // Build cashflow items from all sources
    const cashflowItems: any[] = [];

    // 1. Existing cashflow_items from DB (excel imports, manual entries, etc.)
    for (const ci of existingCashflowItems || []) {
      const bv = bvMap.get(ci.bv_id);
      const weekDate = findWeekBucket(ci.week, weekBuckets);
      if (!weekDate) continue;

      cashflowItems.push({
        bv_id: ci.bv_id,
        bv_naam: bv?.naam || "",
        bv_kleur: bv?.kleur || "#888",
        week: weekDate,
        type: ci.type || "out",
        bedrag: Number(ci.bedrag || 0),
        omschrijving: ci.omschrijving || "",
        categorie: ci.categorie || "Overig",
        subcategorie: ci.subcategorie || ci.tegenpartij || ci.omschrijving || "",
        tegenpartij: ci.tegenpartij || ci.omschrijving || "",
        bron: ci.bron || "handmatig",
        ref_id: ci.ref_id || ci.id,
        ref_type: ci.ref_type || "cashflow_item",
        cashflow_item_id: ci.id,
      });
    }

    // 2. Process invoices (only if not already in cashflow_items to avoid duplicates)
    const existingRefIds = new Set(
      (existingCashflowItems || [])
        .filter((ci: any) => ci.ref_type === "invoice" && ci.ref_id)
        .map((ci: any) => ci.ref_id)
    );

    for (const inv of invoices || []) {
      if (existingRefIds.has(inv.id)) continue;

      const cp = inv.counterparty_id ? counterpartyMap.get(inv.counterparty_id) : null;
      const bv = bvMap.get(inv.bv_id);
      const weekDate = findWeekBucket(inv.vervaldatum, weekBuckets);
      if (!weekDate) continue;

      let categorie = "";
      const subcategorie = cp?.naam || "Onbekend";

      if (inv.type === "AR") {
        categorie = "Omzet";
      } else {
        categorie = "Diensten";
      }

      cashflowItems.push({
        bv_id: inv.bv_id,
        bv_naam: bv?.naam || "",
        bv_kleur: bv?.kleur || "#888",
        week: weekDate,
        type: inv.type === "AR" ? "in" : "out",
        bedrag: Number(inv.bedrag),
        omschrijving: `${inv.factuurnummer || "Factuur"} - ${subcategorie}`,
        categorie,
        subcategorie,
        tegenpartij: subcategorie,
        bron: inv.bron || "handmatig",
        ref_id: inv.id,
        ref_type: "invoice",
        factuurnummer: inv.factuurnummer,
        status: inv.status,
        vervaldatum: inv.vervaldatum,
      });
    }

    // 3. Process MT pipeline (skip if already in cashflow_items)
    const existingPipelineIds = new Set(
      (existingCashflowItems || [])
        .filter((ci: any) => ci.ref_type === "mt_pipeline" && ci.ref_id)
        .map((ci: any) => ci.ref_id)
    );

    for (const mt of pipeline || []) {
      if (existingPipelineIds.has(mt.id)) continue;

      const bv = bvMap.get(mt.bv_id);
      const weekDate = findWeekBucket(mt.verwachte_week, weekBuckets);
      if (!weekDate) continue;

      const expectedValue = Number(mt.bedrag || 0) * (Number(mt.kans_percentage || 0) / 100);
      if (expectedValue <= 0) continue;

      cashflowItems.push({
        bv_id: mt.bv_id,
        bv_naam: bv?.naam || "",
        bv_kleur: bv?.kleur || "#888",
        week: weekDate,
        type: "in",
        bedrag: Math.round(expectedValue * 100) / 100,
        omschrijving: `${mt.projectnaam} (${mt.kans_percentage}%)`,
        categorie: "Pipeline omzet",
        subcategorie: mt.projectnaam || "Onbekend",
        tegenpartij: mt.projectnaam || "",
        bron: "mt_pipeline",
        ref_id: mt.id,
        ref_type: "mt_pipeline",
        kans_percentage: mt.kans_percentage,
        status: mt.status,
        verwachte_week: mt.verwachte_week,
      });
    }

    // 4. Process recurring rules — always generate dynamically for full horizon
    const firstBucketDate = new Date(weekBuckets[0].weekDate);
    const lastBucketDate = new Date(weekBuckets[weekBuckets.length - 1].weekDate);
    lastBucketDate.setDate(lastBucketDate.getDate() + 6); // end of last week

    for (const rule of recurring || []) {
      const bv = bvMap.get(rule.bv_id);
      const ruleStart = rule.startdatum ? new Date(rule.startdatum) : null;
      const ruleEnd = rule.einddatum ? new Date(rule.einddatum) : null;

      const makeItem = (weekDate: string) => ({
        bv_id: rule.bv_id,
        bv_naam: bv?.naam || "",
        bv_kleur: bv?.kleur || "#888",
        week: weekDate,
        type: "out",
        bedrag: Number(rule.bedrag || 0),
        omschrijving: rule.omschrijving || "",
        categorie: "Recurring kosten",
        subcategorie: rule.omschrijving || "",
        tegenpartij: rule.omschrijving || "",
        bron: "recurring",
        ref_id: rule.id,
        ref_type: "recurring_rule",
        frequentie: rule.frequentie,
      });

      if (rule.frequentie === "wekelijks") {
        for (const bucket of weekBuckets) {
          const bucketDate = new Date(bucket.weekDate);
          if (ruleStart && bucketDate < ruleStart) continue;
          if (ruleEnd && bucketDate > ruleEnd) continue;
          cashflowItems.push(makeItem(bucket.weekDate));
        }
      } else if (rule.frequentie === "maandelijks") {
        // Loop through each calendar month in the horizon
        const startMonth = new Date(firstBucketDate.getFullYear(), firstBucketDate.getMonth(), 1);
        const endMonth = new Date(lastBucketDate.getFullYear(), lastBucketDate.getMonth() + 1, 0);

        const cursor = new Date(startMonth);
        while (cursor <= endMonth) {
          const year = cursor.getFullYear();
          const month = cursor.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const payDay = Math.min(rule.verwachte_betaaldag || 1, daysInMonth);
          const payDate = new Date(year, month, payDay);

          if (ruleStart && payDate < ruleStart) { cursor.setMonth(cursor.getMonth() + 1); continue; }
          if (ruleEnd && payDate > ruleEnd) break;

          const weekDate = findWeekBucket(payDate.toISOString().split("T")[0], weekBuckets);
          if (weekDate) {
            cashflowItems.push(makeItem(weekDate));
          }

          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }

    // Calculate weekly forecasts
    const forecasts: any[] = [];
    let runningBalance = openingBalance;

    for (const bucket of weekBuckets) {
      const weekItems = cashflowItems.filter((i) => i.week === bucket.weekDate);
      const inflow = weekItems
        .filter((i) => i.type === "in")
        .reduce((s: number, i: any) => s + i.bedrag, 0);
      const outflow = weekItems
        .filter((i) => i.type === "out")
        .reduce((s: number, i: any) => s + i.bedrag, 0);

      const opening = runningBalance;
      const closing = opening + inflow - outflow;

      forecasts.push({
        week: bucket.weekDate,
        label: bucket.label,
        opening_balance: Math.round(opening * 100) / 100,
        inflow: Math.round(inflow * 100) / 100,
        outflow: Math.round(outflow * 100) / 100,
        closing_balance: Math.round(closing * 100) / 100,
      });

      runningBalance = closing;
    }

    // Get drempel values
    const drempels: Record<string, number> = {};
    for (const bv of bvs || []) {
      drempels[bv.id] = Number(bv.drempel_bedrag || 0);
    }
    const totalDrempel = bv_id
      ? drempels[bv_id] || 0
      : Object.values(drempels).reduce((s, d) => s + d, 0);

    // Add excel_import as a recognized source
    const result = {
      weekBuckets,
      forecasts,
      cashflowItems,
      openingBalance,
      drempel: totalDrempel,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Forecast calculation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getISOWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function findWeekBucket(
  dateStr: string | null,
  buckets: { weekDate: string }[]
): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  for (let i = 0; i < buckets.length; i++) {
    const bucketStart = new Date(buckets[i].weekDate);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketEnd.getDate() + 6);
    if (date >= bucketStart && date <= bucketEnd) {
      return buckets[i].weekDate;
    }
  }
  // If before first bucket, put in first
  if (date < new Date(buckets[0].weekDate)) {
    return buckets[0].weekDate;
  }
  return null;
}
