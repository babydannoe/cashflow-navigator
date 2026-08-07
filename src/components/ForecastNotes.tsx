import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { StickyNote, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

const NOTE_ID = 'forecast';

export function ForecastNotes() {
  const { isAdmin } = useUserRole();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('forecast_notes')
        .select('content')
        .eq('id', NOTE_ID)
        .maybeSingle();
      setValue(data?.content ?? '');
      setLoading(false);
    })();
  }, []);

  const save = async (text: string) => {
    setSaving(true);
    const { error } = await supabase
      .from('forecast_notes')
      .upsert({ id: NOTE_ID, content: text, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      toast.error('Opslaan mislukt');
      return;
    }
    setSavedAt(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
  };

  const onChange = (text: string) => {
    setValue(text);
    if (!isAdmin) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 800);
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          Opmerkingen
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {!saving && savedAt && (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Opgeslagen {savedAt}
            </span>
          )}
          {isAdmin && value.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                setValue('');
                if (timer.current) clearTimeout(timer.current);
                save('');
              }}
            >
              Wissen
            </Button>
          )}
        </div>
      </div>
      <Textarea
        value={loading ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!isAdmin}
        placeholder={isAdmin ? 'Bijv. "dit nog in te plannen" of algemene opmerkingen…' : 'Geen opmerkingen'}
        className="min-h-[80px] text-sm resize-y"
      />
    </div>
  );
}
