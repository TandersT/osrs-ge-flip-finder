import { useCallback, useSyncExternalStore } from 'react';
import { DEV_UNLOCK_CODE, getEntitlements, type Entitlements, type Tier } from '@osrs-flip/shared';

/**
 * Local tier store. Until the payment service exists (docs/payments-plan.md),
 * "premium" is a local flag redeemable with the dev code — the server is not
 * involved and nothing of value is gated behind it server-side.
 */
const KEY = 'geff:tier:v1';
const listeners = new Set<() => void>();

function load(): Tier {
  try {
    return localStorage.getItem(KEY) === 'premium' ? 'premium' : 'free';
  } catch {
    return 'free';
  }
}

let tier: Tier = load();

function persist(next: Tier): void {
  tier = next;
  try {
    if (next === 'premium') localStorage.setItem(KEY, 'premium');
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: in-memory tier still works this session
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTier(): {
  tier: Tier;
  entitlements: Entitlements;
  redeem: (code: string) => boolean;
  downgrade: () => void;
} {
  const current = useSyncExternalStore(subscribe, () => tier);
  const redeem = useCallback((code: string) => {
    if (code.trim().toUpperCase() === DEV_UNLOCK_CODE) {
      persist('premium');
      return true;
    }
    return false;
  }, []);
  const downgrade = useCallback(() => persist('free'), []);
  return { tier: current, entitlements: getEntitlements(current), redeem, downgrade };
}
