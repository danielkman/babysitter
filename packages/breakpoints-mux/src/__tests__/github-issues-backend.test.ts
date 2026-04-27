import { describe, it, expect } from "vitest";
import { GitHubIssuesBackend } from "../backends/github-issues.js";

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
