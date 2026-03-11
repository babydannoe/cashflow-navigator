import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BV {
  id: string;
  naam: string;
  kleur: string | null;
  drempel_bedrag: number | null;
  actief: boolean | null;
}

interface BVContextType {
  bvs: BV[];
  selectedBVId: string | null; // null = geconsolideerd
  setSelectedBVId: (id: string | null) => void;
  selectedBV: BV | null;
  loading: boolean;
}

const BVContext = createContext<BVContextType | undefined>(undefined);

export function BVProvider({ children }: { children: React.ReactNode }) {
  const [bvs, setBvs] = useState<BV[]>([]);
  const [selectedBVId, setSelectedBVId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBVs = async () => {
      const { data } = await supabase.from('bv').select('*').eq('actief', true);
      if (data) setBvs(data);
      setLoading(false);
    };
    fetchBVs();
  }, []);

  const selectedBV = selectedBVId ? bvs.find(b => b.id === selectedBVId) ?? null : null;

  return (
    <BVContext.Provider value={{ bvs, selectedBVId, setSelectedBVId, selectedBV, loading }}>
      {children}
    </BVContext.Provider>
  );
}

export function useBV() {
  const ctx = useContext(BVContext);
  if (!ctx) throw new Error('useBV must be used within BVProvider');
  return ctx;
}
