import { execSync } from "node:child_process";

import type {
  BreakpointBackend,
  SubmitBreakpointParams,
  WaitForAnswerOptions,
  SubmitAnswerParams,
  ListRespondersParams,
} from "../backend.js";
import { unsupportedBackendFeatureMessage } from "../backend.js";

import type {
  Breakpoint,
  BreakpointAnswer,
  BreakpointWaitResult,
  ResponderProfile,
  GitHubIssuesBackendConfig,
} from "../types.js";

import {
  generateBreakpointId,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from "../types.js";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  created_at: string;
  updated_at: string;
}

interface GitHubComment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
}

/**
 * Resolve a GitHub token by trying `gh auth token` first,
 * then falling back to the GITHUB_TOKEN environment variable.
 */
export function getGitHubToken(): string {
  try {
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (token) return token;
  } catch {
    // gh CLI not available or not authenticated
  }
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) return envToken;
  throw new Error(
    "No GitHub token found. Install the GitHub CLI and run `gh auth login`, or set the GITHUB_TOKEN environment variable.",
  );
}

/**
 * Minimum character length for a plain-text comment to be treated
 * as an answer from an assigned responder (heuristic).
 */
const PLAIN_TEXT_ANSWER_MIN_LENGTH = 80;

/**
 * Parse an answer from a GitHub issue comment body.
 * Looks for a "## Answer" heading anywhere in the body,
 * a JSON code block with an "answer" field, or a sufficiently
 * long plain-text comment (for assigned responders handled upstream).
 */
export function parseAnswerFromComment(
  body: string,
  options?: { isAssignedResponder?: boolean },
): { text: string; confidence?: number; references?: string[] } | null {
  // Try "## Answer" marker anywhere in the body
  const markerIndex = body.indexOf("## Answer");
  if (markerIndex !== -1) {
    const afterMarker = body.slice(markerIndex + "## Answer".length).trim();
    if (afterMarker.length > 0) {
      // Split off metadata footer (after --- separator)
      const hrIndex = afterMarker.indexOf("\n---\n");
      const answerText = hrIndex !== -1 ? afterMarker.slice(0, hrIndex).trim() : afterMarker;
      let confidence: number | undefined;
      let references: string[] | undefined;
      if (hrIndex !== -1) {
        const footer = afterMarker.slice(hrIndex + 5);
        const confMatch = /\*\*Confidence:\*\*\s*(\d+)\/100/.exec(footer);
        if (confMatch) confidence = parseInt(confMatch[1], 10);
        const refMatch = /\*\*References:\*\*\s*(.+)/.exec(footer);
        if (refMatch) references = refMatch[1].split(",").map((s) => s.trim());
      }
      return { text: answerText, confidence, references };
    }
  }

  // Try JSON code block with "answer" field
  const jsonBlockMatch = body.match(
    /```(?:json)?\s*\n(\{[\s\S]*?\})\s*\n```/,
  );
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]) as Record<string, unknown>;
      if (typeof parsed.answer === "string") {
        return {
          text: parsed.answer,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
          references: Array.isArray(parsed.references) ? parsed.references as string[] : undefined,
        };
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  // Plain-text fallback for assigned responders with long comments
  if (options?.isAssignedResponder && body.trim().length >= PLAIN_TEXT_ANSWER_MIN_LENGTH) {
    return { text: body.trim() };
  }

  return null;
}

/**
 * BreakpointBackend implementation backed by GitHub Issues.
 *
 * Each breakpoint maps to a GitHub issue; answers are detected
 * from issue comments containing "## Answer" markers or JSON blocks.
 */
export class GitHubIssuesBackend implements BreakpointBackend {
  readonly name = "github-issues";

  private owner: string;
  private repo: string;
  private labels: string[];
  private assignees: string[];
  private defaultPollIntervalMs: number;
  private defaultTimeoutMs: number;

  /**
   * Maps breakpointId -> GitHub issue number.
   *
   * **Limitation:** This map is held in-memory and will be lost if the
   * process restarts. Any breakpoint IDs issued before the restart become
   * unresolvable. A persistent storage layer (e.g. file-backed or DB)
   * would be needed for production durability.
   */
  private issueMap = new Map<string, number>();

  private tokenOverride?: string;

  /**
   * Resolve the GitHub issue number from a breakpoint ID.
   * Checks the in-memory map first, then parses the `gh-{number}` format
   * so that IDs survive across backend instances.
   */
  private resolveIssueNumber(breakpointId: string): number {
    const mapped = this.issueMap.get(breakpointId);
    if (mapped !== undefined) return mapped;

    const match = /^gh-(\d+)$/.exec(breakpointId);
    if (match) {
      const num = parseInt(match[1], 10);
      this.issueMap.set(breakpointId, num);
      return num;
    }

    throw new Error(`Unknown breakpoint ID: ${breakpointId}`);
  }

  constructor(config: GitHubIssuesBackendConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.labels = config.labels ?? [];
    this.assignees = config.assignees ?? [];
    this.defaultPollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.defaultTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Override the token resolution for testing.
   * @internal
   */
  setToken(token: string): void {
    this.tokenOverride = token;
  }

  private getToken(): string {
    if (this.tokenOverride) return this.tokenOverride;
    return getGitHubToken();
  }

  private async githubFetch(
    path: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<Response> {
    const maxRetries = 3;
    const token = this.getToken();
    const url = `${GITHUB_API_BASE}${path}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(options.headers as Record<string, string> | undefined),
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, { ...options, headers });

    // Handle rate limiting
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        if (retryCount >= maxRetries) {
          throw new Error(
            `GitHub API rate limit exceeded after ${maxRetries} retries`,
          );
        }
        const waitMs = parseInt(retryAfter, 10) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return this.githubFetch(path, options, retryCount + 1);
      }
      // 403 without Retry-After is likely an auth failure or forbidden repo
      if (response.status === 403) {
        const errorBody = await response.text();
        throw new Error(
          `GitHub API forbidden (403): ${errorBody}`,
        );
      }
    }

    return response;
  }

  private repoPath(): string {
    return `/repos/${this.owner}/${this.repo}`;
  }

  private mapIssueToBreakpoint(
    issue: GitHubIssue,
    breakpointId: string,
  ): Breakpoint {
    const hasAssignee = issue.assignees.length > 0;
    let status: Breakpoint["status"];
    if (issue.state === "closed") {
      status = "completed";
    } else if (hasAssignee) {
      status = "claimed";
    } else {
      status = "pending";
    }

    return {
      id: breakpointId,
      text: issue.title,
      context: {
        description: issue.body ?? "",
        codeSnippets: [],
        fileReferences: [],
        tags: issue.labels.map((l) => l.name),
      },
      status,
      routing: {
        strategy: "single",
        targetResponders: issue.assignees.map((a) => a.login),
        timeoutMs: this.defaultTimeoutMs,
        presentToUser: false,
      },
      answers: [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      expiresAt: new Date(
        new Date(issue.created_at).getTime() + this.defaultTimeoutMs,
      ).toISOString(),
    };
  }

  private formatIssueBody(params: SubmitBreakpointParams): string {
    const parts: string[] = [];
    if (params.context.description) {
      parts.push(params.context.description);
    }
    if (params.context.codeSnippets.length > 0) {
      parts.push("## Code Snippets");
      for (const snippet of params.context.codeSnippets) {
        if (typeof snippet === "string") {
          parts.push("```\n" + snippet + "\n```");
        } else {
          parts.push(
            `### ${snippet.filename}` +
            "\n```" + (snippet.language ?? "") + "\n" +
            snippet.code +
            "\n```",
          );
        }
      }
    }
    if (params.context.fileReferences.length > 0) {
      parts.push("## File References");
      parts.push(params.context.fileReferences.map((f) => `- \`${f}\``).join("\n"));
    }
    if (params.context.tags.length > 0) {
      parts.push(`**Tags:** ${params.context.tags.join(", ")}`);
    }
    if (params.context.urgency) {
      parts.push(`**Urgency:** ${params.context.urgency}`);
    }
    parts.push(`\n---\n*Project: ${params.projectId ?? "unknown"} | Repo: ${params.repoId ?? "unknown"}*`);
    return parts.join("\n\n");
  }

  async submitBreakpoint(params: SubmitBreakpointParams): Promise<Breakpoint> {
    if (params.proven) {
      throw new Error(unsupportedBackendFeatureMessage(this.name, "ask_breakpoint.proven"));
    }

    const breakpointId = generateBreakpointId();
    const urgency = params.context.urgency;
    const issueLabels = [...this.labels];
    if (urgency) {
      issueLabels.push(`urgency:${urgency}`);
    }

    const response = await this.githubFetch(`${this.repoPath()}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: params.text,
        body: this.formatIssueBody(params),
        labels: issueLabels,
        assignees: this.assignees,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
    }

    const issue = (await response.json()) as GitHubIssue;
    this.issueMap.set(breakpointId, issue.number);

    return this.mapIssueToBreakpoint(issue, breakpointId);
  }

  async getBreakpoint(id: string): Promise<Breakpoint> {
    const issueNumber = this.resolveIssueNumber(id);

    const response = await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}`,
    );
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
    }

    const issue = (await response.json()) as GitHubIssue;
    const breakpoint = this.mapIssueToBreakpoint(issue, id);

    // Fetch comments to detect answers
    const assigneeLogins = new Set(issue.assignees.map((a) => a.login));
    const commentsResponse = await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}/comments`,
    );
    if (commentsResponse.ok) {
      const comments = (await commentsResponse.json()) as GitHubComment[];
      for (const comment of comments) {
        if (!comment.body) continue;
        const commenterLogin = comment.user?.login ?? "";
        const isAssignedResponder = assigneeLogins.has(commenterLogin);
        const parsed = parseAnswerFromComment(comment.body, { isAssignedResponder });
        if (parsed) {
          breakpoint.answers.push({
            id: `comment-${comment.id}`,
            breakpointId: id,
            responderId: commenterLogin || "unknown",
            responderName: commenterLogin || "unknown",
            text: parsed.text,
            confidence: parsed.confidence ?? 80,
            references: parsed.references ?? [],
            followUpQuestions: [],
            answeredAt: comment.created_at,
          });
        }
      }
      if (breakpoint.answers.length > 0 && breakpoint.status === "claimed") {
        breakpoint.status = "answered";
      }
    }

    return breakpoint;
  }

  async waitForAnswer(
    id: string,
    options?: WaitForAnswerOptions,
  ): Promise<BreakpointWaitResult> {
    const issueNumber = this.resolveIssueNumber(id);

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const pollIntervalMs = options?.pollIntervalMs ?? this.defaultPollIntervalMs;
    const signal = options?.signal;

    const startTime = Date.now();

    while (true) {
      if (signal?.aborted) {
        const breakpoint = await this.getBreakpoint(id);
        return {
          answered: false,
          breakpoint,
          allAnswers: [],
          resolution: "aborted",
          elapsedMs: Date.now() - startTime,
        };
      }

      // Fetch issue metadata for assignees and state
      const issueMetaResponse = await this.githubFetch(
        `${this.repoPath()}/issues/${issueNumber}`,
      );
      const assigneeLogins = new Set<string>();
      let issueMeta: GitHubIssue | null = null;
      if (issueMetaResponse.ok) {
        issueMeta = (await issueMetaResponse.json()) as GitHubIssue;
        for (const a of issueMeta.assignees) {
          assigneeLogins.add(a.login);
        }
      }

      // Check for comments with answers
      const commentsResponse = await this.githubFetch(
        `${this.repoPath()}/issues/${issueNumber}/comments`,
      );
      if (!commentsResponse.ok) {
        const errorBody = await commentsResponse.text();
        throw new Error(
          `Failed to fetch comments for issue #${issueNumber} (${commentsResponse.status}): ${errorBody}`,
        );
      }
      const comments = (await commentsResponse.json()) as GitHubComment[];
      for (const comment of comments) {
        if (!comment.body) continue;
        const commenterLogin = comment.user?.login ?? "";
        const isAssignedResponder = assigneeLogins.has(commenterLogin);
        const parsed = parseAnswerFromComment(comment.body, { isAssignedResponder });
        if (parsed) {
          const breakpoint = await this.getBreakpoint(id);
          const answer: BreakpointAnswer = {
            id: generateBreakpointId(),
            breakpointId: id,
            responderId: commenterLogin || "unknown",
            responderName: commenterLogin || "unknown",
            text: parsed.text,
            confidence: parsed.confidence ?? 80,
            references: parsed.references ?? [],
            followUpQuestions: [],
            answeredAt: comment.created_at,
          };
          return {
            answered: true,
            breakpoint: { ...breakpoint, status: "answered", answers: [answer] },
            answer,
            allAnswers: [answer],
            elapsedMs: Date.now() - startTime,
          };
        }
      }

      // Check if issue was closed (reuse metadata already fetched)
      if (issueMeta && issueMeta.state === "closed") {
        const breakpoint = this.mapIssueToBreakpoint(issueMeta, id);
        return {
          answered: false,
          breakpoint,
          allAnswers: [],
          resolution: "closed",
          elapsedMs: Date.now() - startTime,
        };
      }

      // Check timeout
      if (Date.now() - startTime >= timeoutMs) {
        const breakpoint = await this.getBreakpoint(id);
        return {
          answered: false,
          breakpoint,
          allAnswers: [],
          resolution: "timeout",
          elapsedMs: Date.now() - startTime,
        };
      }

      // Wait before next poll
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollIntervalMs);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async listResponders(_params?: ListRespondersParams): Promise<ResponderProfile[]> {
    return this.assignees.map((login) => ({
      id: login,
      name: login,
      title: "",
      domains: [],
      tags: [],
      availability: true,
      responseTimeSla: this.defaultTimeoutMs / 1000,
    }));
  }

  async claimBreakpoint(id: string, responderId: string): Promise<Breakpoint> {
    const issueNumber = this.resolveIssueNumber(id);

    // Post claim comment
    await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          body: `Claimed by ${responderId}`,
        }),
      },
    );

    // Actually assign the responder on the GitHub issue
    await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}/assignees`,
      {
        method: "POST",
        body: JSON.stringify({
          assignees: [responderId],
        }),
      },
    );

    return this.getBreakpoint(id);
  }

  async answerBreakpoint(
    id: string,
    answer: SubmitAnswerParams,
  ): Promise<BreakpointAnswer> {
    if (answer.sign || answer.keyFingerprint) {
      throw new Error(unsupportedBackendFeatureMessage(this.name, "answer signing"));
    }

    const issueNumber = this.resolveIssueNumber(id);

    const metadataLines: string[] = [];
    if (answer.confidence !== undefined) {
      metadataLines.push(`**Confidence:** ${answer.confidence}/100`);
    }
    if (answer.references && answer.references.length > 0) {
      metadataLines.push(`**References:** ${answer.references.join(", ")}`);
    }
    const metadataSection = metadataLines.length > 0
      ? `\n\n---\n${metadataLines.join("\n")}`
      : "";
    const commentBody = `## Answer\n\n${answer.text}${metadataSection}`;
    const response = await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: commentBody }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
    }

    const comment = (await response.json()) as GitHubComment;

    // Close the issue now that it's answered
    await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      },
    );

    return {
      id: generateBreakpointId(),
      breakpointId: id,
      responderId: answer.responderId,
      responderName: answer.responderName,
      text: answer.text,
      confidence: answer.confidence ?? 80,
      references: answer.references ?? [],
      followUpQuestions: answer.followUpQuestions ?? [],
      answeredAt: comment.created_at,
      decisionMemory: answer.decisionMemory
        ? { ...answer.decisionMemory, savedAt: new Date().toISOString() }
        : undefined,
    };
  }

  async listPendingBreakpoints(responderId?: string): Promise<Breakpoint[]> {
    const params = new URLSearchParams({
      state: "open",
      assignee: responderId ?? "",
    });
    for (const label of this.labels) {
      params.append("labels", label);
    }

    const response = await this.githubFetch(
      `${this.repoPath()}/issues?${params.toString()}`,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
    }

    const issues: GitHubIssue[] = await response.json() as GitHubIssue[];
    return issues.map((issue) => {
      const breakpointId = `gh-${issue.number}`;
      this.issueMap.set(breakpointId, issue.number);
      return this.mapIssueToBreakpoint(issue, breakpointId);
    });
  }

  async cancelBreakpoint(id: string): Promise<void> {
    const issueNumber = this.resolveIssueNumber(id);

    const response = await this.githubFetch(
      `${this.repoPath()}/issues/${issueNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
    }
  }
}
