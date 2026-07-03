import { expect, test, type Page } from '@playwright/test';

async function waitForRows(page: Page) {
  await page.waitForSelector('tbody tr td span.truncate', { timeout: 30_000 });
}

test('loads all items and never calls the wiki from the browser', async ({ page }) => {
  const wikiCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('prices.runescape.wiki')) wikiCalls.push(req.url());
  });

  await page.goto('/');
  await waitForRows(page);

  const counter = await page.locator('text=/of [\\d,]+ items/').textContent();
  const total = Number(counter!.match(/of ([\d,]+) items/)![1]!.replaceAll(',', ''));
  expect(total).toBeGreaterThan(3_000);
  expect(wikiCalls).toHaveLength(0);
});

test('search, slider filter and sort state land in the URL and are restorable', async ({ page }) => {
  await page.goto('/');
  await waitForRows(page);

  await page.getByPlaceholder('Item name…  ( / )').fill('rune');
  await page.locator('th', { hasText: 'Margin' }).first().click();
  await expect(page).toHaveURL(/q=rune/);
  await expect(page).toHaveURL(/sort=margin\.desc/);

  // a shared URL restores the exact view
  await page.goto('/?q=whip&world=members&mm=1000');
  await waitForRows(page);
  await expect(page.getByPlaceholder('Item name…  ( / )')).toHaveValue('whip');
  const counter = await page.locator('text=/of [\\d,]+ items/').textContent();
  expect(Number(counter!.match(/^([\d,]+) of/)![1]!.replaceAll(',', ''))).toBeLessThan(100);
});

test('presets apply and tax-exempt filter matches the exemption list size', async ({ page }) => {
  await page.goto('/');
  await waitForRows(page);

  await page.getByRole('button', { name: 'Tax-free only' }).click();
  await expect(page).toHaveURL(/exempt=1/);
  const counter = await page.locator('text=/of [\\d,]+ items/').textContent();
  const shown = Number(counter!.match(/^([\d,]+) of/)![1]!.replaceAll(',', ''));
  expect(shown).toBeGreaterThanOrEqual(40);
  expect(shown).toBeLessThanOrEqual(60);
  await expect(page.locator('tbody span', { hasText: 'exempt' }).first()).toBeVisible();
});

test('keyboard: "/" focuses search, arrows walk rows, Enter opens the item', async ({ page }) => {
  await page.goto('/');
  await waitForRows(page);

  await page.keyboard.press('/');
  await expect(page.getByPlaceholder('Item name…  ( / )')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Item name…  ( / )').blur();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('tr.outline')).toHaveCount(1);
  const name = (await page.locator('tbody tr span.truncate').nth(1).textContent())!.trim();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/item\/\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
});

test('watchlist: starring an item persists and shows since-added', async ({ page }) => {
  await page.goto('/');
  await waitForRows(page);

  const firstName = (await page.locator('tbody tr span.truncate').first().textContent())!.trim();
  await page.locator('tbody tr button[title="Add to watchlist"]').first().click();

  await page.getByRole('link', { name: 'Watchlist' }).click();
  await waitForRows(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr span.truncate').first()).toHaveText(firstName);
  await expect(page.locator('th', { hasText: 'Since added' })).toBeVisible();

  await page.reload();
  await waitForRows(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
});
