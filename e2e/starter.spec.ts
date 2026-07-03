import { expect, test } from '@playwright/test';

function parseGp(text: string): number {
  return Number(text.replaceAll(',', '').replace(/[^\d.-]/g, ''));
}

test('budget-sized picks never need more capital than the budget', async ({ page }) => {
  await page.goto('/starter?budget=100000');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  const capitals = await page.locator('tbody tr td:nth-child(7)').allTextContents();
  expect(capitals.length).toBeGreaterThan(5);
  for (const c of capitals) {
    // cells under 100k render as full digits, so parse directly
    expect(parseGp(c)).toBeLessThanOrEqual(100_000);
  }
});

test('budget presets update the URL and the result set', async ({ page }) => {
  await page.goto('/starter');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });

  await page.getByRole('button', { name: '25k', exact: true }).click();
  await expect(page).toHaveURL(/budget=25000/);
  await expect(page.getByText('Showing flips you can afford with 25,000 gp')).toBeVisible();
});

test('explainer, tips and persona cards are present', async ({ page }) => {
  await page.goto('/starter');
  await expect(page.getByText('Buy low')).toBeVisible();
  await expect(page.getByText('Keep the margin')).toBeVisible();
  await expect(page.getByText('Tips for small banks')).toBeVisible();
  await expect(page.getByRole('link', { name: /Passive investor/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /High alchemist/ })).toBeVisible();
});
