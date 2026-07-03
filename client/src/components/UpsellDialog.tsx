import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/** Small modal shown when a free-tier limit is hit. Never blocks reading — only adding. */
export function UpsellDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-sm rounded border border-gold/40 bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-bold text-gold">⭐ {title}</div>
        <div className="mb-4 text-sm opacity-80">{children}</div>
        <div className="flex gap-2">
          <Link
            to="/premium"
            onClick={onClose}
            className="flex-1 rounded bg-gold px-3 py-2 text-center text-sm font-semibold text-ink hover:brightness-110"
          >
            See Premium
          </Link>
          <button
            onClick={onClose}
            className="rounded border border-panel-border px-3 py-2 text-sm text-parchment/70 hover:text-parchment"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
