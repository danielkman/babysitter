/**
 * AlertBanner (SPEC §4/§5, AC6): top-center banner shown while approvals are
 * pending, with inline Approve/Deny for the most recent alert. Hidden (not
 * rendered) when no alerts exist — the e2e suite asserts visibility both ways.
 * Kept compact and high so it never overlaps map interaction scan lines.
 */

import { useStore } from 'zustand';

import type { CommanderStore, Orders } from '../../game/store';

export interface AlertBannerProps {
  store: CommanderStore;
  orders: Orders;
}

export function AlertBanner({ store, orders }: AlertBannerProps): React.JSX.Element | null {
  const alerts = useStore(store, (s) => s.alerts);
  const units = useStore(store, (s) => s.world.units);
  const latest = alerts[alerts.length - 1];
  if (latest === undefined) return null;

  const unitTitle = units[latest.unitId]?.view.title ?? latest.unitId;
  const action = typeof latest.payload['action'] === 'string' ? latest.payload['action'] : latest.kind;

  return (
    <div className="wr-alert-banner" data-testid="alert-banner" role="alert">
      <span className="wr-alert-count">{alerts.length}</span>
      <span className="wr-alert-text">
        <strong>{unitTitle}</strong> wants to {action}
      </span>
      <span className="wr-alert-actions">
        <button
          type="button"
          className="wr-alert-btn wr-alert-btn--approve"
          onClick={() => orders.decide(latest.hookRequestId, 'allow')}
        >
          Approve
        </button>
        <button
          type="button"
          className="wr-alert-btn wr-alert-btn--deny"
          onClick={() => orders.decide(latest.hookRequestId, 'deny')}
        >
          Deny
        </button>
      </span>
    </div>
  );
}
