import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, setupUser } from "@/test/test-utils";

import LoginPage from "../page";

const replace = vi.fn();
const mockUseGatewayAuth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("next=%2Fsessions"),
}));

vi.mock("@a5c-ai/compendium", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
    type,
  }: {
    value: string;
    onChange: (event: { target: { value: string } }) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <input
      value={value}
      onChange={(event) => onChange(event as unknown as { target: { value: string } })}
      placeholder={placeholder}
      type={type}
    />
  ),
  LogoWordmark: () => <div>logo</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: { children: ReactNode; asChild?: boolean } & Record<string, unknown>) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

vi.mock("@/components/agent-mux/gateway-provider", () => ({
  useGatewayAuth: () => mockUseGatewayAuth(),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    replace.mockReset();
    mockUseGatewayAuth.mockReset();
  });

  it("submits manual bearer token login by default", async () => {
    const user = setupUser();
    const login = vi.fn().mockResolvedValue(undefined);

    mockUseGatewayAuth.mockReturnValue({
      auth: null,
      runtimeConfig: {
        defaultGatewayUrl: "https://gateway.localdev.me",
        authMode: "manual",
        bootstrapAdminUsername: null,
        bootstrapLoginPath: "/api/v1/bootstrap/login",
      },
      login,
      bootstrapLogin: vi.fn(),
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Bearer token"), "token-123");
    await user.click(screen.getByRole("button", { name: "Connect gateway" }));

    expect(login).toHaveBeenCalledWith({
      gatewayUrl: "https://gateway.localdev.me",
      token: "token-123",
    });
    expect(replace).toHaveBeenCalledWith("/sessions");
  });

  it("defaults to bootstrap-admin flow when runtime config enables it", async () => {
    const user = setupUser();
    const bootstrapLogin = vi.fn().mockResolvedValue(undefined);

    mockUseGatewayAuth.mockReturnValue({
      auth: null,
      runtimeConfig: {
        defaultGatewayUrl: "https://gateway.staging.a5c.ai",
        authMode: "bootstrap-admin",
        bootstrapAdminUsername: "admin",
        bootstrapLoginPath: "/api/v1/bootstrap/login",
      },
      login: vi.fn(),
      bootstrapLogin,
    });

    render(<LoginPage />);

    expect(screen.getByDisplayValue("admin")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Admin password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign in and connect" }));

    expect(bootstrapLogin).toHaveBeenCalledWith({
      gatewayUrl: "https://gateway.staging.a5c.ai",
      username: "admin",
      password: "secret-password",
    });
    expect(replace).toHaveBeenCalledWith("/sessions");
  });
});
