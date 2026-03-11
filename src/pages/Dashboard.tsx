import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Wallet, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface KPIData {
  totaalSaldo: number;
  debiteuren: number;
  crediteuren: number;
  vrijeLiquiditeit: number;
}

interface BarData {
  naam: string;
  saldo: number;
  kleur: string;
}

interface UpcomingPayment {
  factuurnummer: string | null;
  bedrag: number;
  vervaldatum: string | null;
  type: string | null;
  bv_naam: string;
}

interface AlertBV {
  naam: string;
  saldo: number;
  drempel: number;
  kleur: string;
}

export default function Dashboard() {
  const { bvs, selectedBVId } = useBV();
  const [kpi, setKpi] = useState<KPIData>({ totaalSaldo: 0, debiteuren: 0, crediteuren: 0, vrijeLiquiditeit: 0 });
  const [barData, setBarData] = useState<BarData[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingPayment[]>([]);
  const [alerts, setAlerts] = useState<AlertBV[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [selectedBVId, bvs]);

  async function fetchData() {
    if (bvs.length === 0) return;
    setLoading(true);

    const bvFilter = selectedBVId ? [selectedBVId] : bvs.map(b => b.id);

    // Fetch bank accounts
    const { data: accounts } = await supabase
      .from('bank_accounts')
      .select('bv_id, huidig_saldo')
      .in('bv_id', bvFilter);

    // Fetch open invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('bv_id, type, bedrag, vervaldatum, factuurnummer, status')
      .in('bv_id', bvFilter)
      .eq('status', 'open')
      .order('vervaldatum', { ascending: true });

    const totaalSaldo = accounts?.reduce((sum, a) => sum + Number(a.huidig_saldo ?? 0), 0) ?? 0;
    const debiteuren = invoices?.filter(i => i.type === 'AR').reduce((sum, i) => sum + Number(i.bedrag), 0) ?? 0;
    const crediteuren = invoices?.filter(i => i.type === 'AP').reduce((sum, i) => sum + Number(i.bedrag), 0) ?? 0;

    setKpi({
      totaalSaldo,
      debiteuren,
      crediteuren,
      vrijeLiquiditeit: totaalSaldo + debiteuren - crediteuren,
    });

    // Bar chart data
    const chartData = bvs.map(bv => ({
      naam: bv.naam.replace(' BV', '').replace(' B.V.', ''),
      saldo: accounts?.filter(a => a.bv_id === bv.id).reduce((s, a) => s + Number(a.huidig_saldo ?? 0), 0) ?? 0,
      kleur: bv.kleur ?? '#888',
    }));
    setBarData(selectedBVId ? chartData.filter(d => d.kleur === bvs.find(b => b.id === selectedBVId)?.kleur) : chartData);

    // Upcoming payments (top 10)
    const top10 = (invoices ?? []).slice(0, 10).map(inv => ({
      factuurnummer: inv.factuurnummer,
      bedrag: Number(inv.bedrag),
      vervaldatum: inv.vervaldatum,
      type: inv.type,
      bv_naam: bvs.find(b => b.id === inv.bv_id)?.naam ?? '',
    }));
    setUpcoming(top10);

    // Alerts: BVs under threshold
    const alertList: AlertBV[] = [];
    for (const bv of bvs) {
      const bvSaldo = accounts?.filter(a => a.bv_id === bv.id).reduce((s, a) => s + Number(a.huidig_saldo ?? 0), 0) ?? 0;
      if (bvSaldo < Number(bv.drempel_bedrag ?? 0)) {
        alertList.push({ naam: bv.naam, saldo: bvSaldo, drempel: Number(bv.drempel_bedrag ?? 0), kleur: bv.kleur ?? '#888' });
      }
    }
    setAlerts(alertList);
    setLoading(false);
  }

  const fmt = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {selectedBVId ? bvs.find(b => b.id === selectedBVId)?.naam : 'Geconsolideerd overzicht'}
        </p>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive text-sm">Liquiditeitsalert</p>
              {alerts.map(a => (
                <p key={a.naam} className="text-sm text-destructive/80">
                  <span className="font-medium">{a.naam}</span>: saldo {fmt(a.saldo)} is onder drempel {fmt(a.drempel)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard icon={Wallet} label="Totaal banksaldo" value={fmt(kpi.totaalSaldo)} color="kpi-blue" />
        <KPICard icon={ArrowUpRight} label="Openstaande debiteuren" value={fmt(kpi.debiteuren)} color="kpi-green" />
        <KPICard icon={ArrowDownRight} label="Openstaande crediteuren" value={fmt(kpi.crediteuren)} color="kpi-orange" />
        <KPICard icon={TrendingDown} label="Vrije liquiditeit" value={fmt(kpi.vrijeLiquiditeit)} color="kpi-blue" />
      </div>

      {/* Charts + Table */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar Chart */}
        <div className="kpi-card">
          <h2 className="text-sm font-semibold mb-4">Banksaldo per BV</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} barCategoryGap="20%">
                <XAxis dataKey="naam" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => [fmt(value), 'Saldo']}
                  contentStyle={{ borderRadius: '0.75rem', border: '1px solid hsl(var(--border))', fontSize: '0.875rem' }}
                />
                <Bar dataKey="saldo" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={index} fill={entry.kleur} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Payments */}
        <div className="kpi-card">
          <h2 className="text-sm font-semibold mb-4">Komende betalingen</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Factuur</th>
                  <th className="text-left py-2 font-medium">BV</th>
                  <th className="text-left py-2 font-medium">Vervaldatum</th>
                  <th className="text-right py-2 font-medium">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((p, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${p.type === 'AR' ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--warning))]'}`} />
                        <span className="font-mono text-xs">{p.factuurnummer}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-muted-foreground truncate max-w-[120px]">{p.bv_naam.replace(' BV', '').replace(' B.V.', '')}</td>
                    <td className="py-2.5 text-muted-foreground">{p.vervaldatum}</td>
                    <td className={`py-2.5 text-right font-mono text-xs font-medium ${p.type === 'AR' ? 'text-[hsl(var(--success))]' : 'text-foreground'}`}>
                      {p.type === 'AP' ? '- ' : '+ '}{fmt(p.bedrag)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`h-9 w-9 rounded-lg bg-[hsl(var(--${color}))] bg-opacity-10 flex items-center justify-center`}>
          <Icon className={`h-4 w-4 text-[hsl(var(--${color}))]`} />
        </div>
      </div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
