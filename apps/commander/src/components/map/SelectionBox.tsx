/**
 * SelectionBox (SPEC §5): the marquee rectangle rendered in screen space
 * while drag-selecting on empty map ground.
 */

import { useStore } from 'zustand';

import type { CommanderStore } from '../../game/store';

export interface SelectionBoxProps {
  store: CommanderStore;
}

export function SelectionBox({ store }: SelectionBoxProps): React.JSX.Element | null {
  const marquee = useStore(store, (s) => s.meta.marquee);
  if (marquee === null) return null;
  const left = Math.min(marquee.x0, marquee.x1);
  const top = Math.min(marquee.y0, marquee.y1);
  const width = Math.abs(marquee.x1 - marquee.x0);
  const height = Math.abs(marquee.y1 - marquee.y0);
  return (
    <div
      data-testid="selection-box"
      className="wr-marquee"
      style={{ left, top, width, height }}
      aria-hidden
    />
  );
}
