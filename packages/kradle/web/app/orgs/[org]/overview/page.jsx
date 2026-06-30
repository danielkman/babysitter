export const dynamic = 'force-dynamic';

import { DashboardPage } from '../../../ui-shell.jsx';

export const metadata = { title: 'Overview | Kradle' };

export default async function Page({ params }) {
  const { org } = await params;
  return <DashboardPage org={org} />;
}
