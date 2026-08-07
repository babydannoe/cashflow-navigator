import { useEffect, useState } from 'react';
import { FileText, Loader2, Download, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  invoiceId: string;
  label?: string;
  className?: string;
}

/** Knop die de factuur-PDF uit Exact Online ophaalt en in een venster toont. */
export function InvoicePdfButton({ invoiceId, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('factuur.pdf');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const load = async () => {
    setOpen(true);
    if (url || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('exact-invoice-pdf', {
        body: { invoice_id: invoiceId },
      });
      if (fnError) throw fnError;
      if (!data?.data) throw new Error(data?.error || 'Geen document gevonden');

      const binary = atob(data.data as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.contentType || 'application/pdf' });
      setUrl(URL.createObjectURL(blob));
      setFileName(data.fileName || 'factuur.pdf');
    } catch (e: any) {
      const msg = e?.context?.error || e?.message || 'Document kon niet worden opgehaald';
      setError(typeof msg === 'string' ? msg : 'Document kon niet worden opgehaald');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Factuur bekijken"
        className={cn('h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground', className)}
        onClick={(e) => {
          e.stopPropagation();
          load();
        }}
      >
        <FileText className="h-3.5 w-3.5" />
        {label && <span className="ml-1 text-xs">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle className="text-base truncate">{fileName}</DialogTitle>
            {url && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Nieuw tabblad
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    toast.success('Download gestart');
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Download
                </Button>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
            {loading && (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Document ophalen uit Exact Online...
              </div>
            )}
            {!loading && error && (
              <p className="text-sm text-muted-foreground max-w-sm text-center px-6">{error}</p>
            )}
            {!loading && !error && url && (
              <iframe src={url} title="Factuur" className="w-full h-full" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
