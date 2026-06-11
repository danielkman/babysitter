/**
 * SelectionPanel (SPEC §4): single unit → portrait + name/adapter/model/state
 * badge + current task link + vitals (context bar, budget bar, turns/rank);
 * multi-unit → clickable card grid (click a card to sub-select that unit);
 * task → icon + title/kind/repo/phase + progress + assignees (click an
 * assignee to select it). data-testid="selection-panel" (SPEC §9).
 *
 * NOTE (frozen e2e contract): the panel text is matched against the §3 state
 * strings — render `view.state` verbatim and never include the word "idle"
 * for non-idle selections.
 */

import { useStore } from 'zustand';
import clsx from 'clsx';

import { formatInt, formatPct, formatUsd, getSelectedEntities } from '../../game/selectors';
import type { CommanderStore, TaskEntity, UnitEntity } from '../../game/store';
import { generateIcon } from '../../microagent/mock/iconGen';

const MAX_RANK_CHEVRONS = 5;

export interface SelectionPanelProps {
  store: CommanderStore;
}

function focusEntity(store: CommanderStore, id: string, shift: boolean): void {
  store.getState().clickSelect(id, shift);
  store.getState().centerOnEntity(id);
}

function RankChevrons({ turnCount }: { turnCount: number }): React.JSX.Element {
  const rank = Math.min(MAX_RANK_CHEVRONS, turnCount);
  return (
    <span className="wr-rank" title={`${turnCount} turns served`} aria-label={`rank ${rank}`}>
      {Array.from({ length: MAX_RANK_CHEVRONS }, (_, i) => (
        <span key={i} className={clsx('wr-rank-chevron', i < rank && 'is-earned')} />
      ))}
    </span>
  );
}

function UnitVitals({ store, unit }: { store: CommanderStore; unit: UnitEntity }): React.JSX.Element {
  const taskId = unit.view.taskId;
  const task = useStore(store, (s) => (taskId !== null ? s.world.tasks[taskId] : undefined));
  const icon = generateIcon({ entityId: unit.id, kind: 'unit', adapter: unit.view.agent });
  return (
    <div className="wr-sel-single">
      <div className="wr-sel-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      <div className="wr-sel-info">
        <div className="wr-sel-name">{unit.view.title}</div>
        <div className="wr-sel-sub">
          <span className={`wr-sel-adapter wr-faction-text--${unit.view.agent}`}>{unit.view.agent}</span>
          <span className="wr-sel-model">{unit.view.model}</span>
        </div>
        <div className="wr-sel-staterow">
          <span className={`wr-sel-state wr-sel-state--${unit.view.state}`}>{unit.view.state}</span>
          {unit.view.paused && <span className="wr-sel-paused">paused</span>}
        </div>
        {taskId !== null && (
          <button
            type="button"
            className="wr-sel-tasklink"
            title="Select the assigned objective"
            onClick={(e) => focusEntity(store, taskId, e.shiftKey)}
          >
            › {task?.view.title ?? taskId}
          </button>
        )}
      </div>
      <div className="wr-sel-vitals">
        <div className="wr-vital">
          <span className="wr-vital-label">CTX</span>
          <div className="wr-bar wr-bar--health">
            <div className="wr-bar-fill" style={{ width: formatPct(1 - unit.contextPct) }} />
          </div>
          <span className="wr-vital-value">{formatPct(1 - unit.contextPct)}</span>
        </div>
        <div className="wr-vital">
          <span className="wr-vital-label">BUDGET</span>
          <div className="wr-bar wr-bar--energy">
            <div className="wr-bar-fill" style={{ width: formatPct(unit.energyPct) }} />
          </div>
          <span className="wr-vital-value">{formatUsd(unit.view.cost.totalUsd)}</span>
        </div>
        <div className="wr-vital">
          <span className="wr-vital-label">TURNS</span>
          <RankChevrons turnCount={unit.view.turnCount} />
          <span className="wr-vital-value">{formatInt(unit.view.turnCount)}</span>
        </div>
      </div>
    </div>
  );
}

function UnitCardGrid({ store, units }: { store: CommanderStore; units: UnitEntity[] }): React.JSX.Element {
  return (
    <div className="wr-sel-grid">
      {units.map((unit) => {
        const icon = generateIcon({ entityId: unit.id, kind: 'unit', adapter: unit.view.agent });
        return (
          <button
            key={unit.id}
            type="button"
            className={`wr-sel-card wr-sel-card--${unit.view.state}`}
            title={`${unit.view.title} — click to select only this unit`}
            onClick={(e) => focusEntity(store, unit.id, e.shiftKey)}
          >
            <div className="wr-sel-card-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
            <div className="wr-sel-card-name">{unit.view.title}</div>
            <div className="wr-sel-card-state">
              {unit.view.state}
              {unit.view.paused && <span className="wr-sel-paused">paused</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TaskDetails({ store, task }: { store: CommanderStore; task: TaskEntity }): React.JSX.Element {
  const units = useStore(store, (s) => s.world.units);
  const icon = generateIcon({ entityId: task.id, kind: 'task', taskKind: task.view.taskKind });
  return (
    <div className="wr-sel-single">
      <div className="wr-sel-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      <div className="wr-sel-info">
        <div className="wr-sel-name">{task.view.title}</div>
        <div className="wr-sel-sub">
          <span>{task.view.taskKind}</span>
          <span>{task.view.repository}</span>
          <span className="wr-sel-phase">{task.view.phase}</span>
        </div>
        <div className="wr-sel-staterow">
          <span className={`wr-sel-state wr-sel-state--task-${task.view.state}`}>{task.view.state}</span>
          {task.view.priority > 0 && <span className="wr-sel-priority">priority</span>}
        </div>
      </div>
      <div className="wr-sel-vitals">
        <div className="wr-vital">
          <span className="wr-vital-label">PROGRESS</span>
          <div className="wr-bar wr-bar--progress">
            <div className="wr-bar-fill" style={{ width: formatPct(task.view.progress) }} />
          </div>
          <span className="wr-vital-value">{formatPct(task.view.progress)}</span>
        </div>
        <div className="wr-vital wr-vital--assignees">
          <span className="wr-vital-label">ASSIGNEES</span>
          {task.view.assigneeIds.length === 0 ? (
            <span className="wr-vital-value">none</span>
          ) : (
            <span className="wr-sel-assignees">
              {task.view.assigneeIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="wr-sel-assignee"
                  title="Select this unit"
                  onClick={(e) => focusEntity(store, id, e.shiftKey)}
                >
                  {units[id]?.view.title ?? id}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function SelectionPanel({ store }: SelectionPanelProps): React.JSX.Element {
  const world = useStore(store, (s) => s.world);
  const selection = useStore(store, (s) => s.selection);
  const { units, tasks } = getSelectedEntities({ world, selection });
  const total = units.length + tasks.length;

  let content: React.JSX.Element;
  if (total === 0) {
    content = <div className="wr-sel-empty">no selection — click a unit or drag a marquee</div>;
  } else if (units.length === 1 && tasks.length === 0) {
    const unit = units[0];
    content = unit !== undefined ? <UnitVitals store={store} unit={unit} /> : <div />;
  } else if (units.length > 1 && tasks.length === 0) {
    content = <UnitCardGrid store={store} units={units} />;
  } else if (tasks.length === 1 && units.length === 0) {
    const task = tasks[0];
    content = task !== undefined ? <TaskDetails store={store} task={task} /> : <div />;
  } else {
    content = (
      <div className="wr-sel-mixed">
        <UnitCardGrid store={store} units={units} />
        {tasks.map((task) => (
          <TaskDetails key={task.id} store={store} task={task} />
        ))}
      </div>
    );
  }

  return (
    <section className="wr-panel wr-selection" data-testid="selection-panel" aria-label="Selection">
      <div className="wr-panel-title">
        SELECTION{total > 0 && <span className="wr-panel-count">{total}</span>}
      </div>
      {content}
    </section>
  );
}
