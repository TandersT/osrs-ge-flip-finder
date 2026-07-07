import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatGpFull } from '@osrs-flip/shared';
import { useAppConfig, useItems } from '../lib/api';
import {
  computeAlchRows,
  computeDecantRows,
  computeMethodRows,
  computeSetRows,
  ALCH_CASTS_PER_HOUR,
  type ResolvedSet,
} from '../lib/tools';
import { useCharacter } from '../lib/character';
import { useTier } from '../lib/tier';
import { CopyValue } from '../components/CopyValue';
import { GpText } from '../components/GpText';
import { Icon, type IconName } from '../components/Icon';
import { ItemIcon } from '../components/ItemIcon';
import { SetBreakdownDialog } from '../components/SetBreakdownDialog';
import { TableSkeleton } from '../components/Skeleton';
import { UnlockStrip } from '../components/UnlockStrip';

type Tool = 'alch' | 'decant' | 'sets' | 'methods';

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

const INTENSITY_BADGE = {
  low: ['AFK', 'bg-emerald-900/60 text-emerald-300'],
  medium: ['semi-AFK', 'bg-amber-900/50 text-amber-300'],
  high: ['click-heavy', 'bg-red-900/50 text-red-300'],
} as const;

/** Import an OSRS character from the official hiscores to gate methods by level. */
function CharacterImport() {
  const { character, importCharacter, clear } = useCharacter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (name.trim() === '') return;
    setBusy(true);
    setError(null);
    setError(await importCharacter(name));
    setBusy(false);
    setName('');
  };

  if (character) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="rounded bg-panel-light px-2 py-1">
          <Icon name="sword" className="mr-1" />
          <span className="font-medium text-gold">{character.name}</span>
          <span className="ml-1 opacity-60">
            (Herb {character.levels.Herblore ?? 1} · Craft {character.levels.Crafting ?? 1} ·
            Magic {character.levels.Magic ?? 1})
          </span>
        </span>
        <button
          onClick={clear}
          className="text-parchment/40 hover:text-osrs-red"
          title="Forget character"
          aria-label="Forget character"
        >
          <Icon name="close" size={12} />
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <input
        type="text"
        value={name}
        maxLength={12}
        placeholder="Your RSN…"
        aria-label="RuneScape name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void run()}
        className="w-32 rounded border border-panel-border bg-ink px-2 py-1 text-xs text-parchment outline-none focus:border-gold"
      />
      <button
        onClick={() => void run()}
        disabled={busy || name.trim() === ''}
        className="rounded bg-gold px-2.5 py-1 text-xs font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-30"
      >
        {busy ? 'Importing…' : 'Import character'}
      </button>
      {error && <span className="text-osrs-red">{error}</span>}
    </span>
  );
}

export default function ToolsPage() {
  const config = useAppConfig();
  const { data, isPending } = useItems(config.clientRefreshSeconds);
  const { entitlements } = useTier();
  const { character } = useCharacter();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tool = (params.get('tool') as Tool) || 'alch';
  const [minVolume, setMinVolume] = useState(10);
  const [onlyMine, setOnlyMine] = useState(false);
  const [geOnly, setGeOnly] = useState(true);
  const [f2pOnly, setF2pOnly] = useState(false);
  const [category, setCategory] = useState('all');
  const [viaFilter, setViaFilter] = useState('all');
  const [openSet, setOpenSet] = useState<ResolvedSet | null>(null);

  const alchRows = useMemo(
    () => (data && tool === 'alch' ? computeAlchRows(data.items, config).filter((r) => r.item.volume1h >= minVolume) : []),
    [data, config, tool, minVolume],
  );
  const decantRows = useMemo(
    () => (data && tool === 'decant' ? computeDecantRows(data.items, config).filter((r) => r.volume1h >= minVolume) : []),
    [data, config, tool, minVolume],
  );
  const setRows = useMemo(() => {
    if (!data || tool !== 'sets') return [];
    return computeSetRows(data.items, config).filter(
      (r) => r.volume1h >= minVolume && (viaFilter === 'all' || r.via === viaFilter),
    );
  }, [data, config, tool, minVolume, viaFilter]);
  const methodRows = useMemo(() => {
    if (!data || tool !== 'methods') return [];
    let rows = computeMethodRows(data.items, config, character?.levels).filter(
      (r) => r.volume1h >= minVolume,
    );
    if (geOnly) rows = rows.filter((r) => r.def.atGE);
    if (f2pOnly) rows = rows.filter((r) => !r.def.members);
    if (category !== 'all') rows = rows.filter((r) => r.def.category === category);
    if (onlyMine && character) rows = rows.filter((r) => r.meetsReqs);
    return rows;
  }, [data, config, tool, minVolume, character, onlyMine, geOnly, f2pOnly, category]);

  const visibleAlch = entitlements.alchRows === null ? alchRows : alchRows.slice(0, entitlements.alchRows);
  const visibleDecant = entitlements.decantRows === null ? decantRows : decantRows.slice(0, entitlements.decantRows);
  const visibleSets = entitlements.setRows === null ? setRows : setRows.slice(0, entitlements.setRows);
  const visibleMethods = entitlements.methodRows === null ? methodRows : methodRows.slice(0, entitlements.methodRows);

  const toolButton = (value: Tool, label: string, icon: IconName) => (
    <button
      onClick={() => setParams(value === 'alch' ? {} : { tool: value }, { replace: true })}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        tool === value ? 'bg-gold text-ink' : 'bg-panel-light text-parchment/70 hover:text-parchment'
      }`}
    >
      <Icon name={icon} className="mr-1.5" />
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
        {toolButton('alch', 'High alchemy', 'sparkle')}
        {toolButton('decant', 'Decanting', 'flask')}
        {toolButton('sets', 'Combining', 'shield')}
        {toolButton('methods', 'AFK methods', 'moon')}
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
      ) : tool === 'decant' ? (
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
      ) : tool === 'sets' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="uppercase tracking-wide opacity-60">Via</span>
              <select
                value={viaFilter}
                onChange={(e) => setViaFilter(e.target.value)}
                className="rounded border border-panel-border bg-ink px-2 py-1 text-xs text-parchment outline-none focus:border-gold"
              >
                <option value="all">All</option>
                <option value="GE clerk">GE clerk (sets)</option>
                <option value="inventory">Inventory (combos)</option>
              </select>
            </label>
          </div>
          <p className="text-xs opacity-50">
            everything here is doable without leaving the GE: clerks exchange armour sets
            (right-click “Sets”), godswords assemble/dismantle with an inventory click ·
            margins shown after tax · throughput bound by the least liquid leg
          </p>
          <section className="overflow-auto rounded border border-panel-border bg-panel">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead className="bg-panel-light">
                <tr>
                  <th className={th(false)}>Set / combo</th>
                  <th className={th(false)}>Via</th>
                  <th className={th(false)}>Best move</th>
                  <th className={th(true)}>Set (buy → sell)</th>
                  <th className={th(true)}>Pieces (buy → sell)</th>
                  <th className={th(true)}>Combine margin</th>
                  <th className={th(true)}>Split margin</th>
                  <th className={th(true)}># Pieces</th>
                  <th className={th(true)}>Vol/1h (min leg)</th>
                </tr>
              </thead>
              <tbody>
                {visibleSets.map((r) => (
                  <tr
                    key={r.def.setId}
                    onClick={() => navigate(`/item/${r.def.setId}`)}
                    className="cursor-pointer border-t border-panel-border/50 hover:bg-panel-light"
                  >
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={r.set.icon} name={r.set.name} />
                        {r.set.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSet({ def: r.def, via: r.via });
                          }}
                          title="View set pieces"
                          className="text-parchment/40 hover:text-gold"
                        >
                          <Icon name="shield" size={13} />
                        </button>
                      </span>
                    </td>
                    <td className={td}>
                      <span className="rounded bg-panel-light px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
                        {r.via}
                      </span>
                    </td>
                    <td className={td}>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                          r.best === 'combine'
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : 'bg-sky-900/60 text-sky-300'
                        }`}
                        title={
                          r.best === 'combine'
                            ? 'Buy the pieces, exchange to a set, sell the set'
                            : 'Buy the set, exchange to pieces, sell the pieces'
                        }
                      >
                        {r.best}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CopyValue value={r.setBuy}><GpText amount={r.setBuy} /></CopyValue>
                        <Icon name="arrow-right" size={11} className="opacity-40" />
                        <CopyValue value={r.setSell}><GpText amount={r.setSell} /></CopyValue>
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CopyValue value={r.piecesBuyTotal}><GpText amount={r.piecesBuyTotal} /></CopyValue>
                        <Icon name="arrow-right" size={11} className="opacity-40" />
                        <CopyValue value={r.piecesSellTotal}><GpText amount={r.piecesSellTotal} /></CopyValue>
                      </span>
                    </td>
                    <td className={`${td} text-right`}><GpText amount={r.combineMargin} signed /></td>
                    <td className={`${td} text-right`}><GpText amount={r.splitMargin} signed /></td>
                    <td className={`${td} text-right tabular-nums opacity-70`}>{r.def.pieces.length}</td>
                    <td className={`${td} text-right tabular-nums opacity-80`}>
                      {r.volume1h.toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleSets.length === 0 && (
              <div className="p-10 text-center text-sm opacity-60">No priced sets at this volume floor.</div>
            )}
          </section>
          <TeaserStrip hidden={setRows.length - visibleSets.length} what="combinables, ranked by margin" />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CharacterImport />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs" title="Only methods doable standing at the Grand Exchange (inventory actions, no ranges/furnaces/NPC runs)">
              <input
                type="checkbox"
                checked={geOnly}
                onChange={(e) => setGeOnly(e.target.checked)}
                className="accent-gold"
              />
              <span>GE-only (bankstand)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs" title="Only methods usable on free-to-play worlds">
              <input
                type="checkbox"
                checked={f2pOnly}
                onChange={(e) => setF2pOnly(e.target.checked)}
                className="accent-gold"
              />
              <span>F2P only</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="uppercase tracking-wide opacity-60">Skill</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded border border-panel-border bg-ink px-2 py-1 text-xs text-parchment outline-none focus:border-gold"
              >
                <option value="all">All</option>
                <option value="Herblore">Herblore</option>
                <option value="Cooking">Cooking</option>
                <option value="Fletching">Fletching</option>
                <option value="Crafting">Crafting</option>
                <option value="Smithing">Smithing</option>
                <option value="Magic">Magic</option>
                <option value="No skill">No skill</option>
              </select>
            </label>
            {character && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                  className="accent-gold"
                />
                <span>Only methods I can do</span>
              </label>
            )}
          </div>
          <p className="text-xs opacity-50">
            buy inputs on the GE, apply a skill, sell outputs — profit is live, post-tax ·
            rates are wiki-guide estimates · GE-only shows pure bankstand methods · import
            your character to check requirements
          </p>
          <section className="overflow-auto rounded border border-panel-border bg-panel">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="bg-panel-light">
                <tr>
                  <th className={th(false)}>Method</th>
                  <th className={th(false)}>Needs</th>
                  <th className={th(false)}>Attention</th>
                  <th className={th(true)}>Cost/action</th>
                  <th className={th(true)}>Profit/action</th>
                  <th className={th(true)}>gp/hour</th>
                  <th className={th(true)}>Vol/1h (min)</th>
                </tr>
              </thead>
              <tbody>
                {visibleMethods.map((r) => {
                  const [label, badgeCls] = INTENSITY_BADGE[r.def.intensity];
                  return (
                    <tr key={r.def.id} className="border-t border-panel-border/50" title={r.def.notes}>
                      <td className={td}>
                        {r.def.name}
                        <span className="ml-2 rounded bg-panel-light px-1 text-[10px] uppercase tracking-wide opacity-60">
                          {r.def.category}
                        </span>
                        {!r.def.members && (
                          <span className="ml-1 rounded bg-sky-900/60 px-1 text-[10px] uppercase tracking-wide text-sky-300" title="Usable on free-to-play worlds">
                            F2P
                          </span>
                        )}
                        {r.def.atGE && !geOnly && (
                          <span className="ml-1 rounded bg-gold/20 px-1 text-[10px] uppercase tracking-wide text-gold" title="Doable standing at the Grand Exchange">
                            GE
                          </span>
                        )}
                      </td>
                      <td className={td}>
                        {r.def.requirements.length === 0 ? (
                          <span className="opacity-40">—</span>
                        ) : (
                          r.def.requirements.map((req) => (
                            <span
                              key={req.skill}
                              className={`mr-1 rounded px-1.5 py-0.5 text-[10px] ${
                                r.meetsReqs === null
                                  ? 'bg-panel-light text-parchment/70'
                                  : r.meetsReqs
                                    ? 'bg-emerald-900/60 text-emerald-300'
                                    : 'bg-red-900/50 text-red-300'
                              }`}
                            >
                              {req.skill} {req.level}
                            </span>
                          ))
                        )}
                      </td>
                      <td className={td}>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badgeCls}`}>
                          {label}
                        </span>
                      </td>
                      <td className={`${td} text-right`}><GpText amount={Math.round(r.costPerAction)} /></td>
                      <td className={`${td} text-right`}><GpText amount={Math.round(r.profitPerAction)} signed /></td>
                      <td className={`${td} text-right`}><GpText amount={Math.round(r.gpPerHour)} signed /></td>
                      <td className={`${td} text-right tabular-nums opacity-80`}>
                        {r.volume1h.toLocaleString('en-US')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleMethods.length === 0 && (
              <div className="p-10 text-center text-sm opacity-60">
                {onlyMine
                  ? 'No methods match your levels at this volume floor.'
                  : 'No methods at this volume floor.'}
              </div>
            )}
          </section>
          <TeaserStrip hidden={methodRows.length - visibleMethods.length} what="methods, ranked by gp/hour" />
        </>
      )}
      <SetBreakdownDialog
        set={openSet}
        items={data?.items ?? []}
        config={config}
        onClose={() => setOpenSet(null)}
      />
    </div>
  );
}
