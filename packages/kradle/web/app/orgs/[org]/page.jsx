export const dynamic = 'force-dynamic';

import { WarRoomMount } from './_commander/war-room-mount.jsx';

export const metadata = { title: 'Command | Kradle' };

export default async function Page({ params, searchParams }) {
  const { org } = await params;
  const sp = await (searchParams ?? Promise.resolve({}));
  const mock = sp?.mock === '1';
  return <WarRoomMount org={org} mock={mock} />;
}
