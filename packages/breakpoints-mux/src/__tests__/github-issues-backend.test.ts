import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { GitHubIssuesBackend } from "../backends/github-issues.js";

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ message: body }),
    text: async () => body,
    headers: new Headers(),
  } as Response;
}

describe("GitHubIssuesBackend", () => {
  const backend = new GitHubIssuesBackend({
    owner: "acme",
    repo: "breakpoints",
  });

  it("rejects proven breakpoint requests until signed answers can round-trip", async () => {
    await expect(
      backend.submitBreakpoint({
        text: "Need a signed answer",
        context: {
          description: "Testing proven support",
          codeSnippets: [],
          fileReferences: [],
          tags: [],
        },
        routing: {
          strategy: "single",
          targetResponders: [],
          timeoutMs: 60_000,
          presentToUser: false,
        },
        proven: true,
      }),
    ).rejects.toThrow(/does not support ask_breakpoint\.proven/i);
  });

  it("rejects answer signing requests until signed answers can round-trip", async () => {
    await expect(
      backend.answerBreakpoint("gh-123", {
        responderId: "tal",
        responderName: "Tal M",
        text: "Signed answer",
        sign: true,
      }),
    ).rejects.toThrow(/does not support answer signing/i);
  });
});

describe("GitHubIssuesBackend cancelBreakpoint()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("closes the GitHub issue with a PATCH to state=closed", async () => {
    const backend = new GitHubIssuesBackend({
      owner: "acme",
      repo: "widgets",
    });
    backend.setToken("test-token");
    globalThis.fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(okResponse({})) as typeof globalThis.fetch;

    await backend.cancelBreakpoint("gh-42");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/widgets/issues/42");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    expect(JSON.parse(init.body as string)).toEqual({ state: "closed" });
  });

  it("surfaces GitHub API errors from the cancel request", async () => {
    const backend = new GitHubIssuesBackend({
      owner: "acme",
      repo: "widgets",
    });
    backend.setToken("test-token");
    globalThis.fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValue(errorResponse(500, "server exploded")) as typeof globalThis.fetch;

    await expect(backend.cancelBreakpoint("gh-42")).rejects.toThrow(
      "GitHub API error (500): server exploded",
    );
  });
});
