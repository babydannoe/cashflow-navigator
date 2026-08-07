import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Elke 4 minuten controleren (Exact access tokens leven 10 minuten)
const CHECK_INTERVAL_MS = 4 * 60 * 1000;

export type ExactStatus = 'checking' | 'connected' | 'needs-auth' | 'no-link';

export function useExactConnection() {
  const [status, setStatus] = useState<ExactStatus>('checking');
  const [firstBvId, setFirstBvId] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/exact-auth/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('connected');
      } else if (data.needsAuth) {
        // Is er überhaupt een koppeling? Zo niet: niets forceren.
        const { data: rows } = await supabase.from('exact_tokens').select('bv_id').limit(1);
        setStatus(rows && rows.length > 0 ? 'needs-auth' : 'no-link');
      } else {
        setStatus('needs-auth');
      }
    } catch {
      setStatus('needs-auth');
    }
  }, []);

  // Welke BV gebruiken we om opnieuw te autoriseren?
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('exact_tokens').select('bv_id').limit(1);
      if (data && data.length > 0) setFirstBvId(data[0].bv_id as string);
    })();
  }, []);

  // Bij openen van de app + periodiek automatisch verbinden
  useEffect(() => {
    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  // Pop-up meldt succes terug
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'exact-connected') {
        popupRef.current?.close();
        setStatus('connected');
        setTimeout(check, 500);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [check]);

  const openLoginPopup = useCallback(
    (bvId?: string) => {
      const target = bvId ?? firstBvId;
      if (!target) return;
      const url = `${SUPABASE_URL}/functions/v1/exact-auth/authorize?bv_id=${target}&apikey=${SUPABASE_KEY}`;
      const w = window.open(url, 'exact-login', 'width=520,height=720,menubar=no,toolbar=no');
      popupRef.current = w;
      // Fallback als pop-ups geblokkeerd zijn
      if (!w) window.location.href = url;
    },
    [firstBvId]
  );

  return { status, check, openLoginPopup, firstBvId };
}
