import { expect, test, type Page } from '@playwright/test';
import type { PatchDetail, PatchesResponse, UpcomingResponse } from '@osrs-flip/shared';

async function unlockPremium(page: Page) {
  await page.goto('/premium');
  await page.getByLabel('Unlock code').fill('GEFF-DEV-2026');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByText('Premium is active on this browser')).toBeVisible();
}

const LIST: PatchesResponse = {
  status: 'ready',
  progress: 1,
  builtAt: 1_780_000_000,
  warnings: [],
  patches: [
    {
      pageid: 111,
      title: 'The Blood Moon Rises',
      date: '2026-06-30',
      wikiUrl: 'https://oldschool.runescape.wiki/w/Update:The_Blood_Moon_Rises',
      impact: 0.18,
      topWinner: { id: 4151, name: 'Abyssal whip', change: 0.21 },
      topLoser: { id: 13652, name: 'Dragon claws', change: -0.09 },
    },
    {
      pageid: 222,
      title: 'Quiet Week Patch',
      date: '2026-06-10',
      wikiUrl: 'https://oldschool.runescape.wiki/w/Update:Quiet_Week_Patch',
      impact: 0.01,
      topWinner: null,
      topLoser: null,
    },
  ],
};

const DETAIL: PatchDetail = {
  ...LIST.patches[0]!,
  dataQuality: 'full',
  tags: ['slayer', 'boss', 'quest'],
  universeSize: 400,
  windowDays: 7,
  winners: [
    {
      id: 4151,
      name: 'Abyssal whip',
      icon: 'Abyssal whip.png',
      change1: 0.05,
      change7: 0.21,
      change30: 0.18,
      runup7: 0.04,
      zScore: 5.2,
      volumeDelta7: 1.4,
      mentioned: true,
    },
  ],
  losers: [
    {
      id: 13652,
      name: 'Dragon claws',
      icon: 'Dragon claws.png',
      change1: -0.02,
      change7: -0.09,
      change30: -0.11,
      runup7: 0.01,
      zScore: -2.4,
      volumeDelta7: 0.2,
      mentioned: false,
    },
  ],
};

const UPCOMING: UpcomingResponse = {
  status: 'ready',
  builtAt: 1_780_000_000,
  features: [
    {
      anchor: 'Sailing_Rewards',
      title: 'Sailing Rewards',
      tags: ['sailing', 'reward'],
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          icon: 'Abyssal whip.png',
          price: 1_500_000,
          history: [
            { pageid: 111, title: 'The Blood Moon Rises', date: '2026-06-30', change7: 0.21 },
          ],
        },
      ],
      analogues: [
        {
          pageid: 111,
          title: 'The Blood Moon Rises',
          date: '2026-06-30',
          similarity: 0.5,
        },
      ],
      evidence: { median7: -0.04, iqrLow7: -0.09, iqrHigh7: 0.03, pctPositive: 0.4, sampleSize: 18 },
      note: null,
    },
  ],
};

async function mockPatchApi(page: Page) {
  await page.route('**/api/patches/upcoming', (route) => route.fulfill({ json: UPCOMING }));
  await page.route('**/api/patches/111', (route) => route.fulfill({ json: DETAIL }));
  await page.route('**/api/patches', (route) => route.fulfill({ json: LIST }));
}

test('free: patches page is fully locked and fetches no patch data', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/patches')) calls.push(r.url());
  });
  await page.goto('/patches');
  await expect(page.getByText('Patch Impact is a Premium feature')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unlock with Premium' })).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('premium: list renders, impact sort updates the URL, detail expands', async ({ page }) => {
  await mockPatchApi(page);
  await unlockPremium(page);
  await page.goto('/patches');

  await expect(page.getByText('The Blood Moon Rises', { exact: true })).toBeVisible();
  await expect(page.getByText('2 game updates analysed')).toBeVisible();

  await page.getByRole('button', { name: 'Biggest impact' }).click();
  await expect(page).toHaveURL(/sort=impact/);

  await page.getByText('The Blood Moon Rises', { exact: true }).click();
  await expect(page).toHaveURL(/patch=111/);
  await expect(page.getByRole('heading', { name: 'Winners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Losers' })).toBeVisible();
  await expect(page.getByText('unusual').first()).toBeVisible();
  await expect(page.getByText('mentioned', { exact: true })).toBeVisible();
  await expect(page.getByText('400 liquid items screened')).toBeVisible();
});

test('premium: upcoming watchlist shows evidence and item history', async ({ page }) => {
  await mockPatchApi(page);
  await unlockPremium(page);
  await page.goto('/patches');

  await expect(page.getByText('Upcoming — items to watch')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sailing Rewards' })).toBeVisible();
  await expect(page.getByText(/mentioned items moved a median/)).toBeVisible();
  await expect(page.getByText('past mentions:')).toBeVisible();
  await expect(
    page.getByText('Historical evidence, not financial advice', { exact: false }),
  ).toBeVisible();
});
