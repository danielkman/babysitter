/**
 * CommandCard (SPEC §4/§8): 3x4 grid of contextual commands produced by the
 * microagent for the current selection. Hotkey hint letters render in cell
 * corners (hotkey ACTIVATION ships with the full HUD phase — they conflict
 * with WASD camera pan and need a mode arbiter). Every command does something
 * visible via the sim or the store. data-testid="cmd-<commandId>" (SPEC §9).
 */

import { useStore } from 'zustand';
import clsx from 'clsx';

import {
  buildCommandContext,
  getAlertForUnits,
  getIdleUnitIds,
  getLatestAlert,
  getSelectedEntities,
} from '../../game/selectors';
import type { CommanderStore, Orders } from '../../game/store';
import { mockMicroagent } from '../../microagent/mock/commandGen';
import type { CommandIntent, CommandSpec } from '../../microagent/types';

const GRID_CELLS = 12;

export interface CommandCardProps {
  store: CommanderStore;
  orders: Orders;
}

function executeIntent(intent: CommandIntent, store: CommanderStore, orders: Orders): void {
  const state = store.getState();
  const { units, tasks } = getSelectedEntities(state);
  const unitIds = units.map((u) => u.id);

  switch (intent.kind) {
    case 'dispatch-mode':
      state.setTargeting('dispatch');
      return;
    case 'rally-mode':
      state.setTargeting('rally');
      return;
    case 'clone': {
      const first = units[0];
      if (first !== undefined) orders.clone(first.view.agent, first.view.workspaceId);
      return;
    }
    case 'retire':
      state.pushEvent(
        `Retire order acknowledged — ${unitIds.length} unit(s) will decommission at the next maintenance window`,
        'info',
        unitIds[0],
      );
      return;
    case 'steer':
      state.openSteer();
      return;
    case 'pause-unit':
      state.pushEvent('Pause queued — units hold after the current step (adapter lacks hard pause)', 'warn');
      return;
    case 'inspect': {
      const first = unitIds[0];
      if (first !== undefined) state.openInspector(first);
      return;
    }
    case 'abort':
      orders.abort(unitIds);
      return;
    case 'approve':
    case 'deny': {
      const alert = getAlertForUnits(state, unitIds) ?? getLatestAlert(state);
      if (alert !== undefined) orders.decide(alert.hookRequestId, intent.kind === 'approve' ? 'allow' : 'deny');
      return;
    }
    case 'assign-best-idle': {
      const task = tasks[0];
      const idle = getIdleUnitIds(state)[0];
      if (task !== undefined && idle !== undefined) orders.dispatchToTask([idle], task.id);
      return;
    }
    case 'prioritize': {
      const task = tasks[0];
      if (task !== undefined) {
        state.pushEvent(`Objective prioritized — ${task.view.title}`, 'info', task.id);
      }
      return;
    }
    case 'cancel-task': {
      const task = tasks[0];
      if (task !== undefined) {
        orders.abort(task.view.assigneeIds);
        state.pushEvent(`Objective cancelled — recalling ${task.view.title} assignees`, 'warn', task.id);
      }
      return;
    }
    case 'select-all-idle':
      state.select(getIdleUnitIds(state));
      return;
    case 'jump-to-alert':
      state.jumpToLatestAlert();
      return;
    case 'toggle-sim':
      orders.toggleSim();
      return;
  }
}

export function CommandCard({ store, orders }: CommandCardProps): React.JSX.Element {
  const world = useStore(store, (s) => s.world);
  const selection = useStore(store, (s) => s.selection);
  const alerts = useStore(store, (s) => s.alerts);
  const meta = useStore(store, (s) => s.meta);

  const ctx = buildCommandContext({ world, selection, alerts, meta });
  const specs = mockMicroagent.generateCommands(ctx).slice(0, GRID_CELLS);
  const empties = Math.max(0, GRID_CELLS - specs.length);

  const onRun = (spec: CommandSpec): void => {
    if (!spec.enabled) return;
    executeIntent(spec.intent, store, orders);
  };

  return (
    <section className="wr-panel wr-commands" data-testid="command-card" aria-label="Commands">
      <div className="wr-panel-title">ORDERS</div>
      <div className="wr-cmd-grid">
        {specs.map((spec) => (
          <button
            key={spec.id}
            type="button"
            data-testid={`cmd-${spec.id}`}
            className={clsx(
              'wr-cmd',
              spec.severity === 'danger' && 'wr-cmd--danger',
              spec.severity === 'urgent' && 'wr-cmd--urgent',
            )}
            disabled={!spec.enabled}
            title={spec.tooltip}
            onClick={() => onRun(spec)}
          >
            <span className="wr-cmd-icon" dangerouslySetInnerHTML={{ __html: spec.icon.svg }} />
            <span className="wr-cmd-label">{spec.label}</span>
            {spec.hotkey !== undefined && <span className="wr-cmd-hotkey">{spec.hotkey}</span>}
          </button>
        ))}
        {Array.from({ length: empties }, (_, i) => (
          <span key={`empty-${i}`} className="wr-cmd wr-cmd--empty" aria-hidden />
        ))}
      </div>
    </section>
  );
}
