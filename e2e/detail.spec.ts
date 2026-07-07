import { expect, test } from '@playwright/test';

// Abyssal whip: liquid, always has history
const WHIP = '/item/4151';

test('renders chart panels, flip economics and high-alch data', async ({ page }) => {
  await page.goto(WHIP);
  await expect(page.getByRole('heading', { name: 'Abyssal whip' })).toBeVisible();

  // two price lines + volume bars + live-price reference lines
  await expect(page.locator('.recharts-line')).toHaveCount(2);
  expect(await page.locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);
  expect(await page.locator('.recharts-reference-line').count()).toBeGreaterThan(0);

  // scope to the live flip panel — the What-if calculator mirrors some of these labels
  const flipPanel = page.locator('section', { hasText: 'Flip at current prices' });
  await expect(flipPanel.getByText('Break-even sell')).toBeVisible();
  await expect(flipPanel.getByText('Post-tax margin')).toBeVisible();
  await expect(page.getByText('Nature rune')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wiki', exact: true })).toBeVisible();
});

test('timestep switch and 24h range chips', async ({ page }) => {
  await page.goto(WHIP);
  await expect(page.locator('.recharts-line').first()).toBeVisible();

  // range chips only exist on the 24h view
  await expect(page.getByRole('button', { name: '3m', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await expect(page.getByRole('button', { name: '3m', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '1m', exact: true }).click();
  await expect(page.locator('.recharts-line')).toHaveCount(2);
});

test('statistics panel computes long-horizon numbers', async ({ page }) => {
  await page.goto(WHIP);
  const statsPanel = page.locator('section', { hasText: 'Statistics' });
  await expect(statsPanel.getByText('7-day change')).toBeVisible();
  // values arrive once the 24h series loads; expect at least one percentage
  await expect(statsPanel.locator('span.tabular-nums').first()).toBeVisible({ timeout: 20_000 });
});

test('unknown item shows a friendly not-found state', async ({ page }) => {
  await page.goto('/item/99999999');
  await expect(page.getByText(/not found/i)).toBeVisible();
});

test('set detail page opens the pieces breakdown modal', async ({ page }) => {
  await page.goto('/item/13012');
  await page.getByRole('button', { name: 'View set pieces' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('tbody tr').count()).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
