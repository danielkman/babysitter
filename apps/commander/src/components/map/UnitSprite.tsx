/**
 * UnitSprite (SPEC §3): portrait slot (procedural SVG), state ring with
 * per-state color/animation, health bar (context headroom), energy bar
 * (budget remaining), rank chevrons (turnCount), selection ring.
 *
 * Memoized on primitive props (SPEC §14) — the world layer re-renders each
 * tick, but unchanged sprites bail out. Position animates via a CSS
 * transform transition (ease-out glide, SPEC §10).
 */

import { memo } from 'react';
import clsx from 'clsx';

const MAX_CHEVRONS = 5;

export interface UnitSpriteProps {
  id: string;
  title: string;
  agent: string;
  state: string;
  /** Operator hold (Pause command) — orthogonal to the §3 visual state. */
  paused: boolean;
  x: number;
  y: number;
  selected: boolean;
  /** 0..1 — context headroom (health). */
  healthPct: number;
  /** 0..1 — budget remaining (energy). */
  energyPct: number;
  turnCount: number;
  iconSvg: string;
}

function UnitSpriteImpl({
  id,
  title,
  agent,
  state,
  paused,
  x,
  y,
  selected,
  healthPct,
  energyPct,
  turnCount,
  iconSvg,
}: UnitSpriteProps): React.JSX.Element {
  const chevrons = Math.min(MAX_CHEVRONS, turnCount);
  return (
    <div
      data-testid={`unit-${id}`}
      data-entity-id={id}
      data-entity-kind="unit"
      className={clsx(
        'wr-unit',
        `wr-unit--${state}`,
        `wr-faction--${agent}`,
        selected && 'is-selected',
        paused && 'is-paused',
      )}
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
    >
      <div className="wr-unit-body">
        <div className="wr-unit-ring" aria-hidden />
        <div className="wr-unit-portrait" dangerouslySetInnerHTML={{ __html: iconSvg }} />
        {paused && (
          <span className="wr-unit-badge wr-unit-badge--paused" aria-hidden>
            II
          </span>
        )}
        {!paused && state === 'blocked' && (
          <span className="wr-unit-badge wr-unit-badge--warn" aria-hidden>
            !
          </span>
        )}
        {!paused && state === 'awaiting_approval' && (
          <span className="wr-unit-badge wr-unit-badge--alert" aria-hidden>
            ?
          </span>
        )}
        <div className="wr-unit-bars" aria-hidden>
          <div className="wr-bar wr-bar--health">
            <div className="wr-bar-fill" style={{ width: `${Math.round(healthPct * 100)}%` }} />
          </div>
          <div className="wr-bar wr-bar--energy">
            <div className="wr-bar-fill" style={{ width: `${Math.round(energyPct * 100)}%` }} />
          </div>
        </div>
        {chevrons > 0 && (
          <div className="wr-unit-chevrons" aria-hidden>
            {Array.from({ length: chevrons }, (_, i) => (
              <span key={i} className="wr-chevron" />
            ))}
          </div>
        )}
        <div className="wr-unit-label">{title}</div>
      </div>
    </div>
  );
}

export const UnitSprite = memo(UnitSpriteImpl);
