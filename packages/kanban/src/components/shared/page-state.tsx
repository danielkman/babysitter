"use client";

import Link from "next/link";
import { AlertTriangle, Inbox, Loader2, ShieldAlert, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type PageStateVariant = "loading" | "empty" | "error" | "offline" | "permission";

export interface PageStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
}

interface PageStateProps {
  variant: PageStateVariant;
  title: string;
  description: string;
  detail?: string | null;
  eyebrow?: string;
  className?: string;
  actions?: readonly PageStateAction[];
  testId?: string;
}

function variantIcon(variant: PageStateVariant) {
  switch (variant) {
    case "loading":
      return Loader2;
    case "empty":
      return Inbox;
    case "offline":
      return WifiOff;
    case "permission":
      return ShieldAlert;
    default:
      return AlertTriangle;
  }
}

function variantFrame(variant: PageStateVariant) {
  switch (variant) {
    case "loading":
      return "border-border bg-card text-foreground";
    case "empty":
      return "border-border bg-card text-foreground";
    case "offline":
      return "border-warning/25 bg-warning/10 text-warning";
    case "permission":
      return "border-info/25 bg-info/10 text-info";
    default:
      return "border-error/25 bg-error-muted text-error";
  }
}

function variantIconFrame(variant: PageStateVariant) {
  switch (variant) {
    case "loading":
      return "border-border bg-background text-foreground-muted";
    case "empty":
      return "border-border bg-background text-foreground-muted";
    case "offline":
      return "border-warning/20 bg-warning/15 text-warning";
    case "permission":
      return "border-info/20 bg-info/15 text-info";
    default:
      return "border-error/20 bg-error/10 text-error";
  }
}

function PageStateActions(props: { actions: readonly PageStateAction[] }) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {props.actions.map((action) => {
        const variant = action.variant ?? "outline";
        if (action.href) {
          return (
            <Button key={`${action.label}-${action.href}`} asChild variant={variant} disabled={action.disabled}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          );
        }

        return (
          <Button
            key={action.label}
            type="button"
            variant={variant}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

export function PageStateCard(props: PageStateProps) {
  const Icon = variantIcon(props.variant);

  return (
    <section
      className={cn("rounded-3xl border p-6 shadow-lg", variantFrame(props.variant), props.className)}
      data-testid={props.testId}
    >
      <div className="flex max-w-4xl items-start gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border", variantIconFrame(props.variant))}>
          <Icon className={cn("h-5 w-5", props.variant === "loading" && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
            {props.eyebrow ?? "Route state"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{props.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground-muted">{props.description}</p>
          {props.detail ? (
            <p className="mt-3 text-sm leading-6 text-foreground-muted">{props.detail}</p>
          ) : null}
          {props.actions && props.actions.length > 0 ? <PageStateActions actions={props.actions} /> : null}
        </div>
      </div>
    </section>
  );
}

export function PageStateBanner(props: PageStateProps) {
  const Icon = variantIcon(props.variant);

  return (
    <section
      className={cn("rounded-3xl border px-5 py-4 shadow-sm", variantFrame(props.variant), props.className)}
      data-testid={props.testId}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", variantIconFrame(props.variant))}>
          <Icon className={cn("h-4.5 w-4.5", props.variant === "loading" && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{props.title}</p>
            <span className="text-xs uppercase tracking-[0.18em] text-foreground-muted">
              {props.eyebrow ?? "Degraded state"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-foreground-muted">{props.description}</p>
          {props.detail ? <p className="mt-1 text-sm leading-6 text-foreground-muted">{props.detail}</p> : null}
          {props.actions && props.actions.length > 0 ? <PageStateActions actions={props.actions} /> : null}
        </div>
      </div>
    </section>
  );
}
