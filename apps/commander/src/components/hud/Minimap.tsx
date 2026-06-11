/**
 * Minimap (SPEC §4/§5): fixed top-right overlay — workspace overview with
 * unit dots (faction-colored), task squares, alert pings, the camera
 * viewport rect, and click-to-jump (AC7). DOM-rendered (canvas is allowed
 * here but unnecessary at this entity count).
 */

import { useStore } from 'zustand';

import { WORLD } from '../../game/layout';
import type { CommanderStore } from '../../game/store';
import { factionAccent } from '../../microagent/mock/iconGen';

const MAP_W = 200;
const MAP_H = 110;

export interface MinimapProps {
  store: CommanderStore;
}

export function Minimap({ store }: MinimapProps): React.JSX.Element {
  const world = useStore(store, (s) => s.world);
  const camera = useStore(store, (s) => s.camera);
  const viewport = useStore(store, (s) => s.meta.viewport);
  const pings = useStore(store, (s) => s.meta.pings);

  const sx = MAP_W / WORLD.width;
  const sy = MAP_H / WORLD.height;

  const viewW = Math.min(MAP_W, (viewport.width / camera.zoom) * sx);
  const viewH = Math.min(MAP_H, (viewport.height / camera.zoom) * sy);
  const viewX = Math.min(Math.max(camera.x * sx - viewW / 2, 0), MAP_W - viewW);
  const viewY = Math.min(Math.max(camera.y * sy - viewH / 2, 0), MAP_H - viewH);

  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * WORLD.width;
    const wy = ((e.clientY - rect.top) / rect.height) * WORLD.height;
    store.getState().centerOnPoint({ x: wx, y: wy });
  };

  return (
    <div
      data-testid="minimap"
      className="wr-minimap"
      style={{ width: MAP_W, height: MAP_H }}
      onClick={onClick}
      role="button"
      aria-label="Minimap — click to move the camera"
    >
      {world.taskIds.map((id) => {
        const pos = world.positions[id];
        if (pos === undefined) return null;
        const task = world.tasks[id];
        return (
          <span
            key={id}
            className={`wr-mini-task wr-mini-task--${task?.view.state ?? 'queued'}`}
            style={{ left: pos.x * sx - 2, top: pos.y * sy - 2 }}
          />
        );
      })}
      {world.unitIds.map((id) => {
        const pos = world.positions[id];
        const unit = world.units[id];
        if (pos === undefined || unit === undefined) return null;
        return (
          <span
            key={id}
            className="wr-mini-unit"
            style={{
              left: pos.x * sx - 1.5,
              top: pos.y * sy - 1.5,
              backgroundColor: factionAccent(unit.view.agent),
            }}
          />
        );
      })}
      {pings.map((ping) => (
        <span
          key={ping.id}
          className="wr-mini-ping"
          style={{ left: ping.x * sx - 4, top: ping.y * sy - 4 }}
        />
      ))}
      <div
        className="wr-mini-view"
        style={{ left: viewX, top: viewY, width: viewW, height: viewH }}
        aria-hidden
      />
    </div>
  );
}
