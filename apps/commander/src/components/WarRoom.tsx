/**
 * WarRoom (SPEC §4 as amended by SPEC-V3): the single full-viewport screen.
 *
 *   TopBar (brass, top) — resources + memory/create buttons + sim clock
 *   THE COGITATOR BOARD (fills everything) — five kanban lanes (§V3-1)
 *   AlertBanner (top-center, while inquiries pend — Inquiry Dock next phase)
 *   Bottom HUD row: EventTicker | SelectionPanel | CommandCard
 *   Inspector (right slide-over) + SteerModal + Foundry + Archive overlay
 *   Narrow-viewport gate (<1100px, SPEC §15)
 *
 * The map canvas, minimap, marquee, link/ping layers and camera are RETIRED
 * (SPEC-V3 header). Keyboard grammar attaches window-scoped via attachInput.
 */

import { useEffect } from 'react';

import { attachInput } from '../game/input';
import type { CommanderStore, Orders } from '../game/store';
import { KanbanBoard } from './board/KanbanBoard';
import { AlertBanner } from './hud/AlertBanner';
import { CommandCard } from './hud/CommandCard';
import { EventTicker } from './hud/EventTicker';
import { SelectionPanel } from './hud/SelectionPanel';
import { TopBar } from './hud/TopBar';
import { Foundry } from './panels/Foundry';
import { Inspector } from './panels/Inspector';
import { MemoryOverlay } from './panels/MemoryOverlay';
import { SteerModal } from './panels/SteerModal';

export interface WarRoomProps {
  store: CommanderStore;
  orders: Orders;
}

export function WarRoom({ store, orders }: WarRoomProps): React.JSX.Element {
  useEffect(() => attachInput({ store, orders }), [store, orders]);

  return (
    <div className="wr-root" data-testid="war-room">
      <TopBar store={store} orders={orders} />
      <KanbanBoard store={store} orders={orders} />
      <AlertBanner store={store} orders={orders} />
      <div className="wr-bottom-row">
        <EventTicker store={store} />
        <SelectionPanel store={store} />
        <CommandCard store={store} orders={orders} />
      </div>
      <Inspector store={store} />
      <SteerModal store={store} orders={orders} />
      <Foundry store={store} orders={orders} />
      <MemoryOverlay store={store} />
      <div className="wr-narrow-gate" role="note">
        <div className="wr-narrow-gate-card">
          <h1>A5C Commander</h1>
          <p>the cogitator requires a wider plate — widen the window to at least 1100px.</p>
        </div>
      </div>
    </div>
  );
}
