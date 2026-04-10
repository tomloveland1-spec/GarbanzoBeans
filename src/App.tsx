import React, { useEffect } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { Button } from '@/components/ui/button';
import { AppSidebar } from '@/components/AppSidebar';

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
      <div
        className="flex h-screen w-full"
        style={{ backgroundColor: 'var(--color-bg-app)' }}
      >
        <div className="flex-1 h-full w-full">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-full overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-app)' }}
    >
    <SidebarProvider style={{ height: '100%' } as React.CSSProperties}>
      <AppSidebar />

      {/* Main content area */}
      <main
        data-testid="main-content"
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={{ backgroundColor: 'var(--color-bg-app)' }}
      >
        {/* Top toolbar — sidebar toggle lives here, consistent with Linear/Notion pattern */}
        <div className="shrink-0 flex items-center h-10 px-3 border-b border-[var(--color-border)]">
          <SidebarTrigger />
        </div>

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
    </SidebarProvider>
    </div>
  );
}

export default App;
