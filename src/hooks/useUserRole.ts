import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    const fetchRole = async () => {
      // Try to get existing profile
      const { data, error } = await supabase
        .from('user_profiles' as any)
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setRole((data as any).role);
      } else {
        // Auto-create profile for first login (viewer by default)
        const { data: newProfile } = await supabase
          .from('user_profiles' as any)
          .insert({ id: user.id, role: 'viewer', full_name: user.email?.split('@')[0] || '' } as any)
          .select('role')
          .single();

        setRole(newProfile ? (newProfile as any).role : 'viewer');
      }
      setIsLoading(false);
    };

    fetchRole();
  }, [user, authLoading]);

  return {
    role,
    isAdmin: role === 'admin',
    isViewer: role === 'viewer',
    isLoading: isLoading || authLoading,
  };
}
