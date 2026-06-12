/**
 * The Foundry (SPEC-V2 §V2-6 as amended by SPEC-V3 §V3-7 and SPEC-V4 §V4-5):
 * a two-tab parchment dialog —
 *   Commission Task (unchanged V3 surface): kind/title/parent → sim verb
 *     `createTask`; the new card lands in the backlog (`adr-cXX` id).
 *   Stacks (`data-testid="foundry-stacks"`, §V4-5 "create agents from
 *     agents"): roster of seeded + custom agent stacks (name, adapter chip
 *     with faction tint, model, personality excerpt, phase badge, CUSTOM
 *     tag) with per-row Forge From (clone-as-template, "<src> Mk II") and
 *     Edit (custom stacks update in place); the editor form below saves via
 *     sim verb `upsertStack` (`stack_forged` event, deterministic stk-cNN
 *     ids). New stacks appear in the card editor's stack select.
 * Opened via N or topbar-create; Esc closes (top of the cascade).
 */

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';

import { TASK_KINDS, TASK_TITLES, ADAPTERS, type TaskKind } from '../../backend/mock/scenario';
import type { SimStackView } from '../../backend/mock/simulation';
import type { CommanderStore, Orders } from '../../game/store';
import type { SimViews } from '../../game/views';
import {
  APPROVAL_MODES,
  blankStackDraft,
  draftToStackInput,
  editStackDraft,
  forgeFromStack,
  personalityExcerpt,
  withAdapter,
  type StackDraft,
} from '../../game/stackForge';

export interface FoundryProps {
  store: CommanderStore;
  orders: Orders;
  views: SimViews;
}

type FoundryTab = 'commission' | 'stacks';

// ---------------------------------------------------------------------------
// Commission Task tab (V3 surface, unchanged)
// ---------------------------------------------------------------------------

function CommissionTab({ store, orders }: { store: CommanderStore; orders: Orders }): React.JSX.Element {
  const taskIds = useStore(store, (s) => s.board.cardIds);
  const cards = useStore(store, (s) => s.board.cards);
  const [kind, setKind] = useState<TaskKind>('implement');
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState('');

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
    <>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Stacks tab (§V4-5)
// ---------------------------------------------------------------------------

function StackRow({
  stack,
  onForgeFrom,
  onEdit,
}: {
  stack: SimStackView;
  onForgeFrom: () => void;
  onEdit: () => void;
}): React.JSX.Element {
  const spec = stack.stack.spec;
  return (
    <li className="wr-stack-row">
      <div className="wr-stack-row-main">
        <span className="wr-stack-name">{stack.name}</span>
        <span className={`wr-stack-adapter wr-faction-text--${spec.adapter}`}>{spec.adapter}</span>
        <span className="wr-stack-model">{spec.model}</span>
        <span className="wr-stack-phase">{stack.stack.status.phase}</span>
        {stack.custom && <span className="wr-stack-custom">CUSTOM</span>}
        <span className="wr-stack-id">{stack.stackRef}</span>
      </div>
      <div className="wr-stack-row-excerpt">{personalityExcerpt(spec.prompt.system)}</div>
      <div className="wr-stack-row-actions">
        <button type="button" className="wr-alert-btn wr-stack-btn" onClick={onForgeFrom}>
          Forge From
        </button>
        {stack.custom && (
          <button type="button" className="wr-alert-btn wr-stack-btn" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </li>
  );
}

function StacksTab({ orders, views }: { orders: Orders; views: SimViews }): React.JSX.Element {
  const [draft, setDraft] = useState<StackDraft>(blankStackDraft);
  // Roster reads straight from the sim; bump after a save so it re-renders.
  const [, setForgeSeq] = useState(0);
  const stacks = views.listStacks();

  const approvalModes = APPROVAL_MODES.includes(draft.approvalMode as (typeof APPROVAL_MODES)[number])
    ? APPROVAL_MODES
    : [draft.approvalMode, ...APPROVAL_MODES];

  const save = (): void => {
    const input = draftToStackInput(draft);
    if (input === null) return;
    const stackRef = orders.upsertStack(input);
    if (stackRef !== null) {
      // Keep editing the saved stack (further saves update it in place).
      setDraft({ ...draft, stackRef });
      setForgeSeq((n) => n + 1);
    }
  };

  return (
    <div className="wr-foundry-stacks-body">
      <ul className="wr-stack-roster" aria-label="Agent stack roster">
        {stacks.map((s) => (
          <StackRow
            key={s.stackRef}
            stack={s}
            onForgeFrom={() => setDraft(forgeFromStack(s))}
            onEdit={() => setDraft(editStackDraft(s))}
          />
        ))}
      </ul>
      <div className="wr-stack-editor" aria-label="Stack editor">
        <div className="wr-stack-editor-title">
          {draft.stackRef !== null ? `RE-FORGE ${draft.stackRef.toUpperCase()}` : 'FORGE A NEW STACK'}
        </div>
        <label className="wr-foundry-field">
          <span className="wr-foundry-label">name</span>
          <input
            className="wr-foundry-input"
            type="text"
            value={draft.name}
            placeholder="name the stack"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="wr-stack-editor-grid">
          <label className="wr-foundry-field">
            <span className="wr-foundry-label">adapter</span>
            <select
              className="wr-foundry-input"
              value={draft.adapter}
              onChange={(e) => setDraft(withAdapter(draft, e.target.value))}
            >
              {ADAPTERS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="wr-foundry-field">
            <span className="wr-foundry-label">model</span>
            <input
              className="wr-foundry-input"
              type="text"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <label className="wr-foundry-field">
            <span className="wr-foundry-label">approval mode</span>
            <select
              className="wr-foundry-input"
              value={draft.approvalMode}
              onChange={(e) => setDraft({ ...draft, approvalMode: e.target.value })}
            >
              {approvalModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="wr-foundry-field">
          <span className="wr-foundry-label">system personality</span>
          <textarea
            className="wr-foundry-input wr-stack-prompt"
            rows={3}
            value={draft.system}
            placeholder="inscribe the personality (prompt.system)"
            onChange={(e) => setDraft({ ...draft, system: e.target.value })}
          />
        </label>
        <label className="wr-foundry-field">
          <span className="wr-foundry-label">developer prompt (optional)</span>
          <textarea
            className="wr-foundry-input wr-stack-prompt"
            rows={2}
            value={draft.developer}
            onChange={(e) => setDraft({ ...draft, developer: e.target.value })}
          />
        </label>
        <div className="wr-modal-hint">deterministic stk-cNN id · honored on the next spawn</div>
        <div className="wr-modal-actions">
          <button
            type="button"
            className="wr-alert-btn"
            onClick={() => setDraft(blankStackDraft())}
          >
            Clear
          </button>
          <button
            type="button"
            className="wr-alert-btn wr-alert-btn--approve"
            disabled={draft.name.trim() === ''}
            onClick={save}
          >
            Save Stack
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function Foundry({ store, orders, views }: FoundryProps): React.JSX.Element | null {
  const open = useStore(store, (s) => s.meta.foundryOpen);
  const [tab, setTab] = useState<FoundryTab>('commission');
  // Each opening starts on Commission Task (the historical default surface).
  useEffect(() => {
    if (open) setTab('commission');
  }, [open]);
  if (!open) return null;

  return (
    <div className="wr-modal-backdrop" data-testid="foundry">
      <div
        className={clsx('wr-modal wr-foundry', tab === 'stacks' && 'wr-foundry--wide')}
        role="dialog"
        aria-label="The Foundry"
      >
        <div className="wr-panel-title">THE FOUNDRY</div>
        {/* Tabs are role="tab" plates, NOT <button>s: the frozen v3 commission
            helper clicks the first button matching /commission/i and must hit
            the submit control, never the tab strip. */}
        <div className="wr-foundry-tabs" role="tablist" aria-label="Foundry tabs">
          <div
            role="tab"
            tabIndex={0}
            aria-selected={tab === 'commission'}
            className={clsx('wr-foundry-tab', tab === 'commission' && 'is-active')}
            onClick={() => setTab('commission')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setTab('commission');
            }}
          >
            Commission Task
          </div>
          <div
            role="tab"
            tabIndex={0}
            data-testid="foundry-stacks"
            aria-selected={tab === 'stacks'}
            className={clsx('wr-foundry-tab', tab === 'stacks' && 'is-active')}
            onClick={() => setTab('stacks')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setTab('stacks');
            }}
          >
            Stacks
          </div>
        </div>
        {tab === 'commission' ? (
          <CommissionTab store={store} orders={orders} />
        ) : (
          <StacksTab orders={orders} views={views} />
        )}
      </div>
    </div>
  );
}
