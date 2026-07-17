import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ENTITLEMENTS, PRICING } from '@osrs-flip/shared';
import { useTier } from '../lib/tier';
import { Icon } from '../components/Icon';

const FEATURES: { label: string; free: string; premium: string }[] = [
  { label: 'Live flip finder, filters & presets', free: '✓', premium: '✓' },
  { label: 'Risk flags (stale / thin / unstable)', free: '✓', premium: '✓' },
  { label: 'Get Started guide & budget flips', free: '✓', premium: '✓' },
  { label: 'Item charts & high-alch panel', free: '✓', premium: '✓' },
  {
    label: 'Price history on charts',
    free: `${ENTITLEMENTS.free.historyDays} days`,
    premium: 'Full year',
  },
  {
    label: 'Long-term screener (dips, momentum, z-scores)',
    free: `Top ${ENTITLEMENTS.free.longtermRows} rows`,
    premium: 'All screened items',
  },
  {
    label: 'Best Deals ranking (cross-tool score)',
    free: `Top ${ENTITLEMENTS.free.dealRows} deals`,
    premium: 'Full ranking',
  },
  { label: 'Price alerts', free: `${ENTITLEMENTS.free.alertsMax} armed`, premium: 'Unlimited' },
  { label: 'Flip analytics (margin history, hourly activity)', free: '—', premium: '✓' },
  {
    label: 'Money-making tools (alch, decant, sets, AFK methods)',
    free: `Top ${ENTITLEMENTS.free.alchRows} rows each`,
    premium: 'Everything',
  },
  { label: 'Character import (hiscores)', free: '✓', premium: '✓' },
  { label: 'Budget portfolio allocator', free: '—', premium: '✓' },
  { label: 'Watchlist', free: `${ENTITLEMENTS.free.watchlistMax} items`, premium: 'Unlimited' },
  { label: 'Flip log', free: `${ENTITLEMENTS.free.fliplogMax} flips`, premium: 'Unlimited' },
  { label: 'Flip-log analytics (win rates, monthly P&L)', free: '—', premium: '✓' },
  { label: 'CSV export & import', free: '—', premium: '✓' },
  {
    label: 'Saved filter views',
    free: `${ENTITLEMENTS.free.savedFiltersMax}`,
    premium: 'Unlimited',
  },
  { label: 'Divergence screener (category-mismatch deals)', free: '—', premium: '✓' },
];

export default function PremiumPage() {
  const { tier, redeem, downgrade } = useTier();
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<null | 'ok' | 'bad'>(null);

  const tryRedeem = () => {
    setFeedback(redeem(code) ? 'ok' : 'bad');
    setCode('');
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gold">
          <Icon name="sparkle" className="mr-1.5" /> Premium
        </h1>
        <p className="mt-1 text-sm opacity-70">
          Everything you need to flip is free — and stays free. Premium is for when flipping
          becomes your grind: full history, the whole screener, and no limits on what you track.
        </p>
      </header>

      {tier === 'premium' && (
        <div className="flex items-center justify-between gap-3 rounded border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          <span>
            <Icon name="check" className="mr-1" /> Premium is active on this browser.
          </span>
          <button onClick={downgrade} className="text-xs underline opacity-70 hover:opacity-100">
            switch back to free
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col rounded border border-panel-border bg-panel p-5">
          <h2 className="text-lg font-semibold">Free</h2>
          <p className="mt-1 text-3xl font-bold">0 gp</p>
          <p className="mt-1 text-xs opacity-60">forever · no account</p>
          <p className="mt-3 text-sm opacity-70">
            The full flipping loop: find, vet, flip, learn. Enough for a casual bank-builder.
          </p>
        </section>
        <section className="flex flex-col rounded border border-gold/60 bg-panel p-5">
          <h2 className="text-lg font-semibold text-gold">Premium</h2>
          <p className="mt-1 text-3xl font-bold">
            ${PRICING.monthly}
            <span className="text-sm font-normal opacity-60"> /month</span>
          </p>
          <p className="mt-1 text-xs opacity-60">
            or ${PRICING.yearly}/year · prices in {PRICING.currency}
          </p>
          <p className="mt-3 text-sm opacity-70">
            Scale and long-horizon analytics for serious flippers.
          </p>
        </section>
      </div>

      <section className="overflow-auto rounded border border-panel-border bg-panel">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead className="bg-panel-light">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gold">
                Feature
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">
                Free
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gold">
                Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.label} className="border-t border-panel-border/50">
                <td className="px-4 py-2">{f.label}</td>
                <td className="px-4 py-2 text-right opacity-70">
                  <FeatureCell value={f.free} />
                </td>
                <td className="px-4 py-2 text-right text-gold">
                  <FeatureCell value={f.premium} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded border border-panel-border bg-panel p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gold">
          Have an unlock code?
        </h2>
        <p className="mb-3 text-xs opacity-60">
          Payments aren&apos;t live yet — see the roadmap in{' '}
          <a
            href="https://github.com/TandersT/osrs-ge-flip-finder/blob/main/docs/payments-plan.md"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-gold"
          >
            docs/payments-plan.md
          </a>
          . Early testers can redeem a code here; it applies to this browser only.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFeedback(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && tryRedeem()}
            placeholder="GEFF-…"
            className="w-56 rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold"
            aria-label="Unlock code"
          />
          <button
            onClick={tryRedeem}
            className="rounded bg-gold px-4 py-1.5 text-sm font-semibold text-ink hover:brightness-110"
          >
            Redeem
          </button>
        </div>
        {feedback === 'ok' && (
          <p className="mt-2 text-sm text-osrs-green">
            <Icon name="sparkle" className="mr-1" /> Premium unlocked — enjoy!
          </p>
        )}
        {feedback === 'bad' && (
          <p className="mt-2 text-sm text-osrs-red">That code didn&apos;t match.</p>
        )}
      </section>

      <p className="text-xs opacity-50">
        Price data comes from the community-run OSRS Wiki and stays free to everyone — Premium
        pays for the tooling and analysis on top, never the data itself. Questions? Check the{' '}
        <Link to="/faq" className="underline hover:text-gold">
          FAQ
        </Link>
        .
      </p>
    </div>
  );
}

/** Feature-table cell values are data strings; '✓' renders as the themed check icon. */
function FeatureCell({ value }: { value: string }) {
  return value === '✓' ? <Icon name="check" size={13} aria-label="Included" /> : <>{value}</>;
}
