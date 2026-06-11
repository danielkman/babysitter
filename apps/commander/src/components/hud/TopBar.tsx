/**
 * TopBar (SPEC §4): logo · resources (units/busy · tokens · tasks · alerts) ·
 * sim clock. data-testids: topbar-units, topbar-tokens, topbar-tasks,
 * topbar-alerts, topbar-clock (SPEC §9; the tokens/tasks/alerts testids must
 * self-identify for AC6/AC14).
 */

import { useStore } from 'zustand';

import { formatClock, formatInt } from '../../game/selectors';
import type { CommanderStore } from '../../game/store';

export interface TopBarProps {
  store: CommanderStore;
}

export function TopBar({ store }: TopBarProps): React.JSX.Element {
  const meta = useStore(store, (s) => s.meta);
  const r = meta.resources;
  return (
    <header className="wr-topbar" data-testid="topbar">
      <div className="wr-topbar-logo">
        A5C <span>COMMANDER</span>
      </div>
      <div className="wr-topbar-stats">
        <div className="wr-stat" data-testid="topbar-units" title="Active units / busy units">
          <span className="wr-stat-label">UNITS</span>
          <span className="wr-stat-value">
            {formatInt(r.unitCount)}
            <em>/{formatInt(r.busyCount)} busy</em>
          </span>
        </div>
        <div className="wr-stat" data-testid="topbar-tokens" title="Total tokens burned by the fleet">
          <span className="wr-stat-label">TOKENS</span>
          <span className="wr-stat-value">{formatInt(r.tokensBurned)}</span>
        </div>
        <div className="wr-stat" data-testid="topbar-tasks" title="Objectives done / total">
          <span className="wr-stat-label">OBJECTIVES</span>
          <span className="wr-stat-value">
            {formatInt(r.tasksDone)}/{formatInt(r.tasksTotal)}
          </span>
        </div>
        <div
          className={`wr-stat${r.alertCount > 0 ? ' wr-stat--alert' : ''}`}
          data-testid="topbar-alerts"
          title="Pending approvals"
        >
          <span className="wr-stat-label">ALERTS</span>
          <span className="wr-stat-value">{formatInt(r.alertCount)}</span>
        </div>
      </div>
      <div className="wr-topbar-clock" data-testid="topbar-clock" title="Sim clock">
        {formatClock(meta.simTimeMs, meta.simStartMs)}
        {meta.paused && <span className="wr-clock-paused">PAUSED</span>}
      </div>
    </header>
  );
}
