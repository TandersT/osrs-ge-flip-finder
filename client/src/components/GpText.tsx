import { formatGpCompact, formatGpFull, gpTier } from '@osrs-flip/shared';

const TIER_CLASS = {
  yellow: 'text-osrs-yellow',
  white: 'text-white',
  green: 'text-osrs-green',
} as const;

/** RuneScape-coloured gp amount; negative values render red. */
export function GpText({ amount, signed = false }: { amount: number | null; signed?: boolean }) {
  if (amount === null) return <span className="opacity-40">—</span>;
  const cls = amount < 0 ? 'text-osrs-red' : TIER_CLASS[gpTier(amount)];
  const prefix = signed && amount > 0 ? '+' : '';
  return (
    <span className={`${cls} tabular-nums`} title={formatGpFull(amount)}>
      {prefix}
      {formatGpCompact(amount)}
    </span>
  );
}
