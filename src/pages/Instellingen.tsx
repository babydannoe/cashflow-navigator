import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Link2, Unlink, Loader2, CheckCircle2, ExternalLink, Settings2 } from 'lucide-react';

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

export default function Instellingen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { bvs } = useBV();
  const queryClient = useQueryClient();
  const [syncingBvId, setSyncingBvId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

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
        toast.success(`${(data.synced_ar ?? 0) + (data.synced_ap ?? 0)} facturen gesynchroniseerd`);
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
          toast.success(`${bv.naam}: ${(data.synced_ar ?? 0) + (data.synced_ap ?? 0)} facturen gesynchroniseerd`);
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
        </TabsList>

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
                {hasAnyCoupled && (
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
                              Division: {token.division ?? '—'} · Laatste sync: {fmt(token.updated_at)}
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
                        ) : (
                          <>
                            <Badge variant="secondary" className="text-xs">Niet gekoppeld</Badge>
                            <Button size="sm" onClick={() => handleKoppelen(bv.id)}>
                              <Link2 className="h-3.5 w-3.5 mr-1.5" />
                              Koppelen
                            </Button>
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
                // Collect all available divisions from any token
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
                          // Force BV context refresh
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
      </Tabs>
    </div>
  );
}
