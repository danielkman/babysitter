import { describe, expect, it, vi } from "vitest";

import { render, screen, setupUser } from "@/test/test-utils";

import { PageStateBanner, PageStateCard } from "../page-state";

describe("PageState", () => {
  it("renders a loading card with route-state copy", () => {
    render(
      <PageStateCard
        variant="loading"
        title="Loading workspaces"
        description="Waiting for inventory."
      />,
    );

    expect(screen.getByText("Loading workspaces")).toBeInTheDocument();
    expect(screen.getByText("Waiting for inventory.")).toBeInTheDocument();
    expect(screen.getByText("Route state")).toBeInTheDocument();
  });

  it("renders actions and fires click handlers", async () => {
    const user = setupUser();
    const onRetry = vi.fn();

    render(
      <PageStateCard
        variant="error"
        title="Workspace inventory failed"
        description="Retry the request."
        actions={[
          { label: "Retry", onClick: onRetry, variant: "primary" },
          { label: "Open settings", href: "/settings" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute("href", "/settings");
  });

  it("renders a permission banner with disabled actions", () => {
    render(
      <PageStateBanner
        variant="permission"
        title="Browser notifications are blocked"
        description="Enable permission to send alerts."
        actions={[{ label: "Enable notifications", onClick: vi.fn(), disabled: true }]}
      />,
    );

    expect(screen.getByText("Browser notifications are blocked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeDisabled();
  });
});
