import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Download, Check, Plus, CreditCard, ArrowRight, RotateCcw, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Invoice {
  id: string;
  bv_id: string;
  counterparty_id: string | null;
  bedrag: number;
  vervaldatum: string | null;
  factuurnummer: string | null;
  status: string | null;
}

interface PaymentRun {
  id: string;
  naam: string | null;
  status: string;
  bv_id: string | null;
  totaal_bedrag: number | null;
  aantal_facturen: number | null;
  aangemaakt_op: string | null;
}

interface PaymentRunItem {
  id: string;
  payment_run_id: string;
  invoice_id: string;
  bedrag: number;
  iban_begunstigde: string | null;
  naam_begunstigde: string | null;
}

interface Counterparty { id: string; naam: string; iban?: string | null; }
interface BankAccount { id: string; bv_id: string; iban: string | null; naam: string | null; }

interface GoedgekeurdItem {
  id: string;
  bv_id: string;
  omschrijving: string;
  bedrag: number;
  categorie: string;
  week: string;
  bron: string;
  factuurnummer?: string;
  goedgekeurd_op?: string;
  status?: string;
}

export default function Betalingsronden() {
  const { bvs } = useBV();
  const { isAdmin, isViewer } = useUserRole();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'openstaand';
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [paymentRuns, setPaymentRuns] = useState<PaymentRun[]>([]);
  const [runItems, setRunItems] = useState<PaymentRunItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [goedgekeurdItems, setGoedgekeurdItems] = useState<GoedgekeurdItem[]>([]);
  const [selectedCIIds, setSelectedCIIds] = useState<Set<string>>(new Set());
  const [betaaldeItems, setBetaaldeItems] = useState<GoedgekeurdItem[]>([]);
  const [selectedBetaaldIds, setSelectedBetaaldIds] = useState<Set<string>>(new Set());
  const [historiekFilter, setHistoriekFilter] = useState('');

  const cpMap = useMemo(() => new Map(counterparties.map(c => [c.id, c])), [counterparties]);
  const bvMap = useMemo(() => new Map(bvs.map(b => [b.id, b])), [bvs]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [inv, cp, ba, pr, pri] = await Promise.all([
      supabase.from('invoices').select('*').eq('status', 'goedgekeurd'),
      supabase.from('counterparties').select('*'),
      supabase.from('bank_accounts').select('*'),
      supabase.from('payment_runs').select('*').order('aangemaakt_op', { ascending: false }),
      supabase.from('payment_run_items').select('*'),
    ]);
    const ci = await supabase.from('cashflow_items').select('*').eq('type', 'out');
    const goedgekeurdeCI = (ci.data || []).filter((item: any) => item.status === 'goedgekeurd');
    const betaaldeCI = (ci.data || []).filter((item: any) => 
      item.status === 'betaald' || item.status === 'ontvangen'
    );

    // Voeg betaalde invoices toe aan historiek
    const { data: betaaldeInvoices } = await supabase
      .from('invoices')
      .select('*, counterparties(naam)')
      .eq('status', 'betaald')
      .eq('import_status', 'imported')
      .order('imported_at', { ascending: false });

    const alleHistoriek = [
      ...(betaaldeCI as GoedgekeurdItem[]),
      ...(betaaldeInvoices || []).map((inv: any) => ({
        id: inv.id,
        bv_id: inv.bv_id,
        omschrijving: inv.counterparties?.naam ?? inv.factuurnummer ?? 'Factuur',
        bedrag: inv.bedrag,
        categorie: inv.type === 'AR' ? 'Omzet' : 'Diensten',
        week: inv.vervaldatum ?? inv.imported_at ?? '',
        bron: 'invoice',
        factuurnummer: inv.factuurnummer,
        status: 'betaald',
      })),
    ];

    if (inv.data) setInvoices(inv.data);
    if (cp.data) setCounterparties(cp.data as Counterparty[]);
    if (ba.data) setBankAccounts(ba.data);
    if (pr.data) setPaymentRuns(pr.data);
    if (pri.data) setRunItems(pri.data);
    setGoedgekeurdItems(goedgekeurdeCI as GoedgekeurdItem[]);
    setBetaaldeItems(alleHistoriek as GoedgekeurdItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const selectedTotal = useMemo(() =>
    invoices.filter(i => selected.has(i.id)).reduce((s, i) => s + i.bedrag, 0),
    [invoices, selected]);

  const createRun = async () => {
    if (selected.size === 0) return;
    const items = invoices.filter(i => selected.has(i.id));
    const total = items.reduce((s, i) => s + i.bedrag, 0);

    const { data: run, error } = await supabase.from('payment_runs').insert({
      naam: `Betalingsronde ${format(new Date(), 'dd-MM-yyyy HH:mm')}`,
      status: 'concept',
      totaal_bedrag: total,
      aantal_facturen: items.length,
    }).select().single();

    if (error || !run) { toast.error('Fout bij aanmaken'); return; }

    const runItemsData = items.map(i => {
      const cp = cpMap.get(i.counterparty_id || '');
      return {
        payment_run_id: run.id,
        invoice_id: i.id,
        bedrag: i.bedrag,
        naam_begunstigde: cp?.naam || 'Onbekend',
        iban_begunstigde: (cp as any)?.iban || null,
      };
    });

    await supabase.from('payment_run_items').insert(runItemsData);
    toast.success(`Betalingsronde aangemaakt met ${items.length} facturen`);
    setSelected(new Set());
    fetchData();
  };

  const generateSEPA = (run: PaymentRun) => {
    const items = runItems.filter(ri => ri.payment_run_id === run.id);
    const bv = bvMap.get(run.bv_id || '');
    const ba = bankAccounts.find(a => a.bv_id === (run.bv_id || bvs[0]?.id));
    const debtorIBAN = ba?.iban?.replace(/\s/g, '') || 'NL00BANK0000000000';
    const debtorName = (bv as any)?.naam || 'Boost';
    const msgId = `MSG-${run.id.slice(0, 8)}-${Date.now()}`;
    const creDtTm = new Date().toISOString();
    const nbOfTxs = items.length;
    const ctrlSum = items.reduce((s, i) => s + i.bedrag, 0).toFixed(2);

    const txns = items.map((item, idx) => {
      const iban = item.iban_begunstigde?.replace(/\s/g, '') || 'NL00BANK0000000000';
      return `
        <CdtTrfTxInf>
          <PmtId><EndToEndId>E2E-${run.id.slice(0, 8)}-${idx + 1}</EndToEndId></PmtId>
          <Amt><InstdAmt Ccy="EUR">${item.bedrag.toFixed(2)}</InstdAmt></Amt>
          <CdtrAgt><FinInstnId><BIC>BUNQNL2AXXX</BIC></FinInstnId></CdtrAgt>
          <Cdtr><Nm>${escXml(item.naam_begunstigde || 'Onbekend')}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${iban}</IBAN></Id></CdtrAcct>
          <RmtInf><Ustrd>Betaling factuur</Ustrd></RmtInf>
        </CdtTrfTxInf>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty><Nm>${escXml(debtorName)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${run.id.slice(0, 8)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${format(new Date(), 'yyyy-MM-dd')}</ReqdExctnDt>
      <Dbtr><Nm>${escXml(debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${debtorIBAN}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>BUNQNL2AXXX</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${txns}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sepa-${run.id.slice(0, 8)}.xml`;
    a.click();
    URL.revokeObjectURL(url);

    supabase.from('payment_runs').update({ status: 'klaargezet' }).eq('id', run.id).then(() => fetchData());
    toast.success('SEPA XML gedownload');
  };

  const markExecuted = async (run: PaymentRun) => {
    const items = runItems.filter(ri => ri.payment_run_id === run.id);
    await supabase.from('payment_runs').update({ status: 'uitgevoerd', uitgevoerd_op: new Date().toISOString() }).eq('id', run.id);
    for (const item of items) {
      await supabase.from('invoices').update({ status: 'betaald' }).eq('id', item.invoice_id);
      await supabase.from('audit_log').insert({
        tabel: 'invoices', actie: 'status → betaald', record_id: item.invoice_id,
        oud_waarde: { status: 'goedgekeurd' }, nieuw_waarde: { status: 'betaald' },
      });
    }
    toast.success('Betalingsronde uitgevoerd, facturen op betaald gezet');
    fetchData();
  };

  // ── Goedgekeurde cashflow_items functies ──
  const markeerBetaald = async (id: string) => {
    await supabase.from('cashflow_items').update({ status: 'betaald' } as any).eq('id', id);
    await supabase.from('audit_log').insert({
      tabel: 'cashflow_items', actie: 'status → betaald',
      record_id: id, oud_waarde: { status: 'goedgekeurd' }, nieuw_waarde: { status: 'betaald' },
    });
    toast.success('Post gemarkeerd als betaald');
    fetchData();
  };

  const markeerBetaaldBulk = async () => {
    const ids = Array.from(selectedCIIds);
    for (const id of ids) {
      await supabase.from('cashflow_items').update({ status: 'betaald' } as any).eq('id', id);
      await supabase.from('audit_log').insert({
        tabel: 'cashflow_items', actie: 'status → betaald',
        record_id: id, oud_waarde: { status: 'goedgekeurd' }, nieuw_waarde: { status: 'betaald' },
      });
    }
    toast.success(`${ids.length} posten gemarkeerd als betaald`);
    setSelectedCIIds(new Set());
    fetchData();
  };

  const verschuifCIBulk = async () => {
    const ids = Array.from(selectedCIIds);
    for (const id of ids) {
      const item = goedgekeurdItems.find(i => i.id === id);
      if (!item) continue;
      const newWeek = format(addDays(new Date(item.week), 7), 'yyyy-MM-dd');
      await supabase.from('cashflow_items').update({ week: newWeek, status: 'actief' } as any).eq('id', id);
    }
    toast.success(`${ids.length} posten verschoven en teruggezet naar actief`);
    setSelectedCIIds(new Set());
    fetchData();
  };

  const verwijderCI = async (id: string) => {
    await supabase.from('cashflow_items').update({ status: 'betaald' } as any).eq('id', id);
    await supabase.from('audit_log').insert({
      tabel: 'cashflow_items', actie: 'status → betaald (verwijderd uit betalingsronde)',
      record_id: id, oud_waarde: { status: 'goedgekeurd' }, nieuw_waarde: { status: 'betaald' },
    });
    toast.success('Post verplaatst naar historiek');
    fetchData();
  };

  const verwijderCIBulk = async () => {
    const ids = Array.from(selectedCIIds);
    for (const id of ids) {
      await supabase.from('cashflow_items').update({ status: 'betaald' } as any).eq('id', id);
      await supabase.from('audit_log').insert({
        tabel: 'cashflow_items', actie: 'status → betaald (verwijderd uit betalingsronde)',
        record_id: id, oud_waarde: { status: 'goedgekeurd' }, nieuw_waarde: { status: 'betaald' },
      });
    }
    toast.success(`${ids.length} posten verplaatst naar historiek`);
    setSelectedCIIds(new Set());
    fetchData();
  };

  // ── Historiek functies ──
  const terugzettenEnkel = async (id: string) => {
    // Haal het cashflow_item op om ref_id te weten
    const { data: ci } = await supabase
      .from('cashflow_items')
      .select('ref_id, ref_type')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('cashflow_items')
      .update({ status: 'actief', goedgekeurd_op: null } as any)
      .eq('id', id);
    if (error) { toast.error('Fout: ' + error.message); return; }

    // Als het gekoppeld is aan een invoice, zet die ook terug
    if (ci?.ref_type === 'invoice' && ci?.ref_id) {
      await supabase
        .from('invoices')
        .update({ status: 'open' } as any)
        .eq('id', ci.ref_id);
    }

    await supabase.from('audit_log').insert({
      tabel: 'cashflow_items',
      actie: 'status → actief (teruggezet)',
      record_id: id,
      oud_waarde: { status: 'betaald' },
      nieuw_waarde: { status: 'actief' },
    });
    toast.success('Post teruggezet naar Finance Meeting');
    fetchData();
  };

  const terugzettenBulk = async () => {
    const ids = Array.from(selectedBetaaldIds);
    for (const id of ids) {
      // Haal ref_id op
      const { data: ci } = await supabase
        .from('cashflow_items')
        .select('ref_id, ref_type')
        .eq('id', id)
        .maybeSingle();

      await supabase.from('cashflow_items')
        .update({ status: 'actief', goedgekeurd_op: null } as any)
        .eq('id', id);

      // Zet bijbehorende invoice terug op open
      if (ci?.ref_type === 'invoice' && ci?.ref_id) {
        await supabase
          .from('invoices')
          .update({ status: 'open' } as any)
          .eq('id', ci.ref_id);
      }

      await supabase.from('audit_log').insert({
        tabel: 'cashflow_items',
        actie: 'status → actief (teruggezet)',
        record_id: id,
        oud_waarde: { status: 'betaald' },
        nieuw_waarde: { status: 'actief' },
      });
    }
    toast.success(`${ids.length} posten teruggezet naar Finance Meeting`);
    setSelectedBetaaldIds(new Set());
    fetchData();
  };

  const verwijderenEnkel = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze post permanent wilt verwijderen?')) return;
    const { error } = await supabase.from('cashflow_items').delete().eq('id', id);
    if (error) { toast.error('Fout: ' + error.message); return; }
    await supabase.from('audit_log').insert({
      tabel: 'cashflow_items', actie: 'DELETE', record_id: id,
      oud_waarde: { status: 'betaald' }, nieuw_waarde: null,
    });
    toast.success('Post verwijderd');
    fetchData();
  };

  const verwijderenBulk = async () => {
    if (!confirm(`Weet je zeker dat je ${selectedBetaaldIds.size} posten permanent wilt verwijderen?`)) return;
    const ids = Array.from(selectedBetaaldIds);
    for (const id of ids) {
      await supabase.from('cashflow_items').delete().eq('id', id);
      await supabase.from('audit_log').insert({
        tabel: 'cashflow_items', actie: 'DELETE', record_id: id,
        oud_waarde: { status: 'betaald' }, nieuw_waarde: null,
      });
    }
    toast.success(`${ids.length} posten verwijderd`);
    setSelectedBetaaldIds(new Set());
    fetchData();
  };

  const fmt = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

  const STATUS_BADGE: Record<string, string> = {
    concept: 'bg-muted text-muted-foreground',
    klaargezet: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    uitgevoerd: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Betalingsronden</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="openstaand">Openstaand</TabsTrigger>
          <TabsTrigger value="historiek" className="flex items-center gap-1.5">
            Historiek
            {betaaldeItems.length > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground/20 px-1.5 text-xs font-medium">
                {betaaldeItems.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="openstaand" className="space-y-6">
          {/* Section: Goedgekeurde cashflow items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Goedgekeurd voor betaling</CardTitle>
                {isAdmin && selectedCIIds.size > 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={markeerBetaaldBulk}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Markeer betaald ({selectedCIIds.size})
                    </Button>
                    <Button size="sm" variant="outline" onClick={verschuifCIBulk}>
                      <ArrowRight className="h-3.5 w-3.5 mr-1" /> 1 week opschuiven
                    </Button>
                    <Button size="sm" variant="outline" className="text-muted-foreground" onClick={verwijderCIBulk}>
                      <ArrowRight className="h-3.5 w-3.5 mr-1" /> Naar historiek ({selectedCIIds.size})
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {goedgekeurdItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Geen goedgekeurde posten — keur posten goed via de Finance Meeting.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedCIIds.size === goedgekeurdItems.length && goedgekeurdItems.length > 0}
                          onCheckedChange={() => {
                            if (selectedCIIds.size === goedgekeurdItems.length) setSelectedCIIds(new Set());
                            else setSelectedCIIds(new Set(goedgekeurdItems.map(i => i.id)));
                          }}
                        />
                      </TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead>BV</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead>Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goedgekeurdItems.map(item => {
                      const bv = bvMap.get(item.bv_id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCIIds.has(item.id)}
                              onCheckedChange={() => {
                                const next = new Set(selectedCIIds);
                                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                setSelectedCIIds(next);
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{item.omschrijving}</div>
                            {item.factuurnummer && (
                              <div className="text-xs text-muted-foreground font-mono">#{item.factuurnummer}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: (bv as any)?.kleur || '#888' }} />
                              <span className="text-sm">{(bv as any)?.naam || '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.week}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-destructive">− {fmt(item.bedrag)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => markeerBetaald(item.id)}>
                                <Check className="h-3.5 w-3.5 mr-1" /> Betaald
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground"
                                onClick={() => verwijderCI(item.id)} title="Naar historiek">
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-medium border-t-2">
                      <TableCell colSpan={4} className="text-sm">Totaal ({goedgekeurdItems.length} posten)</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">− {fmt(goedgekeurdItems.reduce((s, i) => s + i.bedrag, 0))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Section A: Compose */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Nieuwe betalingsronde samenstellen</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Geen goedgekeurde facturen beschikbaar</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><Checkbox checked={selected.size === invoices.length && invoices.length > 0} onCheckedChange={() => { if (selected.size === invoices.length) setSelected(new Set()); else setSelected(new Set(invoices.map(i => i.id))); }} /></TableHead>
                        <TableHead>Relatie</TableHead>
                        <TableHead>BV</TableHead>
                        <TableHead className="text-right">Bedrag</TableHead>
                        <TableHead>Vervaldatum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map(inv => {
                        const cp = cpMap.get(inv.counterparty_id || '');
                        const bv = bvMap.get(inv.bv_id);
                        return (
                          <TableRow key={inv.id}>
                            <TableCell><Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} /></TableCell>
                            <TableCell className="text-sm">{cp?.naam || '—'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: (bv as any)?.kleur || '#888' }} />
                                <span className="text-sm">{(bv as any)?.naam || '—'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(inv.bedrag)}</TableCell>
                            <TableCell className="text-sm">{inv.vervaldatum ? format(new Date(inv.vervaldatum), 'd MMM yyyy', { locale: nl }) : '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/50 font-medium border-t-2">
                        <TableCell colSpan={3} className="text-sm">Totaal ({invoices.length} facturen)</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(invoices.reduce((s, i) => s + i.bedrag, 0))}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                  {isAdmin && selected.size > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <span className="text-sm font-medium">{selected.size} facturen geselecteerd — totaal: <span className="font-mono">{fmt(selectedTotal)}</span></span>
                      <Button onClick={createRun}><Plus className="mr-2 h-4 w-4" /> Maak betalingsronde</Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Section B: Previous runs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Eerdere betalingsronden</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nog geen betalingsronden</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead className="text-right">Facturen</TableHead>
                      <TableHead>Aangemaakt</TableHead>
                      <TableHead>Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentRuns.map(run => (
                      <TableRow key={run.id}>
                        <TableCell className="text-sm font-medium">{run.naam || '—'}</TableCell>
                        <TableCell><Badge className={STATUS_BADGE[run.status] || ''}>{run.status}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(run.totaal_bedrag || 0)}</TableCell>
                        <TableCell className="text-right text-sm">{run.aantal_facturen || 0}</TableCell>
                        <TableCell className="text-sm">{run.aangemaakt_op ? format(new Date(run.aangemaakt_op), 'd MMM yyyy HH:mm', { locale: nl }) : '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {run.status !== 'uitgevoerd' && (
                              <Button size="sm" variant="outline" onClick={() => generateSEPA(run)}>
                                <Download className="mr-1.5 h-3.5 w-3.5" /> SEPA XML
                              </Button>
                            )}
                            {(run.status === 'klaargezet') && (
                              <Button size="sm" variant="outline" onClick={() => markExecuted(run)}>
                                <Check className="mr-1.5 h-3.5 w-3.5" /> Markeer uitgevoerd
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-medium border-t-2">
                      <TableCell className="text-sm">Totaal ({paymentRuns.length} rondes)</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono text-sm">{fmt(paymentRuns.reduce((s, r) => s + (r.totaal_bedrag || 0), 0))}</TableCell>
                      <TableCell className="text-right text-sm">{paymentRuns.reduce((s, r) => s + (r.aantal_facturen || 0), 0)}</TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historiek">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Betaalde posten</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Zoek op omschrijving…"
                    value={historiekFilter}
                    onChange={e => setHistoriekFilter(e.target.value)}
                    className="h-8 w-48 text-sm"
                  />
                  {selectedBetaaldIds.size > 0 && (
                    <>
                      <Button size="sm" variant="outline" onClick={terugzettenBulk}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Terugzetten ({selectedBetaaldIds.size})
                      </Button>
                      <Button size="sm" variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={verwijderenBulk}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Verwijderen ({selectedBetaaldIds.size})
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {betaaldeItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nog geen betaalde posten.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedBetaaldIds.size === betaaldeItems.length && betaaldeItems.length > 0}
                          onCheckedChange={() => {
                            if (selectedBetaaldIds.size === betaaldeItems.length) {
                              setSelectedBetaaldIds(new Set());
                            } else {
                              setSelectedBetaaldIds(new Set(betaaldeItems.map(i => i.id)));
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>BV</TableHead>
                      <TableHead>Categorie</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead>Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {betaaldeItems
                      .filter(i =>
                        !historiekFilter ||
                        i.omschrijving?.toLowerCase().includes(historiekFilter.toLowerCase())
                      )
                      .map(item => {
                        const bv = bvMap.get(item.bv_id);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedBetaaldIds.has(item.id)}
                                onCheckedChange={() => {
                                  const next = new Set(selectedBetaaldIds);
                                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                  setSelectedBetaaldIds(next);
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>{item.omschrijving}</div>
                              {item.factuurnummer && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  #{item.factuurnummer}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={item.status === 'ontvangen' 
                                ? 'bg-blue-500/15 text-blue-600' 
                                : 'bg-emerald-500/15 text-emerald-600'}>
                                {item.status === 'ontvangen' ? 'Ontvangen' : 'Betaald'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: (bv as any)?.kleur || '#888' }} />
                                <span className="text-sm">{(bv as any)?.naam || '—'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.categorie || '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.week}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-destructive">
                              − {fmt(item.bedrag)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-7 text-muted-foreground"
                                  onClick={() => terugzettenEnkel(item.id)}
                                  title="Terugzetten naar Finance Meeting">
                                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Terugzetten
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => verwijderenEnkel(item.id)}
                                  title="Permanent verwijderen">
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Verwijderen
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
