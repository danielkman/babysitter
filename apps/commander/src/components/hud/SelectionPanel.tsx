/**
 * SelectionPanel (SPEC §4): single unit → portrait + name/adapter/model/state
 * + vitals; multi-unit → card grid (one portrait per unit); task → details +
 * assignees. data-testid="selection-panel" (SPEC §9).
 *
 * NOTE (frozen e2e contract): the panel text is matched against the §3 state
 * strings — render `view.state` verbatim and never include the word "idle"
 * for non-idle selections.
 */

import { useStore } from 'zustand';

import { formatInt, formatPct, formatUsd, getSelectedEntities } from '../../game/selectors';
import type { CommanderStore, TaskEntity, UnitEntity } from '../../game/store';
import { generateIcon } from '../../microagent/mock/iconGen';

export interface SelectionPanelProps {
  store: CommanderStore;
}

function UnitVitals({ unit }: { unit: UnitEntity }): React.JSX.Element {
  const icon = generateIcon({ entityId: unit.id, kind: 'unit', adapter: unit.view.agent });
  return (
    <div className="wr-sel-single">
      <div className="wr-sel-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      <div className="wr-sel-info">
        <div className="wr-sel-name">{unit.view.title}</div>
        <div className="wr-sel-sub">
          <span className="wr-sel-adapter">{unit.view.agent}</span>
          <span className="wr-sel-model">{unit.view.model}</span>
        </div>
        <div className={`wr-sel-state wr-sel-state--${unit.view.state}`}>{unit.view.state}</div>
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
          <span className="wr-vital-label">PWR</span>
          <div className="wr-bar wr-bar--energy">
            <div className="wr-bar-fill" style={{ width: formatPct(unit.energyPct) }} />
          </div>
          <span className="wr-vital-value">{formatUsd(unit.view.cost.totalUsd)}</span>
        </div>
        <div className="wr-vital">
          <span className="wr-vital-label">TURNS</span>
          <span className="wr-vital-value">{formatInt(unit.view.turnCount)}</span>
        </div>
      </div>
    </div>
  );
}

function UnitCardGrid({ units }: { units: UnitEntity[] }): React.JSX.Element {
  return (
    <div className="wr-sel-grid">
      {units.map((unit) => {
        const icon = generateIcon({ entityId: unit.id, kind: 'unit', adapter: unit.view.agent });
        return (
          <div key={unit.id} className={`wr-sel-card wr-sel-card--${unit.view.state}`}>
            <div className="wr-sel-card-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
            <div className="wr-sel-card-name">{unit.view.title}</div>
            <div className="wr-sel-card-state">{unit.view.state}</div>
          </div>
        );
      })}
    </div>
  );
}

function TaskDetails({ task }: { task: TaskEntity }): React.JSX.Element {
  const icon = generateIcon({ entityId: task.id, kind: 'task', taskKind: task.view.taskKind });
  return (
    <div className="wr-sel-single">
      <div className="wr-sel-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      <div className="wr-sel-info">
        <div className="wr-sel-name">{task.view.title}</div>
        <div className="wr-sel-sub">
          <span>{task.view.taskKind}</span>
          <span>{task.view.repository}</span>
        </div>
        <div className={`wr-sel-state wr-sel-state--task-${task.view.state}`}>{task.view.state}</div>
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
          <span className="wr-vital-value">
            {task.view.assigneeIds.length === 0 ? 'none' : task.view.assigneeIds.join(', ')}
          </span>
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
    content = unit !== undefined ? <UnitVitals unit={unit} /> : <div />;
  } else if (units.length > 1 && tasks.length === 0) {
    content = <UnitCardGrid units={units} />;
  } else if (tasks.length === 1 && units.length === 0) {
    const task = tasks[0];
    content = task !== undefined ? <TaskDetails task={task} /> : <div />;
  } else {
    content = (
      <div className="wr-sel-mixed">
        <UnitCardGrid units={units} />
        {tasks.map((task) => (
          <TaskDetails key={task.id} task={task} />
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
