import { BacklogOverview } from "@/components/dashboard/backlog-overview";

export default async function ProjectIssueCreatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <BacklogOverview routeMode="create" initialProjectId={projectId} />;
}
