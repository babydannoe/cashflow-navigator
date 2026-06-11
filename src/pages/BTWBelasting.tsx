import { useState, useEffect, useCallback } from 'react';
import { addMonths, startOfMonth } from 'date-fns';
import { Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface BtwEntry { te_betalen: string; te_vorderen: string; dirty?: boolean }

const QUARTERS = [1, 2, 3, 4] as const;

// 0-indexed month per kwartaal of betaling (Q1→april, Q2→juli, Q3→oktober, Q4→januari +1 jaar)
function quarterPayMonth(jaar: number, kwartaal: number): { y: number; m: number } {
  if (kwartaal === 1) return { y: jaar, m: 3 };
  if (kwartaal === 2) return { y: jaar, m: 6 };
  if (kwartaal === 3) return { y: jaar, m: 9 };
  return { y: jaar + 1, m: 0 };
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Maandag van de week waarin de laatste dag van de maand valt. Bij ontvangst (+14 dagen).
function getPaymentWeekDate(jaar: number, kwartaal: number, isReceipt: boolean): string {
  const { y, m } = quarterPayMonth(jaar, kwartaal);
  const last = new Date(y, m + 1, 0);
  const dow = last.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(y, m + 1, 0 - offset);
  if (isReceipt) monday.setDate(monday.getDate() + 14);
  return ymd(monday);
}

function parseAmount(s: string): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export default function BTWBelasting() {
  const { bvs } = useBV();
  const { isAdmin } = useUserRole();
  const jaar = new Date().getFullYear();

  const [entries, setEntries] = useState<Record<string, BtwEntry>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // VPB state (ongewijzigd)
  const [vpbEntries, setVpbEntries] = useState<Record<string, { bedrag: string; datum: string; inForecast: boolean }>>({});

  const keyOf = (bvId: string, q: number) => `${bvId}__${q}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('btw_quarterly')
      .select('*')
      .eq('jaar', jaar);
    const map: Record<string, BtwEntry> = {};
    (data || []).forEach((r: any) => {
      map[keyOf(r.bv_id, r.kwartaal)] = {
        te_betalen: r.te_betalen ? String(r.te_betalen).replace('.', ',') : '',
        te_vorderen: r.te_vorderen ? String(r.te_vorderen).replace('.', ',') : '',
      };
    });
    setEntries(map);
    setLoading(false);
  }, [jaar]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) =>
    n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

  const getEntry = (bvId: string, q: number): BtwEntry =>
    entries[keyOf(bvId, q)] || { te_betalen: '', te_vorderen: '' };

  const updateEntry = (bvId: string, q: number, field: 'te_betalen' | 'te_vorderen', value: string) => {
    setEntries(prev => ({
      ...prev,
      [keyOf(bvId, q)]: { ...getEntry(bvId, q), [field]: value, dirty: true },
    }));
  };

  const saveQuarter = async (bvId: string, q: number) => {
    const e = getEntry(bvId, q);
    const teBetalen = parseAmount(e.te_betalen);
    const teVorderen = parseAmount(e.te_vorderen);
    const k = keyOf(bvId, q);
    setSavingKey(k);
    try {
      // 1) Upsert btw_quarterly
      const { error: upErr } = await (supabase as any)
        .from('btw_quarterly')
        .upsert(
          { bv_id: bvId, jaar, kwartaal: q, te_betalen: teBetalen, te_vorderen: teVorderen },
          { onConflict: 'bv_id,jaar,kwartaal' }
        );
      if (upErr) throw upErr;

      // 2) Sync cashflow_item: verwijder bestaande post voor dit kwartaal/BV en herinsert
      const opmerking = `${jaar}-Q${q}`;
      await supabase
        .from('cashflow_items')
        .delete()
        .eq('bv_id', bvId)
        .eq('bron', 'btw_kwartaal')
        .eq('opmerking', opmerking);

      const netto = teBetalen - teVorderen; // > 0 = uitgave (te betalen), < 0 = ontvangst (teruggaaf)
      if (netto !== 0) {
        const isReceipt = netto < 0;
        const week = getPaymentWeekDate(jaar, q, isReceipt);
        await supabase.from('cashflow_items').insert({
          bv_id: bvId,
          week,
          type: isReceipt ? 'in' : 'out',
          bedrag: Math.abs(netto),
          omschrijving: isReceipt ? `BTW-teruggaaf ${jaar} Q${q}` : `BTW-afdracht ${jaar} Q${q}`,
          categorie: 'Belastingen',
          subcategorie: 'BTW',
          tegenpartij: 'Belastingdienst',
          bron: 'btw_kwartaal',
          ref_type: 'btw_kwartaal',
          opmerking,
        });
      }

      setEntries(prev => ({ ...prev, [k]: { ...e, dirty: false } }));
      toast.success(`Q${q} opgeslagen`);
    } catch (err: any) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingKey(null);
    }
  };

  const saveVPBToForecast = async (bvId: string) => {
    const entry = vpbEntries[bvId];
    if (!entry || !entry.bedrag) return;
    await supabase.from('cashflow_items').insert({
      bv_id: bvId,
      week: entry.datum || new Date().toISOString().split('T')[0],
      type: 'out',
      bedrag: parseFloat(entry.bedrag),
      omschrijving: 'VPB inschatting',
      categorie: 'Belastingen',
      subcategorie: 'VPB',
      tegenpartij: 'Belastingdienst',
      bron: 'handmatig',
      ref_type: 'handmatig',
    });
    toast.success('VPB toegevoegd aan forecast');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">BTW & Belasting</h1>

      <Tabs defaultValue="btw">
        <TabsList>
          <TabsTrigger value="btw">BTW per kwartaal</TabsTrigger>
          <TabsTrigger value="vpb">VPB Inschatting</TabsTrigger>
        </TabsList>

        <TabsContent value="btw" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" /> BTW {jaar} — per BV en kwartaal
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Vul per kwartaal het af te dragen en het terug te vorderen bedrag in (zoals zichtbaar in Exact).
                Het saldo wordt automatisch als één post in de Forecast Explorer geplaatst:
                Q1 → laatste week april, Q2 → juli, Q3 → oktober, Q4 → januari volgend jaar.
                Teruggaaf wordt 2 weken later ingepland.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Laden...</div>
              ) : (
                <div className="space-y-6">
                  {bvs.map(bv => (
                    <div key={bv.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: bv.kleur || '#888' }} />
                        <span className="font-semibold text-sm">{bv.naam}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">Kwartaal</TableHead>
                            <TableHead>Te betalen (€)</TableHead>
                            <TableHead>Terug te vorderen (€)</TableHead>
                            <TableHead>Netto</TableHead>
                            <TableHead>Inplandatum</TableHead>
                            <TableHead className="w-32"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {QUARTERS.map(q => {
                            const e = getEntry(bv.id, q);
                            const k = keyOf(bv.id, q);
                            const teB = parseAmount(e.te_betalen);
                            const teV = parseAmount(e.te_vorderen);
                            const netto = teB - teV;
                            const isReceipt = netto < 0;
                            const datum = netto !== 0 ? getPaymentWeekDate(jaar, q, isReceipt) : '—';
                            return (
                              <TableRow key={q}>
                                <TableCell className="font-medium text-sm">Q{q}</TableCell>
                                <TableCell>
                                  <Input
                                    value={e.te_betalen}
                                    onChange={ev => updateEntry(bv.id, q, 'te_betalen', ev.target.value)}
                                    placeholder="0,00"
                                    className="h-8 w-32 font-mono text-sm tabular-nums"
                                    disabled={!isAdmin}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={e.te_vorderen}
                                    onChange={ev => updateEntry(bv.id, q, 'te_vorderen', ev.target.value)}
                                    placeholder="0,00"
                                    className="h-8 w-32 font-mono text-sm tabular-nums"
                                    disabled={!isAdmin}
                                  />
                                </TableCell>
                                <TableCell className={`font-mono text-sm tabular-nums ${netto > 0 ? 'text-red-600' : netto < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                  {netto === 0 ? '—' : `${isReceipt ? '+' : '-'} ${fmt(Math.abs(netto))}`}
                                  {netto !== 0 && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      ({isReceipt ? 'teruggaaf' : 'afdracht'})
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground tabular-nums">{datum}</TableCell>
                                <TableCell>
                                  {isAdmin && (
                                    <Button
                                      size="sm"
                                      variant={e.dirty ? 'default' : 'outline'}
                                      onClick={() => saveQuarter(bv.id, q)}
                                      disabled={savingKey === k}
                                      className="h-8"
                                    >
                                      {savingKey === k ? 'Opslaan...' : 'Opslaan'}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vpb" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">VPB Inschatting per BV</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BV</TableHead>
                    <TableHead>Bedrag (€)</TableHead>
                    <TableHead>Verwachte betaaldatum</TableHead>
                    <TableHead>Opnemen in forecast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bvs.map(bv => {
                    const entry = vpbEntries[bv.id] || { bedrag: '', datum: '', inForecast: false };
                    return (
                      <TableRow key={bv.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bv.kleur || '#888' }} />
                            <span className="text-sm">{bv.naam}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={entry.bedrag} onChange={e => setVpbEntries(prev => ({ ...prev, [bv.id]: { ...entry, bedrag: e.target.value } }))} className="h-8 w-32 text-sm font-mono" step="0.01" disabled={!isAdmin} />
                        </TableCell>
                        <TableCell>
                          <Input type="date" value={entry.datum} onChange={e => setVpbEntries(prev => ({ ...prev, [bv.id]: { ...entry, datum: e.target.value } }))} className="h-8 w-40 text-sm" disabled={!isAdmin} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch disabled={!isAdmin} checked={entry.inForecast} onCheckedChange={checked => {
                              setVpbEntries(prev => ({ ...prev, [bv.id]: { ...entry, inForecast: checked } }));
                              if (checked) saveVPBToForecast(bv.id);
                            }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
