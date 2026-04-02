import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon, Trash2, Save, X, CheckCircle, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { BV } from '@/contexts/BVContext';

export interface DrilldownItem {
  bv_id: string;
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
  cashflow_item_id?: string;
  opmerking?: string | null;
}

interface Props {
  item: DrilldownItem | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  bvs: BV[];
  isNew?: boolean;
}

const CATEGORIES = ['Omzet', 'Diensten', 'Inkoop', 'Huurkosten', 'Personeelskosten', 'Marketing', 'Belastingen', 'Financiering', 'Abonnementen', 'Dividend', 'Pipeline omzet', 'Overig'];

export function ForecastDrilldownDrawer({ item, open, onClose, onRefresh, bvs, isNew = false }: Props) {
  const [saving, setSaving] = useState(false);

  // Form state
  const [omschrijving, setOmschrijving] = useState('');
  const [bedrag, setBedrag] = useState('');
  const [vervaldatum, setVervaldatum] = useState<Date | undefined>();
  const [categorie, setCategorie] = useState('');
  const [tegenpartij, setTegenpartij] = useState('');
  const [bvId, setBvId] = useState('');
  const [type, setType] = useState<'in' | 'out'>('out');
  const [opmerking, setOpmerking] = useState('');

  // Reset form when item changes
  useEffect(() => {
    if (isNew) {
      setOmschrijving('');
      setBedrag('');
      setVervaldatum(undefined);
      setCategorie('Overig');
      setTegenpartij('');
      setBvId(bvs[0]?.id || '');
      setType('out');
      setOpmerking('');
    } else if (item) {
      setOmschrijving(item.omschrijving || '');
      setBedrag(String(item.bedrag || 0));
      setVervaldatum(item.vervaldatum ? new Date(item.vervaldatum) : item.week ? new Date(item.week) : undefined);
      setCategorie(item.categorie || 'Overig');
      setTegenpartij(item.tegenpartij || '');
      setBvId(item.bv_id || '');
      setType(item.type === 'in' ? 'in' : 'out');
    }
  }, [item, isNew, open, bvs]);

  // Load opmerking from DB when opening existing item
  useEffect(() => {
    if (isNew || !item || !open) return;

    const laadOpmerking = async () => {
      if (item.cashflow_item_id) {
        const { data } = await supabase
          .from('cashflow_items')
          .select('opmerking')
          .eq('id', item.cashflow_item_id)
          .maybeSingle();
        setOpmerking((data as any)?.opmerking || '');
      } else if (item.ref_type === 'invoice' && item.ref_id) {
        const { data } = await supabase
          .from('invoices')
          .select('opmerking')
          .eq('id', item.ref_id)
          .maybeSingle();
        setOpmerking((data as any)?.opmerking || '');
      } else {
        setOpmerking('');
      }
    };

    laadOpmerking();
  }, [item?.cashflow_item_id, item?.ref_id, open, isNew]);

  const handleSave = async () => {
    if (!bvId || !bedrag) {
      toast.error('Vul minimaal BV en bedrag in');
      return;
    }
    setSaving(true);
    try {
      const weekDate = vervaldatum ? format(getISOWeekStart(vervaldatum), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');

      if (isNew) {
        // Insert new cashflow_item
        const { error } = await supabase.from('cashflow_items').insert({
          bv_id: bvId,
          week: weekDate,
          type,
          bedrag: Math.abs(parseFloat(bedrag)),
          omschrijving,
          categorie,
          subcategorie: tegenpartij || omschrijving,
          tegenpartij,
          bron: 'handmatig',
          ref_type: 'handmatig',
          opmerking: opmerking || null,
        } as any);
        if (error) throw error;
        toast.success('Nieuwe post toegevoegd');
      } else if (item?.ref_type === 'invoice' && item?.ref_id) {
        // Update the source invoice
        const { error } = await supabase.from('invoices').update({
          bedrag: Math.abs(parseFloat(bedrag)),
          vervaldatum: vervaldatum ? format(vervaldatum, 'yyyy-MM-dd') : null,
          opmerking: opmerking || null,
        } as any).eq('id', item.ref_id);
        if (error) throw error;
        toast.success('Factuur bijgewerkt');
      } else if (item?.cashflow_item_id) {
        // Update the cashflow_item directly
        const { error } = await supabase.from('cashflow_items').update({
          bedrag: Math.abs(parseFloat(bedrag)),
          omschrijving,
          categorie,
          subcategorie: tegenpartij || omschrijving,
          tegenpartij,
          week: weekDate,
          type,
          bv_id: bvId,
          opmerking: opmerking || null,
        } as any).eq('id', item.cashflow_item_id);
        if (error) throw error;
        toast.success('Post bijgewerkt');
      } else {
        // Fallback: insert as new override
        const { error } = await supabase.from('cashflow_items').insert({
          bv_id: bvId,
          week: weekDate,
          type,
          bedrag: Math.abs(parseFloat(bedrag)),
          omschrijving,
          categorie,
          subcategorie: tegenpartij || omschrijving,
          tegenpartij,
          bron: 'handmatig',
          ref_type: 'handmatig',
          opmerking: opmerking || null,
        } as any);
        if (error) throw error;
        toast.success('Post opgeslagen');
      }

      await onRefresh();
      onClose();
    } catch (e: any) {
      toast.error('Fout bij opslaan: ' + (e.message || 'Onbekende fout'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      if (item?.cashflow_item_id) {
        // Step 1: Unlink any invoice that references this cashflow_item via forecast_item_id
        await supabase
          .from('invoices')
          .update({
            forecast_item_id: null,
            import_status: 'pending',
          } as any)
          .eq('forecast_item_id', item.cashflow_item_id);

        // Step 2: Now safe to delete the cashflow_item
        const { error } = await supabase.from('cashflow_items').delete().eq('id', item.cashflow_item_id);
        if (error) throw error;
      } else if (item?.ref_type === 'invoice' && item?.ref_id) {
        const { error } = await supabase.from('invoices').update({ status: 'betaald' }).eq('id', item.ref_id);
        if (error) throw error;
      } else {
        toast.error('Kan deze post niet verwijderen (geen ID gevonden)');
        setSaving(false);
        return;
      }
      toast.success('Post verwijderd');
      await onRefresh();
      onClose();
    } catch (e: any) {
      toast.error('Fout bij verwijderen: ' + (e.message || 'Onbekende fout'));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!item?.ref_id || item.ref_type !== 'invoice') return;
    setSaving(true);
    try {
      await supabase.from('invoices').update({ status: 'betaald' }).eq('id', item.ref_id);
      toast.success('Factuur gemarkeerd als betaald');
      await onRefresh();
      onClose();
    } catch {
      toast.error('Fout bij markeren');
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? 'Nieuwe post toevoegen' : 'Post bewerken';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[420px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          {!isNew && item && (
            <div className="flex items-center gap-2 mb-1">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.bv_kleur }} />
              <span className="text-sm text-muted-foreground">{item.bv_naam}</span>
            </div>
          )}
          <SheetTitle className="text-lg">{title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-5">
          {/* BV */}
          <div className="space-y-1.5">
            <Label className="text-xs">BV</Label>
            <Select value={bvId} onValueChange={setBvId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecteer BV" />
              </SelectTrigger>
              <SelectContent>
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
          </div>

          {/* Type in/out */}
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setType('in')}
                className={cn('flex-1 px-3 py-1.5 text-sm font-medium transition-colors', type === 'in' ? 'bg-[#059669] text-white' : 'bg-card text-muted-foreground hover:bg-muted')}
              >
                Cash In
              </button>
              <button
                onClick={() => setType('out')}
                className={cn('flex-1 px-3 py-1.5 text-sm font-medium transition-colors', type === 'out' ? 'bg-destructive text-destructive-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
              >
                Cash Uit
              </button>
            </div>
          </div>

          {/* Omschrijving */}
          <div className="space-y-1.5">
            <Label className="text-xs">Omschrijving</Label>
            <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Bijv. Factuur MB-001" className="h-9 text-sm" />
          </div>

          {/* Bedrag */}
          <div className="space-y-1.5">
            <Label className="text-xs">Bedrag (€)</Label>
            <Input type="number" value={bedrag} onChange={e => setBedrag(e.target.value)} placeholder="0.00" step="0.01" className="h-9 text-sm font-mono" />
          </div>

          {/* Vervaldatum */}
          <div className="space-y-1.5">
            <Label className="text-xs">Vervaldatum</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('flex-1 h-9 justify-start text-left font-normal text-sm', !vervaldatum && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {vervaldatum ? format(vervaldatum, 'd MMM yyyy', { locale: nl }) : 'Kies een datum'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={vervaldatum} onSelect={setVervaldatum} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 whitespace-nowrap text-xs"
                onClick={() => setVervaldatum(prev => prev ? addDays(prev, 7) : addDays(new Date(), 7))}
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1" />
                1 week
              </Button>
            </div>
          </div>

          {/* Categorie */}
          <div className="space-y-1.5">
            <Label className="text-xs">Categorie</Label>
            <Select value={categorie} onValueChange={setCategorie}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tegenpartij */}
          <div className="space-y-1.5">
            <Label className="text-xs">Relatie / Bedrijfsnaam</Label>
            <Input value={tegenpartij} onChange={e => setTegenpartij(e.target.value)} placeholder="Bijv. Jongens van Boven" className="h-9 text-sm" />
          </div>

          {/* Opmerking */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              Opmerking (optioneel)
              {opmerking && <span className="text-base leading-none">💬</span>}
            </Label>
            <Textarea value={opmerking} onChange={e => setOpmerking(e.target.value)} placeholder="Extra info..." rows={2} className="text-sm" />
          </div>

          {/* Ref info (read-only when editing) */}
          {!isNew && item && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              {item.factuurnummer && <p>Factuurnr: <span className="font-mono">{item.factuurnummer}</span></p>}
              <p>Bron: {item.bron}</p>
              {item.ref_type && <p>Type: {item.ref_type}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-3 border-t">
            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {isNew ? 'Toevoegen' : 'Opslaan'}
            </Button>

            {!isNew && item?.ref_type === 'invoice' && item.status !== 'betaald' && (
              <Button variant="outline" className="w-full text-[#059669] border-[#059669]/30 hover:bg-[#059669]/10" onClick={handleMarkPaid} disabled={saving}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Markeer als betaald
              </Button>
            )}

            <div className="flex gap-2">
              {!isNew && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="flex-1" disabled={saving}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Verwijderen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Post verwijderen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Weet je zeker dat je "{omschrijving}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Verwijderen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>
                <X className="mr-1 h-3.5 w-3.5" />
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function getISOWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
