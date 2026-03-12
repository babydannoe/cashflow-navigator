import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useBV } from '@/contexts/BVContext';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { selectedBV } = useBV();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-4 border-b border-border px-4 bg-card">
            <SidebarTrigger />
            {selectedBV && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedBV.kleur ?? '#888' }} />
                <span>{selectedBV.naam}</span>
              </div>
            )}
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
