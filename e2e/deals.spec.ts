import { expect, test } from '@playwright/test';

test('free tier sees a top-5 teaser of the deal ranking', async ({ page }) => {
  await page.goto('/deals');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(5);
  await expect(page.getByText(/more scored deals/)).toBeVisible();
});

test('premium: full ranking mixes flips and methods, sorted by score', async ({ page }) => {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();

  await page.goto('/deals');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(20);

  // both opportunity kinds appear
  expect(await page.locator('tbody span:text-is("flip")').count()).toBeGreaterThan(0);
  expect(await page.locator('tbody span:text-is("method")').count()).toBeGreaterThan(0);

  // scores are 1-100 and non-increasing down the table
  const scores = (await page.locator('tbody td:nth-child(3) span.font-bold').allTextContents()).map(Number);
  expect(Math.max(...scores)).toBeLessThanOrEqual(100);
  expect(Math.min(...scores)).toBeGreaterThanOrEqual(1);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));

  // TRADE SECRET: the API must not leak factors, and no tooltip shows them
  const payload = await page.evaluate(() => fetch('/api/deals').then((r) => r.text()));
  expect(payload).not.toContain('breakdown');
  expect(payload).not.toContain('consistency');
  expect(await page.locator('td[title*="liquidity"]').count()).toBe(0);
  // …but qualitative hints are allowed
  expect(payload).toContain('hints');
});

test('capital cap filters expensive deals', async ({ page }) => {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.goto('/deals');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  await page.getByLabel('Max capital — exact value').fill('100000');
  await page.waitForTimeout(400);
  const capitals = await page.locator('tbody td:nth-child(5)').allTextContents();
  expect(capitals.length).toBeGreaterThan(0);
  for (const c of capitals) {
    // <= 100k renders as full digits (no k/m suffix beyond 100k)
    expect(c).not.toMatch(/[15]\d*m/);
  }
});
