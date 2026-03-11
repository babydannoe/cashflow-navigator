import { useState, useCallback, useMemo, useRef } from 'react';
import { useBV } from '@/contexts/BVContext';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ForecastDrilldownDrawer, type DrilldownItem } from '@/components/ForecastDrilldownDrawer';
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
}

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
}

// Row types for the matrix
type RowType = 'summary' | 'category' | 'subcategory' | 'detail';

interface MatrixRow {
  id: string;
  type: RowType;
  label: string;
  summaryKind?: 'opening' | 'inflow' | 'outflow' | 'closing';
  weekValues: Record<string, number>;
  indent: number;
  expandable: boolean;
  parentId?: string;
  items?: CashflowItem[]; // only for detail rows
  detailItem?: CashflowItem; // the specific item for drilldown
}

const SOURCES = [
  { id: 'exact', label: 'Exact' },
  { id: 'bunq', label: 'bunq' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'mt_pipeline', label: 'MT Pipeline' },
  { id: 'handmatig', label: 'Handmatig' },
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
  const [weekBuckets, setWeekBuckets] = useState<WeekBucket[]>([]);
  const [forecasts, setForecasts] = useState<ForecastWeek[]>([]);
  const [cashflowItems, setCashflowItems] = useState<CashflowItem[]>([]);
  const [drempel, setDrempel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Filters
  const [period, setPeriod] = useState('12');
  const [selectedSources, setSelectedSources] = useState<string[]>(SOURCES.map(s => s.id));
  const [typeFilter, setTypeFilter] = useState('all');
  const [localBVId, setLocalBVId] = useState<string | null>(selectedBVId);

  // Expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Drilldown
  const [drilldownItem, setDrilldownItem] = useState<DrilldownItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      setLoaded(true);
    } catch (e: any) {
      toast.error('Fout bij ophalen forecast: ' + (e.message || 'Onbekende fout'));
    } finally {
      setLoading(false);
    }
  }, [localBVId, period]);

  // Filter items
  const filteredItems = useMemo(() => {
    return cashflowItems.filter(item => {
      if (!selectedSources.includes(item.bron)) return false;
      if (typeFilter === 'in' && item.type !== 'in') return false;
      if (typeFilter === 'out' && item.type !== 'out') return false;
      return true;
    });
  }, [cashflowItems, selectedSources, typeFilter]);

  // Build hierarchical rows
  const allRows = useMemo(() => {
    const rows: MatrixRow[] = [];
    const weeks = weekBuckets.map(w => w.weekDate);

    // Summary: Opening balance
    const openingRow: MatrixRow = {
      id: 'summary-opening',
      type: 'summary',
      label: 'Beginsaldo',
      summaryKind: 'opening',
      weekValues: {},
      indent: 0,
      expandable: false,
    };
    forecasts.forEach(f => { openingRow.weekValues[f.week] = f.opening_balance; });
    rows.push(openingRow);

    // Group items by category > subcategory
    const inflowItems = filteredItems.filter(i => i.type === 'in');
    const outflowItems = filteredItems.filter(i => i.type === 'out');

    // Inflow summary
    const inflowSummary: MatrixRow = {
      id: 'summary-inflow',
      type: 'summary',
      label: 'Totaal Cash In',
      summaryKind: 'inflow',
      weekValues: {},
      indent: 0,
      expandable: false,
    };
    forecasts.forEach(f => { inflowSummary.weekValues[f.week] = f.inflow; });

    // Build inflow categories
    const inflowCatRows = buildCategoryRows(inflowItems, weeks, 'in');
    rows.push(inflowSummary);
    rows.push(...inflowCatRows);

    // Outflow summary
    const outflowSummary: MatrixRow = {
      id: 'summary-outflow',
      type: 'summary',
      label: 'Totaal Cash Uit',
      summaryKind: 'outflow',
      weekValues: {},
      indent: 0,
      expandable: false,
    };
    forecasts.forEach(f => { outflowSummary.weekValues[f.week] = f.outflow; });

    const outflowCatRows = buildCategoryRows(outflowItems, weeks, 'out');
    rows.push(outflowSummary);
    rows.push(...outflowCatRows);

    // Closing balance
    const closingRow: MatrixRow = {
      id: 'summary-closing',
      type: 'summary',
      label: 'Eindsaldo',
      summaryKind: 'closing',
      weekValues: {},
      indent: 0,
      expandable: false,
    };
    forecasts.forEach(f => { closingRow.weekValues[f.week] = f.closing_balance; });
    rows.push(closingRow);

    return rows;
  }, [filteredItems, weekBuckets, forecasts]);

  // Visible rows (respecting expand state)
  const visibleRows = useMemo(() => {
    const result: MatrixRow[] = [];
    for (const row of allRows) {
      if (row.type === 'summary') {
        result.push(row);
      } else if (row.type === 'category') {
        result.push(row);
      } else if (row.type === 'subcategory') {
        if (row.parentId && expanded.has(row.parentId)) {
          result.push(row);
        }
      } else if (row.type === 'detail') {
        // Show if both category and subcategory are expanded
        const parts = row.parentId?.split('::') || [];
        const catId = parts[0];
        const subId = row.parentId;
        if (catId && subId && expanded.has(catId) && expanded.has(subId)) {
          result.push(row);
        }
      }
    }
    return result;
  }, [allRows, expanded]);

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

  const handleDetailClick = (item: CashflowItem) => {
    setDrilldownItem(item as DrilldownItem);
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

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Forecast Explorer</h1>
        <p className="text-muted-foreground text-sm mt-1">Cashflow forecast per week</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-card border">
        {/* BV Selector */}
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

        {/* Period Toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                period === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Source filters */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Bron:</span>
          {SOURCES.map(s => (
            <label key={s.id} className="flex items-center gap-1 cursor-pointer">
              <Checkbox
                checked={selectedSources.includes(s.id)}
                onCheckedChange={() => toggleSource(s.id)}
                className="h-3.5 w-3.5"
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex rounded-lg border overflow-hidden">
          {TYPE_FILTERS.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                typeFilter === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sync button */}
        <Button onClick={syncData} disabled={loading} size="sm" className="ml-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Sync data
        </Button>
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-3">Klik "Sync data" om de forecast te berekenen</p>
            <Button onClick={syncData} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Forecast berekenen
            </Button>
          </div>
        </div>
      ) : (
        /* Matrix */
        <div className="flex-1 overflow-hidden rounded-xl border bg-card" ref={parentRef} style={{ overflow: 'auto' }}>
          <div style={{ minWidth: 280 + weekBuckets.length * COL_WIDTH }}>
            {/* Sticky Header */}
            <div className="flex sticky top-0 z-20 bg-card border-b">
              <div className="w-[280px] min-w-[280px] sticky left-0 z-30 bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground border-r">
                Omschrijving
              </div>
              {weekBuckets.map(w => (
                <div key={w.weekDate} className="text-center py-2.5 text-xs font-semibold text-muted-foreground border-r last:border-r-0" style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}>
                  {w.label}
                </div>
              ))}
            </div>

            {/* Virtualized rows */}
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = visibleRows[virtualRow.index];
                return (
                  <div
                    key={row.id}
                    className="flex absolute w-full"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {/* Label cell - sticky left */}
                    <div
                      className={cn(
                        'w-[280px] min-w-[280px] sticky left-0 z-10 flex items-center gap-1 px-4 border-r text-sm truncate',
                        row.type === 'summary' && row.summaryKind === 'opening' && 'bg-primary/5 font-semibold text-primary',
                        row.type === 'summary' && row.summaryKind === 'inflow' && 'bg-[#059669]/5 font-semibold text-[#059669]',
                        row.type === 'summary' && row.summaryKind === 'outflow' && 'bg-destructive/5 font-semibold text-destructive',
                        row.type === 'summary' && row.summaryKind === 'closing' && 'bg-primary/10 font-bold text-primary',
                        row.type === 'category' && 'bg-muted/50 font-semibold',
                        row.type === 'subcategory' && 'bg-card',
                        row.type === 'detail' && 'bg-card italic text-muted-foreground',
                      )}
                      style={{ paddingLeft: 16 + row.indent * 20 }}
                    >
                      {row.expandable && (
                        <button onClick={() => toggleExpand(row.id)} className="p-0.5 rounded hover:bg-muted shrink-0">
                          {expanded.has(row.id)
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />
                          }
                        </button>
                      )}
                      <span className="truncate">{row.label}</span>
                    </div>

                    {/* Week value cells */}
                    {weekBuckets.map(w => {
                      const val = row.weekValues[w.weekDate] || 0;
                      const isClosing = row.summaryKind === 'closing';
                      const isNegative = val < 0;
                      const underDrempel = isClosing && val < drempel && drempel > 0;

                      return (
                        <div
                          key={w.weekDate}
                          className={cn(
                            'flex items-center justify-end px-2 border-r last:border-r-0 font-mono text-xs',
                            row.type === 'summary' && row.summaryKind === 'opening' && 'bg-primary/5',
                            row.type === 'summary' && row.summaryKind === 'inflow' && 'bg-[#059669]/5',
                            row.type === 'summary' && row.summaryKind === 'outflow' && 'bg-destructive/5',
                            row.type === 'summary' && row.summaryKind === 'closing' && 'bg-primary/10 font-bold',
                            row.type === 'category' && 'bg-muted/50 font-semibold',
                            row.type === 'detail' && 'cursor-pointer hover:bg-muted/30',
                            isNegative && 'text-destructive',
                            underDrempel && 'bg-destructive/20 text-destructive font-bold',
                          )}
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          onClick={() => {
                            if (row.type === 'detail' && row.detailItem) {
                              handleDetailClick(row.detailItem);
                            }
                          }}
                        >
                          {val !== 0 ? fmt(val) : <span className="text-muted-foreground/30">—</span>}
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
      />
    </div>
  );
}

function buildCategoryRows(
  items: CashflowItem[],
  weeks: string[],
  flowType: 'in' | 'out'
): MatrixRow[] {
  const rows: MatrixRow[] = [];

  // Group by categorie
  const catMap = new Map<string, CashflowItem[]>();
  for (const item of items) {
    const key = item.categorie || 'Overig';
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key)!.push(item);
  }

  for (const [cat, catItems] of catMap) {
    const catId = `${flowType}::${cat}`;

    // Category row with weekly totals
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

    // Group by subcategorie
    const subMap = new Map<string, CashflowItem[]>();
    for (const item of catItems) {
      const key = item.subcategorie || 'Overig';
      if (!subMap.has(key)) subMap.set(key, []);
      subMap.get(key)!.push(item);
    }

    for (const [sub, subItems] of subMap) {
      const subId = `${catId}::${sub}`;

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

      // Detail items
      for (const item of subItems) {
        const detailId = `${subId}::${item.ref_id || item.omschrijving}::${item.week}`;
        const detailRow: MatrixRow = {
          id: detailId,
          type: 'detail',
          label: item.omschrijving,
          parentId: subId,
          weekValues: { [item.week]: item.bedrag },
          indent: 2,
          expandable: false,
          detailItem: item,
        };
        rows.push(detailRow);
      }
    }
  }

  return rows;
}
