import { expect, test } from '@playwright/test';

test('set combining: teaser for free, full table + direction badges for premium', async ({ page }) => {
  await page.goto('/tools?tool=sets');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(5);
  await expect(page.getByText(/more combinables/)).toBeVisible();

  // unlock premium -> full table
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.goto('/tools?tool=sets');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  // "full" = beyond the 5-row teaser; how many sets have two-sided prices varies live
  const fullCount = await page.locator('tbody tr').count();
  expect(fullCount).toBeGreaterThan(5);
  expect(await page.locator('tbody span', { hasText: /^(combine|split)$/ }).count()).toBe(fullCount);
});

test('AFK methods: character import gates requirements', async ({ page }) => {
  // deterministic hiscores: a mid-level account
  await page.route('**/api/hiscores*', (route) =>
    route.fulfill({
      json: {
        name: 'Test Alt',
        levels: { Herblore: 60, Cooking: 85, Fletching: 99, Crafting: 50, Smithing: 40, Magic: 70 },
      },
    }),
  );

  await page.goto('/tools?tool=methods');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  await page.getByLabel('RuneScape name').fill('Test Alt');
  await page.getByRole('button', { name: 'Import character' }).click();
  await expect(page.getByText('⚔️')).toBeVisible();
  await expect(page.getByText('Herb 60')).toBeVisible();

  // premium: full list, requirement chips now green/red
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.goto('/tools?tool=methods');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(10);
  expect(await page.locator('tbody span', { hasText: /Herblore \d+/ }).count()).toBeGreaterThan(3);

  // "only mine" filters out unmet requirements (e.g. Crafting 87 light orbs)
  await page.getByText('Only methods I can do').click();
  await expect(page.getByText('Blow empty light orbs')).toHaveCount(0);
  await expect(page.getByText('Mix prayer potions')).toBeVisible();
});

test('hiscores errors surface cleanly', async ({ page }) => {
  await page.route('**/api/hiscores*', (route) =>
    route.fulfill({ status: 404, json: { error: 'Player not found on the hiscores' } }),
  );
  await page.goto('/tools?tool=methods');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  await page.getByLabel('RuneScape name').fill('No Such Name');
  await page.getByRole('button', { name: 'Import character' }).click();
  await expect(page.getByText('Player not found on the hiscores')).toBeVisible();
});
