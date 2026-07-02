import { useState } from 'react';
import { breakEvenSell, formatGpFull, geTax } from '@osrs-flip/shared';

/** Interactive demo of the tax rules for the FAQ. */
export function TaxCalculator() {
  const [price, setPrice] = useState(1_000);
  const [exempt, setExempt] = useState(false);

  const tax = geTax(exempt, price);
  const net = price - tax;
  const effective = price > 0 ? (tax / price) * 100 : 0;

  return (
    <div className="rounded border border-gold/30 bg-panel-light/50 p-4">
      <div className="mb-3 text-sm font-medium text-gold">Try it — what does a sale cost?</div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide opacity-60">Sell price (per item)</span>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="w-40 rounded border border-panel-border bg-ink px-2 py-1.5 text-sm text-parchment outline-none focus:border-gold"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs">
          <input
            type="checkbox"
            checked={exempt}
            onChange={(e) => setExempt(e.target.checked)}
            className="accent-gold"
          />
          <span>Tax-exempt item</span>
        </label>
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="opacity-60">Tax</dt>
          <dd className="tabular-nums text-osrs-red">{formatGpFull(tax)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="opacity-60">You receive</dt>
          <dd className="tabular-nums text-osrs-green">{formatGpFull(net)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="opacity-60">Effective rate</dt>
          <dd className="tabular-nums">{effective.toFixed(2)}%</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs opacity-50">
        To break even after buying at this price you&apos;d need to sell at{' '}
        {formatGpFull(breakEvenSell(exempt, price))}.
      </p>
    </div>
  );
}
