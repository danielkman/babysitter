/**
 * PingLayer (SPEC §10): expand-and-fade ping animations at world positions
 * (alert pings on hook.request, failure pings on task_failed).
 */

import { useStore } from 'zustand';

import type { CommanderStore } from '../../game/store';

export interface PingLayerProps {
  store: CommanderStore;
}

export function PingLayer({ store }: PingLayerProps): React.JSX.Element {
  const pings = useStore(store, (s) => s.meta.pings);
  return (
    <div className="wr-pings" aria-hidden>
      {pings.map((ping) => (
        <span
          key={ping.id}
          className={`wr-ping wr-ping--${ping.tone}`}
          style={{ transform: `translate3d(${ping.x}px, ${ping.y}px, 0)` }}
        />
      ))}
    </div>
  );
}
