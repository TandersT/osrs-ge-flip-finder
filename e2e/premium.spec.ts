import { expect, test, type Page } from '@playwright/test';

const DEV_CODE = 'GEFF-DEV-2026';

async function unlockPremium(page: Page) {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill(DEV_CODE);
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText('Premium is active on this browser')).toBeVisible();
}

test('free tier: watchlist caps at 5 with an upsell dialog', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  const stars = page.locator('tbody tr button[title="Add to watchlist"]');
  for (let i = 0; i < 5; i++) await stars.first().click();
  await expect(page.locator('tbody tr button[title="Remove from watchlist"]')).toHaveCount(5);

  await stars.first().click(); // sixth
  await expect(page.getByRole('dialog')).toContainText('Watchlist full');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('tbody tr button[title="Remove from watchlist"]')).toHaveCount(5);
});

test('free tier: long-term screener shows a teaser and unlock CTA', async ({ page }) => {
  await page.goto('/longterm');
  await page.waitForSelector('tbody tr', { timeout: 120_000 });
  await page.waitForFunction(
    () => !document.body.textContent!.includes('Screening the most liquid'),
    undefined,
    { timeout: 120_000 },
  );
  expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(5);
  await expect(page.getByText(/more screened items/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unlock with Premium' })).toBeVisible();
});

test('free tier: CSV export and full-year history are locked', async ({ page }) => {
  // CSV lock
  await page.goto('/log?item=4151');
  await expect(page.locator('button[title="Click to change item"]')).toContainText('Abyssal whip');
  await page.locator('label:has-text("Bought at") input').fill('100');
  await page.locator('label:has-text("Sold at") input').fill('120');
  await page.getByRole('button', { name: 'Log flip' }).click();
  await page.getByRole('button', { name: /Export CSV/ }).click();
  await expect(page.getByRole('dialog')).toContainText('CSV export');
  await page.keyboard.press('Escape');

  // 1y history lock
  await page.goto('/item/4151');
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await page.getByRole('button', { name: /1y/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Full-year history');
});

test('premium unlock removes the caps', async ({ page }) => {
  await unlockPremium(page);

  // watchlist: star 6 items without a dialog
  await page.goto('/');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  const stars = page.locator('tbody tr button[title="Add to watchlist"]');
  for (let i = 0; i < 6; i++) await stars.first().click();
  await expect(page.locator('tbody tr button[title="Remove from watchlist"]')).toHaveCount(6);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // long-term: full table
  await page.goto('/longterm');
  await page.waitForSelector('tbody tr', { timeout: 120_000 });
  await page.waitForFunction(
    () => !document.body.textContent!.includes('Screening the most liquid'),
    undefined,
    { timeout: 120_000 },
  );
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(50);
  await expect(page.getByText(/more screened items/)).toHaveCount(0);
});

test('bad codes are rejected and the page shows the comparison table', async ({ page }) => {
  await page.goto('/premium');
  await expect(page.getByText('Long-term screener (dips, momentum, z-scores)')).toBeVisible();
  await page.getByLabel('Unlock code').fill('GEFF-WRONG');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText(/didn.t match/)).toBeVisible();
});
