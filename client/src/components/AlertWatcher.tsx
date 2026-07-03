import { useEffect } from 'react';
import { useAppConfig, useItems } from '../lib/api';
import { buildRows, type FlipRow } from '../lib/rows';
import { evaluateAlerts, notify, useAlerts } from '../lib/alerts';

/**
 * Mounted once in App: re-evaluates armed alerts against every items refresh
 * (TanStack Query dedupes the fetch with whatever page is open) and fires
 * browser notifications. One-shot: fired alerts stay quiet until re-armed.
 */
export function AlertWatcher() {
  const config = useAppConfig();
  const { alerts, markFired } = useAlerts();
  const { data } = useItems(config.clientRefreshSeconds);

  useEffect(() => {
    if (!data || alerts.length === 0) return;
    const watchedIds = new Set(alerts.map((a) => a.itemId));
    const rows = buildRows(
      data.items.filter((i) => watchedIds.has(i.id)),
      config,
      Math.floor(Date.now() / 1000),
    );
    const byId = new Map<number, FlipRow>(rows.map((r) => [r.id, r]));
    const fired = evaluateAlerts(alerts, byId);
    if (fired.length > 0) {
      fired.forEach(notify);
      markFired(fired.map((f) => f.id));
    }
  }, [data, alerts, config, markFired]);

  return null;
}
