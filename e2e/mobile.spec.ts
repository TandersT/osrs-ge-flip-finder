import { expect, test } from '@playwright/test';

test('finder renders cards instead of a table, with a working sort control', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sort by')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('table')).toHaveCount(0);

  // cards carry the essentials
  const firstCard = page.locator('div.overflow-auto button').first();
  await expect(firstCard).toContainText('ROI');
  await expect(firstCard).toContainText('/ 4h');

  await page.getByLabel(/Sort by/).selectOption('roi');
  await expect(page).toHaveURL(/sort=roi\.desc/);
});

test('no horizontal overflow and collapsible filters', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sort by')).toBeVisible({ timeout: 30_000 });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await expect(page.locator('input[type="range"]:visible')).toHaveCount(0);
  await page.getByRole('button', { name: /Filters/ }).click();
  expect(await page.locator('input[type="range"]:visible').count()).toBeGreaterThan(3);
});

test('tapping a card opens the item detail', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sort by')).toBeVisible({ timeout: 30_000 });
  await page.locator('div.overflow-auto button').first().click();
  await expect(page).toHaveURL(/\/item\/\d+/);
  await expect(page.getByText('Flip at current prices')).toBeVisible();
});

test('PWA manifest is served with icons', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { short_name: string; icons: unknown[] };
  expect(manifest.short_name).toBe('Flip Finder');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
});
