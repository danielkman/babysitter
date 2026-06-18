'use client';

import { CommanderRoot } from '../../../../../../../apps/commander/dist-lib/commander.mjs';
import '../../../../../../../apps/commander/dist-lib/commander.css';

/**
 * Escape affordance: the WarRoom is a full-viewport takeover of the org home and
 * drops kradle's topbar/sidebar, so without this there is no way back to the rest
 * of the console. A small Aegis-styled pill links to the org dashboard (which
 * carries the full kradle nav). Pinned top-left (the conventional "back" spot),
 * with a very high z-index so it sits above the HUD.
 */
const CONSOLE_LINK_STYLE = {
  position: 'fixed',
  top: '8px',
  left: '10px',
  zIndex: 2147483000,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 11px',
  borderRadius: '7px',
  background: 'rgba(25, 26, 20, 0.94)',
  color: '#e2d3ac',
  border: '1px solid #b9913f',
  boxShadow: '0 6px 18px rgba(58, 42, 18, 0.4), inset 0 0 0 1px rgba(216, 181, 97, 0.26)',
  font: "600 11px/1.2 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  backdropFilter: 'blur(3px)',
};

export function WarRoomMount({ org, mock = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <CommanderRoot org={org} kradleApiUrl="" mock={mock} />
      <a
        href={`/orgs/${org}/overview`}
        aria-label="Back to the Kradle console"
        title="Back to the Kradle console"
        style={CONSOLE_LINK_STYLE}
      >
        <span aria-hidden="true">&#8249;</span> Kradle console
      </a>
    </div>
  );
}
