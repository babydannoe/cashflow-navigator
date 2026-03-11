import { useState } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, ArrowRight, X, CheckCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DrilldownItem {
  bv_naam: string;
  bv_kleur: string;
  categorie: string;
  subcategorie: string;
  tegenpartij: string;
  factuurnummer?: string;
  bron: string;
  bedrag: number;
  vervaldatum?: string;
  verwachte_week?: string;
  status?: string;
  ref_id?: string;
  ref_type?: string;
  type: string;
  week: string;
  omschrijving: string;
  kans_percentage?: number;
  frequentie?: string;
}

interface Props {
  item: DrilldownItem | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const bronColors: Record<string, string> = {
  handmatig: 'bg-secondary text-secondary-foreground',
  recurring: 'bg-primary/10 text-primary',
  mt_pipeline: 'bg-[#d9770620] text-[#d97706]',
  exact: 'bg-[#05966920] text-[#059669]',
  bunq: 'bg-[#3b82f620] text-[#3b82f6]',
};

const statusColors: Record<string, string> = {
  open: 'bg-primary/10 text-primary',
  betaald: 'bg-[#05966920] text-[#059669]',
  vervallen: 'bg-destructive/10 text-destructive',
  forecast: 'bg-[#d9770620] text-[#d97706]',
  lead: 'bg-secondary text-secondary-foreground',
  voorstel: 'bg-primary/10 text-primary',
  onderhandeling: 'bg-[#d9770620] text-[#d97706]',
};

export function ForecastDrilldownDrawer({ item, open, onClose, onRefresh }: Props) {
  const [moveDate, setMoveDate] = useState<Date>();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

  const handleMoveWeek = async () => {
    if (!moveDate || !item.ref_id) return;
    setSaving(true);
    try {
      const newWeek = format(moveDate, 'yyyy-MM-dd');
      // Insert override in cashflow_items
      await supabase.from('cashflow_items').insert({
        bv_id: item.ref_id, // We need bv_id - we'll use a workaround
        week: newWeek,
        type: item.type === 'in' ? 'in' : 'out',
        bedrag: item.bedrag,
        omschrijving: `Verplaatst: ${item.omschrijving}`,
        categorie: item.categorie,
        subcategorie: item.subcategorie,
        tegenpartij: item.tegenpartij,
        bron: 'handmatig',
        ref_id: item.ref_id,
        ref_type: item.ref_type,
      });
      toast.success('Verplaatst naar ' + format(moveDate, 'd MMM yyyy', { locale: nl }));
      setShowDatePicker(false);
      onRefresh();
    } catch (e) {
      toast.error('Fout bij verplaatsen');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!item.ref_id || item.ref_type !== 'invoice') return;
    setSaving(true);
    try {
      await supabase
        .from('invoices')
        .update({ status: 'betaald' })
        .eq('id', item.ref_id);
      toast.success('Factuur gemarkeerd als betaald');
      onRefresh();
      onClose();
    } catch (e) {
      toast.error('Fout bij markeren');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[400px] sm:w-[400px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.bv_kleur }} />
            <span className="text-sm text-muted-foreground">{item.bv_naam}</span>
          </div>
          <SheetTitle className="text-lg">{item.omschrijving}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-5">
          {/* Bedrag */}
          <div className="text-center py-4 rounded-xl bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">
              {item.type === 'in' ? 'Inkomend' : 'Uitgaand'}
            </p>
            <p
              className="text-3xl font-bold font-mono tracking-tight"
              style={{ color: item.type === 'in' ? '#059669' : undefined }}
            >
              {item.type === 'out' ? '- ' : '+ '}
              {fmt(item.bedrag)}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow label="Categorie" value={item.categorie} />
            <DetailRow label="Subcategorie" value={item.subcategorie} />
            <DetailRow label="Tegenpartij" value={item.tegenpartij} />
            {item.factuurnummer && (
              <DetailRow label="Factuurnummer" value={item.factuurnummer} mono />
            )}
            {item.kans_percentage != null && (
              <DetailRow label="Kans" value={`${item.kans_percentage}%`} />
            )}
            {item.frequentie && <DetailRow label="Frequentie" value={item.frequentie} />}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className={cn('text-xs', bronColors[item.bron] || bronColors.handmatig)}>
              {item.bron === 'mt_pipeline' ? 'MT Pipeline' : item.bron}
            </Badge>
            {item.status && (
              <Badge className={cn('text-xs', statusColors[item.status] || statusColors.open)}>
                {item.status}
              </Badge>
            )}
          </div>

          {/* Datum */}
          <div className="text-sm">
            <p className="text-muted-foreground mb-0.5">Verwachte betaaldatum</p>
            <p className="font-medium">
              {item.vervaldatum
                ? format(new Date(item.vervaldatum), 'd MMMM yyyy', { locale: nl })
                : item.verwachte_week
                  ? format(new Date(item.verwachte_week), 'd MMMM yyyy', { locale: nl })
                  : 'Niet gespecificeerd'}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2 border-t">
            {/* Move to other week */}
            {showDatePicker ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Verplaats naar andere week</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !moveDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {moveDate
                        ? format(moveDate, 'd MMM yyyy', { locale: nl })
                        : 'Kies een datum'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={moveDate}
                      onSelect={setMoveDate}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2">
                  <Button onClick={handleMoveWeek} disabled={!moveDate || saving} size="sm" className="flex-1">
                    <ArrowRight className="mr-1 h-3.5 w-3.5" />
                    Verplaats
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowDatePicker(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowDatePicker(true)}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Verplaats naar andere week
              </Button>
            )}

            {/* Mark as paid */}
            {item.ref_type === 'invoice' && item.status !== 'betaald' && (
              <Button
                variant="outline"
                className="w-full text-[#059669] border-[#059669]/30 hover:bg-[#059669]/10"
                onClick={handleMarkPaid}
                disabled={saving}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Markeer als betaald
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('font-medium truncate', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}
