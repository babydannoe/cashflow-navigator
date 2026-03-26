import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { format, startOfISOWeek } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  RefreshCw, TrendingUp, CheckCircle2, CalendarIcon, Loader2, X,
  ArrowUpDown, ArrowUp, ArrowDown, Search,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Invoice {
  id: string;
  bv_id: string;
  type: string | null;
  factuurnummer: string | null;
  bedrag: number;
  vervaldatum: string | null;
  status: string | null;
  import_status: string | null;
  exact_id: string | null;
  bron: string | null;
  counterparty_id: string | null;
  aangemaakt_in_exact?: string | null;
  counterparties: { id: string; naam: string } | null;
  _suggestRecurring?: boolean;
}

function castInvoice(row: any): Invoice {
  return row as Invoice;
}

type SortField = 'aangemaakt_in_exact' | 'tegenpartij' | 'bedrag' | 'vervaldatum';

export default function ExactImport() {
  const { bvs } = useBV();
  const { isAdmin, isViewer } = useUserRole();
  const queryClient = useQueryClient();
  const [selectedBvId, setSelectedBvId] = useState<string>(bvs[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<'AR' | 'AP'>('AR');
  const [importModal, setImportModal] = useState<Invoice | null>(null);
  const [importMode, setImportMode] = useState<'forecast' | 'recurring' | 'betaald'>('forecast');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Modal form state
  const [modalOmschrijving, setModalOmschrijving] = useState('');
  const [modalCategorie, setModalCategorie] = useState('');
  const [modalWeek, setModalWeek] = useState<Date | undefined>();

  // Sort, filter, selection, bulk state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('aangemaakt_in_exact');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [zoekterm, setZoekterm] = useState('');
  const [bulkMode, setBulkMode] = useState<'forecast' | 'recurring' | 'betaald' | 'al_in_forecast' | null>(null);
  const [bulkWeek, setBulkWeek] = useState<Date>(startOfISOWeek(new Date()));

  if (!selectedBvId && bvs.length > 0) {
    setSelectedBvId(bvs[0].id);
  }

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['exact-import-invoices', selectedBvId, activeTab],
    queryFn: async () => {
      if (!selectedBvId) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*, counterparties(id, naam)')
        .eq('bv_id', selectedBvId)
        .eq('type', activeTab)
        .eq('bron', 'exact')
        .neq('status', 'betaald')
        .order('vervaldatum', { ascending: true });
      if (error) throw error;

      const { data: recurringRules } = await supabase
        .from('recurring_rules')
        .select('omschrijving, bv_id')
        .eq('actief', true);

      return (data ?? [])
        .map(castInvoice)
        .filter(inv => inv.import_status === 'pending' || inv.import_status === 'skipped')
        .map(inv => {
          const naam = inv.counterparties?.naam ?? inv.factuurnummer ?? '';
          const isRecurring = (recurringRules ?? []).some(r =>
            r.bv_id === inv.bv_id &&
            naam.toLowerCase().includes((r.omschrijving ?? '').toLowerCase().trim())
          );
          return { ...inv, _suggestRecurring: isRecurring };
        });
    },
    enabled: !!selectedBvId,
  });

  // Sorted & filtered list
  const gesorteerdeFacturen = useMemo(() => {
    let lijst = [...invoices];

    if (zoekterm.trim()) {
      const z = zoekterm.toLowerCase();
      lijst = lijst.filter(inv =>
        (inv.counterparties?.naam ?? '').toLowerCase().includes(z) ||
        (inv.factuurnummer ?? '').toLowerCase().includes(z)
      );
    }

    lijst.sort((a, b) => {
      let va: any, vb: any;
      if (sortField === 'tegenpartij') {
        va = (a.counterparties?.naam ?? a.factuurnummer ?? '').toLowerCase();
        vb = (b.counterparties?.naam ?? b.factuurnummer ?? '').toLowerCase();
      } else if (sortField === 'bedrag') {
        va = a.bedrag; vb = b.bedrag;
      } else if (sortField === 'vervaldatum') {
        va = a.vervaldatum ?? ''; vb = b.vervaldatum ?? '';
      } else {
        va = a.aangemaakt_in_exact ?? ''; vb = b.aangemaakt_in_exact ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return lijst;
  }, [invoices, sortField, sortDir, zoekterm]);

  // Sort helpers
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Selection helpers
  const allSelected = gesorteerdeFacturen.length > 0 && gesorteerdeFacturen.every(inv => selectedIds.has(inv.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(gesorteerdeFacturen.map(inv => inv.id)));
  };

  // Bulk action
  const uitvoerenBulk = async (mode: 'forecast' | 'betaald' | 'recurring' | 'al_in_forecast', week?: Date) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const selectedInvoices = gesorteerdeFacturen.filter(inv => ids.includes(inv.id));

    for (const inv of selectedInvoices) {
      if (mode === 'al_in_forecast') {
        await supabase.from('invoices')
          .update({ import_status: 'dismissed' } as any)
          .eq('id', inv.id);
      } else if (mode === 'betaald') {
        await supabase.from('cashflow_items').insert({
          bv_id: inv.bv_id,
          week: format(startOfISOWeek(new Date(inv.vervaldatum ?? new Date())), 'yyyy-MM-dd'),
          type: inv.type === 'AR' ? 'in' : 'out',
          bedrag: Math.abs(inv.bedrag),
          omschrijving: inv.counterparties?.naam ?? inv.factuurnummer ?? 'Exact factuur',
          categorie: inv.type === 'AR' ? 'Omzet' : 'Kosten',
          bron: 'exact_import', ref_id: inv.id, ref_type: 'invoice', status: 'betaald',
        });
        await supabase.from('invoices')
          .update({ import_status: 'imported', status: 'betaald', imported_at: new Date().toISOString() } as any)
          .eq('id', inv.id);
      } else if (mode === 'forecast' && week) {
        const cfItem = {
          bv_id: inv.bv_id,
          week: format(week, 'yyyy-MM-dd'),
          type: inv.type === 'AR' ? 'in' : 'out',
          bedrag: Math.abs(inv.bedrag),
          omschrijving: inv.counterparties?.naam ?? inv.factuurnummer ?? 'Exact factuur',
          categorie: inv.type === 'AR' ? 'Omzet' : 'Kosten',
          tegenpartij: inv.counterparties?.naam ?? null,
          bron: 'exact_import', ref_id: inv.id, ref_type: 'invoice', status: 'actief',
        };
        const { data: cfData } = await supabase.from('cashflow_items').insert(cfItem).select('id').single();
        await supabase.from('invoices')
          .update({ import_status: 'imported', imported_at: new Date().toISOString(), forecast_item_id: cfData?.id } as any)
          .eq('id', inv.id);
      } else if (mode === 'recurring') {
        await supabase.from('recurring_rules').insert({
          bv_id: inv.bv_id,
          omschrijving: inv.counterparties?.naam ?? inv.factuurnummer ?? 'Exact factuur',
          bedrag: Math.abs(inv.bedrag),
          frequentie: 'maandelijks',
          categorie: 'Recurring kosten',
          actief: true,
          bron: 'exact_import',
          verwachte_betaaldag: inv.vervaldatum ? new Date(inv.vervaldatum).getDate() : 1,
        });
        await supabase.from('invoices')
          .update({ import_status: 'imported', status: 'betaald', imported_at: new Date().toISOString() } as any)
          .eq('id', inv.id);
      }
    }

    toast.success(`${ids.length} post${ids.length > 1 ? 'en' : ''} verwerkt`);
    setSelectedIds(new Set());
    setBulkMode(null);
    queryClient.invalidateQueries({ queryKey: ['exact-import-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['exact-import-pending-count'] });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/exact-sync-invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ bv_id: selectedBvId }),
      });
      const data = await res.json();
      if (data.success) {
        const total = (data.synced_ar ?? 0) + (data.synced_ap ?? 0);
        toast.success(`${total} facturen gesynchroniseerd (divisie ${data.division_used ?? '?'})`);
        queryClient.invalidateQueries({ queryKey: ['exact-import-invoices'] });
        queryClient.invalidateQueries({ queryKey: ['exact-import-pending-count'] });
      } else {
        toast.error(data.error || 'Sync mislukt');
      }
    } catch (err) {
      toast.error('Sync mislukt');
    } finally {
      setLastSyncTime(new Date());
      setSyncing(false);
    }
  };

  const openImportModal = (invoice: Invoice, mode: 'forecast' | 'recurring' | 'betaald') => {
    setImportModal(invoice);
    setImportMode(mode);
    setModalOmschrijving(invoice.counterparties?.naam ?? invoice.factuurnummer ?? '');
    setModalCategorie(
      mode === 'recurring' ? 'Recurring kosten' : (invoice.type === 'AR' ? 'Omzet' : 'Kosten')
    );
    if (mode === 'betaald') {
      setModalWeek(startOfISOWeek(new Date()));
    } else if (invoice.vervaldatum) {
      setModalWeek(startOfISOWeek(new Date(invoice.vervaldatum)));
    } else {
      setModalWeek(startOfISOWeek(new Date()));
    }
  };

  const alInForecastMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ import_status: 'imported', imported_at: new Date().toISOString() } as any)
        .eq('id', invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Post verwijderd uit inbox — staat al in de forecast');
      queryClient.invalidateQueries({ queryKey: ['exact-import-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['exact-import-pending-count'] });
    },
    onError: (err: any) => {
      toast.error('Fout: ' + err.message);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importModal) throw new Error('Geen data');

      if (importMode === 'betaald') {
        await supabase.from('cashflow_items').insert({
          bv_id: importModal.bv_id,
          week: format(startOfISOWeek(new Date(importModal.vervaldatum ?? new Date())), 'yyyy-MM-dd'),
          type: importModal.type === 'AR' ? 'in' : 'out',
          bedrag: Math.abs(importModal.bedrag),
          omschrijving: importModal.counterparties?.naam ?? importModal.factuurnummer ?? 'Exact factuur',
          categorie: importModal.type === 'AR' ? 'Omzet' : 'Kosten',
          bron: 'exact_import',
          ref_id: importModal.id,
          ref_type: 'invoice',
          status: 'betaald',
        });
        await supabase.from('invoices')
          .update({ import_status: 'imported', status: 'betaald', imported_at: new Date().toISOString() } as any)
          .eq('id', importModal.id);
      } else if (importMode === 'recurring') {
        if (!modalWeek) throw new Error('Geen week geselecteerd');
        await supabase.from('recurring_rules').insert({
          bv_id: importModal.bv_id,
          omschrijving: modalOmschrijving,
          bedrag: Math.abs(importModal.bedrag),
          frequentie: 'maandelijks',
          categorie: modalCategorie,
          actief: true,
          bron: 'exact_import',
          verwachte_betaaldag: importModal.vervaldatum
            ? new Date(importModal.vervaldatum).getDate()
            : 1,
        });
        await supabase.from('invoices')
          .update({ import_status: 'imported', status: 'betaald', imported_at: new Date().toISOString() } as any)
          .eq('id', importModal.id);
        await supabase.from('cashflow_items').insert({
          bv_id: importModal.bv_id,
          week: format(startOfISOWeek(modalWeek!), 'yyyy-MM-dd'),
          type: 'out',
          bedrag: Math.abs(importModal.bedrag),
          omschrijving: modalOmschrijving,
          categorie: 'Recurring kosten',
          bron: 'exact_import',
          ref_id: importModal.id,
          ref_type: 'invoice',
          status: 'betaald',
        });
      } else {
        if (!modalWeek) throw new Error('Geen week geselecteerd');
        const cfItem = {
          bv_id: importModal.bv_id,
          week: format(modalWeek, 'yyyy-MM-dd'),
          type: importModal.type === 'AR' ? 'in' : 'out',
          bedrag: Math.abs(importModal.bedrag),
          omschrijving: modalOmschrijving,
          categorie: modalCategorie,
          tegenpartij: importModal.counterparties?.naam ?? importModal.factuurnummer ?? null,
          bron: 'exact_import',
          ref_id: importModal.id,
          ref_type: 'invoice',
          status: 'actief',
        };

        const { data: cfData, error: cfError } = await supabase
          .from('cashflow_items')
          .insert(cfItem)
          .select('id')
          .single();
        if (cfError) throw cfError;

        const { error: invError } = await supabase
          .from('invoices')
          .update({
            import_status: 'imported',
            imported_at: new Date().toISOString(),
            forecast_item_id: cfData.id,
          } as any)
          .eq('id', importModal.id);
        if (invError) throw invError;
      }

      return { tegenpartij: importModal.counterparties?.naam ?? importModal.factuurnummer };
    },
    onSuccess: (result) => {
      const msgs: Record<string, string> = {
        betaald: `✓ ${result?.tegenpartij ?? 'Post'} gemarkeerd als reeds betaald`,
        recurring: `✓ ${result?.tegenpartij ?? 'Post'} als recurring ingesteld`,
        forecast: `✓ ${result?.tegenpartij ?? 'Post'} geïmporteerd naar Forecast Explorer`,
      };
      toast.success(msgs[importMode]);
      setImportModal(null);
      queryClient.invalidateQueries({ queryKey: ['exact-import-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['exact-import-pending-count'] });
    },
    onError: (err: any) => {
      toast.error(`Actie mislukt: ${err.message}`);
    },
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exact Import</h1>
          <p className="text-muted-foreground">Beoordeel nieuwe posten vanuit Exact Online</p>
        </div>
        {isAdmin && (
          <div className="flex flex-col items-end gap-1">
            <Button onClick={handleSync} disabled={syncing || !selectedBvId}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync nieuwe posten
            </Button>
            {lastSyncTime ? (
              <span className="text-xs text-muted-foreground">
                Laatste sync: {format(lastSyncTime, 'dd MMM yyyy HH:mm', { locale: nl })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Nog niet gesynchroniseerd</span>
            )}
          </div>
        )}
      </div>

      {/* BV Selector */}
      <Select value={selectedBvId} onValueChange={(v) => { setSelectedBvId(v); setSelectedIds(new Set()); }}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Selecteer BV" />
        </SelectTrigger>
        <SelectContent>
          {bvs.map(bv => (
            <SelectItem key={bv.id} value={bv.id}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bv.kleur ?? '#888' }} />
                {bv.naam}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'AR' | 'AP'); setSelectedIds(new Set()); }}>
        <TabsList>
          <TabsTrigger value="AR">Debiteuren (AR)</TabsTrigger>
          <TabsTrigger value="AP">Crediteuren (AP)</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <Card>
            <CardHeader>
              <CardTitle>{activeTab === 'AR' ? 'Verkoopfacturen' : 'Inkoopfacturen'}</CardTitle>
              <CardDescription>
                {invoices.length} posten te beoordelen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mb-3 text-green-500" />
                  <p className="text-lg font-medium">Alle posten zijn beoordeeld ✓</p>
                </div>
              ) : (
                <>
                  {/* Filterbalk */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Zoek op naam of factuurnummer…"
                        value={zoekterm}
                        onChange={(e) => setZoekterm(e.target.value)}
                        className="h-8 w-64 text-sm pl-8"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{gesorteerdeFacturen.length} posten</span>
                  </div>

                  {/* Bulk-actiebalk */}
                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 border">
                      <span className="text-sm font-medium mr-2">
                        {selectedIds.size} geselecteerd
                      </span>

                      {bulkMode === 'forecast' ? (
                        <div className="flex items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                                {bulkWeek ? format(bulkWeek, 'd MMM yyyy', { locale: nl }) : 'Kies week'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={bulkWeek}
                                onSelect={(d) => d && setBulkWeek(startOfISOWeek(d))}
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <Button size="sm" onClick={() => uitvoerenBulk('forecast', bulkWeek)}>
                            Bevestig
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setBulkMode(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="text-green-600 border-green-500/30 hover:bg-green-500/10" onClick={() => setBulkMode('forecast')}>
                            <TrendingUp className="h-3.5 w-3.5 mr-1" /> Naar forecast
                          </Button>
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-500/30 hover:bg-blue-500/10" onClick={() => uitvoerenBulk('betaald')}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Reeds betaald
                          </Button>
                          <Button size="sm" variant="outline" className="text-purple-600 border-purple-500/30 hover:bg-purple-500/10" onClick={() => uitvoerenBulk('recurring')}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recurring
                          </Button>
                          <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => uitvoerenBulk('al_in_forecast')}>
                            <X className="h-3.5 w-3.5 mr-1" /> Al in forecast
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('aangemaakt_in_exact')}>
                          <span className="flex items-center">Toegevoegd in Exact <SortIcon field="aangemaakt_in_exact" /></span>
                        </TableHead>
                        <TableHead>Factuurnummer</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('tegenpartij')}>
                          <span className="flex items-center">Tegenpartij <SortIcon field="tegenpartij" /></span>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('bedrag')}>
                          <span className="flex items-center justify-end">Bedrag <SortIcon field="bedrag" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('vervaldatum')}>
                          <span className="flex items-center">Vervaldatum <SortIcon field="vervaldatum" /></span>
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gesorteerdeFacturen.map((inv) => (
                        <TableRow key={inv.id} className={selectedIds.has(inv.id) ? 'bg-muted/30' : ''}>
                          <TableCell>
                            <Checkbox checked={selectedIds.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.aangemaakt_in_exact
                              ? format(new Date(inv.aangemaakt_in_exact), 'dd MMM yyyy', { locale: nl })
                              : '—'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{inv.factuurnummer ?? '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {inv.counterparties?.naam ?? inv.factuurnummer ?? '—'}
                              {inv._suggestRecurring && (
                                <Badge className="text-xs bg-purple-500/15 text-purple-600 border-purple-500/30">
                                  Mogelijk recurring
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(inv.bedrag)}
                          </TableCell>
                          <TableCell>
                            {inv.vervaldatum
                              ? format(new Date(inv.vervaldatum), 'dd MMM yyyy', { locale: nl })
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {inv.import_status === 'skipped' ? (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                                Overgeslagen
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Nieuw</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isViewer ? (
                              <span className="text-xs text-muted-foreground">Alleen admins</span>
                            ) : (
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="outline" className="text-green-600 border-green-500/30 hover:bg-green-500/10" onClick={() => openImportModal(inv, 'forecast')}>
                                  <TrendingUp className="h-3.5 w-3.5 mr-1" /> Naar forecast
                                </Button>
                                <Button size="sm" variant="outline" className="text-blue-600 border-blue-500/30 hover:bg-blue-500/10" onClick={() => openImportModal(inv, 'betaald')}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Reeds betaald
                                </Button>
                                <Button size="sm" variant="outline" className="text-purple-600 border-purple-500/30 hover:bg-purple-500/10" onClick={() => openImportModal(inv, 'recurring')}>
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recurring
                                </Button>
                                <Button size="sm" variant="outline" className="text-muted-foreground border-border hover:bg-muted" onClick={() => alInForecastMutation.mutate(inv.id)}>
                                  <X className="h-3.5 w-3.5 mr-1" /> Al in forecast
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Modal */}
      <Dialog open={!!importModal} onOpenChange={(open) => !open && setImportModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {importMode === 'forecast' && 'Doorvoeren naar forecast'}
              {importMode === 'betaald' && 'Markeren als reeds betaald'}
              {importMode === 'recurring' && 'Instellen als recurring kost'}
            </DialogTitle>
          </DialogHeader>
          {importModal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Tegenpartij</span>
                  <p className="font-medium">{importModal.counterparties?.naam ?? importModal.factuurnummer ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Bedrag</span>
                  <p className="font-medium">{formatCurrency(importModal.bedrag)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vervaldatum</span>
                  <p className="font-medium">
                    {importModal.vervaldatum
                      ? format(new Date(importModal.vervaldatum), 'dd MMM yyyy', { locale: nl })
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium">{importModal.type === 'AR' ? 'Debiteur' : 'Crediteur'}</p>
                </div>
              </div>

              {importMode === 'betaald' ? (
                <p className="text-sm text-muted-foreground">
                  Weet je zeker dat deze factuur al betaald is? Er wordt een historisch cashflow-item aangemaakt en de factuur verdwijnt uit de inbox.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Omschrijving</Label>
                    <Input value={modalOmschrijving} onChange={(e) => setModalOmschrijving(e.target.value)} />
                  </div>
                  <div>
                    <Label>Categorie</Label>
                    <Select value={modalCategorie} onValueChange={setModalCategorie}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Omzet">Omzet</SelectItem>
                        <SelectItem value="Kosten">Kosten</SelectItem>
                        <SelectItem value="Recurring kosten">Recurring kosten</SelectItem>
                        <SelectItem value="Financiering">Financiering</SelectItem>
                        <SelectItem value="Overig">Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Week</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !modalWeek && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {modalWeek ? format(modalWeek, 'dd MMM yyyy', { locale: nl }) : 'Kies een week'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={modalWeek} onSelect={(date) => date && setModalWeek(startOfISOWeek(date))} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModal(null)}>Annuleren</Button>
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {importMode === 'betaald' ? 'Bevestig betaald' : importMode === 'recurring' ? 'Bevestig recurring' : 'Bevestig import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
