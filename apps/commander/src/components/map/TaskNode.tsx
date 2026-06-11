/**
 * TaskNode (SPEC §3): objective structure on the map with a progress ring
 * (SVG circle, stroke-dashoffset), per-state styling, procedural glyph icon,
 * assignee count. data-testid="task-<id>" (SPEC §9).
 */

import { memo } from 'react';
import clsx from 'clsx';

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface TaskNodeProps {
  id: string;
  title: string;
  taskKind: string;
  state: string;
  /** 0..1 */
  progress: number;
  /** Operator priority (Prioritize command): > 0 shows the chevron. */
  priority: number;
  x: number;
  y: number;
  selected: boolean;
  assigneeCount: number;
  iconSvg: string;
}

function TaskNodeImpl({
  id,
  title,
  taskKind,
  state,
  progress,
  priority,
  x,
  y,
  selected,
  assigneeCount,
  iconSvg,
}: TaskNodeProps): React.JSX.Element {
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <div
      data-testid={`task-${id}`}
      data-entity-id={id}
      data-entity-kind="task"
      className={clsx(
        'wr-task',
        `wr-task--${state}`,
        selected && 'is-selected',
        priority > 0 && 'is-priority',
      )}
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
    >
      <div className="wr-task-body">
        <svg className="wr-task-ring" viewBox="0 0 64 64" aria-hidden>
          <circle className="wr-task-ring-track" cx="32" cy="32" r={RING_RADIUS} />
          <circle
            className="wr-task-ring-fill"
            cx="32"
            cy="32"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="wr-task-icon" dangerouslySetInnerHTML={{ __html: iconSvg }} />
        {priority > 0 && (
          <span className="wr-task-priority" title="Priority objective" aria-label="priority objective">
            <svg viewBox="0 0 12 12" aria-hidden>
              <path
                d="M2.5 7.5 L6 3.5 L9.5 7.5 M2.5 10 L6 6 L9.5 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        {assigneeCount > 0 && (
          <span className="wr-task-assignees" aria-hidden>
            {assigneeCount}
          </span>
        )}
      </div>
      <div className="wr-task-label">
        <span className="wr-task-title">{title}</span>
        <span className="wr-task-kind">{taskKind}</span>
      </div>
    </div>
  );
}

export const TaskNode = memo(TaskNodeImpl);
