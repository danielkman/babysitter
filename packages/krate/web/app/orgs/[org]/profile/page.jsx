export const dynamic = 'force-dynamic';

import { UserProfilePage } from '../../../ui-shell.jsx';

export default async function Page({ params }) {
  const routeParams = await params;
  const org = routeParams.org;
  return <UserProfilePage org={org} />;
}
