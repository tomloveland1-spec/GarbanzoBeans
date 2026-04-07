import { useEffect } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { Button } from '@/components/ui/button';

// Nav items for the sidebar. Routes will expand as stories are implemented.
const NAV_ITEMS = [
  { label: 'Budget', to: '/' as const, exact: true },
  { label: 'Ledger', to: '/ledger' as const },
  { label: 'Rules', to: '/merchant-rules' as const },
  { label: 'Settings', to: '/settings' as const },
] as const;

function App() {
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);
  const isOnboarding = useRouterState({ select: (s) => s.location.pathname === '/onboarding' });
  const { pendingUpdate, isDismissed, isInstalling, installError, dismissUpdate, applyUpdate } = useUpdateStore();

  // Check for updates once on non-onboarding mount
  useEffect(() => {
    if (!isOnboarding) {
      useUpdateStore.getState().checkForUpdate();
    }
  }, [isOnboarding]);

  if (isOnboarding) {
    return (
      <TooltipProvider delayDuration={300}>
        <div
          className="flex h-screen w-full"
          style={{ backgroundColor: 'var(--color-bg-app)' }}
        >
          <Outlet />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex h-screen w-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-app)' }}
      >
        {/* Sidebar — Forest Deep */}
        <aside
          data-testid="sidebar"
          className="w-[220px] shrink-0 flex flex-col py-6 px-4 gap-2"
          style={{ backgroundColor: 'var(--color-bg-sidebar)' }}
        >
          {/* Logo / App name */}
          <div className="mb-6 px-2">
            <span
              className="type-h1 font-bold tracking-tight"
              style={{ color: 'var(--color-sidebar-active)' }}
            >
              GarbanzoBeans
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={'exact' in item && item.exact ? { exact: true } : undefined}
                className="sidebar-interactive text-left px-3 py-2 rounded-md type-body transition-colors"
                style={{ color: 'var(--color-sidebar-text)' }}
                activeProps={{
                  style: {
                    color: 'var(--color-sidebar-active)',
                    backgroundColor: 'rgba(192, 245, 0, 0.08)',
                  },
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content area */}
        <main
          data-testid="main-content"
          className="flex-1 flex flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--color-bg-app)' }}
        >
          {/* Read-only banner — shown when sentinel lock detected (Story 1.7 wires detection) */}
          {isReadOnly && (
            <div
              data-testid="read-only-banner"
              className="shrink-0 px-4 py-2 type-label text-center"
              style={{
                backgroundColor: 'var(--color-amber)',
                color: 'var(--color-bg-app)',
              }}
            >
              Read-Only — another instance is open
            </div>
          )}

          {/* Update prompt — shown when update is available and not dismissed */}
          {pendingUpdate && !isDismissed && (
            <div
              data-testid="update-prompt"
              className="shrink-0 flex items-center justify-between px-4 py-2"
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span
                className="type-label"
                style={{ color: installError ? 'var(--color-amber)' : 'var(--color-text-primary)' }}
                data-testid={installError ? 'update-error' : undefined}
              >
                {installError ?? `v${pendingUpdate.version} available`}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={applyUpdate}
                  disabled={isInstalling}
                  data-testid="update-confirm-button"
                >
                  {isInstalling ? 'Installing…' : 'Update Now'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={dismissUpdate}
                  disabled={isInstalling}
                  data-testid="update-dismiss-button"
                >
                  Later
                </Button>
              </div>
            </div>
          )}

          {/* Routed content */}
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
