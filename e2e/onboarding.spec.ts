/**
 * E2E: Onboarding flow (Story 1.5)
 *
 * These tests run against the Vite dev server (localhost:1420) without a live
 * Tauri backend. A page init script stubs out window.__TAURI_INTERNALS__ so
 * that all invoke() calls (get_settings, upsert_settings, init_data_folder,
 * plugin:dialog|open) resolve with controlled values instead of crashing.
 *
 * This lets us drive the full React wizard without a compiled Tauri binary.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * Injects a minimal __TAURI_INTERNALS__ mock before the React app boots.
 * The mock:
 *   - Returns null from get_settings on first call (simulate first launch)
 *   - Returns the upserted value from get_settings after upsert_settings runs
 *   - Returns '/tmp/e2e-test-folder' from the dialog open command
 *   - Silently swallows init_data_folder
 */
async function injectTauriMock(page: Page) {
  await page.addInitScript(() => {
    // Persist storedSettings across reloads within the same test via sessionStorage.
    // This allows the AC6 "subsequent launch" test to verify that completed onboarding
    // is not shown again after a page reload.
    const STORAGE_KEY = '__tauri_mock_settings__';
    const persisted = sessionStorage.getItem(STORAGE_KEY);
    let storedSettings: Record<string, unknown> | null = persisted
      ? (JSON.parse(persisted) as Record<string, unknown>)
      : null;

    (window as typeof window & { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'get_settings') {
          return storedSettings;
        }
        if (cmd === 'upsert_settings') {
          const input = (args as { input: Record<string, unknown> }).input;
          storedSettings = {
            id: 1,
            budgetName: input['budgetName'] ?? null,
            startMonth: input['startMonth'] ?? null,
            payFrequency: input['payFrequency'] ?? null,
            payDates: input['payDates'] ?? null,
            savingsTargetPct: input['savingsTargetPct'] ?? 10,
            dataFolderPath: input['dataFolderPath'] ?? null,
            onboardingComplete: input['onboardingComplete'] ?? false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          };
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedSettings));
          return undefined;
        }
        if (cmd === 'init_data_folder') {
          return undefined;
        }
        // tauri-plugin-dialog's open() calls invoke with this command
        if (cmd === 'plugin:dialog|open') {
          return '/tmp/e2e-test-folder';
        }
        if (cmd === 'get_db_status') {
          return { schema_version: 2, status: 'ok' };
        }
        console.warn('[TAURI MOCK] Unknown command:', cmd);
        return undefined;
      },
      // Minimal metadata required by @tauri-apps/api/core
      metadata: {
        currentWindow: { label: 'main' },
        windows: [{ label: 'main' }],
      },
      listen: async () => () => {},
      emit: async () => {},
      convertFileSrc: (src: string) => src,
    };
  });
}

test.describe('Onboarding — first launch setup', () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page);
  });

  test('completes 4-step onboarding and redirects to budget screen', async ({ page }) => {
    // ── Navigate ──────────────────────────────────────────────────────────────
    // With no settings (get_settings returns null), visiting "/" redirects to "/onboarding".
    await page.goto('/');
    await expect(page).toHaveURL('/onboarding');

    // ── Welcome screen ────────────────────────────────────────────────────────
    await expect(page.getByTestId('welcome-description')).toBeVisible();
    await expect(page.getByTestId('get-started-button')).toBeVisible();

    // Click Get Started
    await page.getByTestId('get-started-button').click();

    // ── Step 1: Budget name + start month ─────────────────────────────────────
    await expect(page.getByText('Step 1 of 4')).toBeVisible();

    await page.getByTestId('budget-name-input').fill('My E2E Budget');

    // Radix UI Select: click the trigger to open the dropdown, then pick an item
    await page.getByTestId('start-month-select').click();
    // The most recent month should be the first item in the list
    await page.getByRole('option').first().click();

    // Click Next
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 2: Data folder ───────────────────────────────────────────────────
    await expect(page.getByText('Step 2 of 4')).toBeVisible();

    // Browse clicks the mocked dialog which returns /tmp/e2e-test-folder
    await page.getByTestId('browse-button').click();

    // The selected path should appear
    await expect(page.getByTestId('selected-folder-path')).toContainText('/tmp/e2e-test-folder');

    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 3: Pay frequency ─────────────────────────────────────────────────
    await expect(page.getByText('Step 3 of 4')).toBeVisible();

    // Default is monthly — select monthly and enter a pay date
    await page.getByTestId('pay-frequency-monthly').check();
    await page.getByTestId('pay-date-1-input').fill('15');

    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 4: Savings target ────────────────────────────────────────────────
    await expect(page.getByText('Step 4 of 4')).toBeVisible();

    // Default is 10 — accept it
    await expect(page.getByTestId('savings-target-input')).toHaveValue('10');

    // Click Confirm
    await page.getByRole('button', { name: 'Confirm' }).click();

    // ── Assert: redirected to budget screen ───────────────────────────────────
    await expect(page).toHaveURL('/');

    // Sidebar should be visible (no longer on onboarding full-screen)
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // ── AC6: subsequent launch does not show onboarding again ─────────────────
    // Reload simulates a fresh app launch. The mock persists completed settings
    // via sessionStorage so get_settings returns the completed state on reload.
    await page.reload();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('navigating to /onboarding after completion redirects to /', async ({ page }) => {
    // Pre-populate settings as completed so onboarding is done
    await page.addInitScript(() => {
      const completedSettings = {
        id: 1,
        budgetName: 'Done Budget',
        startMonth: '2026-04',
        payFrequency: 'monthly',
        payDates: '"15"',
        savingsTargetPct: 10,
        dataFolderPath: '/tmp/done',
        onboardingComplete: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      (window as typeof window & { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'get_settings') return completedSettings;
          return undefined;
        },
        metadata: { currentWindow: { label: 'main' }, windows: [{ label: 'main' }] },
        listen: async () => () => {},
        emit: async () => {},
        convertFileSrc: (src: string) => src,
      };
    });

    await page.goto('/onboarding');

    // Reverse guard: should redirect to / since onboarding is complete
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('Back button is non-destructive — returns to step 1 with data preserved', async ({ page }) => {
    await page.goto('/onboarding');

    // Get past the welcome screen
    await page.getByTestId('get-started-button').click();

    // Fill step 1
    await page.getByTestId('budget-name-input').fill('My Budget');
    await page.getByTestId('start-month-select').click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2 — go back
    await expect(page.getByText('Step 2 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();

    // Step 1 data should be preserved
    await expect(page.getByTestId('budget-name-input')).toHaveValue('My Budget');
  });
});
