import { BacklogOverview } from "@/components/dashboard/backlog-overview";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;

  return <BacklogOverview routeMode="issue" initialIssueId={issueId} />;
}
