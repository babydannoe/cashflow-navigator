import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Link2, Unlink, Loader2, CheckCircle2, ExternalLink, Settings2, Users, UserPlus, Trash2, Shield, Eye } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ExactDivision {
  Code: number;
  Description: string;
  CustomerName: string;
}

interface ExactToken {
  id: string;
  bv_id: string;
  division: number | null;
  expires_at: string;
  updated_at: string;
  available_divisions: ExactDivision[] | null;
}

interface UserProfile {
  id: string;
  role: string;
  full_name: string | null;
  created_at: string | null;
  email?: string;
}

export default function Instellingen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { bvs } = useBV();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [syncingBvId, setSyncingBvId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Handle callback success
  useEffect(() => {
    if (searchParams.get('exact') === 'success') {
      toast.success('Exact Online succesvol gekoppeld!');
      searchParams.delete('exact');
      setSearchParams(searchParams, { replace: true });
      queryClient.invalidateQueries({ queryKey: ['exact-tokens'] });
    }
  }, [searchParams, setSearchParams, queryClient]);

  // Fetch exact_tokens
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['exact-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exact_tokens')
        .select('id, bv_id, division, expires_at, updated_at, available_divisions');
      if (error) throw error;
      return (data ?? []) as unknown as ExactToken[];
    },
  });

  // Fetch users (admin only)
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as UserProfile[];
    },
    enabled: isAdmin,
  });

  const tokensByBv = Object.fromEntries(tokens.map(t => [t.bv_id, t]));
  const hasAnyCoupled = tokens.length > 0;

  const handleKoppelen = (bvId: string) => {
    window.location.href = `${SUPABASE_URL}/functions/v1/exact-auth/authorize?bv_id=${bvId}&apikey=${SUPABASE_KEY}`;
  };

  const handleSync = async (bvId: string) => {
    setSyncingBvId(bvId);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/exact-sync-invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ bv_id: bvId }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        const bvNaam = bvs.find(b => b.id === bvId)?.naam ?? bvId;
        const divUsed = data.division_used ?? '?';
        toast.success(`Synced ${bvNaam} met divisie ${divUsed} ✓ (${(data.synced_ar ?? 0) + (data.synced_ap ?? 0)} facturen)`);
        queryClient.invalidateQueries({ queryKey: ['exact-tokens'] });
      }
    } catch (err) {
      toast.error('Sync mislukt: ' + String(err));
    } finally {
      setSyncingBvId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    const coupled = bvs.filter(bv => tokensByBv[bv.id]);
    for (const bv of coupled) {
      setSyncingBvId(bv.id);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/exact-sync-invoices`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ bv_id: bv.id }),
        });
        const data = await res.json();
        if (data.error) {
          toast.error(`${bv.naam}: ${data.error}`);
        } else {
          const divUsed = data.division_used ?? '?';
          toast.success(`Synced ${bv.naam} met divisie ${divUsed} ✓ (${(data.synced_ar ?? 0) + (data.synced_ap ?? 0)} facturen)`);
        }
      } catch (err) {
        toast.error(`${bv.naam}: Sync mislukt`);
      }
    }
    setSyncingBvId(null);
    setSyncingAll(false);
    queryClient.invalidateQueries({ queryKey: ['exact-tokens'] });
  };

  const handleOntkoppelen = async (bvId: string) => {
    const { error } = await supabase.from('exact_tokens').delete().eq('bv_id', bvId);
    if (error) {
      toast.error('Ontkoppelen mislukt: ' + error.message);
    } else {
      toast.success('Exact Online koppeling verwijderd');
      queryClient.invalidateQueries({ queryKey: ['exact-tokens'] });
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) { toast.error('Vul een e-mailadres in'); return; }
    setInviteLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Uitnodiging verstuurd naar ${inviteEmail}`);
        setInviteOpen(false);
        setInviteEmail('');
        setInviteRole('viewer');
        queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      }
    } catch (err) {
      toast.error('Uitnodigen mislukt: ' + String(err));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user/update-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Rol bijgewerkt');
        queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      }
    } catch (err) {
      toast.error('Rol wijzigen mislukt');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Gebruiker verwijderd');
        queryClient.invalidateQueries({ queryKey: ['user-profiles'] });
      }
    } catch (err) {
      toast.error('Verwijderen mislukt');
    }
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('nl-NL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return '—'; }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Instellingen</h1>

      <Tabs defaultValue="integraties">
        <TabsList>
          <TabsTrigger value="integraties">Integraties</TabsTrigger>
          <TabsTrigger value="bv-config">BV Configuratie</TabsTrigger>
          {isAdmin && <TabsTrigger value="gebruikers">Gebruikers</TabsTrigger>}
        </TabsList>

        {/* ── Tab: Integraties ── */}
        <TabsContent value="integraties" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="h-5 w-5 text-primary" />
                    Exact Online
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Synchroniseer facturen en BTW-data automatisch vanuit je Exact-administratie
                  </CardDescription>
                </div>
                {hasAnyCoupled && isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncAll}
                    disabled={syncingAll}
                  >
                    {syncingAll ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    Sync alle BVs
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Koppelingen laden...
                </div>
              ) : (
                bvs.map(bv => {
                  const token = tokensByBv[bv.id];
                  const isSyncing = syncingBvId === bv.id;

                  return (
                    <div
                      key={bv.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: bv.kleur || 'hsl(var(--muted-foreground))' }}
                        />
                        <div>
                          <p className="font-medium text-sm">{bv.naam}</p>
                          {token ? (
                            <p className="text-xs text-muted-foreground">
                               Division: {bv.exact_division_code ?? token.division ?? '—'} · Laatste sync: {fmt(token.updated_at)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {token ? (
                          <>
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Gekoppeld
                            </Badge>
                            {isAdmin && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSync(bv.id)}
                                  disabled={isSyncing}
                                >
                                  {isSyncing ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1.5">Sync nu</span>
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                      <Unlink className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Koppeling verwijderen?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Weet je zeker dat je de Exact Online koppeling voor {bv.naam} wilt verwijderen?
                                        Eerder gesynchroniseerde facturen blijven bewaard.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleOntkoppelen(bv.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Ontkoppelen
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <Badge variant="secondary" className="text-xs">Niet gekoppeld</Badge>
                            {isAdmin && (
                              <Button size="sm" onClick={() => handleKoppelen(bv.id)}>
                                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                                Koppelen
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: BV Configuratie ── */}
        <TabsContent value="bv-config" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Exact divisie per BV
              </CardTitle>
              <CardDescription>
                Selecteer welke Exact Online divisie bij elke BV hoort. Laat leeg als de BV geen eigen Exact-administratie heeft.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bvs.map(bv => {
                const allDivisions: ExactDivision[] = [];
                const seen = new Set<number>();
                tokens.forEach(t => {
                  (t.available_divisions ?? []).forEach(d => {
                    if (!seen.has(d.Code)) {
                      seen.add(d.Code);
                      allDivisions.push(d);
                    }
                  });
                });

                const currentValue = (bv as any).exact_division_code;

                return (
                  <div
                    key={bv.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: bv.kleur || 'hsl(var(--muted-foreground))' }}
                      />
                      <p className="font-medium text-sm">{bv.naam}</p>
                    </div>
                    <Select
                      value={currentValue ? String(currentValue) : "none"}
                      disabled={!isAdmin}
                      onValueChange={async (val) => {
                        const divCode = val === "none" ? null : parseInt(val);
                        const { error } = await supabase
                          .from('bv')
                          .update({ exact_division_code: divCode } as any)
                          .eq('id', bv.id);
                        if (error) {
                          toast.error('Opslaan mislukt: ' + error.message);
                        } else {
                          toast.success(`Divisie ${divCode ? divCode : '(geen)'} opgeslagen voor ${bv.naam}`);
                          queryClient.invalidateQueries({ queryKey: ['exact-tokens'] });
                          window.dispatchEvent(new Event('bv-division-updated'));
                        }
                      }}
                    >
                      <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Geen divisie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Geen divisie</SelectItem>
                        {allDivisions.map(d => (
                          <SelectItem key={d.Code} value={String(d.Code)}>
                            {d.Code} — {d.Description || d.CustomerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
              {tokens.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  Koppel eerst minstens één BV met Exact Online om divisies te kunnen toewijzen.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Gebruikers ── */}
        {isAdmin && (
          <TabsContent value="gebruikers" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Gebruikersbeheer
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Beheer gebruikers en hun toegangsrechten
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    Gebruiker uitnodigen
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gebruikers laden...
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Aangemaakt</TableHead>
                        <TableHead>Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(u => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{u.full_name || 'Onbekend'}</p>
                              <p className="text-xs text-muted-foreground">{u.id === user?.id ? '(jij)' : ''}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                              {u.role === 'admin' ? (
                                <><Shield className="h-3 w-3 mr-1" /> Admin</>
                              ) : (
                                <><Eye className="h-3 w-3 mr-1" /> Kijker</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.created_at ? fmt(u.created_at) : '—'}
                          </TableCell>
                          <TableCell>
                            {u.id !== user?.id && (
                              <div className="flex items-center gap-2">
                                <Select
                                  value={u.role}
                                  onValueChange={(val) => handleUpdateRole(u.id, val)}
                                >
                                  <SelectTrigger className="h-8 w-28 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="viewer">Kijker</SelectItem>
                                  </SelectContent>
                                </Select>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Gebruiker verwijderen?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Weet je zeker dat je deze gebruiker wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteUser(u.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Verwijderen
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Invite Modal */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Gebruiker uitnodigen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>E-mailadres</Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="naam@bedrijf.nl"
                    />
                  </div>
                  <div>
                    <Label>Rol</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin — volledige toegang</SelectItem>
                        <SelectItem value="viewer">Kijker — alleen leestoegang</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setInviteOpen(false)}>Annuleren</Button>
                  <Button onClick={handleInvite} disabled={inviteLoading}>
                    {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
                    Uitnodigen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
