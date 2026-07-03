import { expect, test, type Page } from '@playwright/test';

async function unlockPremium(page: Page) {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText('Premium is active on this browser')).toBeVisible();
}

test('free: tools screeners show top-5 teasers with an unlock strip', async ({ page }) => {
  await page.goto('/tools');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(5);
  await expect(page.getByText(/more alchable items/)).toBeVisible();

  await page.getByRole('button', { name: /Decanting/ }).click();
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(5);
  await expect(page.getByText(/more potion families/)).toBeVisible();
});

test('free: one alert allowed, the second hits the upsell', async ({ page }) => {
  await page.goto('/item/4151');
  await page.getByRole('button', { name: /Set price alert/ }).click();
  await page.getByLabel('Alert threshold in gp').fill('50000');
  await page.getByRole('button', { name: 'Arm', exact: true }).click();
  await expect(page.getByRole('button', { name: /Alert set/ })).toBeVisible();

  // second alert exceeds the free cap
  await page.getByRole('button', { name: /Alert set/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Alert limit reached');
  await page.keyboard.press('Escape');

  // the alert is manageable from the watchlist page
  await page.goto('/watchlist');
  await expect(page.getByText('Price alerts')).toBeVisible();
  await expect(page.getByText(/post-tax margin ≥ 50,000 gp/)).toBeVisible();
});

test('free: analytics and allocator are locked strips', async ({ page }) => {
  await page.goto('/item/4151');
  await expect(page.getByText(/Margin history and hour-by-hour/)).toBeVisible();
  await page.goto('/starter');
  await expect(page.getByText(/Suggested portfolio: spread/)).toBeVisible();
});

test('premium: allocator, flip analytics and saved views work', async ({ page }) => {
  await unlockPremium(page);

  // allocator renders a diversified portfolio
  await page.goto('/starter?budget=2000000');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  await expect(page.getByText('Suggested portfolio')).toBeVisible();
  await expect(page.getByText('capital used')).toBeVisible();

  // item analytics charts render
  await page.goto('/item/4151');
  await expect(page.getByText('Post-tax margin over time', { exact: false })).toBeVisible();
  await expect(
    page.locator('section', { hasText: 'Flip analytics' }).locator('.recharts-line'),
  ).toHaveCount(1, { timeout: 20_000 });

  // saved views: save the current finder state, clear, re-apply
  await page.goto('/?mv=1000&roi=2');
  await page.waitForSelector('tbody tr', { timeout: 30_000 });
  await page.getByRole('button', { name: /Save view/ }).click();
  await page.getByLabel('Saved view name').fill('grinders');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page).not.toHaveURL(/mv=1000/);
  await page.getByRole('button', { name: '★ grinders' }).click();
  await expect(page).toHaveURL(/mv=1000/);
  await expect(page).toHaveURL(/roi=2/);
});

test('premium: log analytics section and CSV import round-trip', async ({ page }) => {
  await unlockPremium(page);
  await page.goto('/log?item=4151');
  await expect(page.locator('button[title="Click to change item"]')).toContainText('Abyssal whip');
  await page.locator('label:has-text("Bought at") input').fill('1000');
  await page.locator('label:has-text("Sold at") input').fill('1100');
  await page.getByRole('button', { name: 'Log flip' }).click();
  await expect(page.getByText('Your numbers')).toBeVisible();
  await expect(page.getByText(/100% win/)).toBeVisible();

  // export, wipe, re-import
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.locator('button[title="Delete entry"]').first().click();
  await expect(page.getByText('No flips logged yet.')).toBeVisible();
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect(page.getByText(/Imported 1 flip/)).toBeVisible();
  await expect(page.locator('section', { hasText: 'History' }).locator('tbody tr')).toHaveCount(1);
});
