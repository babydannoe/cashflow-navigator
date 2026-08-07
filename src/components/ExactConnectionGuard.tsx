import { useEffect, useState } from 'react';
import { useExactConnection } from '@/hooks/useExactConnection';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Link2, Loader2 } from 'lucide-react';

/**
 * Probeert bij het openen van de app automatisch de Exact Online koppeling
 * actief te houden. Lukt dat niet, dan verschijnt een pop-up om in te loggen.
 */
export function ExactConnectionGuard() {
  const { status, openLoginPopup } = useExactConnection();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'needs-auth') setOpen(true);
    if (status === 'connected') {
      setOpen(false);
      setBusy(false);
    }
  }, [status]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exact Online opnieuw verbinden</DialogTitle>
          <DialogDescription>
            De koppeling met Exact Online is verlopen. Log opnieuw in om de verbinding
            te herstellen — dit werkt voor alle BV's tegelijk.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Later
          </Button>
          <Button
            onClick={() => {
              setBusy(true);
              openLoginPopup();
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Inloggen bij Exact Online
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
