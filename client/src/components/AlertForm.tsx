import { useState } from 'react';
import type { ItemSnapshot } from '@osrs-flip/shared';
import { atLimit } from '@osrs-flip/shared';
import { requestNotifyPermission, useAlerts, type AlertMetric, type AlertOp } from '../lib/alerts';
import { useTier } from '../lib/tier';
import { Icon } from './Icon';
import { UpsellDialog } from './UpsellDialog';

/** Inline "Set alert" control for an item page's flip panel. */
export function AlertForm({ item, defaultThreshold }: { item: ItemSnapshot; defaultThreshold: number | null }) {
  const { alerts, add } = useAlerts();
  const { entitlements } = useTier();
  const [open, setOpen] = useState(false);
  const [upsell, setUpsell] = useState(false);
  const [metric, setMetric] = useState<AlertMetric>('margin');
  const [op, setOp] = useState<AlertOp>('gte');
  const [threshold, setThreshold] = useState<number | ''>(defaultThreshold ?? '');
  const [added, setAdded] = useState(false);

  const openForm = () => {
    if (atLimit(alerts.length, entitlements.alertsMax)) {
      setUpsell(true);
      return;
    }
    setOpen(true);
  };

  const submit = () => {
    if (threshold === '') return;
    requestNotifyPermission();
    add({ itemId: item.id, itemName: item.name, icon: item.icon, metric, op, threshold });
    setOpen(false);
    setAdded(true);
  };

  const selectCls =
    'rounded border border-panel-border bg-ink px-1.5 py-1 text-xs text-parchment outline-none focus:border-gold';

  return (
    <div className="pt-2">
      {!open ? (
        <button
          onClick={openForm}
          className="w-full rounded border border-panel-border px-3 py-1.5 text-center text-sm hover:border-gold hover:text-gold"
        >
          <Icon name="bell" className="mr-1" /> {added ? 'Alert set — add another' : 'Set price alert'}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-panel-border p-2">
          <select value={metric} onChange={(e) => setMetric(e.target.value as AlertMetric)} className={selectCls} aria-label="Alert metric">
            <option value="margin">Margin</option>
            <option value="buy">Buy price</option>
            <option value="sell">Sell price</option>
          </select>
          <select value={op} onChange={(e) => setOp(e.target.value as AlertOp)} className={selectCls} aria-label="Alert condition">
            <option value="gte">≥</option>
            <option value="lte">≤</option>
          </select>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-24 rounded border border-panel-border bg-ink px-1.5 py-1 text-right text-xs text-parchment outline-none focus:border-gold"
            aria-label="Alert threshold in gp"
          />
          <button
            onClick={submit}
            disabled={threshold === ''}
            className="rounded bg-gold px-2.5 py-1 text-xs font-semibold text-ink enabled:hover:brightness-110 disabled:opacity-30"
          >
            Arm
          </button>
          <button onClick={() => setOpen(false)} className="px-1 text-xs text-parchment/50 hover:text-parchment">
            cancel
          </button>
          <span className="w-full text-[11px] opacity-50">
            Fires a browser notification while the site is open. Manage alerts on the Watchlist page.
          </span>
        </div>
      )}
      <UpsellDialog open={upsell} onClose={() => setUpsell(false)} title="Alert limit reached">
        The free tier keeps {entitlements.alertsMax} alert armed. Premium watches as many
        prices as you like.
      </UpsellDialog>
    </div>
  );
}
