import { BacklogOverview } from "@/components/dashboard/backlog-overview";

export default async function ProjectIssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
}) {
  const { projectId, issueId } = await params;

  return (
    <BacklogOverview
      routeMode="issue"
      initialProjectId={projectId}
      initialIssueId={issueId}
    />
  );
}
