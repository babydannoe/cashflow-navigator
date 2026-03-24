import { useState, useEffect, useCallback } from 'react';
import { format, addMonths, startOfMonth } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Plus, Calculator, ToggleLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Invoice { id: string; bv_id: string; type: string | null; bedrag: number; status: string | null; }
interface VatPosition { id: string; bv_id: string; periode_label: string | null; verschuldigd_btw: number | null; te_vorderen_btw: number | null; netto_btw: number | null; status: string | null; }

export default function BTWBelasting() {
  const { bvs } = useBV();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vatPositions, setVatPositions] = useState<VatPosition[]>([]);
  const [loading, setLoading] = useState(true);

  // VPB state
  const [vpbEntries, setVpbEntries] = useState<Record<string, { bedrag: string; datum: string; inForecast: boolean }>>({});
  const [vpbAddOpen, setVpbAddOpen] = useState(false);
  const [vpbNew, setVpbNew] = useState({ bv_id: '', bedrag: '', datum: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [inv, vat] = await Promise.all([
      supabase.from('invoices').select('id, bv_id, type, bedrag, status').eq('status', 'open'),
      supabase.from('vat_positions').select('*'),
    ]);
    if (inv.data) setInvoices(inv.data);
    if (vat.data) setVatPositions(vat.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
  const BTW_RATE = 0.21;

  const getBTWForBV = (bvId: string) => {
    const bvInv = invoices.filter(i => i.bv_id === bvId);
    const arBTW = bvInv.filter(i => i.type === 'AR').reduce((s, i) => s + i.bedrag * BTW_RATE, 0);
    const apBTW = bvInv.filter(i => i.type === 'AP').reduce((s, i) => s + i.bedrag * BTW_RATE, 0);
    return { omzetbelasting: arBTW, voorbelasting: apBTW, netto: arBTW - apBTW };
  };

  const addBTWToForecast = async (bvId: string) => {
    const { netto } = getBTWForBV(bvId);
    if (netto <= 0) { toast.info('Geen positieve BTW-afdracht'); return; }
    const nextMonth = startOfMonth(addMonths(new Date(), 1));
    const weekDate = nextMonth.toISOString().split('T')[0];
    await supabase.from('cashflow_items').insert({
      bv_id: bvId, week: weekDate, type: 'out', bedrag: netto,
      omschrijving: 'BTW-afdracht (forecast)', categorie: 'Belastingen',
      subcategorie: 'BTW', tegenpartij: 'Belastingdienst', bron: 'handmatig', ref_type: 'handmatig',
    });
    toast.success('BTW-afdracht toegevoegd aan forecast');
  };

  const saveVPBToForecast = async (bvId: string) => {
    const entry = vpbEntries[bvId];
    if (!entry || !entry.bedrag) return;
    await supabase.from('cashflow_items').insert({
      bv_id: bvId, week: entry.datum || new Date().toISOString().split('T')[0],
      type: 'out', bedrag: parseFloat(entry.bedrag),
      omschrijving: 'VPB inschatting', categorie: 'Belastingen',
      subcategorie: 'VPB', tegenpartij: 'Belastingdienst', bron: 'handmatig', ref_type: 'handmatig',
    });
    toast.success('VPB toegevoegd aan forecast');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">BTW & Belasting</h1>

      <Tabs defaultValue="btw">
        <TabsList>
          <TabsTrigger value="btw">BTW Forecast</TabsTrigger>
          <TabsTrigger value="vpb">VPB Inschatting</TabsTrigger>
        </TabsList>

        <TabsContent value="btw" className="space-y-4 mt-4">
          {bvs.map(bv => {
            const btw = getBTWForBV(bv.id);
            const bvVat = vatPositions.filter(v => v.bv_id === bv.id);
            return (
              <Card key={bv.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: bv.kleur || '#888' }} />
                    {bv.naam}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Exact BTW</p>
                      <p className="text-sm font-mono text-muted-foreground">€0 — nog niet gekoppeld</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Omzetbelasting (AR)</p>
                      <p className="text-sm font-mono">{fmt(btw.omzetbelasting)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Voorbelasting (AP)</p>
                      <p className="text-sm font-mono">{fmt(btw.voorbelasting)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Netto te betalen</p>
                      <p className={`text-sm font-mono font-bold ${btw.netto > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(btw.netto)}</p>
                    </div>
                  </div>

                  {bvVat.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Periode</TableHead>
                          <TableHead className="text-right">Verschuldigd</TableHead>
                          <TableHead className="text-right">Te vorderen</TableHead>
                          <TableHead className="text-right">Netto</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bvVat.map(v => (
                          <TableRow key={v.id}>
                            <TableCell className="text-sm">{v.periode_label || '—'}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(v.verschuldigd_btw || 0)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(v.te_vorderen_btw || 0)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">{fmt(v.netto_btw || 0)}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{v.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  <Button size="sm" variant="outline" onClick={() => addBTWToForecast(bv.id)}>
                    <Calculator className="mr-1.5 h-3.5 w-3.5" /> Voeg BTW-afdracht toe aan forecast
                  </Button>
                </CardContent>
              </Card>
            );
          })}
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
                          <Input type="number" value={entry.bedrag} onChange={e => setVpbEntries(prev => ({ ...prev, [bv.id]: { ...entry, bedrag: e.target.value } }))} className="h-8 w-32 text-sm font-mono" step="0.01" />
                        </TableCell>
                        <TableCell>
                          <Input type="date" value={entry.datum} onChange={e => setVpbEntries(prev => ({ ...prev, [bv.id]: { ...entry, datum: e.target.value } }))} className="h-8 w-40 text-sm" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={entry.inForecast} onCheckedChange={checked => {
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
