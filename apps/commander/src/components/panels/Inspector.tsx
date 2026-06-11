/**
 * Inspector (SPEC §4, AC11): right slide-over panel streaming the selected
 * unit's session transcript. Message bubbles by role (agent text · thinking
 * shimmer · tool calls with name + duration · system notes · turn dividers),
 * token-usage footer, auto-scroll-to-bottom with scroll-lock when the
 * operator has scrolled up (a "LATEST" jump chip appears). Header: portrait +
 * name + adapter + model + state badge. Opened by double-clicking a unit or
 * the Inspect command; Esc closes it (after the steer modal in the cascade).
 * data-testid="inspector" (SPEC §9).
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';

import { formatInt, formatUsd } from '../../game/selectors';
import type { CommanderStore, TranscriptEntry, UnitEntity } from '../../game/store';
import { generateIcon } from '../../microagent/mock/iconGen';

export interface InspectorProps {
  store: CommanderStore;
}

/** Path-only gear glyph for tool rows (never <line>/<polyline> — frozen contract). */
const TOOL_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">' +
  '<path d="M8 5.2 A2.8 2.8 0 1 0 8 10.8 A2.8 2.8 0 1 0 8 5.2 Z M8 1.5 V3.5 M8 12.5 V14.5 M1.5 8 H3.5 M12.5 8 H14.5 M3.4 3.4 L4.8 4.8 M11.2 11.2 L12.6 12.6 M12.6 3.4 L11.2 4.8 M4.8 11.2 L3.4 12.6" ' +
  'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const SCROLL_STICK_THRESHOLD_PX = 28;

function TranscriptRow({
  entry,
  live,
}: {
  entry: TranscriptEntry;
  live: boolean;
}): React.JSX.Element {
  switch (entry.kind) {
    case 'turn':
      return <li className="wr-tr wr-tr--turn">{entry.text}</li>;
    case 'tool':
      return (
        <li
          className={clsx(
            'wr-tr wr-tr--tool',
            entry.toolStatus === 'failed' && 'wr-tr--tool-failed',
            entry.toolStatus === 'running' && 'wr-tr--tool-running',
          )}
        >
          <span className="wr-tr-tool-glyph" dangerouslySetInnerHTML={{ __html: TOOL_GLYPH }} />
          <span className="wr-tr-tool-name">{entry.toolName ?? 'tool'}</span>
          <span className="wr-tr-tool-meta">
            {entry.durationMs !== undefined
              ? `${formatInt(entry.durationMs)}ms`
              : entry.toolStatus === 'failed'
                ? 'FAILED'
                : 'running…'}
          </span>
        </li>
      );
    case 'thinking':
      return (
        <li className={clsx('wr-tr wr-tr--thinking', live && 'is-live')}>
          <span className="wr-tr-role">THINKING</span>
          {entry.text}
        </li>
      );
    case 'text':
      return (
        <li className="wr-tr wr-tr--text">
          <span className="wr-tr-role">AGENT</span>
          {entry.text}
        </li>
      );
    default:
      return <li className="wr-tr wr-tr--note">{entry.text}</li>;
  }
}

function TokenFooter({ unit }: { unit: UnitEntity }): React.JSX.Element {
  const t = unit.view.tokenUsage;
  return (
    <footer className="wr-inspector-foot" aria-label="Token usage">
      <span className="wr-foot-cell">
        <em>IN</em>
        {formatInt(t.inputTokens)}
      </span>
      <span className="wr-foot-cell">
        <em>OUT</em>
        {formatInt(t.outputTokens)}
      </span>
      <span className="wr-foot-cell">
        <em>THINK</em>
        {formatInt(t.thinkingTokens)}
      </span>
      <span className="wr-foot-cell">
        <em>CACHE</em>
        {formatInt(t.cachedTokens)}
      </span>
      <span className="wr-foot-cell wr-foot-cell--cost">
        <em>COST</em>
        {formatUsd(unit.view.cost.totalUsd)}
      </span>
    </footer>
  );
}

export function Inspector({ store }: InspectorProps): React.JSX.Element | null {
  const unitId = useStore(store, (s) => s.meta.inspectorUnitId);
  const units = useStore(store, (s) => s.world.units);
  const listRef = useRef<HTMLOListElement | null>(null);
  // Scroll lock: stick to the bottom until the operator scrolls up.
  const stuckRef = useRef(true);
  const [stuck, setStuck] = useState(true);
  const unit = unitId !== null ? units[unitId] : undefined;
  const transcriptLength = unit?.transcript.length ?? 0;

  useEffect(() => {
    // Fresh unit → re-arm auto-scroll.
    stuckRef.current = true;
    setStuck(true);
  }, [unitId]);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null && stuckRef.current) list.scrollTop = list.scrollHeight;
  }, [transcriptLength, unitId]);

  if (unitId === null || unit === undefined) return null;

  const icon = generateIcon({ entityId: unit.id, kind: 'unit', adapter: unit.view.agent });
  const lastEntry = unit.transcript[unit.transcript.length - 1];

  const onScroll = (e: React.UIEvent<HTMLOListElement>): void => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICK_THRESHOLD_PX;
    if (stuckRef.current !== atBottom) {
      stuckRef.current = atBottom;
      setStuck(atBottom);
    }
  };

  const jumpToLatest = (): void => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
    stuckRef.current = true;
    setStuck(true);
  };

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
      <div className="wr-inspector-body">
        <ol ref={listRef} className="wr-inspector-stream" onScroll={onScroll}>
          {unit.transcript.length === 0 && (
            <li className="wr-tr wr-tr--note">no transcript yet — unit has not run</li>
          )}
          {unit.transcript.map((entry) => (
            <TranscriptRow
              key={entry.id}
              entry={entry}
              live={entry === lastEntry && unit.view.state === 'thinking'}
            />
          ))}
        </ol>
        {!stuck && (
          <button type="button" className="wr-inspector-jump" onClick={jumpToLatest}>
            LATEST
          </button>
        )}
      </div>
      <TokenFooter unit={unit} />
    </aside>
  );
}
