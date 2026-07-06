import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { Icon } from './Icon';

/**
 * Wraps a displayed value in a click-to-copy button. Copies the RAW integer
 * (not the compact "1.5m" label) so it pastes straight into the in-game GE
 * offer box. Stops click propagation so copying inside a clickable row/card
 * doesn't also trigger navigation. When there's nothing to copy it renders the
 * children plainly (no button), so callers can wrap nullable values freely.
 */
export function CopyValue({
  value,
  children,
  className = '',
  gpLabel = true,
}: {
  value: number | null | undefined;
  children: React.ReactNode;
  className?: string;
  /** Append " gp" to the hover title — turn off for non-price counts. */
  gpLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (value === null || value === undefined) return <>{children}</>;

  const amount = Math.round(value);
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (await copyText(String(amount))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Copy ${amount.toLocaleString('en-US')}${gpLabel ? ' gp' : ''}`}
      className={`group/copy inline-flex items-center gap-1 ${className}`}
    >
      {children}
      <Icon
        name={copied ? 'check' : 'copy'}
        size={11}
        className={`shrink-0 transition-opacity ${
          copied ? 'text-osrs-green opacity-100' : 'opacity-0 group-hover/copy:opacity-60'
        }`}
      />
    </button>
  );
}
