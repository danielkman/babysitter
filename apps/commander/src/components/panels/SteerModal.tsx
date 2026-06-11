/**
 * SteerModal (SPEC §8): prompt input for the `Steer…` command — sends a
 * `session.message` frame to every selected working unit. Minimal modal this
 * phase; polish lands with the HUD phase.
 */

import { useState } from 'react';
import { useStore } from 'zustand';

import { getSelectedEntities } from '../../game/selectors';
import type { CommanderStore, Orders } from '../../game/store';

export interface SteerModalProps {
  store: CommanderStore;
  orders: Orders;
}

export function SteerModal({ store, orders }: SteerModalProps): React.JSX.Element | null {
  const open = useStore(store, (s) => s.meta.steerOpen);
  const [prompt, setPrompt] = useState('');
  if (!open) return null;

  const submit = (): void => {
    const text = prompt.trim();
    const state = store.getState();
    const { units } = getSelectedEntities(state);
    if (text !== '' && units.length > 0) {
      orders.steer(
        units.map((u) => u.id),
        text,
      );
      state.pushEvent(`Steering ${units.length} unit(s): ${text}`, 'info', units[0]?.id);
    }
    setPrompt('');
    state.closeSteer();
  };

  return (
    <div className="wr-modal-backdrop" data-testid="steer-modal">
      <div className="wr-modal" role="dialog" aria-label="Steer units">
        <div className="wr-panel-title">STEER SELECTED UNITS</div>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- command-driven modal
          autoFocus
          className="wr-modal-input"
          value={prompt}
          placeholder="new orders for the selection…"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') store.getState().closeSteer();
          }}
        />
        <div className="wr-modal-actions">
          <button type="button" className="wr-alert-btn" onClick={() => store.getState().closeSteer()}>
            Cancel
          </button>
          <button type="button" className="wr-alert-btn wr-alert-btn--approve" onClick={submit}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
