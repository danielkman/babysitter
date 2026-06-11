/**
 * Inspector (SPEC §4, AC11): right slide-over panel streaming the selected
 * unit's session transcript (turns, thinking/text deltas, tool calls,
 * approvals). Opened by double-clicking a unit or the Inspect command;
 * closed by Esc (first in the Esc cascade) or the close button.
 * data-testid="inspector" (SPEC §9). This phase ships the structural panel;
 * the full inspector experience lands with the HUD phase.
 */

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';

import type { CommanderStore } from '../../game/store';
import { generateIcon } from '../../microagent/mock/iconGen';

export interface InspectorProps {
  store: CommanderStore;
}

export function Inspector({ store }: InspectorProps): React.JSX.Element | null {
  const unitId = useStore(store, (s) => s.meta.inspectorUnitId);
  const units = useStore(store, (s) => s.world.units);
  const listRef = useRef<HTMLOListElement | null>(null);
  const unit = unitId !== null ? units[unitId] : undefined;
  const transcriptLength = unit?.transcript.length ?? 0;

  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [transcriptLength, unitId]);

  if (unitId === null || unit === undefined) return null;

  const icon = generateIcon({ entityId: unit.id, kind: 'unit', adapter: unit.view.agent });

  return (
    <aside className="wr-inspector" data-testid="inspector" aria-label="Session inspector">
      <header className="wr-inspector-head">
        <div className="wr-inspector-portrait" dangerouslySetInnerHTML={{ __html: icon.svg }} />
        <div className="wr-inspector-id">
          <div className="wr-inspector-name">{unit.view.title}</div>
          <div className="wr-inspector-sub">
            {unit.view.agent} · {unit.view.model}
          </div>
          <div className={`wr-sel-state wr-sel-state--${unit.view.state}`}>{unit.view.state}</div>
        </div>
        <button
          type="button"
          className="wr-inspector-close"
          aria-label="Close inspector"
          onClick={() => store.getState().closeInspector()}
        >
          CLOSE
        </button>
      </header>
      <ol ref={listRef} className="wr-inspector-stream">
        {unit.transcript.length === 0 && (
          <li className="wr-tr wr-tr--note">no transcript yet — unit has not run</li>
        )}
        {unit.transcript.map((entry) => (
          <li key={entry.id} className={clsx('wr-tr', `wr-tr--${entry.kind}`)}>
            {entry.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}
