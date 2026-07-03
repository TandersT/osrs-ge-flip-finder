import { expect, test } from '@playwright/test';

test('closed flip: log from an item page, math matches the GE tax rules', async ({ page }) => {
  await page.goto('/item/4151');
  await page.getByRole('link', { name: /Log this flip/ }).click();
  await expect(page).toHaveURL(/\/log\?item=4151/);

  // preselected with live prices
  await expect(page.locator('button[title="Click to change item"]')).toContainText('Abyssal whip');

  // use deterministic prices so the asserted math is exact
  await page.locator('label:has-text("Quantity") input').fill('10');
  await page.locator('label:has-text("Bought at") input').fill('1000');
  await page.locator('label:has-text("Sold at") input').fill('1100');
  // tax floor(1100/50)=22 -> profit (1100-1000-22)*10 = 780
  await expect(page.getByText('tax 22/ea')).toBeVisible();
  await page.getByRole('button', { name: 'Log flip' }).click();

  await expect(page.locator('section', { hasText: 'History' }).getByText('+780')).toBeVisible();
  await expect(page.getByText('Realized profit')).toBeVisible();
});

test('open position: log buy, live unrealized P&L, complete, gp/hour', async ({ page }) => {
  await page.goto('/log?item=4151');
  await expect(page.locator('button[title="Click to change item"]')).toContainText('Abyssal whip');

  await page.locator('label:has-text("Quantity") input').fill('2');
  await page.locator('label:has-text("Bought at") input').fill('1000000');
  await page.locator('label:has-text("Sold at") input').fill('');
  await expect(page.getByText('open position — complete it when it sells')).toBeVisible();
  await page.getByRole('button', { name: 'Log buy' }).click();

  const openSection = page.locator('section', { hasText: 'Open positions — waiting to sell' });
  await expect(openSection).toBeVisible();
  await expect(openSection.getByText('2m')).toBeVisible(); // 2 × 1m capital
  await expect(page.getByText('tied up')).toBeVisible();

  // complete at a fixed price: tax floor(1.2m/50)=24k -> profit (1.2m-1m-24k)*2 = 352k
  await openSection.locator('input[type="number"]').fill('1200000');
  await openSection.getByRole('button', { name: '✓ Sold' }).click();
  await expect(openSection).toHaveCount(0);
  await expect(page.locator('section', { hasText: 'History' }).getByText('+352k')).toBeVisible();
});

test('log persists across reload and exports CSV (premium)', async ({ page }) => {
  // CSV export is a premium feature — unlock with the dev code first
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.goto('/log?item=4151');
  await expect(page.locator('button[title="Click to change item"]')).toContainText('Abyssal whip');
  await page.locator('label:has-text("Bought at") input').fill('500');
  await page.locator('label:has-text("Sold at") input').fill('600');
  await page.getByRole('button', { name: 'Log flip' }).click();
  await expect(page.locator('section', { hasText: 'History' }).locator('tbody tr')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('section', { hasText: 'History' }).locator('tbody tr')).toHaveCount(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('flip-log.csv');
});
