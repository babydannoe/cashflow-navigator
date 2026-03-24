import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Plus, ArrowUpDown, CheckCircle, CreditCard, Check, Search, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBV, type BV } from '@/contexts/BVContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ForecastDrilldownDrawer, type DrilldownItem } from '@/components/ForecastDrilldownDrawer';
import { useUserRole } from '@/hooks/useUserRole';

interface Invoice {
  id: string;
  bv_id: string;
  counterparty_id: string | null;
  type: string | null;
  bedrag: number;
  vervaldatum: string | null;
  factuurnummer: string | null;
  status: string | null;
  bron: string | null;
}

interface Counterparty {
  id: string;
  naam: string;
}

const STATUS_COLORS: Record<string, string> = {
  'open': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'ter_goedkeuring': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'goedgekeurd': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'betaald': 'bg-muted text-muted-foreground',
  'vervallen': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_LABELS: Record<string, string> = {
  'open': 'Open',
  'ter_goedkeuring': 'Ter goedkeuring',
  'goedgekeurd': 'Goedgekeurd',
  'betaald': 'Betaald',
  'vervallen': 'Vervallen',
};

type SortKey = 'factuurnummer' | 'bv_id' | 'type' | 'bedrag' | 'vervaldatum' | 'status' | 'bron';

export default function Facturen() {
  const { bvs, selectedBVId } = useBV();
  const { isAdmin } = useUserRole();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('vervaldatum');
  const [sortAsc, setSortAsc] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState('');

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [newInv, setNewInv] = useState({ bv_id: '', type: 'AR', counterparty_id: '', bedrag: '', vervaldatum: '', factuurnummer: '', omschrijving: '' });

  // Drilldown
  const [drawerItem, setDrawerItem] = useState<DrilldownItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cpMap = useMemo(() => new Map(counterparties.map(c => [c.id, c.naam])), [counterparties]);
  const bvMap = useMemo(() => new Map(bvs.map(b => [b.id, b])), [bvs]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [inv, cp] = await Promise.all([
      supabase.from('invoices').select('*').order('vervaldatum', { ascending: true }),
      supabase.from('counterparties').select('id, naam'),
    ]);
    if (inv.data) setInvoices(inv.data);
    if (cp.data) setCounterparties(cp.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (selectedBVId) list = list.filter(i => i.bv_id === selectedBVId);
    if (filterType !== 'all') list = list.filter(i => i.type === filterType);
    if (filterStatus !== 'all') list = list.filter(i => i.status === filterStatus);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter(i => {
        const cpName = cpMap.get(i.counterparty_id || '') || '';
        return cpName.toLowerCase().includes(q) || (i.factuurnummer || '').toLowerCase().includes(q);
      });
    }
    // Sort
    list = [...list].sort((a, b) => {
      let va: any = (a as any)[sortKey];
      let vb: any = (b as any)[sortKey];
      if (sortKey === 'bedrag') { va = Number(va); vb = Number(vb); }
      else { va = String(va || ''); vb = String(vb || ''); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [invoices, selectedBVId, filterType, filterStatus, filterSearch, sortKey, sortAsc, cpMap]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  };

  const logAudit = async (invoiceId: string, actie: string, oud: string | null, nieuw: string) => {
    await supabase.from('audit_log').insert({
      tabel: 'invoices',
      actie,
      record_id: invoiceId,
      oud_waarde: oud ? { status: oud } : null,
      nieuw_waarde: { status: nieuw },
    });
  };

  const bulkUpdateStatus = async (newStatus: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    for (const id of ids) {
      const inv = invoices.find(i => i.id === id);
      await supabase.from('invoices').update({ status: newStatus }).eq('id', id);
      await logAudit(id, `status → ${newStatus}`, inv?.status || null, newStatus);
    }
    toast.success(`${ids.length} facturen bijgewerkt naar "${STATUS_LABELS[newStatus] || newStatus}"`);
    setSelected(new Set());
    fetchData();
  };

  const handleAddInvoice = async () => {
    if (!newInv.bv_id || !newInv.bedrag) { toast.error('Vul BV en bedrag in'); return; }
    const { error } = await supabase.from('invoices').insert({
      bv_id: newInv.bv_id,
      type: newInv.type,
      counterparty_id: newInv.counterparty_id || null,
      bedrag: parseFloat(newInv.bedrag),
      vervaldatum: newInv.vervaldatum || null,
      factuurnummer: newInv.factuurnummer || null,
      status: 'open',
      bron: 'handmatig',
    });
    if (error) { toast.error('Fout: ' + error.message); return; }
    toast.success('Factuur toegevoegd');
    setAddOpen(false);
    setNewInv({ bv_id: '', type: 'AR', counterparty_id: '', bedrag: '', vervaldatum: '', factuurnummer: '', omschrijving: '' });
    fetchData();
  };

  const openDrawer = (inv: Invoice) => {
    const bv = bvMap.get(inv.bv_id);
    setDrawerItem({
      bv_id: inv.bv_id,
      bv_naam: bv?.naam || '',
      bv_kleur: bv?.kleur || '#888',
      categorie: inv.type === 'AR' ? 'Omzet' : 'Kosten',
      subcategorie: cpMap.get(inv.counterparty_id || '') || '',
      tegenpartij: cpMap.get(inv.counterparty_id || '') || '',
      factuurnummer: inv.factuurnummer || undefined,
      bron: inv.bron || 'handmatig',
      bedrag: inv.bedrag,
      vervaldatum: inv.vervaldatum || undefined,
      status: inv.status || 'open',
      ref_id: inv.id,
      ref_type: 'invoice',
      type: inv.type === 'AR' ? 'in' : 'out',
      week: inv.vervaldatum || '',
      omschrijving: `${inv.factuurnummer || ''} - ${cpMap.get(inv.counterparty_id || '') || 'Onbekend'}`,
    });
    setDrawerOpen(true);
  };

  const fmt = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Facturen & Goedkeuringen</h1>
        {isAdmin && (
          <Button onClick={() => { setNewInv(n => ({ ...n, bv_id: bvs[0]?.id || '' })); setAddOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Factuur toevoegen
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-card border rounded-xl p-4">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="AR">AR (in)</SelectItem>
              <SelectItem value="AP">AP (uit)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Zoek relatie / factuurnr</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Zoeken..." className="h-9 pl-8 text-sm" />
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('ter_goedkeuring')}>
            <Filter className="mr-1.5 h-3.5 w-3.5" /> Ter goedkeuring
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('goedgekeurd')}>
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Goedkeuren
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('betaald')}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Markeer betaald
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('factuurnummer')}># <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('bv_id')}>BV <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('type')}>Type <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Relatie</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('bedrag')}>Bedrag <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('vervaldatum')}>Vervaldatum <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>Status <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Bron</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Geen facturen gevonden</TableCell></TableRow>
            ) : filtered.map(inv => {
              const bv = bvMap.get(inv.bv_id);
              const cpName = cpMap.get(inv.counterparty_id || '') || '—';
              const status = inv.status || 'open';
              return (
                <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDrawer(inv)}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{inv.factuurnummer || '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bv?.kleur || '#888' }} />
                      <span className="text-sm">{bv?.naam || '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{inv.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{cpName}</TableCell>
                  <TableCell className={`text-right font-mono text-sm ${inv.type === 'AR' ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(inv.bedrag)}
                  </TableCell>
                  <TableCell className="text-sm">{inv.vervaldatum ? format(new Date(inv.vervaldatum), 'd MMM yyyy', { locale: nl }) : '—'}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_COLORS[status] || ''}`}>{STATUS_LABELS[status] || status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{inv.bron || '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Factuur toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">BV</Label>
              <Select value={newInv.bv_id} onValueChange={v => setNewInv(n => ({ ...n, bv_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecteer BV" /></SelectTrigger>
                <SelectContent>{bvs.map(b => <SelectItem key={b.id} value={b.id}>{b.naam}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={newInv.type} onValueChange={v => setNewInv(n => ({ ...n, type: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AR">AR (debiteur)</SelectItem>
                  <SelectItem value="AP">AP (crediteur)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Relatie</Label>
              <Select value={newInv.counterparty_id} onValueChange={v => setNewInv(n => ({ ...n, counterparty_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecteer relatie" /></SelectTrigger>
                <SelectContent>{counterparties.map(c => <SelectItem key={c.id} value={c.id}>{c.naam}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bedrag (€)</Label>
              <Input type="number" value={newInv.bedrag} onChange={e => setNewInv(n => ({ ...n, bedrag: e.target.value }))} className="h-9 text-sm" step="0.01" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vervaldatum</Label>
              <Input type="date" value={newInv.vervaldatum} onChange={e => setNewInv(n => ({ ...n, vervaldatum: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Factuurnummer</Label>
              <Input value={newInv.factuurnummer} onChange={e => setNewInv(n => ({ ...n, factuurnummer: e.target.value }))} className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddInvoice}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drilldown drawer */}
      <ForecastDrilldownDrawer item={drawerItem} open={drawerOpen} onClose={() => setDrawerOpen(false)} onRefresh={fetchData} bvs={bvs} />
    </div>
  );
}
