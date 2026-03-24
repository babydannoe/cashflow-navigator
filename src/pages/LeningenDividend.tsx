import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, addMonths } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Plus, ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Loan {
  id: string; bv_id: string; kredietverstrekker: string | null; hoofdsom: number | null;
  rente_percentage: number | null; startdatum: string | null; einddatum: string | null;
  aflossingsfrequentie: string | null;
}
interface LoanPayment {
  id: string; loan_id: string; hoofdsom: number | null; rente: number | null;
  betaaldatum: string | null; status: string | null;
}
interface Dividend {
  id: string; bv_id: string; aandeelhouder: string | null; bedrag: number | null;
  geplande_betaaldatum: string | null; status: string | null;
}

export default function LeningenDividend() {
  const { bvs } = useBV();
  const { isAdmin } = useUserRole();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLoans, setExpandedLoans] = useState<Set<string>>(new Set());

  // Modals
  const [loanOpen, setLoanOpen] = useState(false);
  const [divOpen, setDivOpen] = useState(false);
  const [newLoan, setNewLoan] = useState({ bv_id: '', kredietverstrekker: '', hoofdsom: '', rente_percentage: '', startdatum: '', einddatum: '', aflossingsfrequentie: 'maandelijks' });
  const [newDiv, setNewDiv] = useState({ bv_id: '', aandeelhouder: '', bedrag: '', datum: '' });

  const bvMap = useMemo(() => new Map(bvs.map(b => [b.id, b])), [bvs]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [l, p, d] = await Promise.all([
      supabase.from('loans').select('*'),
      supabase.from('loan_payments').select('*').order('betaaldatum'),
      supabase.from('dividends').select('*').order('geplande_betaaldatum'),
    ]);
    if (l.data) setLoans(l.data);
    if (p.data) setPayments(p.data);
    if (d.data) setDividends(d.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

  const getRestschuld = (loan: Loan) => {
    const paid = payments.filter(p => p.loan_id === loan.id && p.status === 'betaald').reduce((s, p) => s + (p.hoofdsom || 0), 0);
    return (loan.hoofdsom || 0) - paid;
  };

  const addLoan = async () => {
    if (!newLoan.bv_id || !newLoan.hoofdsom) { toast.error('Vul BV en hoofdsom in'); return; }
    const { error } = await supabase.from('loans').insert({
      bv_id: newLoan.bv_id,
      kredietverstrekker: newLoan.kredietverstrekker || null,
      hoofdsom: parseFloat(newLoan.hoofdsom),
      rente_percentage: newLoan.rente_percentage ? parseFloat(newLoan.rente_percentage) : null,
      startdatum: newLoan.startdatum || null,
      einddatum: newLoan.einddatum || null,
      aflossingsfrequentie: newLoan.aflossingsfrequentie,
    });
    if (error) { toast.error('Fout: ' + error.message); return; }
    toast.success('Lening toegevoegd');
    setLoanOpen(false);
    setNewLoan({ bv_id: '', kredietverstrekker: '', hoofdsom: '', rente_percentage: '', startdatum: '', einddatum: '', aflossingsfrequentie: 'maandelijks' });
    fetchData();
  };

  const generateSchedule = async (loan: Loan) => {
    if (!loan.startdatum || !loan.einddatum || !loan.hoofdsom) { toast.error('Start/einddatum en hoofdsom vereist'); return; }
    const start = new Date(loan.startdatum);
    const end = new Date(loan.einddatum);
    const months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    const monthlyPrincipal = (loan.hoofdsom || 0) / months;
    const monthlyInterest = ((loan.hoofdsom || 0) * (loan.rente_percentage || 0) / 100) / 12;

    const items = [];
    for (let i = 0; i < months; i++) {
      const date = addMonths(start, i + 1);
      items.push({
        loan_id: loan.id,
        hoofdsom: Math.round(monthlyPrincipal * 100) / 100,
        rente: Math.round(monthlyInterest * 100) / 100,
        betaaldatum: format(date, 'yyyy-MM-dd'),
        status: 'gepland',
      });
    }

    // Delete existing
    await supabase.from('loan_payments').delete().eq('loan_id', loan.id);
    await supabase.from('loan_payments').insert(items);
    toast.success(`${items.length} aflossingen gegenereerd`);
    fetchData();
  };

  const addLoanToForecast = async (loan: Loan) => {
    const futurePmts = payments.filter(p => p.loan_id === loan.id && p.status === 'gepland');
    for (const pmt of futurePmts) {
      await supabase.from('cashflow_items').insert({
        bv_id: loan.bv_id, week: pmt.betaaldatum || new Date().toISOString().split('T')[0],
        type: 'out', bedrag: (pmt.hoofdsom || 0) + (pmt.rente || 0),
        omschrijving: `Aflossing ${loan.kredietverstrekker || 'Lening'}`,
        categorie: 'Financiering', subcategorie: loan.kredietverstrekker || 'Lening',
        tegenpartij: loan.kredietverstrekker || 'Lening', bron: 'handmatig', ref_type: 'loan',
      });
    }
    toast.success(`${futurePmts.length} aflossingen toegevoegd aan forecast`);
  };

  const addDividend = async () => {
    if (!newDiv.bv_id || !newDiv.bedrag) { toast.error('Vul BV en bedrag in'); return; }
    const { error } = await supabase.from('dividends').insert({
      bv_id: newDiv.bv_id,
      aandeelhouder: newDiv.aandeelhouder || null,
      bedrag: parseFloat(newDiv.bedrag),
      geplande_betaaldatum: newDiv.datum || null,
      status: 'gepland',
    });
    if (error) { toast.error('Fout: ' + error.message); return; }

    // Also add to forecast
    await supabase.from('cashflow_items').insert({
      bv_id: newDiv.bv_id, week: newDiv.datum || new Date().toISOString().split('T')[0],
      type: 'out', bedrag: parseFloat(newDiv.bedrag),
      omschrijving: `Dividend ${newDiv.aandeelhouder || ''}`.trim(),
      categorie: 'Dividend', subcategorie: newDiv.aandeelhouder || 'Dividend',
      tegenpartij: newDiv.aandeelhouder || 'Aandeelhouder', bron: 'handmatig', ref_type: 'dividend',
    });

    await supabase.from('audit_log').insert({
      tabel: 'dividends', actie: 'nieuw', nieuw_waarde: { aandeelhouder: newDiv.aandeelhouder, bedrag: newDiv.bedrag },
    });

    toast.success('Dividend gepland en aan forecast toegevoegd');
    setDivOpen(false);
    setNewDiv({ bv_id: '', aandeelhouder: '', bedrag: '', datum: '' });
    fetchData();
  };

  const updateDivStatus = async (div: Dividend, newStatus: string) => {
    await supabase.from('dividends').update({ status: newStatus }).eq('id', div.id);
    await supabase.from('audit_log').insert({
      tabel: 'dividends', actie: `status → ${newStatus}`, record_id: div.id,
      oud_waarde: { status: div.status }, nieuw_waarde: { status: newStatus },
    });
    toast.success(`Status bijgewerkt naar ${newStatus}`);
    fetchData();
  };

  const DIV_STATUS: Record<string, string> = {
    gepland: 'bg-muted text-muted-foreground',
    goedgekeurd: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    uitgekeerd: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Leningen & Dividend</h1>

      <Tabs defaultValue="leningen">
        <TabsList>
          <TabsTrigger value="leningen">Leningen</TabsTrigger>
          <TabsTrigger value="dividend">Dividend</TabsTrigger>
        </TabsList>

        <TabsContent value="leningen" className="space-y-4 mt-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={() => { setNewLoan(n => ({ ...n, bv_id: bvs[0]?.id || '' })); setLoanOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Lening toevoegen
              </Button>
            </div>
          )}
            </Button>
          </div>

          {loans.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Geen leningen gevonden</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>BV</TableHead>
                      <TableHead>Kredietverstrekker</TableHead>
                      <TableHead className="text-right">Hoofdsom</TableHead>
                      <TableHead className="text-right">Rente%</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Eind</TableHead>
                      <TableHead className="text-right">Restschuld</TableHead>
                      <TableHead>Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map(loan => {
                      const bv = bvMap.get(loan.bv_id);
                      const expanded = expandedLoans.has(loan.id);
                      const loanPmts = payments.filter(p => p.loan_id === loan.id);
                      return (
                        <>
                          <TableRow key={loan.id} className="cursor-pointer" onClick={() => {
                            const s = new Set(expandedLoans);
                            if (s.has(loan.id)) s.delete(loan.id); else s.add(loan.id);
                            setExpandedLoans(s);
                          }}>
                            <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bv?.kleur || '#888' }} />
                                <span className="text-sm">{bv?.naam || '—'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{loan.kredietverstrekker || '—'}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(loan.hoofdsom || 0)}</TableCell>
                            <TableCell className="text-right text-sm">{loan.rente_percentage != null ? `${loan.rente_percentage}%` : '—'}</TableCell>
                            <TableCell className="text-sm">{loan.startdatum ? format(new Date(loan.startdatum), 'd MMM yyyy', { locale: nl }) : '—'}</TableCell>
                            <TableCell className="text-sm">{loan.einddatum ? format(new Date(loan.einddatum), 'd MMM yyyy', { locale: nl }) : '—'}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">{fmt(getRestschuld(loan))}</TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => generateSchedule(loan)}>
                                  <Calculator className="mr-1 h-3 w-3" /> Schema
                                </Button>
                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => addLoanToForecast(loan)}>
                                  Forecast
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expanded && loanPmts.map(pmt => (
                            <TableRow key={pmt.id} className="bg-muted/30">
                              <TableCell></TableCell>
                              <TableCell colSpan={2} className="text-xs text-muted-foreground pl-8">
                                {pmt.betaaldatum ? format(new Date(pmt.betaaldatum), 'd MMM yyyy', { locale: nl }) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{fmt(pmt.hoofdsom || 0)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{fmt(pmt.rente || 0)}</TableCell>
                              <TableCell colSpan={2}></TableCell>
                              <TableCell className="text-right font-mono text-xs">{fmt((pmt.hoofdsom || 0) + (pmt.rente || 0))}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{pmt.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dividend" className="space-y-4 mt-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={() => { setNewDiv(n => ({ ...n, bv_id: bvs[0]?.id || '' })); setDivOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Dividend plannen
              </Button>
            </div>
          )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BV</TableHead>
                    <TableHead>Aandeelhouder</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead>Geplande datum</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividends.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Geen dividenduitkeringen gepland</TableCell></TableRow>
                  ) : dividends.map(div => {
                    const bv = bvMap.get(div.bv_id);
                    return (
                      <TableRow key={div.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bv?.kleur || '#888' }} />
                            <span className="text-sm">{bv?.naam || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{div.aandeelhouder || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(div.bedrag || 0)}</TableCell>
                        <TableCell className="text-sm">{div.geplande_betaaldatum ? format(new Date(div.geplande_betaaldatum), 'd MMM yyyy', { locale: nl }) : '—'}</TableCell>
                        <TableCell><Badge className={DIV_STATUS[div.status || 'gepland'] || ''}>{div.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {div.status === 'gepland' && (
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => updateDivStatus(div, 'goedgekeurd')}>Goedkeuren</Button>
                            )}
                            {div.status === 'goedgekeurd' && (
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => updateDivStatus(div, 'uitgekeerd')}>Uitkeren</Button>
                            )}
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

      {/* Add Loan Modal */}
      <Dialog open={loanOpen} onOpenChange={setLoanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lening toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">BV</Label>
              <Select value={newLoan.bv_id} onValueChange={v => setNewLoan(n => ({ ...n, bv_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{bvs.map(b => <SelectItem key={b.id} value={b.id}>{b.naam}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kredietverstrekker</Label>
              <Input value={newLoan.kredietverstrekker} onChange={e => setNewLoan(n => ({ ...n, kredietverstrekker: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Hoofdsom (€)</Label>
                <Input type="number" value={newLoan.hoofdsom} onChange={e => setNewLoan(n => ({ ...n, hoofdsom: e.target.value }))} className="h-9 text-sm" step="0.01" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rente %</Label>
                <Input type="number" value={newLoan.rente_percentage} onChange={e => setNewLoan(n => ({ ...n, rente_percentage: e.target.value }))} className="h-9 text-sm" step="0.01" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Startdatum</Label>
                <Input type="date" value={newLoan.startdatum} onChange={e => setNewLoan(n => ({ ...n, startdatum: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Einddatum</Label>
                <Input type="date" value={newLoan.einddatum} onChange={e => setNewLoan(n => ({ ...n, einddatum: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLoanOpen(false)}>Annuleren</Button>
            <Button onClick={addLoan}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dividend Modal */}
      <Dialog open={divOpen} onOpenChange={setDivOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dividend plannen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">BV</Label>
              <Select value={newDiv.bv_id} onValueChange={v => setNewDiv(n => ({ ...n, bv_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{bvs.map(b => <SelectItem key={b.id} value={b.id}>{b.naam}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Aandeelhouder</Label>
              <Input value={newDiv.aandeelhouder} onChange={e => setNewDiv(n => ({ ...n, aandeelhouder: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bedrag (€)</Label>
              <Input type="number" value={newDiv.bedrag} onChange={e => setNewDiv(n => ({ ...n, bedrag: e.target.value }))} className="h-9 text-sm" step="0.01" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Geplande betaaldatum</Label>
              <Input type="date" value={newDiv.datum} onChange={e => setNewDiv(n => ({ ...n, datum: e.target.value }))} className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDivOpen(false)}>Annuleren</Button>
            <Button onClick={addDividend}>Plannen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
