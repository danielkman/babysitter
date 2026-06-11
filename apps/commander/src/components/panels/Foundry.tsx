/**
 * The Foundry (SPEC-V2 §V2-6 as amended by SPEC-V3 §V3-7): Commission Task is
 * the ONLY surviving tab — the Forge Agent tab is retired (agents are never
 * created manually under V3). Opened via N or topbar-create; Esc closes (top
 * of the cascade alongside the Archive). Submitting calls the sim verb
 * `createTask`; the new card lands in the backlog with a deterministic
 * `adr-cXX-…` id and a ticker entry.
 */

import { useState } from 'react';
import { useStore } from 'zustand';

import { TASK_KINDS, TASK_TITLES, type TaskKind } from '../../backend/mock/scenario';
import type { CommanderStore, Orders } from '../../game/store';

export interface FoundryProps {
  store: CommanderStore;
  orders: Orders;
}

export function Foundry({ store, orders }: FoundryProps): React.JSX.Element | null {
  const open = useStore(store, (s) => s.meta.foundryOpen);
  const taskIds = useStore(store, (s) => s.board.cardIds);
  const cards = useStore(store, (s) => s.board.cards);
  const [kind, setKind] = useState<TaskKind>('implement');
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState('');
  if (!open) return null;

  const parentOptions = taskIds.filter((id) => cards[id]?.view.parentId === null);
  const defaultTitle = TASK_TITLES[kind];

  const submit = (): void => {
    const created = orders.createTask({
      taskKind: kind,
      ...(title.trim() !== '' ? { title: title.trim() } : {}),
      ...(parentId !== '' ? { parentId } : {}),
    });
    if (created !== null) {
      setTitle('');
      setParentId('');
      store.getState().closeFoundry();
    }
  };

  return (
    <div className="wr-modal-backdrop" data-testid="foundry">
      <div className="wr-modal wr-foundry" role="dialog" aria-label="The Foundry — Commission Task">
        <div className="wr-panel-title">THE FOUNDRY — COMMISSION TASK</div>
        <label className="wr-foundry-field">
          <span className="wr-foundry-label">task kind</span>
          <select
            className="wr-foundry-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as TaskKind)}
          >
            {TASK_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="wr-foundry-field">
          <span className="wr-foundry-label">title</span>
          <input
            className="wr-foundry-input"
            type="text"
            value={title}
            placeholder={defaultTitle}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') store.getState().closeFoundry();
            }}
          />
        </label>
        <label className="wr-foundry-field">
          <span className="wr-foundry-label">parent task (optional)</span>
          <select
            className="wr-foundry-input"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— none —</option>
            {parentOptions.map((id) => (
              <option key={id} value={id}>
                {cards[id]?.view.title ?? id}
              </option>
            ))}
          </select>
        </label>
        <div className="wr-modal-hint">lands in BACKLOG · deterministic adr-cXX id · Esc to close</div>
        <div className="wr-modal-actions">
          <button type="button" className="wr-alert-btn" onClick={() => store.getState().closeFoundry()}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="foundry-commission"
            className="wr-alert-btn wr-alert-btn--approve"
            onClick={submit}
          >
            Commission
          </button>
        </div>
      </div>
    </div>
  );
}
