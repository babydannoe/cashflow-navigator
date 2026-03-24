import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Buffer {
  id: string;
  naam: string | null;
  bedrag: number | null;
  buffer_type: string | null;
  niveau: string | null;
  bv_id: string | null;
  prioriteit: number | null;
  actief: boolean | null;
}

interface LiqRow {
  bvId: string;
  bvNaam: string;
  kleur: string;
  saldo: number;
  buffers: number;
  vrij: number;
}

export default function BuffersLiquiditeit() {
  const { bvs } = useBV();
  const { isAdmin } = useUserRole();
  const [buffers, setBuffers] = useState<Buffer[]>([]);
  const [liqRows, setLiqRows] = useState<LiqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ naam: '', bedrag: '', buffer_type: 'vast', niveau: 'bv', bv_id: '', prioriteit: '1' });

  const loadData = async () => {
    const [bufRes, bankRes] = await Promise.all([
      supabase.from('buffers').select('*').order('prioriteit'),
      supabase.from('bank_accounts').select('bv_id, huidig_saldo'),
    ]);
    const bufs = (bufRes.data || []) as Buffer[];
    setBuffers(bufs);

    const rows: LiqRow[] = bvs.map(bv => {
      const saldo = (bankRes.data || []).filter(b => b.bv_id === bv.id).reduce((s, b) => s + (b.huidig_saldo || 0), 0);
      const bufTotal = bufs.filter(b => b.bv_id === bv.id && b.actief).reduce((s, b) => s + (b.bedrag || 0), 0);
      return { bvId: bv.id, bvNaam: bv.naam, kleur: bv.kleur || '#6366f1', saldo, buffers: bufTotal, vrij: saldo - bufTotal };
    });
    setLiqRows(rows);
    setLoading(false);
  };

  useEffect(() => { if (bvs.length) loadData(); }, [bvs]);

  const fmt = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const toggleActief = async (buf: Buffer) => {
    await supabase.from('buffers').update({ actief: !buf.actief }).eq('id', buf.id);
    await logAudit('UPDATE', 'buffers', buf.id, { actief: buf.actief }, { actief: !buf.actief });
    loadData();
  };

  const deleteBuffer = async (buf: Buffer) => {
    if (!confirm(`Buffer "${buf.naam}" verwijderen?`)) return;
    await supabase.from('buffers').delete().eq('id', buf.id);
    await logAudit('DELETE', 'buffers', buf.id, buf, null);
    toast.success('Buffer verwijderd');
    loadData();
  };

  const addBuffer = async () => {
    const { error } = await supabase.from('buffers').insert({
      naam: form.naam,
      bedrag: parseFloat(form.bedrag) || 0,
      buffer_type: form.buffer_type,
      niveau: form.niveau,
      bv_id: form.niveau === 'bv' ? form.bv_id || null : null,
      prioriteit: parseInt(form.prioriteit) || 1,
      actief: true,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit('INSERT', 'buffers', null, null, form);
    toast.success('Buffer toegevoegd');
    setModalOpen(false);
    setForm({ naam: '', bedrag: '', buffer_type: 'vast', niveau: 'bv', bv_id: '', prioriteit: '1' });
    loadData();
  };

  const logAudit = async (actie: string, tabel: string, recordId: string | null, oud: any, nieuw: any) => {
    await supabase.from('audit_log').insert({
      actie, tabel,
      record_id: recordId,
      oud_waarde: oud,
      nieuw_waarde: nieuw,
      gebruiker: 'systeem',
    });
  };

  const statusBadge = (vrij: number) => {
    if (vrij < 0) return <Badge variant="destructive">Kritiek</Badge>;
    if (vrij < 10000) return <Badge className="bg-orange-500 text-white">Waarschuwing</Badge>;
    return <Badge className="bg-green-600 text-white">Gezond</Badge>;
  };

  // Intercompany suggestion
  const deficit = liqRows.filter(r => r.vrij < 0);
  const surplus = liqRows.filter(r => r.vrij > 20000);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Buffers & Liquiditeit</h1>

      {/* SECTIE A */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Buffer beheer</CardTitle>
          {isAdmin && (
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" />Nieuwe buffer</Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe buffer toevoegen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Naam</Label><Input value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} /></div>
                <div><Label>Bedrag (€)</Label><Input type="number" value={form.bedrag} onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))} /></div>
                <div><Label>Type</Label>
                  <Select value={form.buffer_type} onValueChange={v => setForm(f => ({ ...f, buffer_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="vast">Vast</SelectItem><SelectItem value="percentage">Percentage</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Niveau</Label>
                  <Select value={form.niveau} onValueChange={v => setForm(f => ({ ...f, niveau: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="bv">BV</SelectItem><SelectItem value="groep">Groep</SelectItem></SelectContent>
                  </Select>
                </div>
                {form.niveau === 'bv' && (
                  <div><Label>BV</Label>
                    <Select value={form.bv_id} onValueChange={v => setForm(f => ({ ...f, bv_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecteer BV" /></SelectTrigger>
                      <SelectContent>{bvs.map(bv => <SelectItem key={bv.id} value={bv.id}>{bv.naam}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Prioriteit</Label><Input type="number" value={form.prioriteit} onChange={e => setForm(f => ({ ...f, prioriteit: e.target.value }))} /></div>
                <Button onClick={addBuffer} className="w-full">Toevoegen</Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
                <TableHead>BV</TableHead>
                <TableHead>Prioriteit</TableHead>
                <TableHead>Actief</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buffers.map(buf => (
                <TableRow key={buf.id} className={!buf.actief ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">{buf.naam}</TableCell>
                  <TableCell>{buf.buffer_type}</TableCell>
                  <TableCell>{buf.niveau}</TableCell>
                  <TableCell className="text-right">{fmt(buf.bedrag || 0)}</TableCell>
                  <TableCell>{bvs.find(b => b.id === buf.bv_id)?.naam || '—'}</TableCell>
                  <TableCell>{buf.prioriteit}</TableCell>
                  <TableCell><Switch checked={!!buf.actief} onCheckedChange={() => toggleActief(buf)} disabled={!isAdmin} /></TableCell>
                  <TableCell>{isAdmin && <Button variant="ghost" size="icon" onClick={() => deleteBuffer(buf)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SECTIE B */}
      <Card>
        <CardHeader><CardTitle>Liquiditeitsoverzicht</CardTitle></CardHeader>
        <CardContent>
          {deficit.length > 0 && surplus.length > 0 && (
            <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Intercompany suggestie:</strong>{' '}
                {deficit.map(d => `${d.bvNaam} heeft een tekort van ${fmt(Math.abs(d.vrij))}`).join(', ')}
                {' — '}
                {surplus.map(s => `${s.bvNaam} heeft een overschot van ${fmt(s.vrij)}`).join(', ')}.
                {' '}Overweeg een interne overboeking.
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BV</TableHead>
                <TableHead className="text-right">Banksaldo</TableHead>
                <TableHead className="text-right">Totale buffers</TableHead>
                <TableHead className="text-right">Vrije liquiditeit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liqRows.map(row => (
                <TableRow key={row.bvId}>
                  <TableCell className="font-medium">
                    <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: row.kleur }} />
                    {row.bvNaam}
                  </TableCell>
                  <TableCell className="text-right">{fmt(row.saldo)}</TableCell>
                  <TableCell className="text-right">{fmt(row.buffers)}</TableCell>
                  <TableCell className={`text-right font-semibold ${row.vrij < 0 ? 'text-destructive' : ''}`}>{fmt(row.vrij)}</TableCell>
                  <TableCell>{statusBadge(row.vrij)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2">
                <TableCell>Totaal</TableCell>
                <TableCell className="text-right">{fmt(liqRows.reduce((s, r) => s + r.saldo, 0))}</TableCell>
                <TableCell className="text-right">{fmt(liqRows.reduce((s, r) => s + r.buffers, 0))}</TableCell>
                <TableCell className="text-right">{fmt(liqRows.reduce((s, r) => s + r.vrij, 0))}</TableCell>
                <TableCell>{statusBadge(liqRows.reduce((s, r) => s + r.vrij, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
