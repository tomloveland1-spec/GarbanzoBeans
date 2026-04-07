/**
 * E2E: Settings screen (Story 1.6)
 *
 * Runs against the Vite dev server (localhost:1420) without a live Tauri backend.
 * A page init script stubs out window.__TAURI_INTERNALS__ so invoke() calls
 * resolve with controlled values, allowing us to drive the settings screen
 * without a compiled Tauri binary.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * Injects a Tauri mock with onboarding already complete.
 * upsert_settings merges the input into storedSettings so that
 * get_settings returns the updated values after a save.
 */
async function injectTauriMockWithSettings(
  page: Page,
  initialSettings: Record<string, unknown>,
) {
  await page.addInitScript((settings) => {
    let storedSettings: Record<string, unknown> = settings;

    (window as typeof window & { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'get_settings') {
          return storedSettings;
        }
        if (cmd === 'upsert_settings') {
          const input = (args as { input: Record<string, unknown> }).input;
          storedSettings = { ...storedSettings, ...input };
          return undefined;
        }
        if (cmd === 'get_db_status') {
          return { schema_version: 2, status: 'ok' };
        }
        if (cmd === 'get_month_status') {
          return 'open';
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
  }, initialSettings);
}

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

test.describe('Settings screen', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMockWithSettings(page, completedSettings);
  });

  test('navigates to /settings and shows pre-populated pay frequency', async ({ page }) => {
    await page.goto('/settings');

    // Pay frequency should be pre-populated as "monthly" from stored settings
    const monthlyRadio = page.getByTestId('pay-frequency-monthly');
    await expect(monthlyRadio).toBeChecked();
  });

  test('change savings target, save, verify "Settings saved." appears', async ({ page }) => {
    await page.goto('/settings');

    // Set a valid pay date so save button is not disabled
    const payDateInput = page.getByTestId('pay-date-1-input');
    await payDateInput.fill('20');

    // Change savings target
    const savingsInput = page.getByTestId('savings-target-input');
    await savingsInput.fill('25');

    // Click Save
    await page.getByTestId('save-settings-button').click();

    // Inline "Settings saved." should appear
    await expect(page.getByText('Settings saved.')).toBeVisible();
  });

  test('navigate away and return — new savings target is shown', async ({ page }) => {
    await page.goto('/settings');

    // Set a valid pay date
    await page.getByTestId('pay-date-1-input').fill('20');

    // Change savings target to 30 and save
    const savingsInput = page.getByTestId('savings-target-input');
    await savingsInput.fill('30');
    await page.getByTestId('save-settings-button').click();
    await expect(page.getByText('Settings saved.')).toBeVisible();

    // Navigate away (to budget screen)
    await page.goto('/');

    // Return to settings
    await page.goto('/settings');

    // New value (30) should be shown, not the pre-save value (10)
    await expect(page.getByTestId('savings-target-input')).toHaveValue('30');
  });
});
