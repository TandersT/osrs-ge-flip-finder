import { expect, test, type Page } from '@playwright/test';
import type { DivergenceResponse } from '@osrs-flip/shared';

async function unlockPremium(page: Page) {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText('Premium is active on this browser')).toBeVisible();
}

const T0 = 1_780_000_000;
const SERIES = Array.from({ length: 90 }, (_, i) => ({
  t: T0 - (90 - i) * 86_400,
  item: 1 - (i / 90) * 0.15,
  peer: 1 + (i / 90) * 0.08,
}));

const READY: DivergenceResponse = {
  builtAt: T0,
  deals: [
    {
      itemId: 397,
      name: 'Sea turtle',
      icon: 'Sea turtle.png',
      groupId: 'food-high-heal',
      groupLabel: 'High-heal food',
      laggingPairs: 2,
      eligiblePairs: 3,
      headline: { item30d: -0.12, peersMedian30d: 0.06 },
      pairs: [
        {
          peerId: 385,
          peerName: 'Shark',
          z: -2.7,
          weeklyR: 0.71,
          episodes: { count: 5, closedWithin30d: 4, medianDays: 9 },
          series90: SERIES,
        },
        {
          peerId: 391,
          peerName: 'Manta ray',
          z: -2.1,
          weeklyR: 0.64,
          episodes: { count: 2, closedWithin30d: 2, medianDays: 12 },
        },
      ],
      buy: 720,
      sell: 799,
      margin: 64,
      patch: {
        title: 'Fishing Rework',
        url: 'https://oldschool.runescape.wiki/w/Update:Fishing_Rework',
        date: '2026-07-10',
      },
    },
  ],
  groups: [
    {
      id: 'food-high-heal',
      label: 'High-heal food',
      eligiblePairs: 3,
      members: [
        {
          itemId: 385,
          name: 'Shark',
          icon: 'Shark.png',
          eligible: true,
          avgR: 0.7,
          missing: false,
        },
        {
          itemId: 397,
          name: 'Sea turtle',
          icon: 'Sea turtle.png',
          eligible: true,
          avgR: 0.68,
          missing: false,
        },
        {
          itemId: 3144,
          name: 'Cooked karambwan',
          icon: null,
          eligible: false,
          avgR: 0.2,
          missing: false,
        },
        {
          itemId: null,
          name: 'Mystery meat',
          icon: null,
          eligible: false,
          avgR: null,
          missing: true,
        },
      ],
    },
  ],
  coverage: { itemsRequested: 4, itemsWithSeries: 3 },
};

const EMPTY: DivergenceResponse = {
  builtAt: T0,
  deals: [],
  groups: READY.groups,
  coverage: READY.coverage,
};

test('free: divergence page is fully locked and fetches no data', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/divergence')) calls.push(r.url());
  });
  await page.goto('/divergence');
  await expect(page.getByText('Divergence is a Premium feature')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unlock with Premium' })).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('premium: deal card renders evidence and expands to chart + pair table', async ({ page }) => {
  await page.route('**/api/divergence', (route) => route.fulfill({ json: READY }));
  await unlockPremium(page);
  await page.goto('/divergence');

  await expect(page.getByRole('link', { name: 'Sea turtle' })).toBeVisible();
  await expect(page.getByText('lags 2 of 3 co-moving peers')).toBeVisible();
  await expect(page.getByRole('link', { name: /patched/ })).toBeVisible();

  await page.getByText('lags 2 of 3 co-moving peers').click();
  await expect(page.locator('.recharts-wrapper')).toBeVisible();
  await expect(page.getByText('vs Shark')).toBeVisible();
  await expect(page.getByText('closed 4 of 5 within 30d · median 9d')).toBeVisible();
  await expect(page.getByText('Spreads close from either side', { exact: false })).toBeVisible();
});

test('premium: groups panel explains member eligibility', async ({ page }) => {
  await page.route('**/api/divergence', (route) => route.fulfill({ json: READY }));
  await unlockPremium(page);
  await page.goto('/divergence');

  await expect(page.getByRole('heading', { name: 'Watched categories' })).toBeVisible();
  const groupsPanel = page.locator('section').filter({ hasText: 'Watched categories' });
  await expect(groupsPanel.getByText('High-heal food')).toBeVisible();
  await expect(page.getByText('3 co-moving pairs')).toBeVisible();
  await expect(page.getByText('Mystery meat')).toBeVisible();
});

test('premium: empty state when everything tracks', async ({ page }) => {
  await page.route('**/api/divergence', (route) => route.fulfill({ json: EMPTY }));
  await unlockPremium(page);
  await page.goto('/divergence');
  await expect(page.getByText('No mismatches right now', { exact: false })).toBeVisible();
});
