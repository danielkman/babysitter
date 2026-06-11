/**
 * LinkLayer (SPEC §4): SVG world-space layer drawing unit↔assigned-task link
 * lines. This is intentionally the ONLY place in the app that renders
 * `<line>` elements — the e2e suite counts `svg line/polyline` shapes to
 * verify dispatch orders create links (AC4).
 */

import { useStore } from 'zustand';

import { factionAccent } from '../../microagent/mock/iconGen';
import { WORLD } from '../../game/layout';
import type { CommanderStore } from '../../game/store';

export interface LinkLayerProps {
  store: CommanderStore;
}

export function LinkLayer({ store }: LinkLayerProps): React.JSX.Element {
  const units = useStore(store, (s) => s.world.units);
  const unitIds = useStore(store, (s) => s.world.unitIds);
  const positions = useStore(store, (s) => s.world.positions);

  const links: Array<{ unitId: string; taskId: string; accent: string }> = [];
  for (const id of unitIds) {
    const unit = units[id];
    const taskId = unit?.view.taskId ?? null;
    if (unit === undefined || taskId === null) continue;
    if (positions[id] === undefined || positions[taskId] === undefined) continue;
    links.push({ unitId: id, taskId, accent: factionAccent(unit.view.agent) });
  }

  return (
    <svg
      className="wr-links"
      data-testid="link-layer"
      width={WORLD.width}
      height={WORLD.height}
      viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
      aria-hidden
    >
      {links.map((link) => {
        const from = positions[link.unitId];
        const to = positions[link.taskId];
        if (from === undefined || to === undefined) return null;
        return (
          <line
            key={`${link.unitId}->${link.taskId}`}
            className="wr-link-line"
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={link.accent}
          />
        );
      })}
    </svg>
  );
}
