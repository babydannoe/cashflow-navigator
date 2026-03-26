import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Check, X, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface RecurringRule {
  id: string;
  bv_id: string;
  categorie: string | null;
  omschrijving: string | null;
  bedrag: number | null;
  frequentie: string | null;
  verwachte_betaaldag: number | null;
  counterparty_id: string | null;
  bron: string | null;
  actief: boolean | null;
  startdatum: string | null;
  einddatum: string | null;
}

interface ReviewSuggestion {
  id: string;
  tegenpartij: string;
  bedrag: number;
  interval: string;
  accepted: boolean | null;
}

const CATEGORIES = ['Abonnement', 'Personeel', 'Huur', 'Overige'];
const FREQUENCIES = ['wekelijks', 'maandelijks', 'kwartaal', 'jaarlijks'];

const mockSuggestions: ReviewSuggestion[] = [
  { id: '1', tegenpartij: 'Slack Technologies', bedrag: 89, interval: 'maandelijks', accepted: null },
  { id: '2', tegenpartij: 'Adobe Creative Cloud', bedrag: 599, interval: 'jaarlijks', accepted: null },
  { id: '3', tegenpartij: 'Mollie Payments', bedrag: 29, interval: 'maandelijks', accepted: null },
  { id: '4', tegenpartij: 'Coolblue Zakelijk', bedrag: 149, interval: 'kwartaal', accepted: null },
  { id: '5', tegenpartij: 'KPN Glasvezel', bedrag: 65, interval: 'maandelijks', accepted: null },
];

export default function RecurringKosten() {
  const { bvs, selectedBVId } = useBV();
  const { isAdmin } = useUserRole();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<RecurringRule>>({});
  const [filterCat, setFilterCat] = useState('all');
  const [filterBron, setFilterBron] = useState('all');
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>(mockSuggestions);
  const [exactOnlineRecurring, setExactOnlineRecurring] = useState<any[]>([]);

  const [form, setForm] = useState({
    bv_id: '', categorie: 'Abonnement', omschrijving: '', bedrag: '', frequentie: 'maandelijks',
    verwachte_betaaldag: '1', startdatum: '', einddatum: '',
  });

  const loadData = async () => {
    let q = supabase.from('recurring_rules').select('*');
    if (selectedBVId) q = q.eq('bv_id', selectedBVId);
    const { data } = await q;
    setRules((data || []) as RecurringRule[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedBVId]);

  useEffect(() => {
    const loadBetaald = async () => {
      let q = supabase
        .from('cashflow_items')
        .select('*')
        .eq('bron', 'exact_import')
        .eq('categorie', 'Recurring kosten')
        .eq('status', 'betaald')
        .order('week', { ascending: false });
      if (selectedBVId) q = q.eq('bv_id', selectedBVId);
      const { data } = await q;
      setBetaaldeRecurring(data || []);
    };
    loadBetaald();
  }, [selectedBVId]);

  const fmt = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const logAudit = async (actie: string, recordId: string | null, oud: any, nieuw: any) => {
    await supabase.from('audit_log').insert({
      actie, tabel: 'recurring_rules', record_id: recordId,
      oud_waarde: oud, nieuw_waarde: nieuw, gebruiker: 'systeem',
    });
  };

  const addRule = async () => {
    if (!form.omschrijving || !form.bv_id) { toast.error('Vul omschrijving en BV in'); return; }
    const insert = {
      bv_id: form.bv_id,
      categorie: form.categorie,
      omschrijving: form.omschrijving,
      bedrag: parseFloat(form.bedrag) || 0,
      frequentie: form.frequentie,
      verwachte_betaaldag: parseInt(form.verwachte_betaaldag) || 1,
      startdatum: form.startdatum || null,
      einddatum: form.einddatum || null,
      actief: true,
      bron: 'handmatig',
    };
    const { data, error } = await supabase.from('recurring_rules').insert(insert).select().single();
    if (error) { toast.error(error.message); return; }
    await logAudit('INSERT', data?.id, null, insert);
    toast.success('Recurring regel toegevoegd');
    setModalOpen(false);
    setForm({ bv_id: '', categorie: 'Abonnement', omschrijving: '', bedrag: '', frequentie: 'maandelijks', verwachte_betaaldag: '1', startdatum: '', einddatum: '' });
    loadData();
  };

  const toggleActief = async (rule: RecurringRule) => {
    await supabase.from('recurring_rules').update({ actief: !rule.actief }).eq('id', rule.id);
    await logAudit('UPDATE', rule.id, { actief: rule.actief }, { actief: !rule.actief });
    loadData();
  };

  const deleteRule = async (rule: RecurringRule) => {
    if (!confirm(`"${rule.omschrijving}" verwijderen?`)) return;
    await supabase.from('recurring_rules').delete().eq('id', rule.id);
    await logAudit('DELETE', rule.id, rule, null);
    toast.success('Verwijderd');
    loadData();
  };

  const startEdit = (rule: RecurringRule) => { setEditId(rule.id); setEditData({ ...rule }); };

  const saveEdit = async () => {
    if (!editId) return;
    const old = rules.find(r => r.id === editId);
    await supabase.from('recurring_rules').update({
      omschrijving: editData.omschrijving,
      bedrag: editData.bedrag,
      categorie: editData.categorie,
      frequentie: editData.frequentie,
      verwachte_betaaldag: editData.verwachte_betaaldag,
    }).eq('id', editId);
    await logAudit('UPDATE', editId, old, editData);
    setEditId(null);
    toast.success('Opgeslagen');
    loadData();
  };

  const acceptSuggestion = async (sug: ReviewSuggestion) => {
    if (!bvs.length) return;
    const insert = {
      bv_id: selectedBVId || bvs[0].id,
      categorie: 'Abonnement',
      omschrijving: sug.tegenpartij,
      bedrag: sug.bedrag,
      frequentie: sug.interval,
      verwachte_betaaldag: 1,
      actief: true,
      bron: 'bunq-detectie',
    };
    const { error } = await supabase.from('recurring_rules').insert(insert);
    if (error) { toast.error(error.message); return; }
    await logAudit('INSERT', null, null, { ...insert, bron_suggestie: sug });
    setSuggestions(prev => prev.map(s => s.id === sug.id ? { ...s, accepted: true } : s));
    toast.success(`"${sug.tegenpartij}" geaccepteerd als recurring`);
    loadData();
  };

  const ignoreSuggestion = (id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, accepted: false } : s));
  };

  const filtered = rules.filter(r => {
    if (filterCat !== 'all' && r.categorie !== filterCat) return false;
    if (filterBron !== 'all' && r.bron !== filterBron) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Recurring Kosten</h1>

      <Tabs defaultValue="actief">
        <TabsList>
          <TabsTrigger value="actief">Actieve regels</TabsTrigger>
          <TabsTrigger value="review">Review voorstellen</TabsTrigger>
          <TabsTrigger value="betaald">Betaalde recurring</TabsTrigger>
        </TabsList>

        <TabsContent value="actief" className="space-y-4">
          {/* Filters + add button */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Categorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle categorieën</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBron} onValueChange={setFilterBron}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Bron" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle bronnen</SelectItem>
                <SelectItem value="handmatig">Handmatig</SelectItem>
                <SelectItem value="bunq-detectie">bunq-detectie</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-2 h-4 w-4" />Nieuwe regel</Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nieuwe recurring regel</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>BV</Label>
                    <Select value={form.bv_id} onValueChange={v => setForm(f => ({ ...f, bv_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Kies BV" /></SelectTrigger>
                      <SelectContent>{bvs.map(bv => <SelectItem key={bv.id} value={bv.id}>{bv.naam}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Categorie</Label>
                    <Select value={form.categorie} onValueChange={v => setForm(f => ({ ...f, categorie: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Omschrijving</Label><Input value={form.omschrijving} onChange={e => setForm(f => ({ ...f, omschrijving: e.target.value }))} /></div>
                  <div><Label>Bedrag (€)</Label><Input type="number" value={form.bedrag} onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))} /></div>
                  <div><Label>Frequentie</Label>
                    <Select value={form.frequentie} onValueChange={v => setForm(f => ({ ...f, frequentie: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Verwachte betaaldag (dag vd maand)</Label><Input type="number" min={1} max={31} value={form.verwachte_betaaldag} onChange={e => setForm(f => ({ ...f, verwachte_betaaldag: e.target.value }))} /></div>
                  <div><Label>Startdatum</Label><Input type="date" value={form.startdatum} onChange={e => setForm(f => ({ ...f, startdatum: e.target.value }))} /></div>
                  <div><Label>Einddatum (optioneel)</Label><Input type="date" value={form.einddatum} onChange={e => setForm(f => ({ ...f, einddatum: e.target.value }))} /></div>
                  <Button onClick={addRule} className="w-full">Toevoegen</Button>
                </div>
              </DialogContent>
            </Dialog>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead>BV</TableHead>
                      <TableHead>Categorie</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead>Frequentie</TableHead>
                      <TableHead>Betaaldag</TableHead>
                      <TableHead>Bron</TableHead>
                      <TableHead>Actief</TableHead>
                      <TableHead>Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(rule => {
                      const isEditing = editId === rule.id;
                      const bvNaam = bvs.find(b => b.id === rule.bv_id)?.naam || '—';

                      if (isEditing) {
                        return (
                          <TableRow key={rule.id} className="bg-accent/50">
                            <TableCell><Input value={editData.omschrijving || ''} onChange={e => setEditData(d => ({ ...d, omschrijving: e.target.value }))} className="h-8" /></TableCell>
                            <TableCell>{bvNaam}</TableCell>
                            <TableCell>
                              <Select value={editData.categorie || ''} onValueChange={v => setEditData(d => ({ ...d, categorie: v }))}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell><Input type="number" value={editData.bedrag || ''} onChange={e => setEditData(d => ({ ...d, bedrag: parseFloat(e.target.value) }))} className="h-8 w-24" /></TableCell>
                            <TableCell>
                              <Select value={editData.frequentie || ''} onValueChange={v => setEditData(d => ({ ...d, frequentie: v }))}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell><Input type="number" value={editData.verwachte_betaaldag || ''} onChange={e => setEditData(d => ({ ...d, verwachte_betaaldag: parseInt(e.target.value) }))} className="h-8 w-16" /></TableCell>
                            <TableCell><Badge variant="outline">{rule.bron}</Badge></TableCell>
                            <TableCell><Switch checked={!!rule.actief} /></TableCell>
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
                        <TableRow key={rule.id} className={!rule.actief ? 'opacity-50' : ''}>
                          <TableCell className="font-medium">{rule.omschrijving}</TableCell>
                          <TableCell>{bvNaam}</TableCell>
                          <TableCell><Badge variant="outline">{rule.categorie}</Badge></TableCell>
                          <TableCell className="text-right">{fmt(rule.bedrag || 0)}</TableCell>
                          <TableCell>{rule.frequentie}</TableCell>
                          <TableCell>{rule.verwachte_betaaldag || '—'}</TableCell>
                          <TableCell><Badge variant="secondary">{rule.bron}</Badge></TableCell>
                          <TableCell><Switch checked={!!rule.actief} onCheckedChange={() => toggleActief(rule)} disabled={!isAdmin} /></TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => startEdit(rule)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => deleteRule(rule)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gedetecteerde abonnementen</CardTitle>
              <p className="text-sm text-muted-foreground">Op basis van bankafschriften gedetecteerde terugkerende betalingen. Later automatisch gevuld vanuit bunq-koppeling.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {suggestions.map(sug => (
                  <div key={sug.id} className={`flex items-center justify-between p-4 rounded-lg border ${sug.accepted === true ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : sug.accepted === false ? 'bg-muted/50 border-muted opacity-50' : 'border-border'}`}>
                    <div>
                      <div className="font-medium text-foreground">{sug.tegenpartij}</div>
                      <div className="text-sm text-muted-foreground">{fmt(sug.bedrag)} · {sug.interval}</div>
                    </div>
                    {sug.accepted === null ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => acceptSuggestion(sug)}>
                          <CheckCircle className="mr-1 h-4 w-4" />Accepteren
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => ignoreSuggestion(sug.id)}>
                          <XCircle className="mr-1 h-4 w-4" />Negeren
                        </Button>
                      </div>
                    ) : (
                      <Badge className={sug.accepted ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}>
                        {sug.accepted ? 'Geaccepteerd' : 'Genegeerd'}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="betaald" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Betaalde recurring posten</CardTitle>
              <p className="text-sm text-muted-foreground">Facturen die via Exact Import als recurring zijn gemarkeerd en betaald.</p>
            </CardHeader>
            <CardContent>
              {betaaldeRecurring.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6 text-center">Geen betaalde recurring posten gevonden.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead>BV</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {betaaldeRecurring.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.omschrijving ?? '—'}</TableCell>
                        <TableCell>{bvs.find(b => b.id === item.bv_id)?.naam ?? '—'}</TableCell>
                        <TableCell>{item.week ?? '—'}</TableCell>
                        <TableCell className="text-right">{fmt(item.bedrag || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
