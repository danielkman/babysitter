/**
 * EventTicker (SPEC §4/§14): bottom-left clickable event stream, newest
 * first, virtualized to the last 50 visible entries of the ≤500 ring buffer.
 * Clicking an entry that references an entity selects it and centers the
 * camera (AC10). data-testid="ticker-item" (SPEC §9).
 */

import { useStore } from 'zustand';
import clsx from 'clsx';

import { formatClock } from '../../game/selectors';
import type { CommanderStore } from '../../game/store';

const VISIBLE_ITEMS = 50;

export interface EventTickerProps {
  store: CommanderStore;
}

export function EventTicker({ store }: EventTickerProps): React.JSX.Element {
  const events = useStore(store, (s) => s.events);
  const simStartMs = useStore(store, (s) => s.meta.simStartMs);
  const visible = events.slice(-VISIBLE_ITEMS).reverse();

  return (
    <section className="wr-panel wr-ticker" data-testid="event-ticker" aria-label="Event stream">
      <div className="wr-panel-title">COMMS</div>
      <ol className="wr-ticker-list">
        {visible.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              data-testid="ticker-item"
              className={clsx('wr-ticker-item', `wr-ticker-item--${entry.severity}`)}
              onClick={() => {
                if (entry.entityId === undefined) return;
                store.getState().clickSelect(entry.entityId, false);
                store.getState().centerOnEntity(entry.entityId);
              }}
            >
              <span className="wr-ticker-ts">{formatClock(entry.ts, simStartMs)}</span>
              <span className="wr-ticker-text">{entry.text}</span>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="wr-ticker-empty">awaiting fleet activity…</li>}
      </ol>
    </section>
  );
}
