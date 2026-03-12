import {
  LayoutDashboard, TrendingUp, Building2, Target, FileCheck,
  CreditCard, RefreshCw, Shield, Calculator, Banknote, Settings, ChevronDown, Sun, Moon
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useBV } from '@/contexts/BVContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import mrboostLogo from '@/assets/mrboost-logo.svg';

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
  const { theme, toggleTheme } = useTheme();

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {collapsed ? (
              <img
                src={mrboostLogo}
                alt="Mr. Boost"
                className={`h-8 w-8 object-contain ${theme === 'light' ? 'invert' : ''}`}
              />
            ) : (
              <img
                src={mrboostLogo}
                alt="Mr. Boost"
                className={`h-8 object-contain ${theme === 'light' ? 'invert' : ''}`}
              />
            )}
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-sidebar-foreground hover:text-foreground hover:bg-surface-raised transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {!collapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-3 flex w-full items-center justify-between rounded-lg bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground hover:bg-surface-raised transition-colors focus:ring-2 focus:ring-primary focus:outline-none">
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
              {navItems.map(item => {
                const isActive = item.url === '/' ? location.pathname === '/' : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        className={`sidebar-nav-item text-sidebar-foreground hover:text-foreground hover:bg-surface-raised ${
                          isActive ? 'bg-surface-raised text-foreground border-l-2 border-primary' : ''
                        }`}
                        activeClassName="bg-surface-raised text-foreground font-semibold border-l-2 border-primary"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
