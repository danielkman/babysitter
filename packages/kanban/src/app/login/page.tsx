"use client";

import { Suspense, useEffect, useState } from "react";
import { Field, Input, LogoWordmark } from "@a5c-ai/compendium";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useGatewayAuth } from "@/components/agent-mux/gateway-provider";

type LoginMode = "manual-token" | "bootstrap-admin";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth, runtimeConfig, login, bootstrapLogin } = useGatewayAuth();
  const [mode, setMode] = useState<LoginMode>("manual-token");
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supportsBootstrap = runtimeConfig?.authMode === "bootstrap-admin";

  useEffect(() => {
    setGatewayUrl((current) => current || auth?.gatewayUrl || runtimeConfig?.defaultGatewayUrl || "");
  }, [auth?.gatewayUrl, runtimeConfig?.defaultGatewayUrl]);

  useEffect(() => {
    setUsername((current) => current || runtimeConfig?.bootstrapAdminUsername || "");
  }, [runtimeConfig?.bootstrapAdminUsername]);

  useEffect(() => {
    if (supportsBootstrap) {
      setMode((current) => (current === "manual-token" ? "bootstrap-admin" : current));
    }
  }, [supportsBootstrap]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "bootstrap-admin") {
        await bootstrapLogin({ gatewayUrl, username, password });
      } else {
        await login({ gatewayUrl, token });
      }
      router.replace(searchParams.get("next") || "/sessions");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-6 py-10">
      <form onSubmit={handleSubmit} className="w-full rounded-3xl border border-border bg-card p-8 shadow-lg">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
          agent-mux
        </p>
        <div className="mb-3">
          <LogoWordmark className="h-6 w-auto" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Connect the gateway</h1>
        <p className="mt-3 text-sm leading-6 text-foreground-muted">
          {mode === "bootstrap-admin"
            ? "Sign in with the provisioned bootstrap admin account to mint a browser token, then reconnect to the same gateway between page loads."
            : "The kanban app keeps the gateway URL and bearer token in local storage so it can reconnect to the same agent-mux instance between page loads."}
        </p>

        {supportsBootstrap ? (
          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant={mode === "bootstrap-admin" ? "primary" : "outline"}
              onClick={() => setMode("bootstrap-admin")}
            >
              Bootstrap admin
            </Button>
            <Button
              type="button"
              variant={mode === "manual-token" ? "primary" : "outline"}
              onClick={() => setMode("manual-token")}
            >
              Bearer token
            </Button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <Field label="Gateway URL">
            <Input
              value={gatewayUrl}
              onChange={(event) => setGatewayUrl(event.target.value)}
              placeholder={runtimeConfig?.defaultGatewayUrl ?? "http://127.0.0.1:7878"}
            />
          </Field>

          {mode === "bootstrap-admin" ? (
            <>
              <Field label="Admin username">
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={runtimeConfig?.bootstrapAdminUsername ?? "admin"}
                />
              </Field>
              <Field label="Admin password">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="enter password"
                />
              </Field>
            </>
          ) : (
            <Field label="Bearer token">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="paste token"
              />
            </Field>
          )}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-error/20 bg-error-muted px-4 py-3 text-sm text-error">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={
              submitting ||
              (mode === "bootstrap-admin"
                ? !username.trim() || !password
                : !token.trim())
            }
          >
            {mode === "bootstrap-admin" ? "Sign in and connect" : "Connect gateway"}
          </Button>
        </div>
      </form>
    </section>
  );
}
