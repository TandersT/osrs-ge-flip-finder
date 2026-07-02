import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'geff:intro-dismissed:v1';

/** One-time pointer to the guide/FAQ for first-time visitors. */
export function NewUserBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return true;
    }
  });
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // storage blocked: banner just returns next visit
    }
  };

  return (
    <div className="flex items-center gap-3 rounded border border-gold/40 bg-panel px-3 py-2 text-sm">
      <span className="text-lg">👋</span>
      <span className="flex-1">
        New to flipping? The{' '}
        <Link to="/starter" className="font-medium text-gold underline">
          Get Started guide
        </Link>{' '}
        finds safe flips sized to your budget — even a tiny one. The{' '}
        <Link to="/faq" className="font-medium text-gold underline">
          FAQ
        </Link>{' '}
        explains every number on this page.
      </span>
      <button
        onClick={dismiss}
        title="Dismiss"
        className="rounded px-2 py-1 text-parchment/50 hover:text-parchment"
      >
        ✕
      </button>
    </div>
  );
}
