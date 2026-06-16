'use client';

import { CommanderRoot } from '../../../../../../../apps/commander/dist-lib/commander.mjs';
import '../../../../../../../apps/commander/dist-lib/commander.css';

export function WarRoomMount({ org, mock = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <CommanderRoot org={org} kradleApiUrl="" mock={mock} />
    </div>
  );
}
