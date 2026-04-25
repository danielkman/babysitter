/** @vitest-environment jsdom */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { render, screen } from "@/test/test-utils";
import RunDetailPage from "../page";

const mockUseRunDetail = vi.fn();
const mockUseBacklog = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn(() => null) }),
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>, options?: { loading?: React.ComponentType }) => {
    const ReactModule = React;
    return function DynamicComponent(props: Record<string, unknown>) {
      const [Component, setComponent] = ReactModule.useState<React.ComponentType<Record<string, unknown>> | null>(null);

      ReactModule.useEffect(() => {
        let active = true;
        void Promise.resolve(loader()).then((mod) => {
          const resolved = mod as { default?: React.ComponentType<Record<string, unknown>> };
          if (active) {
            setComponent(() => resolved.default ?? null);
          }
        });
        return () => {
          active = false;
        };
      }, []);

      if (!Component) {
        const Loading = options?.loading;
        return Loading ? <Loading /> : null;
      }

      return <Component {...props} />;
    };
  },
}));

vi.mock("@/hooks/use-run-detail", () => ({
  useRunDetail: (...args: unknown[]) => mockUseRunDetail(...args),
}));

vi.mock("@/hooks/use-backlog", () => ({
  useBacklog: () => mockUseBacklog(),
}));

vi.mock("@/hooks/use-keyboard", () => ({
  useKeyboard: vi.fn(),
}));

vi.mock("@/components/notifications/notification-provider", () => ({
  useNotificationContext: () => ({
    notifications: [],
    dismiss: vi.fn(),
    notify: vi.fn(),
  }),
}));

vi.mock("@/components/shared/outcome-banner", () => ({
  OutcomeBanner: () => <div data-testid="outcome-banner" />,
}));

vi.mock("@/components/shared/metrics-row", () => ({
  MetricsRow: () => <div data-testid="metrics-row" />,
}));

vi.mock("@/components/pipeline/pipeline-view", () => ({
  PipelineView: () => <div data-testid="pipeline-view">pipeline</div>,
}));

vi.mock("@/components/events/event-stream", () => ({
  EventStream: () => <div data-testid="event-stream">events</div>,
}));

vi.mock("@/components/details/task-detail", () => ({
  TaskDetailPanel: () => <div data-testid="task-detail-panel">detail</div>,
}));

vi.mock("@/components/runs/run-realtime-execution-panel", () => ({
  RunRealtimeExecutionPanel: () => <div data-testid="run-realtime-panel">realtime</div>,
}));

vi.mock("@a5c-ai/agent-mux-core/kanban", () => ({
  findKanbanExecutionContextEnvelopesForRun: vi.fn(() => []),
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <svg aria-hidden="true" />,
  Loader2: () => <svg aria-hidden="true" />,
  X: () => <svg aria-hidden="true" />,
}));

const run = {
  runId: "run-1",
  processId: "kanban/process",
  status: "completed" as const,
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
  tasks: [],
  events: [],
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,
  duration: 1_000,
};

describe("RunDetailPage", () => {
  beforeEach(() => {
    mockUseRunDetail.mockReset();
    mockUseBacklog.mockReset();

    mockUseRunDetail.mockReturnValue({
      run,
      loading: false,
      error: null,
      hasBreakpointWaiting: false,
    });
    mockUseBacklog.mockReturnValue({ snapshot: null });
  });

  it("switches the activity panel from the event stream to the realtime execution view", async () => {
    const user = userEvent.setup();

    render(<RunDetailPage params={{ runId: "run-1" }} />);

    expect(await screen.findByTestId("event-stream")).toHaveTextContent("events");
    expect(screen.queryByTestId("run-realtime-panel")).toBeNull();

    await user.click(screen.getByTestId("run-activity-realtime-tab"));

    expect(await screen.findByTestId("run-realtime-panel")).toHaveTextContent("realtime");
    expect(screen.queryByTestId("event-stream")).toBeNull();
  });
});
