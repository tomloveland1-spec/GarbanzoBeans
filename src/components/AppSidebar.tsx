import { Wallet, BookOpen, SlidersHorizontal, Settings2, ArrowRight } from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useMonthStore } from '@/stores/useMonthStore'

const NAV_ITEMS = [
  { label: 'Budget',   to: '/' as const,               icon: Wallet,           exact: true },
  { label: 'Ledger',   to: '/ledger' as const,          icon: BookOpen },
  { label: 'Rules',    to: '/merchant-rules' as const,  icon: SlidersHorizontal },
  { label: 'Settings', to: '/settings' as const,        icon: Settings2 },
] as const

export function AppSidebar() {
  const monthStatus = useMonthStore((s) => s.monthStatus)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isOnTTMRoute = pathname === '/turn-the-month'

  return (
    <Sidebar collapsible="icon" data-testid="sidebar">
      <SidebarHeader>
        <div className="px-2 py-4 overflow-hidden">
          <span
            className="type-h1 font-bold tracking-tight truncate group-data-[state=collapsed]:hidden block"
            style={{ color: 'var(--color-text-primary)' }}
          >
            GarbanzoBeans
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const isActive = 'exact' in item && item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + '/')
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {monthStatus.startsWith('closing:') && !isOnTTMRoute && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Continue Turn the Month">
                <Link to="/turn-the-month" style={{ color: 'var(--color-sidebar-active)' }}>
                  <ArrowRight />
                  <span>Continue</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}

      <SidebarRail />
    </Sidebar>
  )
}
