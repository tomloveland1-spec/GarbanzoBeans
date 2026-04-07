/**
 * E2E: Auto-update prompt (Story 1.8)
 *
 * Runs against the Vite dev server (localhost:1420) without a live Tauri backend.
 * The Tauri mock injects a fake update response for `plugin:updater|check`,
 * letting us verify prompt appearance and dismiss/install buttons without
 * a real update manifest or signed binary.
 *
 * NOTE: Story 1.9 creates the real update pipeline. Until then, all update
 * checks in real dev builds fail silently (AC4). These tests use mock injection.
 */

import { test, expect, type Page } from '@playwright/test';

const completedSettings = {
  id: 1,
  budgetName: 'E2E Budget',
  startMonth: '2026-04',
  payFrequency: 'monthly',
  payDates: '"15"',
  savingsTargetPct: 10,
  dataFolderPath: '/tmp/e2e',
  onboardingComplete: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

async function injectTauriMock(
  page: Page,
  opts: { fakeUpdateVersion?: string | null } = {},
) {
  const { fakeUpdateVersion = null } = opts;

  await page.addInitScript(
    ({ settings, updateVersion }) => {
      (window as typeof window & { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'get_settings') return settings;
          if (cmd === 'get_read_only_state') return false;
          if (cmd === 'get_db_status') return { schema_version: 2, status: 'ok' };
          if (cmd === 'get_month_status') return 'open';
          if (cmd === 'plugin:updater|check') {
            if (updateVersion) {
              return {
                version: updateVersion,
                body: 'Test update',
                date: '2026-04-06',
                downloadAndInstall: async () => {},
              };
            }
            return null; // no update available
          }
          console.warn('[TAURI MOCK] Unknown command:', cmd);
          return undefined;
        },
        metadata: {
          currentWindow: { label: 'main' },
          windows: [{ label: 'main' }],
        },
        listen: async () => () => {},
        emit: async () => {},
        convertFileSrc: (src: string) => src,
      };
    },
    { settings: completedSettings, updateVersion: fakeUpdateVersion },
  );
}

test.describe('Auto-update prompt', () => {
  test('update prompt is NOT shown when no update is available', async ({ page }) => {
    await injectTauriMock(page, { fakeUpdateVersion: null });
    await page.goto('/');

    await expect(page.getByTestId('update-prompt')).not.toBeVisible();
  });

  test('update prompt IS shown when an update is available', async ({ page }) => {
    await injectTauriMock(page, { fakeUpdateVersion: '1.2.3' });
    await page.goto('/');

    const prompt = page.getByTestId('update-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('v1.2.3 available');
  });

  test('update prompt has "Update Now" and "Later" buttons', async ({ page }) => {
    await injectTauriMock(page, { fakeUpdateVersion: '1.2.3' });
    await page.goto('/');

    await expect(page.getByTestId('update-confirm-button')).toBeVisible();
    await expect(page.getByTestId('update-dismiss-button')).toBeVisible();
  });

  test('"Later" button hides the update prompt for the session', async ({ page }) => {
    await injectTauriMock(page, { fakeUpdateVersion: '1.2.3' });
    await page.goto('/');

    await expect(page.getByTestId('update-prompt')).toBeVisible();

    await page.getByTestId('update-dismiss-button').click();

    await expect(page.getByTestId('update-prompt')).not.toBeVisible();
  });

  test('update prompt is absent when no update is returned by check', async ({ page }) => {
    await injectTauriMock(page, { fakeUpdateVersion: null });
    await page.goto('/');

    // Give the async check time to settle
    await page.waitForTimeout(200);

    await expect(page.getByTestId('update-prompt')).not.toBeVisible();
  });

  test('"Update Now" button triggers install flow and shows error feedback in mock environment', async ({ page }) => {
    await injectTauriMock(page, { fakeUpdateVersion: '1.2.3' });
    await page.goto('/');

    await expect(page.getByTestId('update-prompt')).toBeVisible();
    await expect(page.getByTestId('update-confirm-button')).toBeVisible();

    await page.getByTestId('update-confirm-button').click();

    // In the mock environment the install will fail (plugin wraps IPC response in a class
    // with its own downloadAndInstall — plain object method from mock is not invoked).
    // After failure, installError is set and prompt shows inline error feedback.
    await expect(page.getByTestId('update-error')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('update-error')).toHaveText('Install failed — try again');

    // Prompt remains visible so user can retry or dismiss
    await expect(page.getByTestId('update-prompt')).toBeVisible();
  });
});
