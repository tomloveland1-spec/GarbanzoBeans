/**
 * E2E: Sentinel lock / read-only mode (Story 1.7)
 *
 * Runs against the Vite dev server (localhost:1420) without a live Tauri backend.
 * The Tauri mock controls what `get_read_only_state` returns, letting us verify
 * the read-only banner and SettingsPage save-button blocking without a binary.
 *
 * For real two-instance sentinel detection (writing/deleting the lock file),
 * see e2e-integration/sentinel-lock.test.ts which uses WebdriverIO + tauri-driver.
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

async function injectTauriMock(page: Page, isReadOnly: boolean) {
  await page.addInitScript(
    ({ settings, readOnly }) => {
      (window as typeof window & { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'get_settings') return settings;
          if (cmd === 'get_read_only_state') return readOnly;
          if (cmd === 'get_db_status') return { schema_version: 2, status: 'ok' };
          if (cmd === 'get_month_status') return 'open';
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
    { settings: completedSettings, readOnly: isReadOnly },
  );
}

test.describe('Sentinel lock — read-only mode', () => {
  test('read-only banner is NOT shown when no other instance is open', async ({ page }) => {
    await injectTauriMock(page, false);
    await page.goto('/');

    await expect(page.getByTestId('read-only-banner')).not.toBeVisible();
  });

  test('read-only banner IS shown when another instance holds the lock', async ({ page }) => {
    await injectTauriMock(page, true);
    await page.goto('/');

    const banner = page.getByTestId('read-only-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Read-Only — another instance is open');
  });

  test('read-only banner persists on /settings route', async ({ page }) => {
    await injectTauriMock(page, true);
    await page.goto('/settings');

    await expect(page.getByTestId('read-only-banner')).toBeVisible();
  });

  test('Save button is disabled on /settings when in read-only mode', async ({ page }) => {
    await injectTauriMock(page, true);
    await page.goto('/settings');

    // Set a valid pay date so the only reason Save is disabled is isReadOnly
    const payDateInput = page.getByTestId('pay-date-1-input');
    await payDateInput.fill('15');

    const saveButton = page.getByTestId('save-settings-button');
    await expect(saveButton).toBeDisabled();
  });

  test('inline read-only message shown on /settings when in read-only mode', async ({ page }) => {
    await injectTauriMock(page, true);
    await page.goto('/settings');

    await expect(
      page.getByText(/read-only: another instance is open/i),
    ).toBeVisible();
  });

  test('Save button is enabled on /settings when NOT in read-only mode', async ({ page }) => {
    await injectTauriMock(page, false);
    await page.goto('/settings');

    // Set a valid pay date so isSaveDisabled is false
    const payDateInput = page.getByTestId('pay-date-1-input');
    await payDateInput.fill('15');

    const saveButton = page.getByTestId('save-settings-button');
    await expect(saveButton).toBeEnabled();
  });
});
