import { test, expect } from '@playwright/test';

test.describe('Design System — Dark Forest Shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('two-panel layout is present', async ({ page }) => {
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('main-content')).toBeVisible();
  });

  test('sidebar has correct width (~220px)', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    const box = await sidebar.boundingBox();
    expect(box, 'sidebar element not found in DOM').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(215);
    expect(box!.width).toBeLessThanOrEqual(225);
  });

  test('sidebar background is Forest Deep', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    const bg = await sidebar.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    // #0F2218 → rgb(15, 34, 24)
    expect(bg).toBe('rgb(15, 34, 24)');
  });

  test('app background is Neutral Black', async ({ page }) => {
    const main = page.getByTestId('main-content');
    const bg = await main.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    // #111214 → rgb(17, 18, 20)
    expect(bg).toBe('rgb(17, 18, 20)');
  });

  test('GarbanzoBeans app title renders in sidebar', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toContainText('GarbanzoBeans');
  });

  test('Primary button has lime background and dark text', async ({ page }) => {
    const btn = page.getByTestId('btn-primary');
    const bg = await btn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // #C0F500 → rgb(192, 245, 0)
    expect(bg).toBe('rgb(192, 245, 0)');
    const color = await btn.evaluate((el) => window.getComputedStyle(el).color);
    // #111214 → rgb(17, 18, 20)
    expect(color).toBe('rgb(17, 18, 20)');
  });

  test('Secondary button has lime border and transparent background', async ({ page }) => {
    const btn = page.getByTestId('btn-secondary');
    const border = await btn.evaluate((el) => window.getComputedStyle(el).borderColor);
    // #C0F500 → rgb(192, 245, 0)
    expect(border).toBe('rgb(192, 245, 0)');
    const bg = await btn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)');
  });

  test('Ghost button has transparent background', async ({ page }) => {
    const btn = page.getByTestId('btn-ghost');
    const bg = await btn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)');
  });

  test('Destructive button has red border and transparent background (not red fill)', async ({ page }) => {
    const btn = page.getByTestId('btn-destructive');
    const border = await btn.evaluate((el) => window.getComputedStyle(el).borderColor);
    // #ff5555 → rgb(255, 85, 85)
    expect(border).toBe('rgb(255, 85, 85)');
    const bg = await btn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)');
  });
});
