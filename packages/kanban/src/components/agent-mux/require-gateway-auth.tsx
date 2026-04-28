"use client";

import Link from "next/link";

import { useGatewayAuth } from "@/components/agent-mux/gateway-provider";
import { PageShell } from "@/components/shared/page-shell";
import { PageStateCard } from "@/components/shared/page-state";

export function RequireGatewayAuth(props: { children: React.ReactNode; title?: string; body?: string }) {
  const { isAuthenticated } = useGatewayAuth();

  if (isAuthenticated) {
    return <>{props.children}</>;
  }

  return (
    <PageShell className="justify-center">
      <PageStateCard
        variant="permission"
        eyebrow="Gateway required"
        title={props.title ?? "Connect agent-mux before using this page"}
        description={
          props.body ??
          "This surface depends on live agent-mux collaboration state. Connect through the gateway login flow, then come back here."
        }
        detail="Until access is restored, collaboration and runtime-backed controls stay unavailable on this route."
        actions={[
          { label: "Connect gateway", href: "/login", variant: "primary" },
          { label: "Open settings", href: "/settings" },
        ]}
      />
    </PageShell>
  );
}
