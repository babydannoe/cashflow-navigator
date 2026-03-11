import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBV } from '@/contexts/BVContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface BVCardData {
  id: string;
  naam: string;
  kleur: string;
  banksaldo: number;
  bufferTotaal: number;
  vrijeLiquiditeit: number;
  sparkline: { week: string; closing: number }[];
  hasNegativeClosing: boolean;
  hasNegativeLiquidity: boolean;
}

export default function BVOverzicht() {
  const { bvs } = useBV();
  const navigate = useNavigate();
  const [cards, setCards] = useState<BVCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bvs.length) return;
    const load = async () => {
      setLoading(true);
      const [bankRes, bufferRes, forecastRes] = await Promise.all([
        supabase.from('bank_accounts').select('bv_id, huidig_saldo'),
        supabase.from('buffers').select('bv_id, bedrag, actief').eq('actief', true),
        supabase.from('forecasts').select('bv_id, week, closing_balance').order('week', { ascending: true }),
      ]);

      const result: BVCardData[] = bvs.map(bv => {
        const saldo = (bankRes.data || [])
          .filter(b => b.bv_id === bv.id)
          .reduce((s, b) => s + (b.huidig_saldo || 0), 0);
        const buffers = (bufferRes.data || [])
          .filter(b => b.bv_id === bv.id)
          .reduce((s, b) => s + (b.bedrag || 0), 0);
        const forecasts = (forecastRes.data || [])
          .filter(f => f.bv_id === bv.id)
          .slice(0, 8)
          .map(f => ({ week: f.week || '', closing: f.closing_balance || 0 }));
        const hasNeg = forecasts.some(f => f.closing < 0);
        return {
          id: bv.id,
          naam: bv.naam,
          kleur: bv.kleur || '#6366f1',
          banksaldo: saldo,
          bufferTotaal: buffers,
          vrijeLiquiditeit: saldo - buffers,
          sparkline: forecasts,
          hasNegativeClosing: hasNeg,
          hasNegativeLiquidity: saldo - buffers < 0,
        };
      });
      setCards(result);
      setLoading(false);
    };
    load();
  }, [bvs]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const totaalSaldo = cards.reduce((s, c) => s + c.banksaldo, 0);
  const totaalVrij = cards.reduce((s, c) => s + c.vrijeLiquiditeit, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">BV Overzicht</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => (
          <Card key={card.id} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: card.kleur }} />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg" style={{ color: card.kleur }}>{card.naam}</CardTitle>
              <div className="flex gap-1">
                {card.hasNegativeClosing && (
                  <AlertTriangle className="h-5 w-5 text-destructive" title="Negatief eindsaldo in forecast" />
                )}
                {card.hasNegativeLiquidity && (
                  <AlertCircle className="h-5 w-5 text-orange-500" title="Negatieve vrije liquiditeit" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold text-foreground">{fmt(card.banksaldo)}</div>
              <div className="text-sm text-muted-foreground">
                Vrije liquiditeit: <span className={card.vrijeLiquiditeit < 0 ? 'text-destructive font-semibold' : 'text-foreground font-semibold'}>{fmt(card.vrijeLiquiditeit)}</span>
              </div>

              {card.sparkline.length > 0 && (
                <div className="h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={card.sparkline}>
                      <Line type="monotone" dataKey="closing" stroke={card.kleur} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  navigate('/forecast');
                }}
              >
                Details <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Consolidated card */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg text-primary">Geconsolideerd</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline gap-6">
            <div>
              <div className="text-sm text-muted-foreground">Totaal banksaldo</div>
              <div className="text-3xl font-bold text-foreground">{fmt(totaalSaldo)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Totale vrije liquiditeit</div>
              <div className={`text-2xl font-bold ${totaalVrij < 0 ? 'text-destructive' : 'text-foreground'}`}>{fmt(totaalVrij)}</div>
            </div>
          </div>

          {cards.some(c => c.sparkline.length > 0) && (
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={(() => {
                  const maxLen = Math.max(...cards.map(c => c.sparkline.length));
                  return Array.from({ length: maxLen }, (_, i) => {
                    const point: Record<string, number | string> = { week: cards[0]?.sparkline[i]?.week || `W${i}` };
                    cards.forEach(c => { point[c.naam] = c.sparkline[i]?.closing || 0; });
                    return point;
                  });
                })()}>
                  {cards.map(c => (
                    <Area key={c.id} type="monotone" dataKey={c.naam} stackId="1" stroke={c.kleur} fill={c.kleur} fillOpacity={0.3} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
