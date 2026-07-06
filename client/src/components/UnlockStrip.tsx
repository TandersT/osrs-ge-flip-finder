import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/** Teaser CTA under a partially-visible premium feature. */
export function UnlockStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gold/40 bg-panel px-4 py-3">
      <span className="text-sm opacity-80">
        <Icon name="lock" className="mr-1" /> {children}
      </span>
      <Link
        to="/premium"
        className="rounded bg-gold px-3 py-1.5 text-sm font-semibold text-ink hover:brightness-110"
      >
        Unlock with Premium
      </Link>
    </div>
  );
}
