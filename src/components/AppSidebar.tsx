import {
  LayoutDashboard, TrendingUp, Building2, Target, FileCheck,
  CreditCard, RefreshCw, Shield, Calculator, Banknote, Settings, ChevronDown, Waves
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useBV } from '@/contexts/BVContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Forecast Explorer', url: '/forecast', icon: TrendingUp },
  { title: 'BV Overzicht', url: '/bv-overzicht', icon: Building2 },
  { title: 'MT Pipeline', url: '/mt-pipeline', icon: Target },
  { title: 'Facturen & Goedkeuringen', url: '/facturen', icon: FileCheck },
  { title: 'Betalingsronden', url: '/betalingsronden', icon: CreditCard },
  { title: 'Recurring Kosten', url: '/recurring', icon: RefreshCw },
  { title: 'Buffers & Liquiditeit', url: '/buffers', icon: Shield },
  { title: 'BTW & Belasting', url: '/btw', icon: Calculator },
  { title: 'Leningen & Dividend', url: '/leningen', icon: Banknote },
  { title: 'Instellingen', url: '/instellingen', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { bvs, selectedBVId, setSelectedBVId, selectedBV } = useBV();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <Waves className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-accent-foreground tracking-tight">
              CashFlow
            </span>
          )}
        </div>

        {!collapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-3 flex w-full items-center justify-between rounded-lg bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground hover:bg-sidebar-accent/80 transition-colors">
              <div className="flex items-center gap-2">
                {selectedBV && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedBV.kleur ?? '#888' }} />
                )}
                <span className="truncate">{selectedBV ? selectedBV.naam : 'Geconsolideerd'}</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => setSelectedBVId(null)}>
                <span className="font-medium">Geconsolideerd</span>
              </DropdownMenuItem>
              {bvs.map(bv => (
                <DropdownMenuItem key={bv.id} onClick={() => setSelectedBVId(bv.id)}>
                  <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: bv.kleur ?? '#888' }} />
                  {bv.naam}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="sidebar-nav-item text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
