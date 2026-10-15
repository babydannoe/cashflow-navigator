import { useState, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ChevronRight, ChevronDown, Loader2, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ForecastDrilldownDrawer, type DrilldownItem } from '@/components/ForecastDrilldownDrawer';
import { ForecastNotes } from '@/components/ForecastNotes';
import { toast } from 'sonner';
import { useVirtualizer } from '@tanstack/react-virtual';

interface WeekBucket {
  weekDate: string;
  label: string;
}

interface ForecastWeek {
  week: string;
  label: string;
  opening_balance: number;
  inflow: number;
  outflow: number;
  closing_balance: number;
  opening_reserved?: number;
  reserve_dekking?: number;
  closing_reserved?: number;
  opening_per_reserve?: Record<string, number>;
  dekking_per_reserve?: Record<string, number>;
  closing_per_reserve?: Record<string, number>;
}

interface ReserveAccount { id: string; bv_id: string; naam: string; gereserveerd_voor: string | null }
interface ReserveWarning { week: string; rekening_id: string; rekening_naam: string; tekort: number; omschrijving: string }

const RESERVE_LABEL: Record<string, string> = {
  vpb: 'VPB', dividendbelasting: 'Dividendbelasting', btw: 'BTW', overig: 'Overige',
};
const fmtEur = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

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
  ref_id?: string;
  ref_type?: string;
  factuurnummer?: string;
  status?: string;
  vervaldatum?: string;
  verwachte_week?: string;
  kans_percentage?: number;
  frequentie?: string;
  cashflow_item_id?: string;
  opmerking?: string | null;
  betaal_rekening_id?: string | null;
  reserve_dekking?: number;
  reserve_rekening_naam?: string;
  reserve_tekort?: number;
}

type RowType = 'summary' | 'category' | 'subcategory' | 'detail';

interface MatrixRow {
  id: string;
  type: RowType;
  label: string;
  summaryKind?: 'opening' | 'inflow' | 'outflow' | 'closing' | 'opening_reserved' | 'dekking' | 'closing_reserved' | 'total';
  weekValues: Record<string, number>;
  indent: number;
  expandable: boolean;
  parentId?: string;
  detailItem?: CashflowItem;
  requires?: string[];
}

const SOURCES = [
  { id: 'exact', label: 'Exact' },
  { id: 'exact_import', label: 'Exact Import' },
  { id: 'bunq', label: 'bunq' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'mt_pipeline', label: 'MT Pipeline' },
  { id: 'handmatig', label: 'Handmatig' },
  { id: 'excel_import', label: 'Excel Import' },
  { id: 'btw_kwartaal', label: 'BTW kwartaal' },
];

const PERIODS = [
  { value: '8', label: '8 wk' },
  { value: '12', label: '12 wk' },
  { value: '26', label: '26 wk' },
];

const TYPE_FILTERS = [
  { value: 'all', label: 'Alles' },
  { value: 'in', label: 'Alleen in' },
  { value: 'out', label: 'Alleen uit' },
];

export default function ForecastExplorer() {
  const { bvs, selectedBVId, setSelectedBVId } = useBV();
  const { isAdmin } = useUserRole();
  const [weekBuckets, setWeekBuckets] = useState<WeekBucket[]>([]);
  const [forecasts, setForecasts] = useState<ForecastWeek[]>([]);
  const [cashflowItems, setCashflowItems] = useState<CashflowItem[]>([]);
  const [drempel, setDrempel] = useState(0);
  const [reserveAccounts, setReserveAccounts] = useState<ReserveAccount[]>([]);
  const [reserveWarnings, setReserveWarnings] = useState<ReserveWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [period, setPeriod] = useState('12');
  const [selectedSources, setSelectedSources] = useState<string[]>(SOURCES.map(s => s.id));
  const [typeFilter, setTypeFilter] = useState('all');
  const [localBVId, setLocalBVId] = useState<string | null>(selectedBVId);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [drilldownItem, setDrilldownItem] = useState<DrilldownItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isNewPost, setIsNewPost] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  const syncData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-forecast', {
        body: { bv_id: localBVId, weeks: parseInt(period) },
      });
      if (error) throw error;
      setWeekBuckets(data.weekBuckets);
      setForecasts(data.forecasts);
      setCashflowItems(data.cashflowItems);
      setDrempel(data.drempel || 0);
      setReserveAccounts(data.reserveAccounts || []);
      setReserveWarnings(data.reserveWarnings || []);
      setLoaded(true);
    } catch (e: any) {
      toast.error('Fout bij ophalen forecast: ' + (e.message || 'Onbekende fout'));
    } finally {
      setLoading(false);
    }
  }, [localBVId, period]);

  const filteredItems = useMemo(() => {
    return cashflowItems.filter(item => {
      if (!selectedSources.includes(item.bron)) return false;
      if (typeFilter === 'in' && item.type !== 'in') return false;
      if (typeFilter === 'out' && item.type !== 'out') return false;
      return true;
    });
  }, [cashflowItems, selectedSources, typeFilter]);

  // Build hierarchical rows: Category → Subcategory (counterparty) → Individual post
  const allRows = useMemo(() => {
    const rows: MatrixRow[] = [];
    const weeks = weekBuckets.map(w => w.weekDate);

    // Opening balance (vrij)
    const openingRow: MatrixRow = {
      id: 'summary-opening', type: 'summary', label: 'Beginsaldo vrij', summaryKind: 'opening',
      weekValues: {}, indent: 0, expandable: false,
    };
    forecasts.forEach(f => { openingRow.weekValues[f.week] = f.opening_balance; });
    rows.push(openingRow);

    const hasReserves = reserveAccounts.length > 0;
    const reserveSubRows = (prefix: string, key: 'opening_per_reserve' | 'closing_per_reserve' | 'dekking_per_reserve') =>
      reserveAccounts.map(acc => {
        const r: MatrixRow = {
          id: `${prefix}::${acc.id}`, type: 'subcategory', label: acc.naam, parentId: prefix,
          weekValues: {}, indent: 1, expandable: false, requires: [prefix],
        };
        forecasts.forEach(f => { r.weekValues[f.week] = f[key]?.[acc.id] || 0; });
        return r;
      });

    if (hasReserves) {
      const openRes: MatrixRow = {
        id: 'summary-opening-res', type: 'summary', label: 'Beginsaldo gereserveerd', summaryKind: 'opening_reserved',
        weekValues: {}, indent: 0, expandable: true,
      };
      forecasts.forEach(f => { openRes.weekValues[f.week] = f.opening_reserved || 0; });
      rows.push(openRes, ...reserveSubRows('summary-opening-res', 'opening_per_reserve'));
    }

    const inflowItems = filteredItems.filter(i => i.type === 'in');
    const outflowItems = filteredItems.filter(i => i.type === 'out');

    // Inflow summary
    const inflowSummary: MatrixRow = {
      id: 'summary-inflow', type: 'summary', label: 'Totaal Cash In', summaryKind: 'inflow',
      weekValues: {}, indent: 0, expandable: false,
    };
    forecasts.forEach(f => { inflowSummary.weekValues[f.week] = f.inflow; });
    rows.push(inflowSummary);
    rows.push(...buildCategoryRows(inflowItems, weeks, 'in'));

    // Outflow summary
    const outflowSummary: MatrixRow = {
      id: 'summary-outflow', type: 'summary', label: 'Totaal Cash Uit', summaryKind: 'outflow',
      weekValues: {}, indent: 0, expandable: false,
    };
    forecasts.forEach(f => { outflowSummary.weekValues[f.week] = f.outflow; });
    rows.push(outflowSummary);
    rows.push(...buildCategoryRows(outflowItems, weeks, 'out'));

    if (hasReserves) {
      const dek: MatrixRow = {
        id: 'summary-dekking', type: 'summary', label: 'Gedekt uit reserves', summaryKind: 'dekking',
        weekValues: {}, indent: 0, expandable: true,
      };
      forecasts.forEach(f => { dek.weekValues[f.week] = f.reserve_dekking || 0; });
      rows.push(dek);
      for (const acc of reserveAccounts) {
        const accRowId = `summary-dekking::${acc.id}`;
        const accRow: MatrixRow = {
          id: accRowId, type: 'subcategory', label: acc.naam, parentId: 'summary-dekking',
          weekValues: {}, indent: 1, expandable: true, requires: ['summary-dekking'],
        };
        forecasts.forEach(f => { accRow.weekValues[f.week] = f.dekking_per_reserve?.[acc.id] || 0; });
        rows.push(accRow);
        cashflowItems
          .filter(i => i.betaal_rekening_id === acc.id && (i.reserve_dekking || 0) > 0)
          .forEach((item, idx) => {
            rows.push({
              id: `${accRowId}::item::${item.cashflow_item_id || idx}::${item.week}`,
              type: 'detail', label: item.omschrijving, parentId: accRowId,
              weekValues: { [item.week]: item.reserve_dekking || 0 }, indent: 2, expandable: false,
              detailItem: item, requires: ['summary-dekking', accRowId],
            });
          });
      }
    }

    // Closing balance (vrij)
    const closingRow: MatrixRow = {
      id: 'summary-closing', type: 'summary', label: 'Eindsaldo vrij', summaryKind: 'closing',
      weekValues: {}, indent: 0, expandable: false,
    };
    forecasts.forEach(f => { closingRow.weekValues[f.week] = f.closing_balance; });
    rows.push(closingRow);

    if (hasReserves) {
      const closeRes: MatrixRow = {
        id: 'summary-closing-res', type: 'summary', label: 'Eindsaldo gereserveerd', summaryKind: 'closing_reserved',
        weekValues: {}, indent: 0, expandable: true,
      };
      forecasts.forEach(f => { closeRes.weekValues[f.week] = f.closing_reserved || 0; });
      rows.push(closeRes, ...reserveSubRows('summary-closing-res', 'closing_per_reserve'));

      const total: MatrixRow = {
        id: 'summary-total', type: 'summary', label: 'Totaal liquide middelen', summaryKind: 'total',
        weekValues: {}, indent: 0, expandable: false,
      };
      forecasts.forEach(f => { total.weekValues[f.week] = (f.closing_balance || 0) + (f.closing_reserved || 0); });
      rows.push(total);
    }

    return rows;
  }, [filteredItems, weekBuckets, forecasts, reserveAccounts, cashflowItems]);

  const visibleRows = useMemo(() => {
    const result: MatrixRow[] = [];
    for (const row of allRows) {
      if (row.requires) {
        if (row.requires.every(r => expanded.has(r))) result.push(row);
        continue;
      }
      if (row.type === 'summary' || row.type === 'category') {
        result.push(row);
      } else if (row.type === 'subcategory') {
        if (row.parentId && expanded.has(row.parentId)) {
          result.push(row);
        }
      } else if (row.type === 'detail') {
        const parts = row.parentId?.split('::') || [];
        if (parts.length === 2) {
          // Direct onder categorie (enkelvoudig item) — toon als categorie expanded is
          const catId = row.parentId;
          if (catId && expanded.has(catId)) {
            result.push(row);
          }
        } else {
          // Onder subcategorie — beide moeten expanded zijn
          const catId = parts.slice(0, 2).join('::');
          const subId = row.parentId;
          if (catId && subId && expanded.has(catId) && expanded.has(subId)) {
            result.push(row);
          }
        }
      }
    }
    return result;
  }, [allRows, expanded]);

  const warningsByWeek = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const w of reserveWarnings) {
      const acc = reserveAccounts.find(a => a.id === w.rekening_id);
      const label = RESERVE_LABEL[acc?.gereserveerd_voor || ''] || w.rekening_naam;
      const msg = `${label}-reserve dekt ${fmtEur(w.tekort)} niet; dit gaat ten laste van het vrije saldo.`;
      (m[w.week] ||= []).push(msg);
    }
    return m;
  }, [reserveWarnings, reserveAccounts]);

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 20,
  });

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowClick = (row: MatrixRow) => {
    if (row.type === 'detail' && row.detailItem) {
      setDrilldownItem(row.detailItem as DrilldownItem);
    } else if (row.type === 'category' || row.type === 'subcategory') {
      // Build an aggregated item for category/subcategory rows
      const totalBedrag = Object.values(row.weekValues).reduce((s, v) => s + v, 0);
      const firstBv = bvs[0];
      const selectedBv = selectedBVId ? bvs.find(b => b.id === selectedBVId) : firstBv;
      const aggregated: CashflowItem = {
        omschrijving: row.label,
        bedrag: totalBedrag,
        categorie: row.type === 'category' ? row.label : (row.parentId?.split('::')[1] || row.label),
        subcategorie: row.type === 'subcategory' ? row.label : '',
        tegenpartij: row.type === 'subcategory' ? row.label : '',
        bv_id: selectedBv?.id || firstBv?.id || '',
        bv_naam: selectedBv?.naam || firstBv?.naam || '',
        bv_kleur: selectedBv?.kleur || firstBv?.kleur || '#888',
        week: '',
        type: row.id.startsWith('in::') ? 'in' : 'out',
        bron: '',
        cashflow_item_id: undefined,
      };
      setDrilldownItem(aggregated as DrilldownItem);
    } else {
      return; // Don't open drawer for summary rows
    }
    setIsNewPost(false);
    setDrawerOpen(true);
  };

  const handleNewPost = () => {
    setDrilldownItem(null);
    setIsNewPost(true);
    setDrawerOpen(true);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  const toggleSource = (id: string) => {
    setSelectedSources(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const COL_WIDTH = 120;

  const exportXLSX = useCallback(() => {
    if (!allRows.length || !weekBuckets.length) return;

    const bvLabel = localBVId
      ? (bvs.find(b => b.id === localBVId)?.naam ?? 'Onbekend')
      : 'Geconsolideerd';

    const headers = ['Omschrijving', ...weekBuckets.map(w => w.label)];

    const dataRows = allRows.map(row => {
      const indent = '  '.repeat(row.indent);
      const label = indent + row.label;
      const vals = weekBuckets.map(w => {
        const v = row.weekValues[w.weekDate];
        return v != null && v !== 0 ? v : '';
      });
      return [label, ...vals];
    });

    const wsData = [headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 45 },
      ...weekBuckets.map(() => ({ wch: 14 }))
    ];

    allRows.forEach((row, i) => {
      const rowIndex = i + 1;
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
      if (!ws[cellRef]) return;
      if (!ws[cellRef].s) ws[cellRef].s = {};
      if (row.type === 'summary' || row.type === 'category') {
        ws[cellRef].s.font = { bold: true };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, bvLabel.slice(0, 31));

    const datum = new Date().toISOString().slice(0, 10);
    const bestandsnaam = `forecast-${bvLabel.replace(/[^a-zA-Z0-9]/g, '-')}-${datum}.xlsx`;

    XLSX.writeFile(wb, bestandsnaam);
    toast.success(`XLSX geëxporteerd: ${bestandsnaam}`);
  }, [allRows, weekBuckets, localBVId, bvs]);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forecast Explorer</h1>
          <p className="text-muted-foreground text-sm mt-1">Cashflow forecast per week</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportXLSX} size="sm" variant="outline" disabled={!loaded}>
            <Download className="h-4 w-4 mr-1" />
            Exporteer XLSX
          </Button>
          {isAdmin && (
            <Button onClick={handleNewPost} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Nieuwe post
            </Button>
          )}
        </div>
      </div>

      <ForecastNotes />

      {/* Filter Bar */}

      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-card border border-border">
        <Select value={localBVId || 'all'} onValueChange={(v) => setLocalBVId(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[200px] h-9 text-sm">
            <SelectValue placeholder="Geconsolideerd" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Geconsolideerd</SelectItem>
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

        <div className="flex rounded-lg border border-border overflow-hidden">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                period === p.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-surface-raised'
              )}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Bron:</span>
          {SOURCES.map(s => (
            <label key={s.id} className="flex items-center gap-1 cursor-pointer">
              <Checkbox checked={selectedSources.includes(s.id)} onCheckedChange={() => toggleSource(s.id)} className="h-3.5 w-3.5" />
              <span>{s.label}</span>
            </label>
          ))}
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {TYPE_FILTERS.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)}
              className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
                typeFilter === t.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-surface-raised'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        <Button onClick={syncData} disabled={loading} size="sm" className="ml-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Sync data
        </Button>
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center border border-dashed border-border rounded-xl p-12">
            <p className="text-muted-foreground mb-3">Klik "Sync data" om de forecast te berekenen</p>
            <Button onClick={syncData} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Forecast berekenen
            </Button>
          </div>
        </div>
      ) : (
        <>
        {Object.keys(warningsByWeek).length > 0 && (
          <div className="mb-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs space-y-1">
            {weekBuckets.filter(w => warningsByWeek[w.weekDate]).map(w => (
              <div key={w.weekDate} className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                <span className="font-semibold">{w.label}:</span>
                <span>{warningsByWeek[w.weekDate].join(' ')}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card" ref={parentRef} style={{ overflow: 'auto' }}>
          <div style={{ minWidth: 280 + weekBuckets.length * COL_WIDTH }}>
            {/* Header */}
            <div className="flex sticky top-0 z-20 bg-background border-b border-border">
              <div className="w-[280px] min-w-[280px] sticky left-0 z-30 bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground border-r border-border">
                Omschrijving
              </div>
              {weekBuckets.map(w => (
                <div key={w.weekDate} className="text-center py-2.5 text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0" style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}>
                  {w.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = visibleRows[virtualRow.index];
                const isOpening = row.type === 'summary' && row.summaryKind === 'opening';
                const isClosing = row.type === 'summary' && row.summaryKind === 'closing';

                return (
                  <div key={row.id} className={cn(
                    'flex absolute w-full hover:bg-surface-raised transition-colors',
                    isClosing && 'border-l-[3px] border-l-primary',
                  )}
                    style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}>
                    {/* Label cell */}
                    <div
                      className={cn(
                        'w-[280px] min-w-[280px] sticky left-0 z-10 flex items-center gap-1 px-4 border-r border-border text-sm truncate',
                        isOpening && 'matrix-opening-bg font-semibold text-foreground',
                        row.type === 'summary' && row.summaryKind === 'inflow' && 'font-semibold text-success',
                        row.type === 'summary' && row.summaryKind === 'outflow' && 'font-semibold text-destructive',
                        isClosing && 'bg-card font-bold text-foreground',
                        row.summaryKind === 'dekking' && 'font-semibold text-primary',
                        row.summaryKind === 'total' && 'text-muted-foreground italic',
                        (row.summaryKind === 'opening_reserved' || row.summaryKind === 'closing_reserved') && 'font-semibold text-muted-foreground',
                        row.type === 'category' && 'matrix-cat-bg font-semibold text-foreground cursor-pointer',
                        row.type === 'subcategory' && 'matrix-sub-bg font-medium text-muted-foreground cursor-pointer',
                        row.type === 'detail' && 'matrix-detail-bg text-muted-foreground cursor-pointer',
                      )}
                      style={{ paddingLeft: 16 + row.indent * 20 }}
                      onClick={() => {
                        if (row.type !== 'summary') handleRowClick(row);
                      }}
                    >
                      {row.expandable && (
                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }} className="p-0.5 rounded hover:bg-surface-raised shrink-0">
                          {expanded.has(row.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <span className="truncate">{row.label}</span>
                    </div>

                    {/* Week cells */}
                    {weekBuckets.map(w => {
                      const val = row.weekValues[w.weekDate] || 0;
                      const isNeg = val < 0;
                      const underDrempel = isClosing && val < drempel && drempel > 0;
                      const isNegShown = isNeg && (row.type !== 'summary' || isClosing || row.summaryKind === 'opening');
                      const heeftOpmerking = row.type === 'detail'
                        && row.detailItem?.week === w.weekDate
                        && !!(row.detailItem as any)?.opmerking;

                      return (
                        <div key={w.weekDate}
                          className={cn(
                            'flex items-center justify-end px-2 border-r border-border last:border-r-0 font-mono text-xs tabular-nums',
                            isOpening && 'matrix-opening-bg',
                            row.type === 'summary' && row.summaryKind === 'inflow' && 'text-success',
                            row.type === 'summary' && row.summaryKind === 'outflow' && 'text-destructive',
                            isClosing && 'bg-card font-bold',
                            row.summaryKind === 'dekking' && 'text-primary font-semibold',
                            row.summaryKind === 'total' && 'text-muted-foreground',
                            (row.summaryKind === 'opening_reserved' || row.summaryKind === 'closing_reserved') && 'font-semibold text-muted-foreground',
                            row.type === 'category' && 'matrix-cat-bg font-semibold cursor-pointer',
                            row.type === 'subcategory' && 'matrix-sub-bg cursor-pointer',
                            row.type === 'detail' && 'matrix-detail-bg cursor-pointer',
                            isNeg && 'text-destructive',
                            underDrempel && 'matrix-negative-bg text-destructive font-bold',
                          )}
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          onClick={() => {
                            if (row.type !== 'summary') handleRowClick(row);
                          }}
                        >
                          {val !== 0 ? (
                            <span className="flex items-center justify-end gap-1">
                              {heeftOpmerking && (
                                <span
                                  className="text-xs leading-none shrink-0"
                                  title={(row.detailItem as any)?.opmerking}>
                                  💬
                                </span>
                              )}
                              {row.summaryKind === 'dekking' && warningsByWeek[w.weekDate] && (
                                <span title={warningsByWeek[w.weekDate].join('\n')}><AlertTriangle className="h-3 w-3 text-warning" /></span>
                              )}
                              {row.type === 'detail' && !row.requires && row.detailItem?.week === w.weekDate && (row.detailItem?.reserve_dekking || 0) > 0 && (
                                <span
                                  className="text-[9px] px-1 rounded bg-primary/15 text-primary leading-tight shrink-0"
                                  title={`${fmt(row.detailItem!.reserve_dekking!)} gedekt uit ${row.detailItem!.reserve_rekening_naam}`}>
                                  uit reserve
                                </span>
                              )}
                              {fmt(val)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ForecastDrilldownDrawer
        item={drilldownItem}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={syncData}
        bvs={bvs}
        isNew={isNewPost}
      />
    </div>
  );
}

/**
 * Build rows: Category → Counterparty (subcategory) → Individual items
 * Each individual item is its own row at level 3 with its exact amount.
 */
function buildCategoryRows(
  items: CashflowItem[],
  weeks: string[],
  flowType: 'in' | 'out'
): MatrixRow[] {
  const rows: MatrixRow[] = [];

  const catMap = new Map<string, CashflowItem[]>();
  for (const item of items) {
    const key = item.categorie || 'Overig';
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key)!.push(item);
  }

  for (const [cat, catItems] of catMap) {
    const catId = `${flowType}::${cat}`;
    const catRow: MatrixRow = {
      id: catId,
      type: 'category',
      label: cat,
      weekValues: {},
      indent: 0,
      expandable: true,
    };
    for (const w of weeks) {
      catRow.weekValues[w] = catItems
        .filter(i => i.week === w)
        .reduce((s, i) => s + i.bedrag, 0);
    }
    rows.push(catRow);

    // Groepeer per subcategorie/tegenpartij
    const subMap = new Map<string, CashflowItem[]>();
    for (const item of catItems) {
      const key = item.subcategorie || item.tegenpartij || 'Overig';
      if (!subMap.has(key)) subMap.set(key, []);
      subMap.get(key)!.push(item);
    }

    for (const [sub, subItems] of subMap) {
      const subId = `${catId}::${sub}`;

      if (subItems.length === 1) {
        // Slechts één item — geen subcategorie-rij, detail direct onder categorie
        const item = subItems[0];
        const detailId = `${subId}::detail::${item.ref_id || 'x'}::${item.week}::0`;
        const detailRow: MatrixRow = {
          id: detailId,
          type: 'detail',
          label: item.omschrijving || `€${item.bedrag.toLocaleString('nl-NL')}`,
          parentId: catId,
          weekValues: { [item.week]: item.bedrag },
          indent: 1,
          expandable: false,
          detailItem: item,
        };
        rows.push(detailRow);
      } else {
        // Meerdere items — subcategorie-rij + detail-rijen
        const subRow: MatrixRow = {
          id: subId,
          type: 'subcategory',
          label: sub,
          parentId: catId,
          weekValues: {},
          indent: 1,
          expandable: true,
        };
        for (const w of weeks) {
          subRow.weekValues[w] = subItems
            .filter(i => i.week === w)
            .reduce((s, i) => s + i.bedrag, 0);
        }
        rows.push(subRow);

        subItems.forEach((item, idx) => {
          const detailId = `${subId}::detail::${item.ref_id || 'x'}::${item.week}::${idx}`;
          const detailRow: MatrixRow = {
            id: detailId,
            type: 'detail',
            label: item.omschrijving || `€${item.bedrag.toLocaleString('nl-NL')}`,
            parentId: subId,
            weekValues: { [item.week]: item.bedrag },
            indent: 2,
            expandable: false,
            detailItem: item,
          };
          rows.push(detailRow);
        });
      }
    }
  }

  return rows;
}
