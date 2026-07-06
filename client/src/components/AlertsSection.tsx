import { Link } from 'react-router-dom';
import { describeAlert, useAlerts } from '../lib/alerts';
import { Icon } from './Icon';
import { ItemIcon } from './ItemIcon';

/** Active price alerts — shown on the watchlist page; created from item pages. */
export function AlertsSection() {
  const { alerts, remove, rearm } = useAlerts();
  if (alerts.length === 0) return null;

  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="rounded border border-panel-border bg-panel">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gold">
        <Icon name="bell" className="mr-1" /> Price alerts
      </div>
      <ul>
        {alerts.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-2 border-t border-panel-border/50 px-3 py-2 text-sm"
          >
            <Link to={`/item/${a.itemId}`} className="flex items-center gap-2 hover:text-gold">
              <ItemIcon icon={a.icon} name={a.itemName} size={20} />
            </Link>
            <span className="flex-1">{describeAlert(a)}</span>
            {a.firedAt === null ? (
              <span className="text-xs text-osrs-green">armed</span>
            ) : (
              <>
                <span className="text-xs text-gold">
                  fired {timeFmt.format(new Date(a.firedAt * 1000))}
                </span>
                <button
                  onClick={() => rearm(a.id)}
                  className="rounded border border-panel-border px-2 py-0.5 text-xs hover:border-gold hover:text-gold"
                >
                  Re-arm
                </button>
              </>
            )}
            <button
              onClick={() => remove(a.id)}
              title="Delete alert"
              aria-label="Delete alert"
              className="px-1 text-parchment/30 hover:text-osrs-red"
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
