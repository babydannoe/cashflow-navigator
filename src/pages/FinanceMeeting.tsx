import { useState, useEffect, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  RefreshCw, ArrowRight, Pencil, Plus, X, CalendarIcon, Save, Lock, Check, PackageCheck,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { ForecastDrilldownDrawer, type DrilldownItem } from '@/components/ForecastDrilldownDrawer';
import { toast } from 'sonner';

// ── helpers ──
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

const fmt = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

const STATUS_ORDER: Record<string, number> = { contract: 0, handshake: 1, offerte: 2, lead: 3 };
const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-muted text-muted-foreground',
  offerte: 'bg-blue-500/20 text-blue-400',
  handshake: 'bg-orange-500/20 text-orange-400',
  contract: 'bg-emerald-500/20 text-emerald-400',
};
const STATUS_FLOW = ['lead', 'offerte', 'handshake', 'contract'];

// ── types ──
interface CashflowItem {
  bv_id: string;
  bv_naam: string;
  bv_kleur: string;
  week: string;
  type: string;
  bedrag: number;
  omschrijving: string;
  categorie: string;
  subcategorie: string;
  tegenpartij: string;
  bron: string;
  ref_id: string;
  ref_type: string;
  cashflow_item_id?: string;
  factuurnummer?: string;
  status?: string;
  vervaldatum?: string;
  kans_percentage?: number;
  frequentie?: string;
}

interface PipelineItem {
  id: string;
  bv_id: string;
  projectnaam: string | null;
  bedrag: number | null;
  kans_percentage: number | null;
  status: string | null;
  verwachte_week: string | null;
  opmerkingen: string | null;
  aangemaakt_op: string | null;
  aangemaakt_door: string | null;
}

interface Termijn {
  percentage: number;
  datum: Date | undefined;
}

export default function FinanceMeeting() {
  const { bvs } = useBV();
  const { isAdmin, isViewer } = useUserRole();
  const [localBVId, setLocalBVId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Tab 1 state
  const [cashflowItems, setCashflowItems] = useState<CashflowItem[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [editingSaldoId, setEditingSaldoId] = useState<string | null>(null);
  const [saldoValues, setSaldoValues] = useState<Record<string, string>>({});
  const [drawerItem, setDrawerItem] = useState<DrilldownItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Tab 2 state
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([]);
  const [scheduleItem, setScheduleItem] = useState<PipelineItem | null>(null);
  const [termijnen, setTermijnen] = useState<Termijn[]>([
    { percentage: 50, datum: undefined },
    { percentage: 30, datum: undefined },
    { percentage: 20, datum: undefined },
  ]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const weekStart = getISOWeekStart(new Date());
  const weekEnd = addDays(weekStart, 6);
  const weekNr = getISOWeek(weekStart);
  const weekLabel = `Week ${weekNr} · ${format(weekStart, 'd', { locale: nl })}–${format(weekEnd, 'd MMM yyyy', { locale: nl })}`;
  const currentWeekDate = format(weekStart, 'yyyy-MM-dd');

  // ── approval helpers ──
  const getSelectKey = (item: CashflowItem) => item.cashflow_item_id ?? item.ref_id;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const goedkeurenBulk = async (ids: string[]) => {
    // Cashflow items direct updaten
    const cfIds = ids.filter(id =>
      outItems.some(i => i.cashflow_item_id === id)
    );
    if (cfIds.length > 0) {
      const { error } = await supabase
        .from('cashflow_items')
        .update({ status: 'goedgekeurd', goedgekeurd_op: new Date().toISOString() } as any)
        .in('id', cfIds);
      if (error) { toast.error('Fout: ' + error.message); return; }
    }

    // Invoice-items zonder cashflow_item_id via goedkeurenInvoice
    const invoiceItems = outItems.filter(i =>
      !i.cashflow_item_id &&
      i.ref_type === 'invoice' &&
      ids.includes(i.ref_id)
    );
    for (const item of invoiceItems) {
      await goedkeurenInvoice(item);
    }

    toast.success(`${ids.length} post${ids.length > 1 ? 'en' : ''} goedgekeurd voor betaling`);
    setSelectedIds(new Set());
    loadData();
  };

  const goedkeurenInvoice = async (item: CashflowItem) => {
    const { data: cfData, error: cfError } = await supabase
      .from('cashflow_items')
      .insert({
        bv_id: item.bv_id,
        week: item.week,
        type: item.type,
        bedrag: item.bedrag,
        omschrijving: item.omschrijving,
        categorie: item.categorie,
        subcategorie: item.subcategorie,
        tegenpartij: item.tegenpartij,
        bron: item.bron,
        ref_id: item.ref_id,
        ref_type: item.ref_type,
        status: 'goedgekeurd',
        goedgekeurd_op: new Date().toISOString(),
      } as any)
      .select('id')
      .single();
    if (cfError) { toast.error('Fout: ' + cfError.message); return; }
    await supabase
      .from('invoices')
      .update({ forecast_item_id: cfData.id, import_status: 'imported', status: 'goedgekeurd' } as any)
      .eq('id', item.ref_id);
    toast.success('Goedgekeurd voor betaling');
    loadData();
  };

  const checkOntvangen = async (item: CashflowItem) => {
    const id = item.cashflow_item_id;
    if (!id) return;
    const { error } = await supabase
      .from('cashflow_items')
      .update({ status: 'ontvangen', goedgekeurd_op: new Date().toISOString() } as any)
      .eq('id', id);
    if (error) { toast.error('Fout: ' + error.message); return; }
    toast.success('Gemarkeerd als ontvangen');
    loadData();
  };

  const betaalRecurring = async (item: CashflowItem) => {
    const { error } = await supabase.from('cashflow_items').insert({
      bv_id: item.bv_id,
      week: item.week,
      type: 'out',
      bedrag: item.bedrag,
      omschrijving: item.omschrijving,
      categorie: item.categorie,
      tegenpartij: item.tegenpartij,
      bron: 'recurring',
      ref_id: item.ref_id,
      ref_type: 'recurring_rule',
      status: 'betaald',
      goedgekeurd_op: new Date().toISOString(),
    } as any);
    if (error) { toast.error('Fout: ' + error.message); return; }
    toast.success(`${item.omschrijving} gemarkeerd als betaald`);
    loadData();
  };

  const verschuifBulk = async (ids: string[]) => {
    for (const id of ids) {
      const item = cashflowItems.find(i => getSelectKey(i) === id);
      if (!item || item.ref_type === 'recurring_rule') continue;
      const newWeek = format(addDays(new Date(item.week), 7), 'yyyy-MM-dd');
      await supabase.from('cashflow_items').update({ week: newWeek }).eq('id', id);
    }
    toast.success(`${ids.length} post${ids.length > 1 ? 'en' : ''} verschoven`);
    setSelectedIds(new Set());
    loadData();
  };

  // ── data loading ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const body: any = { weeks: 2 };
      if (localBVId) body.bv_id = localBVId;

      const { data, error } = await supabase.functions.invoke('calculate-forecast', { body });
      if (error) throw error;

      const items: CashflowItem[] = (data.cashflowItems || []).filter(
        (i: CashflowItem) => i.week === currentWeekDate
          && i.status !== 'goedgekeurd'
          && i.status !== 'betaald'
      );
      setCashflowItems(items);
      setOpeningBalance(data.openingBalance ?? 0);

      // Bank accounts
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('id, bv_id, iban, naam, huidig_saldo')
        .in('bv_id', localBVId ? [localBVId] : bvs.map(b => b.id));
      setBankAccounts(accounts || []);

      // Pipeline
      let q = supabase.from('mt_pipeline_items').select('*');
      if (localBVId) q = q.eq('bv_id', localBVId);
      const { data: pipe } = await q;
      const sorted = (pipe || []).sort((a: any, b: any) => {
        const sa = STATUS_ORDER[a.status ?? 'lead'] ?? 9;
        const sb = STATUS_ORDER[b.status ?? 'lead'] ?? 9;
        if (sa !== sb) return sa - sb;
        return (b.bedrag ?? 0) - (a.bedrag ?? 0);
      });
      setPipelineItems(sorted);
    } catch (e: any) {
      toast.error('Fout bij laden: ' + (e.message || 'Onbekend'));
    } finally {
      setLoading(false);
    }
  }, [localBVId, currentWeekDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Bankstand helpers ──
  const startEditSaldo = (accountId: string, huidigSaldo: number) => {
    setSaldoValues(prev => ({ ...prev, [accountId]: String(huidigSaldo) }));
    setEditingSaldoId(accountId);
  };

  const saveSaldo = async (account: any) => {
    const raw = saldoValues[account.id] ?? '';
    const cleaned = raw.replace(/\./g, '').replace(',', '.');
    const nieuwSaldo = parseFloat(cleaned);
    if (isNaN(nieuwSaldo)) {
      toast.error('Ongeldig bedrag');
      return;
    }
    const { error } = await supabase
      .from('bank_accounts')
      .update({ huidig_saldo: nieuwSaldo })
      .eq('id', account.id);
    if (error) {
      console.error('Supabase update error:', error);
      toast.error('Fout bij opslaan: ' + error.message);
      return;
    }
    console.log('Saldo opgeslagen voor account', account.id, '→', nieuwSaldo);
    toast.success('Saldo bijgewerkt');
    setEditingSaldoId(null);
    setBankAccounts(prev => prev.map(a =>
      a.id === account.id ? { ...a, huidig_saldo: nieuwSaldo } : a
    ));
  };

   // ── Tab 1 helpers ──
  const outItems = cashflowItems.filter(i => i.type === 'out');
  const inItems = cashflowItems.filter(i => i.type === 'in');
  const outDecision = outItems.filter(i => i.bron !== 'recurring');
  const outRecurring = outItems.filter(i => i.bron === 'recurring');
  const totalDecision = outDecision.reduce((s, i) => s + i.bedrag, 0);
  const totalRecurring = outRecurring.reduce((s, i) => s + i.bedrag, 0);
  const totalOut = outItems.reduce((s, i) => s + i.bedrag, 0);
  const totalIn = inItems.reduce((s, i) => s + i.bedrag, 0);
  const expectedClosing = openingBalance + totalIn - totalOut;

  const handleShiftWeek = async (item: CashflowItem) => {
    if (item.ref_type === 'recurring_rule') {
      toast.error('Recurring items kunnen niet worden verschoven — pas de betaaldag aan in Recurring Kosten.');
      return;
    }
    if (!item.cashflow_item_id) {
      toast.error('Geen cashflow item ID gevonden');
      return;
    }
    const newWeek = format(addDays(new Date(item.week), 7), 'yyyy-MM-dd');
    const newWeekNr = getISOWeek(new Date(newWeek));
    const { error } = await supabase
      .from('cashflow_items')
      .update({ week: newWeek })
      .eq('id', item.cashflow_item_id);
    if (error) {
      toast.error('Fout: ' + error.message);
      return;
    }
    toast.success(`Verschoven naar week ${newWeekNr}`);
    loadData();
  };

  const openDrawer = (item: CashflowItem) => {
    const di: DrilldownItem = {
      bv_id: item.bv_id,
      bv_naam: item.bv_naam,
      bv_kleur: item.bv_kleur,
      categorie: item.categorie,
      subcategorie: item.subcategorie,
      tegenpartij: item.tegenpartij,
      bron: item.bron,
      bedrag: item.bedrag,
      vervaldatum: item.vervaldatum,
      ref_id: item.ref_id,
      ref_type: item.ref_type,
      type: item.type,
      week: item.week,
      omschrijving: item.omschrijving,
      kans_percentage: item.kans_percentage,
      frequentie: item.frequentie,
      cashflow_item_id: item.cashflow_item_id,
      factuurnummer: item.factuurnummer,
      status: item.status,
    };
    setDrawerItem(di);
    setDrawerOpen(true);
  };

  // ── Tab 2 helpers ──
  const handleStatusChange = async (item: PipelineItem) => {
    const currentIdx = STATUS_FLOW.indexOf(item.status ?? 'lead');
    const nextStatus = STATUS_FLOW[Math.min(currentIdx + 1, STATUS_FLOW.length - 1)];
    if (nextStatus === item.status) return;

    const { error } = await supabase
      .from('mt_pipeline_items')
      .update({ status: nextStatus })
      .eq('id', item.id);
    if (error) {
      toast.error('Fout: ' + error.message);
      return;
    }
    toast.success(`Status gewijzigd naar ${nextStatus}`);
    loadData();
  };

  const openSchedule = (item: PipelineItem) => {
    setScheduleItem(item);
    setTermijnen([
      { percentage: 50, datum: undefined },
      { percentage: 30, datum: undefined },
      { percentage: 20, datum: undefined },
    ]);
  };

  const totalPercentage = termijnen.reduce((s, t) => s + (t.percentage || 0), 0);
  const percentageValid = totalPercentage === 100;
  const allDatesSet = termijnen.every(t => t.datum);

  const handleSaveSchedule = async () => {
    if (!scheduleItem || !percentageValid || !allDatesSet) return;
    setSavingSchedule(true);
    try {
      const totalBedrag = scheduleItem.bedrag ?? 0;
      const items = termijnen.map((t, i) => {
        const bedrag = Math.round(totalBedrag * (t.percentage / 100) * 100) / 100;
        const weekDate = format(getISOWeekStart(t.datum!), 'yyyy-MM-dd');
        return {
          bv_id: scheduleItem.bv_id,
          omschrijving: `${scheduleItem.projectnaam} — termijn ${i + 1} (${t.percentage}%)`,
          bedrag,
          type: 'in',
          week: weekDate,
          categorie: 'Omzet',
          subcategorie: scheduleItem.projectnaam ?? '',
          bron: 'mt_pipeline',
          ref_id: scheduleItem.id,
          ref_type: 'mt_pipeline',
          tegenpartij: scheduleItem.projectnaam ?? '',
        };
      });

      const { error } = await supabase.from('cashflow_items').insert(items);
      if (error) throw error;

      // Update verwachte_week to first termijn date
      const firstDate = termijnen
        .filter(t => t.datum)
        .sort((a, b) => a.datum!.getTime() - b.datum!.getTime())[0];
      if (firstDate?.datum) {
        await supabase
          .from('mt_pipeline_items')
          .update({ verwachte_week: format(firstDate.datum, 'yyyy-MM-dd') })
          .eq('id', scheduleItem.id);
      }

      toast.success(`${termijnen.length} betaaltermijnen ingepland in forecast`);
      setScheduleItem(null);
      loadData();
    } catch (e: any) {
      toast.error('Fout: ' + (e.message || 'Onbekend'));
    } finally {
      setSavingSchedule(false);
    }
  };

  // ── helper: selectable items (non-recurring, has cashflow_item_id OR is invoice) ──
  const selectableOutItems = outDecision.filter(i => i.cashflow_item_id || i.ref_type === 'invoice');
  const selectableInItems = inItems.filter(i => i.cashflow_item_id && i.bron !== 'recurring');

  // ── render helpers ──
  const renderCashflowTable = (items: CashflowItem[], type: 'in' | 'out') => {
    const colorClass = type === 'in' ? 'text-emerald-400' : 'text-destructive';
    const total = items.reduce((s, i) => s + i.bedrag, 0);
    const selectableItems = items.filter(i => i.cashflow_item_id && i.bron !== 'recurring');
    const allSelected = selectableItems.length > 0 && selectableItems.every(i => selectedIds.has(i.cashflow_item_id!));
    return (
      <Table>
        <TableHeader>
          <TableRow>
             <TableHead className="w-8">
              {!isViewer && selectableItems.length > 0 && (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => {
                    const next = new Set(selectedIds);
                    if (allSelected) {
                      selectableItems.forEach(i => next.delete(i.cashflow_item_id!));
                    } else {
                      selectableItems.forEach(i => next.add(i.cashflow_item_id!));
                    }
                    setSelectedIds(next);
                  }}
                />
              )}
            </TableHead>
            <TableHead>Omschrijving</TableHead>
            <TableHead>Categorie</TableHead>
            <TableHead>BV</TableHead>
            <TableHead className="text-right">Bedrag</TableHead>
            <TableHead className="w-[120px]">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Geen items</TableCell></TableRow>
          )}
          {items.map((item, idx) => {
            const isSelectable = item.cashflow_item_id && item.bron !== 'recurring';
            return (
              <TableRow key={`${item.ref_id}-${idx}`}>
                <TableCell className="w-8">
                  {!isViewer && isSelectable && (
                    <Checkbox
                      checked={selectedIds.has(item.cashflow_item_id!)}
                      onCheckedChange={() => toggleSelect(item.cashflow_item_id!)}
                    />
                  )}
                </TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{item.omschrijving}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{item.categorie}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.bv_kleur }} />
                    <span className="text-xs text-muted-foreground truncate max-w-[80px]">{item.bv_naam}</span>
                  </div>
                </TableCell>
                <TableCell className={cn('text-right font-mono text-sm', colorClass)}>
                  {type === 'out' ? '−' : '+'} {fmt(item.bedrag)}
                </TableCell>
                <TableCell>
                  {!isViewer && (
                    <div className="flex gap-1">
                      {isSelectable && type === 'in' && (
                        <Button variant="ghost" size="icon"
                          className="h-7 w-7 hover:bg-blue-500 hover:text-white transition-colors"
                          onClick={() => checkOntvangen(item)}
                          title="Check ontvangen">
                          <PackageCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleShiftWeek(item)} title="→ 1 week">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(item)} title="Bewerken">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell />
            <TableCell colSpan={3} className="font-semibold">Totaal</TableCell>
            <TableCell className={cn('text-right font-mono font-semibold', colorClass)}>
              {type === 'out' ? '−' : '+'} {fmt(total)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    );
  };

  const renderOutTable = () => {
    const colorClass = 'text-destructive';
    const allSelectableOut = outDecision.filter(i => i.cashflow_item_id || i.ref_type === 'invoice');
    const allOutSelected = allSelectableOut.length > 0 && allSelectableOut.every(i => selectedIds.has(getSelectKey(i)));
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              {allSelectableOut.length > 0 && (
                <Checkbox
                  checked={allOutSelected}
                  onCheckedChange={() => {
                    const next = new Set(selectedIds);
                    if (allOutSelected) {
                      allSelectableOut.forEach(i => next.delete(getSelectKey(i)));
                    } else {
                      allSelectableOut.forEach(i => next.add(getSelectKey(i)));
                    }
                    setSelectedIds(next);
                  }}
                />
              )}
            </TableHead>
            <TableHead>Omschrijving</TableHead>
            <TableHead>Categorie</TableHead>
            <TableHead>BV</TableHead>
            <TableHead className="text-right">Bedrag</TableHead>
            <TableHead className="w-[120px]">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Sectie 1: Te beslissen */}
          {outDecision.length === 0 && outRecurring.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Geen items</TableCell></TableRow>
          )}
          {outDecision.map((item, idx) => (
            <TableRow key={`dec-${item.ref_id}-${idx}`}>
              <TableCell className="w-8">
              {(item.cashflow_item_id || item.ref_type === 'invoice') && (
                  <Checkbox
                    checked={selectedIds.has(getSelectKey(item))}
                    onCheckedChange={() => toggleSelect(getSelectKey(item))}
                  />
                )}
              </TableCell>
              <TableCell className="text-sm max-w-[200px] truncate">{item.omschrijving}</TableCell>
              <TableCell><Badge variant="secondary" className="text-xs">{item.categorie}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.bv_kleur }} />
                  <span className="text-xs text-muted-foreground truncate max-w-[80px]">{item.bv_naam}</span>
                </div>
              </TableCell>
              <TableCell className={cn('text-right font-mono text-sm', colorClass)}>− {fmt(item.bedrag)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {(item.cashflow_item_id || item.ref_type === 'invoice') && (
                    <Button variant="ghost" size="icon"
                      className="h-7 w-7 hover:bg-emerald-500 hover:text-white transition-colors"
                      onClick={async () => {
                        if (item.cashflow_item_id) {
                          await goedkeurenBulk([item.cashflow_item_id]);
                        } else if (item.ref_type === 'invoice') {
                          await goedkeurenInvoice(item);
                        }
                      }}
                      title="Goedkeuren voor betaling">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleShiftWeek(item)} title="→ 1 week">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(item)} title="Bewerken">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}

          {/* Scheidingslijn */}
          {outRecurring.length > 0 && (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={6} className="py-2 px-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex-1 border-t border-border" />
                  <Lock className="h-3 w-3" />
                  <span>Automatisch afgeschreven — geen actie nodig</span>
                  <div className="flex-1 border-t border-border" />
                </div>
              </TableCell>
            </TableRow>
          )}

          {/* Sectie 2: Vaste lasten */}
          {outRecurring.map((item, idx) => (
            <TableRow key={`rec-${item.ref_id}-${idx}`} className="bg-muted/30 hover:bg-muted/40">
              <TableCell />
              <TableCell className="text-sm max-w-[200px] truncate">
                <div className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                  {item.omschrijving}
                </div>
              </TableCell>
              <TableCell><Badge variant="secondary" className="text-xs">{item.categorie}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.bv_kleur }} />
                  <span className="text-xs text-muted-foreground truncate max-w-[80px]">{item.bv_naam}</span>
                </div>
              </TableCell>
              <TableCell className={cn('text-right font-mono text-sm', colorClass)}>− {fmt(item.bedrag)}</TableCell>
              <TableCell>
                {!isViewer && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-emerald-500 hover:text-white transition-colors"
                    onClick={() => betaalRecurring(item)}
                    title="Markeer als betaald">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell />
            <TableCell colSpan={3} className="text-sm text-muted-foreground">Te beslissen</TableCell>
            <TableCell className={cn('text-right font-mono text-sm', colorClass)}>− {fmt(totalDecision)}</TableCell>
            <TableCell />
          </TableRow>
          {outRecurring.length > 0 && (
            <TableRow>
              <TableCell />
              <TableCell colSpan={3} className="text-sm text-muted-foreground">Vaste lasten</TableCell>
              <TableCell className={cn('text-right font-mono text-sm', colorClass)}>− {fmt(totalRecurring)}</TableCell>
              <TableCell />
            </TableRow>
          )}
          <TableRow>
            <TableCell />
            <TableCell colSpan={3} className="font-semibold">Totaal uit</TableCell>
            <TableCell className={cn('text-right font-mono font-semibold', colorClass)}>− {fmt(totalOut)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    );
  };
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance Meeting</h1>
          <p className="text-muted-foreground text-sm">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={localBVId ?? '__all__'} onValueChange={v => setLocalBVId(v === '__all__' ? null : v)}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Geconsolideerd</SelectItem>
              {bvs.map(bv => (
                <SelectItem key={bv.id} value={bv.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bv.kleur ?? '#888' }} />
                    {bv.naam}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Sync
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deze-week">
        <TabsList>
          <TabsTrigger value="deze-week">Deze week</TabsTrigger>
          <TabsTrigger value="mt-pipeline">MT Pipeline</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Deze week ── */}
        <TabsContent value="deze-week" className="space-y-4 mt-4">
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (() => {
            const selectedOutIds = Array.from(selectedIds).filter(id =>
              outItems.some(i => getSelectKey(i) === id)
            );
            const selectedInIds = Array.from(selectedIds).filter(id =>
              inItems.some(i => getSelectKey(i) === id)
            );
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
                <span className="text-sm font-medium">{selectedIds.size} geselecteerd</span>
                {selectedOutIds.length > 0 && (
                  <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => goedkeurenBulk(selectedOutIds)}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Goedkeuren voor betaling
                  </Button>
                )}
                {selectedInIds.length > 0 && (
                  <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={async () => {
                      for (const id of selectedInIds) {
                        const item = inItems.find(i => getSelectKey(i) === id);
                        if (item) await checkOntvangen(item);
                      }
                      setSelectedIds(new Set());
                    }}>
                    <PackageCheck className="h-3.5 w-3.5 mr-1" /> Check ontvangen
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8"
                  onClick={() => verschuifBulk(Array.from(selectedIds))}>
                  <ArrowRight className="h-3.5 w-3.5 mr-1" /> 1 week opschuiven
                </Button>
                <Button size="sm" variant="ghost" className="h-8 ml-auto"
                  onClick={() => setSelectedIds(new Set())}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive">Te betalen</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {renderOutTable()}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-400">Te ontvangen</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {renderCashflowTable(inItems, 'in')}
              </CardContent>
            </Card>
          </div>

          {/* Bankstanden */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bankstanden bijwerken</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {bankAccounts.map(account => {
                  const bv = bvs.find(b => b.id === account.bv_id);
                  const isEditing = editingSaldoId === account.id;
                  return (
                    <div key={account.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{bv?.naam ?? 'Onbekend'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{account.iban}</p>
                      </div>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            value={saldoValues[account.id] ?? ''}
                            onChange={e => setSaldoValues(prev => ({ ...prev, [account.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveSaldo(account);
                              if (e.key === 'Escape') setEditingSaldoId(null);
                            }}
                            className="h-8 w-36 font-mono text-sm"
                            autoFocus
                          />
                          <Button size="sm" className="h-8" onClick={() => saveSaldo(account)}>
                            <Save className="h-3.5 w-3.5 mr-1" />Opslaan
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingSaldoId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{fmt(account.huidig_saldo ?? 0)}</span>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEditSaldo(account.id, account.huidig_saldo ?? 0)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {bankAccounts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Geen bankrekeningen gevonden.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary bar */}
          <Card>
            <CardContent className="py-3 px-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Beginsaldo</p>
                  <p className="text-lg font-mono font-semibold">{fmt(openingBalance)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Totaal in</p>
                  <p className="text-lg font-mono font-semibold text-emerald-400">+ {fmt(totalIn)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Totaal uit</p>
                  <p className="text-lg font-mono font-semibold text-destructive">− {fmt(totalOut)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Verwacht eindsaldo</p>
                  <p className={cn('text-lg font-mono font-semibold', expectedClosing < 0 ? 'text-destructive' : '')}>
                    {fmt(expectedClosing)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: MT Pipeline ── */}
        <TabsContent value="mt-pipeline" className="space-y-4 mt-4">
          {pipelineItems.length === 0 && (
            <p className="text-muted-foreground text-center py-12">Geen pipeline items gevonden.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pipelineItems.map(item => {
              const ev = (item.bedrag ?? 0) * ((item.kans_percentage ?? 0) / 100);
              const status = item.status ?? 'lead';
              return (
                <Card key={item.id}>
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base leading-tight">{item.projectnaam ?? '—'}</h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {bvs.find(b => b.id === item.bv_id) && (
                          <Badge variant="outline" className="text-xs">
                            <span className="h-2 w-2 rounded-full mr-1" style={{ backgroundColor: bvs.find(b => b.id === item.bv_id)?.kleur ?? '#888' }} />
                            {bvs.find(b => b.id === item.bv_id)?.naam}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStatusChange(item)}
                        className={cn('px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors', STATUS_COLORS[status] ?? STATUS_COLORS.lead)}
                      >
                        {status}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Bedrag</p>
                        <p className="font-mono text-sm font-medium">{fmt(item.bedrag ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Kans</p>
                        <p className="font-mono text-sm font-medium">{item.kans_percentage ?? 0}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expected</p>
                        <p className="font-mono text-sm font-medium text-emerald-400">{fmt(ev)}</p>
                      </div>
                    </div>

                    {item.opmerkingen && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">{item.opmerkingen}</p>
                    )}

                    {(status === 'contract' || status === 'handshake') && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => openSchedule(item)}>
                        <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                        Inplannen
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Drilldown drawer */}
      <ForecastDrilldownDrawer
        item={drawerItem}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={loadData}
        bvs={bvs}
      />

      {/* Schedule modal */}
      <Sheet open={!!scheduleItem} onOpenChange={v => !v && setScheduleItem(null)}>
        <SheetContent className="w-[460px] sm:w-[460px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>{scheduleItem?.projectnaam ?? 'Inplannen'}</SheetTitle>
          </SheetHeader>
          {scheduleItem && (
            <div className="space-y-5 pt-5">
              <div>
                <Label className="text-xs text-muted-foreground">Totaal projectbedrag</Label>
                <p className="text-xl font-mono font-semibold">{fmt(scheduleItem.bedrag ?? 0)}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Betalingsschema</Label>
                <p className={cn('text-xs', percentageValid ? 'text-emerald-400' : 'text-destructive')}>
                  Totaal: {totalPercentage}%{' '}
                  {!percentageValid && `(nog ${100 - totalPercentage}% in te delen)`}
                </p>
              </div>

              <div className="space-y-3">
                {termijnen.map((t, i) => {
                  const bedrag = (scheduleItem.bedrag ?? 0) * ((t.percentage || 0) / 100);
                  return (
                    <div key={i} className="flex items-end gap-3 p-3 rounded-lg bg-muted/30 border">
                      <div className="space-y-1 w-20">
                        <Label className="text-xs">Termijn {i + 1}</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={t.percentage}
                            onChange={e => {
                              const updated = [...termijnen];
                              updated[i] = { ...updated[i], percentage: Number(e.target.value) || 0 };
                              setTermijnen(updated);
                            }}
                            className="h-8 text-sm font-mono w-16"
                            min={0}
                            max={100}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">Datum</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn('w-full h-8 justify-start text-left text-sm', !t.datum && 'text-muted-foreground')}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {t.datum ? format(t.datum, 'd MMM yyyy', { locale: nl }) : 'Kies datum'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={t.datum}
                              onSelect={d => {
                                const updated = [...termijnen];
                                updated[i] = { ...updated[i], datum: d };
                                setTermijnen(updated);
                              }}
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="text-right min-w-[90px]">
                        <p className="text-xs text-muted-foreground">Bedrag</p>
                        <p className="font-mono text-sm">{fmt(bedrag)}</p>
                      </div>
                      {termijnen.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => setTermijnen(termijnen.filter((_, j) => j !== i))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setTermijnen([...termijnen, { percentage: 0, datum: undefined }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Betaaltermijn toevoegen
              </Button>

              <div className="pt-3 border-t">
                <Button
                  className="w-full"
                  disabled={!percentageValid || !allDatesSet || savingSchedule}
                  onClick={handleSaveSchedule}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Opslaan ({termijnen.length} termijnen)
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
