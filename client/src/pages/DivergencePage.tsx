import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DivergenceDeal, DivergenceResponse } from '@osrs-flip/shared';
import { CopyValue } from '../components/CopyValue';
import { GpText } from '../components/GpText';
import { Icon } from '../components/Icon';
import { ItemIcon } from '../components/ItemIcon';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';
import { useTier } from '../lib/tier';
import { Pct } from './PatchesPage';

function LockedDivergence() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="rounded border border-panel-border bg-panel p-6 text-center">
        <Icon name="lock" size={28} className="text-gold" />
        <h1 className="mt-2 text-xl font-bold text-gold">Divergence is a Premium feature</h1>
        <p className="mt-2 text-sm opacity-80">
          Items of the same kind — sharks and sea turtles, logs, runes, hides — usually move
          together. When one breaks away from peers it historically tracks, that mismatch is a
          deal: buy the laggard, wait for the spread to close. Every signal ships with the
          evidence — peer moves, past reconvergence record, and a warning when a game update is
          the likely cause.
        </p>
      </div>
      <UnlockStrip>Category-mismatch deals with reconvergence history and update warnings.</UnlockStrip>
    </div>
  );
}

async function fetchDivergence(): Promise<DivergenceResponse> {
  const res = await fetch('/api/divergence');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<DivergenceResponse>;
}

function PatchBadge({ patch }: { patch: NonNullable<DivergenceDeal['patch']> }) {
  return (
    <a
      href={patch.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`A recent game update mentions this item or its peer — this divergence may be justified and never close. ${patch.title} (${patch.date})`}
      className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-1.5 py-0.5 text-xs text-amber-300 hover:underline"
    >
      <Icon name="warning" size={11} /> patched
    </a>
  );
}

function DealCard({ deal }: { deal: DivergenceDeal }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-panel-border bg-panel">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
      >
        <ItemIcon icon={deal.icon} name={deal.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium text-parchment">
            <Link
              to={`/item/${deal.itemId}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-gold hover:underline"
            >
              {deal.name}
            </Link>
            <span className="text-xs font-normal opacity-60">{deal.groupLabel}</span>
            {deal.patch && <PatchBadge patch={deal.patch} />}
          </div>
          <div className="text-xs opacity-70">
            peers <Pct value={deal.headline.peersMedian30d} /> · this{' '}
            <Pct value={deal.headline.item30d} /> over 30d · lags {deal.laggingPairs} of{' '}
            {deal.eligiblePairs} co-moving peers
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span>
            buy{' '}
            <CopyValue value={deal.buy}>
              <GpText amount={deal.buy} />
            </CopyValue>
          </span>
          <Icon name="arrow-right" size={11} className="opacity-40" />
          <span>
            sell{' '}
            <CopyValue value={deal.sell}>
              <GpText amount={deal.sell} />
            </CopyValue>
          </span>
          <span className="opacity-70">
            margin <GpText amount={deal.margin} signed />
          </span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} className="opacity-50" />
        </div>
      </div>
      {open && <DealDetail deal={deal} />}
    </div>
  );
}

/** Expanded evidence: overlay chart + all flagged pairs. Filled in by Task 9. */
function DealDetail({ deal }: { deal: DivergenceDeal }) {
  void deal;
  return null;
}

function DivergenceContent() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['divergence'],
    queryFn: fetchDivergence,
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.building || d.builtAt === null) ? 2_000 : 15 * 60_000;
    },
  });

  if (isPending) return <TableSkeleton rows={8} />;
  if (isError) {
    return (
      <div className="p-10 text-center text-osrs-red">
        Failed to load: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gold">Divergence</h1>
        <p className="mt-1 max-w-3xl text-sm opacity-70">
          Same-category items that historically move together, screened daily for one breaking
          away. Only pairs that prove co-movement (weekly-return correlation over 6 months) can
          signal; each deal shows how often that pair snapped back before. A spread can close
          from either side — the laggard rising <em>or</em> the leader falling back — so treat
          these as evidence, not advice. See the <Link to="/faq" className="text-gold underline">FAQ</Link>.
        </p>
      </header>

      {(data.building || data.builtAt === null) && (
        <div className="rounded border border-panel-border bg-panel px-3 py-2 text-sm opacity-70">
          Screening categories — {data.building?.done ?? 0}/{data.building?.total ?? '…'} price
          histories fetched…
        </div>
      )}

      {data.deals.length > 0 && (
        <section className="flex flex-col gap-2">
          {data.deals.map((deal) => (
            <DealCard key={`${deal.groupId}-${deal.itemId}`} deal={deal} />
          ))}
        </section>
      )}
      {data.deals.length === 0 && data.builtAt !== null && (
        <div className="rounded border border-panel-border bg-panel p-8 text-center text-sm opacity-60">
          No mismatches right now — most days everything tracks. Check back after the next
          screen (rebuilds twice a day).
        </div>
      )}

      <GroupsPanel groups={data.groups} />
    </div>
  );
}

/** Cohesion overview: why quiet groups are quiet. Filled in by Task 9. */
function GroupsPanel({ groups }: { groups: DivergenceResponse['groups'] }) {
  void groups;
  return null;
}

export default function DivergencePage() {
  const { entitlements } = useTier();
  if (!entitlements.divergence) return <LockedDivergence />;
  return <DivergenceContent />;
}
