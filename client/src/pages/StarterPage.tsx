import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatGpCompact, formatGpFull } from '@osrs-flip/shared';
import { useAppConfig, useItems } from '../lib/api';
import { buildRows, type Membership } from '../lib/rows';
import { BUDGET_PRESETS, computeStarterFlips, DEFAULT_BUDGET } from '../lib/starter';
import { allocateBank } from '../lib/allocate';
import { useTier } from '../lib/tier';
import { UnlockStrip } from '../components/UnlockStrip';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';
import { SliderInput } from '../components/SliderInput';
import { TableSkeleton } from '../components/Skeleton';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-ink">
        {n}
      </span>
      <div>
        <div className="font-semibold text-parchment">{title}</div>
        <div className="text-sm opacity-70">{children}</div>
      </div>
    </div>
  );
}

function PersonaCard({
  to,
  emoji,
  title,
  children,
}: {
  to: string;
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 rounded border border-panel-border bg-panel p-4 transition-colors hover:border-gold"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="font-semibold text-gold">{title}</span>
      <span className="text-sm opacity-70">{children}</span>
    </Link>
  );
}

export default function StarterPage() {
  const config = useAppConfig();
  const { data, isPending, isError, error } = useItems(config.clientRefreshSeconds);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const budget = Math.max(1_000, Number(params.get('budget')) || DEFAULT_BUDGET);
  const membership = (params.get('world') as Membership) || 'all';
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const { entitlements } = useTier();
  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), [data]);
  const rows = useMemo(
    () => (data ? buildRows(data.items, config, nowSec) : []),
    [data, config, nowSec],
  );
  const picks = useMemo(
    () => computeStarterFlips(rows, { budget, membership }),
    [rows, budget, membership],
  );
  const portfolio = useMemo(() => {
    if (!entitlements.allocator || rows.length === 0) return null;
    const eligible = rows.filter((r) =>
      membership === 'all' ? true : membership === 'members' ? r.members : !r.members,
    );
    return allocateBank(eligible, budget);
  }, [entitlements.allocator, rows, budget, membership]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-gold">Build your bank</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-70">
          Flipping works at any size — even a few thousand gp. Set your budget and we&apos;ll
          show safe, fast-moving items sized to what you can actually afford, with the GE tax
          already subtracted.
        </p>
      </header>

      <section className="grid gap-4 rounded border border-panel-border bg-panel p-4 sm:grid-cols-3">
        <Step n={1} title="Buy low">
          Place a buy offer at the <span className="text-gold">Buy</span> price — slightly above
          what impatient sellers accept, so yours fills first.
        </Step>
        <Step n={2} title="Sell high">
          Once it fills, re-list at the <span className="text-gold">Sell</span> price — slightly
          below what impatient buyers pay.
        </Step>
        <Step n={3} title="Keep the margin">
          The margin shown is <em>after</em> the 2% GE tax. Reinvest it and repeat — buy limits
          reset every 4 hours. <Link to="/faq" className="text-gold underline">More in the FAQ.</Link>
        </Step>
      </section>

      <section className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded border border-panel-border bg-panel p-4">
        <SliderInput
          label="Your budget"
          title="Total gp you can spend on flips right now"
          value={budget}
          onChange={(v) => setParam('budget', String(Math.max(1_000, v ?? DEFAULT_BUDGET)))}
          min={10_000}
          max={100_000_000}
          offLabel=""
          format={(v) => formatGpCompact(v)}
        />
        <div className="flex items-center gap-1.5">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setParam('budget', String(preset.value))}
              className={`rounded px-2 py-1 text-xs font-medium ${
                budget === preset.value
                  ? 'bg-gold text-ink'
                  : 'bg-panel-light text-parchment/70 hover:text-parchment'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide opacity-60">World</span>
          <select
            className="rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold"
            value={membership}
            onChange={(e) => setParam('world', e.target.value === 'all' ? null : e.target.value)}
          >
            <option value="all">All</option>
            <option value="members">Members</option>
            <option value="f2p">F2P</option>
          </select>
        </label>
        <span className="pb-1 text-xs opacity-50">
          Showing flips you can afford with {formatGpFull(budget)}
        </span>
      </section>

      {isPending ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <div className="p-10 text-center text-osrs-red">
          Failed to load prices: {(error as Error).message}
        </div>
      ) : (
        <section className="overflow-auto rounded border border-panel-border bg-panel">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="sticky top-0 bg-panel-light">
              <tr>
                {(
                  [
                    ['#', false],
                    ['Item', false],
                    ['Buy at', true],
                    ['Sell at', true],
                    ['Margin/item', true],
                    ['You can flip', true],
                    ['Capital needed', true],
                    ['Est. profit', true],
                    ['Return', true],
                  ] as const
                ).map(([h, right]) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold ${right ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {picks.map((pick, i) => (
                <tr
                  key={pick.row.id}
                  onClick={() => navigate(`/item/${pick.row.id}`)}
                  className="cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
                >
                  <td className="px-3 py-1.5 tabular-nums opacity-50">{i + 1}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <ItemIcon icon={pick.row.icon} name={pick.row.name} />
                      {pick.row.name}
                      {pick.row.taxExempt && (
                        <span className="rounded bg-emerald-900/60 px-1 text-[10px] uppercase text-emerald-300">
                          tax-free
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={pick.row.flip!.buyAt} /></td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={pick.row.flip!.sellAt} /></td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={pick.row.flip!.marginPerItem} signed /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {pick.affordableQty.toLocaleString('en-US')}
                    <span className="opacity-40"> ×</span>
                  </td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={pick.capitalUsed} /></td>
                  <td className="px-3 py-1.5 text-right"><GpText amount={pick.expectedProfit} signed /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-osrs-green">
                    {(pick.returnOnCapital * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {picks.length === 0 && (
            <div className="p-10 text-center text-sm opacity-60">
              Nothing affordable and liquid right now — try a different budget or world.
            </div>
          )}
          <p className="border-t border-panel-border/50 px-3 py-2 text-xs opacity-50">
            Estimates assume your offers fill at the listed prices within one 4-hour buy-limit
            window and that you capture ~{Math.round(config.captureRate * 100)}% of traded volume.
            Real fills vary — start small and learn each item&apos;s rhythm.
          </p>
        </section>
      )}

      {portfolio === null ? (
        <UnlockStrip>
          Suggested portfolio: spread {formatGpCompact(budget)} across up to 5 flips sized by
          limits and volume — one click instead of picking by hand.
        </UnlockStrip>
      ) : (
        <section className="rounded border border-gold/40 bg-panel p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold">
            Suggested portfolio <span className="ml-1 font-normal normal-case text-gold/60">⭐ premium</span>
          </h2>
          <p className="mb-2 text-xs opacity-50">
            Greedy split of your budget across the strongest safe flips — diversified so one
            stuck offer can&apos;t freeze the bank.
          </p>
          {portfolio.allocations.length === 0 ? (
            <p className="py-2 text-sm opacity-60">Nothing safe and liquid fits this budget right now.</p>
          ) : (
            <>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {portfolio.allocations.map((a) => (
                    <tr
                      key={a.row.id}
                      onClick={() => navigate(`/item/${a.row.id}`)}
                      className="cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
                    >
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <ItemIcon icon={a.row.icon} name={a.row.name} />
                          {a.row.name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.qty.toLocaleString('en-US')} ×</td>
                      <td className="px-2 py-1.5 text-right"><GpText amount={a.row.flip!.buyAt} /></td>
                      <td className="px-2 py-1.5 text-right opacity-70">= <GpText amount={a.cost} /></td>
                      <td className="px-2 py-1.5 text-right"><GpText amount={a.expectedProfit} signed /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-right text-sm">
                <span className="opacity-60">capital used </span>
                <GpText amount={portfolio.totalCost} />
                <span className="mx-2 opacity-40">·</span>
                <span className="opacity-60">est. profit / 4h </span>
                <GpText amount={portfolio.totalProfit} signed />
              </p>
            </>
          )}
        </section>
      )}

      <section className="rounded border border-panel-border bg-panel p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
          Tips for small banks
        </h2>
        <ul className="grid gap-1.5 text-sm opacity-80 sm:grid-cols-2">
          <li>• Spread your budget over 3–5 items — one stuck offer won&apos;t freeze your bank.</li>
          <li>• High volume beats high margin: fast fills compound faster than big spreads.</li>
          <li>• Items under 50 gp are effectively tax-free (2% rounds down to 0).</li>
          <li>• If an offer doesn&apos;t fill in ~10 minutes, cancel and re-price — don&apos;t wait hours.</li>
          <li>• Check the item&apos;s chart before committing: a falling price eats thin margins.</li>
          <li>• Buy limits reset 4 hours after your first purchase — set a timer and re-buy.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">
          As your bank grows
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <PersonaCard to="/?world=f2p&mv=100" emoji="🗡️" title="F2P flipper">
            No membership needed — runes, arrows and food move constantly on F2P worlds.
          </PersonaCard>
          <PersonaCard to="/?mv=1000&mm=1&nostale=1&norisk=1" emoji="⚡" title="High-volume grinder">
            Thousands of small, safe flips per day. Low margin, high certainty.
          </PersonaCard>
          <PersonaCard to="/?bmin=1000000&mm=10000" emoji="💎" title="Big-ticket trader">
            Fewer, larger flips on expensive gear — mind the 2% tax (capped at 5m).
          </PersonaCard>
          <PersonaCard to="/longterm" emoji="📈" title="Passive investor">
            Buy statistical dips, hold for weeks. Slower, hands-off, needs patience.
          </PersonaCard>
          <PersonaCard to="/faq#high-alch" emoji="🔮" title="High alchemist">
            Turn Magic training into profit — every item page shows alch margins live.
          </PersonaCard>
        </div>
      </section>
    </div>
  );
}
