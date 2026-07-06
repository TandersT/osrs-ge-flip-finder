import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { UpcomingFeature, UpcomingResponse } from '@osrs-flip/shared';
import { Pct } from '../pages/PatchesPage';
import { GpText } from './GpText';
import { ItemIcon } from './ItemIcon';

async function fetchUpcoming(): Promise<UpcomingResponse> {
  const res = await fetch('/api/patches/upcoming');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<UpcomingResponse>;
}

function EvidenceLine({ feature }: { feature: UpcomingFeature }) {
  const e = feature.evidence;
  if (e === null) {
    return (
      <p className="text-xs opacity-60">Not enough similar past updates to summarise honestly.</p>
    );
  }
  return (
    <p className="text-xs opacity-80">
      In the {feature.analogues.length} most similar past updates, mentioned items moved a median
      of <Pct value={e.median7} /> over 7 days (middle half <Pct value={e.iqrLow7} />…
      <Pct value={e.iqrHigh7} />; {Math.round(e.pctPositive * 100)}% rose; n={e.sampleSize}).
    </p>
  );
}

function FeatureCard({ feature }: { feature: UpcomingFeature }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-panel-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://oldschool.runescape.wiki/w/Upcoming_updates#${feature.anchor}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-parchment hover:text-gold"
        >
          {feature.title}
        </a>
        {feature.tags.map((t) => (
          <span
            key={t}
            className="rounded bg-panel-light px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-parchment/70"
          >
            {t}
          </span>
        ))}
      </div>

      {feature.note !== null && <p className="text-xs italic opacity-80">{feature.note}</p>}
      <EvidenceLine feature={feature} />

      <ul className="flex flex-col gap-1">
        {feature.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Link to={`/item/${item.id}`} className="flex items-center gap-2 hover:text-gold">
              <ItemIcon icon={item.icon} name={item.name} size={20} />
              {item.name}
            </Link>
            <GpText amount={item.price === null ? null : Math.round(item.price)} />
            {item.history.length > 0 && (
              <span className="text-xs opacity-80">
                past mentions:{' '}
                {item.history.map((h, i) => (
                  <span key={h.pageid} title={`${h.title} (${h.date})`}>
                    {i > 0 && ' · '}
                    <Pct value={h.change7} />
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Items to watch": announced future content + measured historical evidence. */
export function UpcomingFeatures() {
  const { data } = useQuery({
    queryKey: ['patches-upcoming'],
    queryFn: fetchUpcoming,
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 5_000 : 30 * 60_000),
  });

  if (!data || data.status === 'building') return null; // page-level progress bar covers this
  if (data.features.length === 0) {
    return (
      <p className="text-sm opacity-60">
        No announced upcoming content currently mentions tradeable items.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gold">
        Upcoming — items to watch
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.features.map((f) => (
          <FeatureCard key={f.anchor} feature={f} />
        ))}
      </div>
    </section>
  );
}
