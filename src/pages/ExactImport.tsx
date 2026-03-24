import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
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
import { cn } from '@/lib/utils';
import { RefreshCw, Check, SkipForward, CalendarIcon, CheckCircle2, Loader2 } from 'lucide-react';

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
}

// We need to cast since types.ts doesn't have the new columns yet
function castInvoice(row: any): Invoice {
  return row as Invoice;
}

export default function ExactImport() {
  const { bvs } = useBV();
  const queryClient = useQueryClient();
  const [selectedBvId, setSelectedBvId] = useState<string>(bvs[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<'AR' | 'AP'>('AR');
  const [importModal, setImportModal] = useState<Invoice | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Modal form state
  const [modalOmschrijving, setModalOmschrijving] = useState('');
  const [modalCategorie, setModalCategorie] = useState('');
  const [modalWeek, setModalWeek] = useState<Date | undefined>();

  // Set selected BV when bvs load
  if (!selectedBvId && bvs.length > 0) {
    setSelectedBvId(bvs[0].id);
  }

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['exact-import-invoices', selectedBvId, activeTab],
    queryFn: async () => {
      if (!selectedBvId) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('bv_id', selectedBvId)
        .eq('type', activeTab)
        .eq('bron', 'exact')
        .in('import_status' as any, ['pending', 'skipped'])
        .order('vervaldatum', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(castInvoice);
    },
    enabled: !!selectedBvId,
  });

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
      setSyncing(false);
    }
  };

  const openImportModal = (invoice: Invoice) => {
    setImportModal(invoice);
    setModalOmschrijving(
      [invoice.factuurnummer, invoice.status].filter(Boolean).join(' – ')
    );
    setModalCategorie(invoice.type === 'AR' ? 'Omzet' : 'Kosten');
    if (invoice.vervaldatum) {
      setModalWeek(startOfISOWeek(new Date(invoice.vervaldatum)));
    } else {
      setModalWeek(startOfISOWeek(new Date()));
    }
  };

  const skipMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ import_status: 'skipped' } as any)
        .eq('id', invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exact-import-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['exact-import-pending-count'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importModal || !modalWeek) throw new Error('Geen data');

      // 1. Create cashflow_item
      const cfItem = {
        bv_id: importModal.bv_id,
        week: format(modalWeek, 'yyyy-MM-dd'),
        type: importModal.type === 'AR' ? 'in' : 'out',
        bedrag: Math.abs(importModal.bedrag),
        omschrijving: modalOmschrijving,
        categorie: modalCategorie,
        tegenpartij: importModal.factuurnummer ?? null,
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

      // 2. Update invoice
      const { error: invError } = await supabase
        .from('invoices')
        .update({
          import_status: 'imported',
          imported_at: new Date().toISOString(),
          forecast_item_id: cfData.id,
        } as any)
        .eq('id', importModal.id);
      if (invError) throw invError;

      return { tegenpartij: importModal.factuurnummer };
    },
    onSuccess: (result) => {
      toast.success(`✓ ${result?.tegenpartij ?? 'Post'} geïmporteerd naar Forecast Explorer`);
      setImportModal(null);
      queryClient.invalidateQueries({ queryKey: ['exact-import-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['exact-import-pending-count'] });
    },
    onError: (err: any) => {
      toast.error(`Import mislukt: ${err.message}`);
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
        <Button onClick={handleSync} disabled={syncing || !selectedBvId}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync nieuwe posten
        </Button>
      </div>

      {/* BV Selector */}
      <Select value={selectedBvId} onValueChange={setSelectedBvId}>
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'AR' | 'AP')}>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Factuurnummer</TableHead>
                      <TableHead>Tegenpartij</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead>Vervaldatum</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv, i) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{inv.factuurnummer ?? '—'}</TableCell>
                        <TableCell>{inv.factuurnummer ?? '—'}</TableCell>
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
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => openImportModal(inv)}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Importeren
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => skipMutation.mutate(inv.id)}
                              disabled={inv.import_status === 'skipped'}
                            >
                              <SkipForward className="h-3.5 w-3.5 mr-1" /> Niet importeren
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Modal */}
      <Dialog open={!!importModal} onOpenChange={(open) => !open && setImportModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post importeren naar Forecast</DialogTitle>
          </DialogHeader>
          {importModal && (
            <div className="space-y-4">
              {/* Read-only info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Tegenpartij</span>
                  <p className="font-medium">{importModal.factuurnummer ?? '—'}</p>
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

              {/* Editable fields */}
              <div className="space-y-3">
                <div>
                  <Label>Omschrijving</Label>
                  <Input value={modalOmschrijving} onChange={(e) => setModalOmschrijving(e.target.value)} />
                </div>

                <div>
                  <Label>Categorie</Label>
                  <Select value={modalCategorie} onValueChange={setModalCategorie}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Omzet">Omzet</SelectItem>
                      <SelectItem value="Kosten">Kosten</SelectItem>
                      <SelectItem value="Financiering">Financiering</SelectItem>
                      <SelectItem value="Overig">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Week</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !modalWeek && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {modalWeek ? format(modalWeek, 'dd MMM yyyy', { locale: nl }) : 'Kies een week'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={modalWeek}
                        onSelect={(date) => date && setModalWeek(startOfISOWeek(date))}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModal(null)}>
              Annuleren
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Bevestig import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
