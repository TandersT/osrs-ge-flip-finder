/**
 * RuneScape-style gp formatting.
 * Compact: below 100k full digits ("12,345"), 100k–<1m as "350k",
 * 1m–<10m as "1.2m", >=10m as "12m"/"1.2b".
 */
export function formatGpCompact(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs < 100_000) return sign + abs.toLocaleString('en-US');
  if (abs < 1_000_000) return `${sign}${Math.round(abs / 1_000)}k`;
  if (abs < 10_000_000) return `${sign}${trimZero((abs / 1_000_000).toFixed(1))}m`;
  if (abs < 1_000_000_000) return `${sign}${Math.round(abs / 1_000_000)}m`;
  return `${sign}${trimZero((abs / 1_000_000_000).toFixed(1))}b`;
}

/** Full form with separators: "12,345 gp". */
export function formatGpFull(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${Math.abs(amount).toLocaleString('en-US')} gp`;
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export type GpTier = 'yellow' | 'white' | 'green';

/** RuneScape value colours: yellow < 100k, white 100k–<10m, green >= 10m. */
export function gpTier(amount: number): GpTier {
  const abs = Math.abs(amount);
  if (abs < 100_000) return 'yellow';
  if (abs < 10_000_000) return 'white';
  return 'green';
}

/** Wiki icon URL for an /mapping icon filename (spaces -> underscores). */
export function iconUrl(iconFilename: string | null): string | null {
  if (!iconFilename) return null;
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(
    iconFilename.replaceAll(' ', '_'),
  )}`;
}

/** "3m ago" style age string for unix-second timestamps. */
export function formatAge(unixSeconds: number | null, nowMs: number): string {
  if (unixSeconds === null) return '—';
  const seconds = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
