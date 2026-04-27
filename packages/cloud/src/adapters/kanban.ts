import type { CloudConfig, ComponentPlan, KubernetesManifest } from "../types.js";

function resolveImage(config: CloudConfig, releaseTag: string): string {
  return config.images?.kanban ?? `${config.imageRegistry ?? "ghcr.io/a5c-ai/babysitter"}/kanban:${releaseTag}`;
}

export function buildKanbanPlan(config: CloudConfig, releaseTag: string, gatewayServiceName: string, publicUrl: string | undefined): ComponentPlan {
  return {
    id: "kanban",
    enabled: config.components.kanban.enabled,
    image: {
      image: resolveImage(config, releaseTag),
      pullPolicy: "IfNotPresent",
    },
    replicas: config.components.kanban.replicas ?? 1,
    serviceName: "kanban",
    port: 4800,
    internalUrl: "http://kanban:4800",
    ...(publicUrl ? { publicUrl } : {}),
    summary: [
      "kanban Next.js app served via service `kanban`",
      `wired to gateway service ${gatewayServiceName}`,
    ],
  };
}

export function buildKanbanManifests(
  config: CloudConfig,
  plan: ComponentPlan,
  gatewayInternalUrl: string,
  gatewayPublicUrl?: string,
): readonly KubernetesManifest[] {
  if (!plan.enabled) {
    return [];
  }

  const browserGatewayUrl = gatewayPublicUrl ?? gatewayInternalUrl;

  return [
    {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: plan.serviceName,
        namespace: config.namespace,
        labels: {
          "app.kubernetes.io/name": plan.serviceName,
          "app.kubernetes.io/component": "ui",
        },
      },
      spec: {
        replicas: plan.replicas,
        selector: {
          matchLabels: {
            "app.kubernetes.io/name": plan.serviceName,
          },
        },
        template: {
          metadata: {
            labels: {
              "app.kubernetes.io/name": plan.serviceName,
              "app.kubernetes.io/component": "ui",
            },
          },
          spec: {
            containers: [
              {
                name: "kanban",
                image: plan.image.image,
                imagePullPolicy: plan.image.pullPolicy,
                command: ["kanban"],
                args: ["--port", String(plan.port)],
                ports: [{ containerPort: plan.port, name: "http" }],
                env: [
                  { name: "KANBAN_PORT", value: String(plan.port) },
                  { name: "KANBAN_DEFAULT_GATEWAY_URL", value: browserGatewayUrl },
                  { name: "KANBAN_GATEWAY_PROXY_URL", value: gatewayInternalUrl },
                  { name: "KANBAN_GATEWAY_AUTH_MODE", value: config.auth.mode },
                  { name: "KANBAN_BOOTSTRAP_ADMIN_USERNAME", value: config.auth.adminUsername },
                  { name: "NEXT_PUBLIC_GATEWAY_URL", value: browserGatewayUrl },
                ],
              },
            ],
          },
        },
      },
    },
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: plan.serviceName,
        namespace: config.namespace,
      },
      spec: {
        selector: {
          "app.kubernetes.io/name": plan.serviceName,
        },
        ports: [
          {
            name: "http",
            port: plan.port,
            targetPort: plan.port,
          },
        ],
      },
    },
  ];
}
