import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatGpFull } from '@osrs-flip/shared';
import { useAppConfig, useItems } from '../lib/api';
import { computeAlchRows, computeDecantRows, ALCH_CASTS_PER_HOUR } from '../lib/tools';
import { useTier } from '../lib/tier';
import { GpText } from '../components/GpText';
import { ItemIcon } from '../components/ItemIcon';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';

type Tool = 'alch' | 'decant';

function TeaserStrip({ hidden, what }: { hidden: number; what: string }) {
  if (hidden <= 0) return null;
  return (
    <UnlockStrip>
      {hidden.toLocaleString('en-US')} more {what} with Premium.
    </UnlockStrip>
  );
}

const th = (right: boolean) =>
  `whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold ${right ? 'text-right' : 'text-left'}`;
const td = 'whitespace-nowrap px-3 py-1.5';

export default function ToolsPage() {
  const config = useAppConfig();
  const { data, isPending } = useItems(config.clientRefreshSeconds);
  const { entitlements } = useTier();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tool = (params.get('tool') as Tool) || 'alch';
  const [minVolume, setMinVolume] = useState(10);

  const alchRows = useMemo(
    () => (data && tool === 'alch' ? computeAlchRows(data.items, config).filter((r) => r.item.volume1h >= minVolume) : []),
    [data, config, tool, minVolume],
  );
  const decantRows = useMemo(
    () => (data && tool === 'decant' ? computeDecantRows(data.items, config).filter((r) => r.volume1h >= minVolume) : []),
    [data, config, tool, minVolume],
  );

  const visibleAlch = entitlements.alchRows === null ? alchRows : alchRows.slice(0, entitlements.alchRows);
  const visibleDecant = entitlements.decantRows === null ? decantRows : decantRows.slice(0, entitlements.decantRows);

  const toolButton = (value: Tool, label: string) => (
    <button
      onClick={() => setParams(value === 'alch' ? {} : { tool: value }, { replace: true })}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        tool === value ? 'bg-gold text-ink' : 'bg-panel-light text-parchment/70 hover:text-parchment'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gold">Money-making tools</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-70">
          Beyond flipping: profit routes computed from the same live prices.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {toolButton('alch', '🔮 High alchemy')}
        {toolButton('decant', '🧪 Decanting')}
        <label className="ml-auto flex items-center gap-2 text-xs">
          <span className="uppercase tracking-wide opacity-60">Min vol/1h</span>
          <input
            type="number"
            min={0}
            value={minVolume}
            onChange={(e) => setMinVolume(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 rounded border border-panel-border bg-ink px-2 py-1 text-right text-xs text-parchment outline-none focus:border-gold"
          />
        </label>
      </div>

      {isPending ? (
        <TableSkeleton rows={8} />
      ) : tool === 'alch' ? (
        <>
          <p className="text-xs opacity-50">
            profit = high alch − buy price − nature rune · gp/h assumes {ALCH_CASTS_PER_HOUR.toLocaleString('en-US')} casts
            (needs 55 Magic + fire runes or staff) · buy limits still apply
          </p>
          <section className="overflow-auto rounded border border-panel-border bg-panel">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="bg-panel-light">
                <tr>
                  <th className={th(false)}>Item</th>
                  <th className={th(true)}>Buy at</th>
                  <th className={th(true)}>High alch</th>
                  <th className={th(true)}>Profit/cast</th>
                  <th className={th(true)}>gp/hour</th>
                  <th className={th(true)}>Limit</th>
                  <th className={th(true)}>Vol/1h</th>
                </tr>
              </thead>
              <tbody>
                {visibleAlch.map((r) => (
                  <tr
                    key={r.item.id}
                    onClick={() => navigate(`/item/${r.item.id}`)}
                    className="cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
                  >
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={r.item.icon} name={r.item.name} />
                        {r.item.name}
                      </span>
                    </td>
                    <td className={`${td} text-right`}><GpText amount={r.buyAt} /></td>
                    <td className={`${td} text-right`}>
                      <span className="tabular-nums opacity-80">{formatGpFull(r.item.highalch!)}</span>
                    </td>
                    <td className={`${td} text-right`}><GpText amount={r.profitPerCast} signed /></td>
                    <td className={`${td} text-right`}><GpText amount={r.gpPerHour} signed /></td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {r.item.limit === null ? '—' : r.item.limit.toLocaleString('en-US')}
                    </td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {r.item.volume1h.toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleAlch.length === 0 && (
              <div className="p-10 text-center text-sm opacity-60">No alchable items at this volume floor.</div>
            )}
          </section>
          <TeaserStrip hidden={alchRows.length - visibleAlch.length} what="alchable items, ranked by profit" />
        </>
      ) : (
        <>
          <p className="text-xs opacity-50">
            doses are conserved when decanting — buy the cheap per-dose form, decant (Bob
            Barter in the GE does it free), sell the expensive form · margin shown after tax
          </p>
          <section className="overflow-auto rounded border border-panel-border bg-panel">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-panel-light">
                <tr>
                  <th className={th(false)}>Potion</th>
                  <th className={th(true)}>Buy</th>
                  <th className={th(true)}>Sell as</th>
                  <th className={th(true)}>Margin/dose</th>
                  <th className={th(true)}>Per 4-dose</th>
                  <th className={th(true)}>Vol/1h (min side)</th>
                </tr>
              </thead>
              <tbody>
                {visibleDecant.map((r) => (
                  <tr key={r.family} className="border-t border-panel-border/50">
                    <td className={td}>{r.family}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      ({r.buyDoses}) @ <GpText amount={r.buyAt} />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      ({r.sellDoses}) @ <GpText amount={r.sellAt} />
                    </td>
                    <td className={`${td} text-right`}>
                      <GpText amount={Math.round(r.marginPerDose * 100) / 100} signed />
                    </td>
                    <td className={`${td} text-right`}><GpText amount={Math.round(r.marginPer4)} signed /></td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {r.volume1h.toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleDecant.length === 0 && (
              <div className="p-10 text-center text-sm opacity-60">No decantable families at this volume floor.</div>
            )}
          </section>
          <TeaserStrip hidden={decantRows.length - visibleDecant.length} what="potion families, ranked by margin" />
        </>
      )}
    </div>
  );
}
