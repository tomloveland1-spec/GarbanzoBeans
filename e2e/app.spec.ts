import { expect, test } from "@playwright/test";

test("app loads and shows placeholder screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GarbanzoBeans" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scaffold ready" })).toBeVisible();
});
