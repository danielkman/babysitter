import { BacklogOverview } from "@/components/dashboard/backlog-overview";

export default async function ProjectListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">
      <BacklogOverview
        projectId={projectId}
        routeBasePath={`/projects/${projectId}`}
        forcedPresentation="list"
      />
    </div>
  );
}
