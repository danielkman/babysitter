"use client";

import Link from "next/link";
import { LogoWordmark } from "@a5c-ai/compendium";
import { Activity, ShieldCheck, Users } from "lucide-react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { useGatewayAuth } from "@/components/agent-mux/gateway-provider";
import { useBacklog } from "@/hooks/use-backlog";
import { useConnection, useGateway } from "@/lib/agent-mux-ui";

export default function SettingsPage() {
  const { auth, logout, isAuthenticated } = useGatewayAuth();
  const { snapshot } = useBacklog();
  const connection = isAuthenticated ? <SettingsConnected /> : null;
  const project = snapshot?.projects[0];
  const dispatchContextLabels = snapshot?.dispatchContextLabels ?? [];
  const issues = snapshot?.issues ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Settings</p>
        <div className="mt-2">
          <LogoWordmark className="h-6 w-auto" />
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gateway and runtime status</h1>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          The kanban app does not own deep integrations. It points at a running agent-mux gateway and
          observes Babysitter runs from the filesystem watcher and cached run parser.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-xl font-semibold tracking-tight">Gateway auth</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SettingCard label="Gateway URL" value={auth?.gatewayUrl ?? "not connected"} />
          <SettingCard label="Saved token" value={auth ? "configured" : "missing"} />
        </div>
        <div className="mt-4 flex gap-3">
          <Button asChild variant="primary">
            <Link href="/login">
              {isAuthenticated ? "Reconnect gateway" : "Connect gateway"}
            </Link>
          </Button>
          {isAuthenticated ? (
            <Button
              onClick={logout}
              variant="ghost"
              type="button"
            >
              Forget token
            </Button>
          ) : null}
        </div>
      </section>

      {project ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-lg" data-testid="collaboration-settings">
          <h2 className="text-xl font-semibold tracking-tight">Team and collaboration</h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            Collaboration is now modeled explicitly in shared kanban primitives: team roster,
            project policy, activity scope, and role-based permissions all live alongside the board.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <SettingCard
              label="Team"
              value={`${project.team.name} (${project.team.members.length} members)`}
            />
            <SettingCard
              label="Visibility"
              value={`${project.team.settings.visibility} / default ${project.team.settings.defaultRole}`}
            />
            <SettingCard
              label="Workspace policy"
              value={project.settings.workspaceProvisioning}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4" />
                Team roster
              </div>
              <div className="mt-3 space-y-2">
                {project.team.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-foreground">{member.displayName}</div>
                      <div className="text-xs text-foreground-muted">{member.email ?? member.id}</div>
                    </div>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-muted">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4" />
                Permission policy
              </div>
              <div className="mt-3 space-y-2">
                {project.permissions.map((permission) => (
                  <div key={permission.action} className="rounded-xl border border-border bg-card px-3 py-3 text-sm">
                    <div className="font-medium text-foreground">{permission.action}</div>
                    <div className="mt-1 text-xs text-foreground-muted">{permission.description}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {permission.roles.map((role) => (
                        <span key={`${permission.action}-${role}`} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-muted">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4" />
              Recent activity
            </div>
            <div className="mt-3 space-y-2">
              {project.activity.slice(0, 4).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border bg-card px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3 text-xs text-foreground-muted">
                    <span>{entry.actor.displayName}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-foreground">{entry.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {dispatchContextLabels.length > 0 ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-lg" data-testid="dispatch-context-label-settings">
          <h2 className="text-xl font-semibold tracking-tight">Dispatch Context Labels</h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            Reusable execution-context labels stay separate from issue categorization and Task Tags.
            This view keeps the package contract inspectable by showing the stored definitions, where
            they are attached, and which dispatch projections remain visible after dispatch.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SettingCard label="Definitions" value={String(dispatchContextLabels.length)} />
            <SettingCard
              label="Attached issues"
              value={String(
                issues.filter((issue) => issue.dispatch.contextLabels.length > 0).length,
              )}
            />
            <SettingCard
              label="Rendered projections"
              value={String(
                issues.filter((issue) => (issue.dispatch.renderedContext ?? "").length > 0).length,
              )}
            />
          </div>

          <div className="mt-5 space-y-3">
            {dispatchContextLabels.map((contextLabel) => {
              const attachedIssues = issues.filter((issue) =>
                issue.dispatch.contextLabels.some((ref) => ref.labelId === contextLabel.id),
              );

              return (
                <div key={contextLabel.id} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">{contextLabel.label}</div>
                      <div className="text-xs text-foreground-muted">{contextLabel.key}</div>
                    </div>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-muted">
                      {attachedIssues.length} issue{attachedIssues.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {contextLabel.description ? (
                    <p className="mt-2 text-sm text-foreground-muted">{contextLabel.description}</p>
                  ) : null}
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground-secondary">
                    {contextLabel.instruction}
                  </pre>
                  {attachedIssues.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                      {attachedIssues.map((issue) => (
                        <span key={`${contextLabel.id}-${issue.id}`} className="rounded-full border border-border px-2.5 py-1">
                          {issue.key}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {connection}
    </div>
  );
}

function SettingsConnected() {
  const connection = useConnection();
  const { store } = useGateway();
  const agentCount = useStore(store, (state) => state.agents.items.length);
  const sessionCount = useStore(store, (state) => Object.keys(state.sessions.byId).length);
  const runCount = useStore(store, (state) => Object.keys(state.runs.byId).length);

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-lg">
      <h2 className="text-xl font-semibold tracking-tight">Live state</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SettingCard label="Socket status" value={connection.status} />
        <SettingCard label="Agents" value={String(agentCount)} />
        <SettingCard label="Sessions" value={String(sessionCount)} />
        <SettingCard label="Runs" value={String(runCount)} />
      </div>
      {connection.error ? (
        <div className="mt-4 rounded-2xl border border-error/20 bg-error-muted px-4 py-3 text-sm text-error">
          {connection.error}
        </div>
      ) : null}
    </section>
  );
}

function SettingCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-foreground-muted">{props.label}</div>
      <div className="mt-2 text-sm font-medium">{props.value}</div>
    </div>
  );
}
