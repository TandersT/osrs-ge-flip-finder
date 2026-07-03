import { useCallback, useSyncExternalStore } from 'react';
import type { FlipRow } from './rows';

export type AlertMetric = 'margin' | 'buy' | 'sell';
export type AlertOp = 'gte' | 'lte';

export interface PriceAlert {
  id: string;
  itemId: number;
  itemName: string;
  icon: string | null;
  metric: AlertMetric;
  op: AlertOp;
  threshold: number;
  createdAt: number;
  /** One-shot: set when the alert fires; re-arm clears it. */
  firedAt: number | null;
}

export const METRIC_LABEL: Record<AlertMetric, string> = {
  margin: 'post-tax margin',
  buy: 'buy price',
  sell: 'sell price',
};

export function metricValue(row: FlipRow, metric: AlertMetric): number | null {
  if (row.flip === null) return null;
  if (metric === 'margin') return row.flip.marginPerItem;
  if (metric === 'buy') return row.flip.buyAt;
  return row.flip.sellAt;
}

function conditionMet(alert: PriceAlert, value: number): boolean {
  return alert.op === 'gte' ? value >= alert.threshold : value <= alert.threshold;
}

/** Armed alerts whose condition holds against the given rows. */
export function evaluateAlerts(alerts: PriceAlert[], rows: Map<number, FlipRow>): PriceAlert[] {
  const fired: PriceAlert[] = [];
  for (const alert of alerts) {
    if (alert.firedAt !== null) continue; // one-shot until re-armed
    const row = rows.get(alert.itemId);
    if (!row) continue;
    const value = metricValue(row, alert.metric);
    if (value !== null && conditionMet(alert, value)) fired.push(alert);
  }
  return fired;
}

export function describeAlert(a: PriceAlert): string {
  return `${a.itemName}: ${METRIC_LABEL[a.metric]} ${a.op === 'gte' ? '≥' : '≤'} ${a.threshold.toLocaleString('en-US')} gp`;
}

const KEY = 'geff:alerts:v1';
const listeners = new Set<() => void>();

function load(): PriceAlert[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (a): a is PriceAlert =>
            typeof a === 'object' && a !== null && typeof (a as PriceAlert).threshold === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

let alerts: PriceAlert[] = load();

function persist(next: PriceAlert[]): void {
  alerts = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts));
  } catch {
    // storage blocked: keep the in-memory list working
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAlerts() {
  const list = useSyncExternalStore(subscribe, () => alerts);
  const add = useCallback((alert: Omit<PriceAlert, 'id' | 'createdAt' | 'firedAt'>) => {
    persist([
      { ...alert, id: crypto.randomUUID(), createdAt: Math.floor(Date.now() / 1000), firedAt: null },
      ...alerts,
    ]);
  }, []);
  const remove = useCallback((id: string) => {
    persist(alerts.filter((a) => a.id !== id));
  }, []);
  const rearm = useCallback((id: string) => {
    persist(alerts.map((a) => (a.id === id ? { ...a, firedAt: null } : a)));
  }, []);
  const markFired = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const now = Math.floor(Date.now() / 1000);
    persist(alerts.map((a) => (ids.includes(a.id) ? { ...a, firedAt: now } : a)));
  }, []);
  return { alerts: list, add, remove, rearm, markFired };
}

/** Ask once, lazily, when the user creates their first alert. */
export function requestNotifyPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function notify(alert: PriceAlert): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('GE Flip Finder', { body: describeAlert(alert), icon: '/icons/icon-192.png' });
  }
}
