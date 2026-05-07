import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAppOrigin,
  createOAuthStateToken,
  createSessionToken,
  normalizeCallbackUrl,
  verifyOAuthStateToken,
  verifySessionToken,
} from "../auth";

describe("atlas auth helpers", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "atlas-test-secret");
  });

  it("normalizes callback URLs to local application paths", () => {
    expect(normalizeCallbackUrl("/workspace/graphs")).toBe("/workspace/graphs");
    expect(normalizeCallbackUrl("https://evil.example")).toBe("/workspace");
    expect(normalizeCallbackUrl("//evil.example")).toBe("/workspace");
    expect(normalizeCallbackUrl("workspace")).toBe("/workspace");
    expect(normalizeCallbackUrl(undefined, "/workspace/company-builder")).toBe("/workspace/company-builder");
  });

  it("round-trips session and OAuth state tokens and rejects tampering", () => {
    const sessionToken = createSessionToken({
      id: "user-1",
      email: "user@example.com",
      name: "Atlas User",
      image: null,
      login: "atlas-user",
    });
    expect(verifySessionToken(sessionToken)).toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Atlas User",
        image: null,
        login: "atlas-user",
      },
    });

    const [body, signature] = sessionToken.split(".");
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(verifySessionToken(`${body}.${tamperedSignature}`)).toBeNull();

    const stateToken = createOAuthStateToken("https://bad.example/workspace");
    expect(verifyOAuthStateToken(stateToken)).toMatchObject({
      callbackUrl: "/workspace",
    });
  });

  it("builds the app origin from forwarded headers when present", () => {
    const request = new Request("http://internal.local/api/auth/github", {
      headers: {
        host: "internal.local",
        "x-forwarded-host": "atlas.a5c.ai",
        "x-forwarded-proto": "https",
      },
    });

    expect(buildAppOrigin(request)).toBe("https://atlas.a5c.ai");
  });
});
