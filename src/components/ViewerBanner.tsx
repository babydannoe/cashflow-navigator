import { useUserRole } from '@/hooks/useUserRole';
import { Info } from 'lucide-react';

export function ViewerBanner() {
  const { isViewer, isLoading } = useUserRole();

  if (isLoading || !isViewer) return null;

  return (
    <div className="bg-muted/50 border-b border-border px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground">
      <Info className="h-4 w-4 shrink-0" />
      <span>Je hebt alleen leestoegang — neem contact op met Daan voor wijzigingen.</span>
    </div>
  );
}
