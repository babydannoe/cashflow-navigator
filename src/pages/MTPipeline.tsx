import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, Pencil, Check, X, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';

interface PipelineItem {
  id: string;
  bv_id: string;
  projectnaam: string | null;
  bedrag: number | null;
  kans_percentage: number | null;
  verwachte_week: string | null;
  status: string | null;
  opmerkingen: string | null;
  aangemaakt_door: string | null;
  aangemaakt_op: string | null;
}

interface AuditEntry {
  id: string;
  actie: string | null;
  tijdstip: string | null;
  oud_waarde: any;
  nieuw_waarde: any;
  gebruiker: string | null;
}

const STATUSES = ['lead', 'offerte', 'handshake', 'contract'];

export default function MTPipeline() {
  const { bvs, selectedBVId } = useBV();
  const { isAdmin, isViewer } = useUserRole();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<PipelineItem>>({});
  const [sortCol, setSortCol] = useState<string>('projectnaam');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [form, setForm] = useState({
    projectnaam: '', bv_id: '', bedrag: '', kans: 50, verwachte_week: '', status: 'lead', opmerkingen: '',
  });

  const loadData = async () => {
    let q = supabase.from('mt_pipeline_items').select('*');
    if (selectedBVId) q = q.eq('bv_id', selectedBVId);
    const { data } = await q;
    setItems((data || []) as PipelineItem[]);

    const { data: auditData } = await supabase
      .from('audit_log')
      .select('*')
      .eq('tabel', 'mt_pipeline_items')
      .order('tijdstip', { ascending: false })
      .limit(10);
    setAudit((auditData || []) as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedBVId]);

  const logAudit = async (actie: string, recordId: string | null, oud: any, nieuw: any) => {
    await supabase.from('audit_log').insert({
      actie, tabel: 'mt_pipeline_items', record_id: recordId,
      oud_waarde: oud, nieuw_waarde: nieuw, gebruiker: 'systeem',
    });
  };

  const addItem = async () => {
    if (!form.projectnaam || !form.bv_id) { toast.error('Vul projectnaam en BV in'); return; }
    const insert = {
      projectnaam: form.projectnaam,
      bv_id: form.bv_id,
      bedrag: parseFloat(form.bedrag) || 0,
      kans_percentage: form.kans,
      verwachte_week: form.verwachte_week || null,
      status: form.status,
      opmerkingen: form.opmerkingen || null,
      aangemaakt_door: 'MT',
    };
    const { data, error } = await supabase.from('mt_pipeline_items').insert(insert).select().single();
    if (error) { toast.error(error.message); return; }
    await logAudit('INSERT', data?.id, null, insert);
    toast.success('Pipeline item toegevoegd');
    setForm({ projectnaam: '', bv_id: '', bedrag: '', kans: 50, verwachte_week: '', status: 'lead', opmerkingen: '' });
    loadData();
  };

  const startEdit = (item: PipelineItem) => {
    if (isViewer) return;
    setEditId(item.id);
    setEditData({ ...item });
  };

  const saveEdit = async () => {
    if (!editId) return;
    const old = items.find(i => i.id === editId);
    const { error } = await supabase.from('mt_pipeline_items').update({
      projectnaam: editData.projectnaam,
      bedrag: editData.bedrag,
      kans_percentage: editData.kans_percentage,
      verwachte_week: editData.verwachte_week,
      status: editData.status,
      opmerkingen: editData.opmerkingen,
    }).eq('id', editId);
    if (error) { toast.error(error.message); return; }
    await logAudit('UPDATE', editId, old, editData);
    setEditId(null);
    toast.success('Opgeslagen');
    loadData();
  };

  const deleteItem = async (item: PipelineItem) => {
    if (!confirm(`"${item.projectnaam}" verwijderen?`)) return;
    await supabase.from('mt_pipeline_items').delete().eq('id', item.id);
    await logAudit('DELETE', item.id, item, null);
    toast.success('Verwijderd');
    loadData();
  };

  const fmt = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const filtered = useMemo(() => {
    let list = [...items];
    if (filterStatus !== 'all') list = list.filter(i => i.status === filterStatus);
    list.sort((a, b) => {
      const av = (a as any)[sortCol] ?? '';
      const bv = (b as any)[sortCol] ?? '';
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [items, filterStatus, sortCol, sortAsc]);

  const totaalBedrag = filtered.reduce((s, i) => s + (i.bedrag || 0), 0);
  const totaalExpected = filtered.reduce((s, i) => s + (i.bedrag || 0) * (i.kans_percentage || 0) / 100, 0);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'lead': return 'bg-muted text-muted-foreground';
      case 'offerte': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'handshake': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'contract': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return '';
    }
  };

  const expectedValue = (parseFloat(form.bedrag) || 0) * form.kans / 100;

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">MT Pipeline</h1>

      {/* Add form - hidden for viewers */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nieuw pipeline-item</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Projectnaam</Label><Input value={form.projectnaam} onChange={e => setForm(f => ({ ...f, projectnaam: e.target.value }))} /></div>
              <div><Label>BV</Label>
                <Select value={form.bv_id} onValueChange={v => setForm(f => ({ ...f, bv_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Kies BV" /></SelectTrigger>
                  <SelectContent>{bvs.map(bv => <SelectItem key={bv.id} value={bv.id}>{bv.naam}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Bedrag (€)</Label><Input type="number" value={form.bedrag} onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))} /></div>
              <div>
                <Label>Kans: {form.kans}%</Label>
                <Slider value={[form.kans]} onValueChange={v => setForm(f => ({ ...f, kans: v[0] }))} max={100} step={5} className="mt-2" />
              </div>
              <div><Label>Verwachte week</Label><Input type="date" value={form.verwachte_week} onChange={e => setForm(f => ({ ...f, verwachte_week: e.target.value }))} /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Opmerkingen</Label><Textarea value={form.opmerkingen} onChange={e => setForm(f => ({ ...f, opmerkingen: e.target.value }))} rows={2} /></div>
              <div className="flex items-end gap-4">
                <div className="text-sm text-muted-foreground">Verwachte waarde: <span className="font-bold text-foreground">{fmt(expectedValue)}</span></div>
                <Button onClick={addItem}><Plus className="mr-2 h-4 w-4" />Toevoegen</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    ['projectnaam', 'Project'],
                    ['bv_id', 'BV'],
                    ['bedrag', 'Bedrag'],
                    ['kans_percentage', 'Kans%'],
                  ].map(([col, label]) => (
                    <TableHead key={col} className="cursor-pointer select-none" onClick={() => toggleSort(col)}>
                      <span className="flex items-center gap-1">{label}<ArrowUpDown className="h-3 w-3" /></span>
                    </TableHead>
                  ))}
                  <TableHead>Expected</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('verwachte_week')}>Week<ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>Status<ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                  {isAdmin && <TableHead>Acties</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => {
                  const isEditing = editId === item.id;
                  const bvNaam = bvs.find(b => b.id === item.bv_id)?.naam || '—';
                  const ev = (item.bedrag || 0) * (item.kans_percentage || 0) / 100;

                  if (isEditing) {
                    return (
                      <TableRow key={item.id} className="bg-accent/50">
                        <TableCell><Input value={editData.projectnaam || ''} onChange={e => setEditData(d => ({ ...d, projectnaam: e.target.value }))} className="h-8" /></TableCell>
                        <TableCell>{bvNaam}</TableCell>
                        <TableCell><Input type="number" value={editData.bedrag || ''} onChange={e => setEditData(d => ({ ...d, bedrag: parseFloat(e.target.value) }))} className="h-8 w-24" /></TableCell>
                        <TableCell><Input type="number" value={editData.kans_percentage || ''} onChange={e => setEditData(d => ({ ...d, kans_percentage: parseFloat(e.target.value) }))} className="h-8 w-16" /></TableCell>
                        <TableCell>{fmt((editData.bedrag || 0) * (editData.kans_percentage || 0) / 100)}</TableCell>
                        <TableCell><Input type="date" value={editData.verwachte_week || ''} onChange={e => setEditData(d => ({ ...d, verwachte_week: e.target.value }))} className="h-8" /></TableCell>
                        <TableCell>
                          <Select value={editData.status || 'lead'} onValueChange={v => setEditData(d => ({ ...d, status: v }))}>
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={saveEdit}><Check className="h-4 w-4 text-green-600" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={item.id} className={`${isAdmin ? 'cursor-pointer' : ''} hover:bg-accent/30`} onClick={() => isAdmin && startEdit(item)}>
                      <TableCell className="font-medium">{item.projectnaam}</TableCell>
                      <TableCell>{bvNaam}</TableCell>
                      <TableCell className="text-right">{fmt(item.bedrag || 0)}</TableCell>
                      <TableCell className="text-right">{item.kans_percentage}%</TableCell>
                      <TableCell className="text-right">{fmt(ev)}</TableCell>
                      <TableCell>{item.verwachte_week || '—'}</TableCell>
                      <TableCell><Badge className={statusColor(item.status || 'lead')}>{item.status}</Badge></TableCell>
                      {isAdmin && (
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteItem(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={2}>Totaal</TableCell>
                  <TableCell className="text-right">{fmt(totaalBedrag)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{fmt(totaalExpected)}</TableCell>
                  <TableCell colSpan={isAdmin ? 3 : 2}></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Audit trail */}
      <Card>
        <CardHeader><CardTitle className="text-base">Laatste wijzigingen</CardTitle></CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen wijzigingen gevonden.</p>
          ) : (
            <div className="space-y-2">
              {audit.map(a => (
                <div key={a.id} className="flex items-center gap-3 text-sm border-b border-border pb-2">
                  <Badge variant="outline">{a.actie}</Badge>
                  <span className="text-muted-foreground">{a.tijdstip ? new Date(a.tijdstip).toLocaleString('nl-NL') : '—'}</span>
                  <span className="text-muted-foreground">door {a.gebruiker || 'onbekend'}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
