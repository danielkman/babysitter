# Advanced Babysitter Patterns - Agent/Skill Execution and Iterative Convergence

**Date:** 2026-01-19
**Added to:** SKILL.md Section 3.7 Common Patterns

---

## Summary

Added four new advanced patterns to the babysitter skill documentation:

1. **Pattern 5:** Agent-based execution (LLM-powered tasks)
2. **Pattern 6:** Skill-based execution (Claude Code skill invocation)
3. **Pattern 7:** Complex iterative convergence with scoring
4. **Pattern 8:** Smoke E2E verification gate (runtime reality check)

These patterns demonstrate sophisticated orchestration capabilities beyond basic task execution.

---

## Pattern 5: Agent-Based Execution

### Concept

Tasks can have `kind: "agent"` to invoke agentic tasks. The orchestrator routes these to the appropriate agent runtime.

### TaskDef Structure

```javascript
{
  kind: "agent",
  title: "Agentic code review",
  description: "Code review using an agent",

  agent: {
    name: "code-reviewer",         // The sub-agent name (not the runtime)
    prompt: {                       // Structured prompt as JSON for clarity
      role: "senior code reviewer",
      task: "Analyze code for quality, security, and best practices",
      context: {
        diff: "...",
        files: [...]
      },
      instructions: [
        "Review each file",
        "Identify issues by severity",
        "Provide suggestions"
      ],
      outputFormat: "Structured JSON with summary and issues"
    },
    outputSchema: {                 // Optional structured output schema
      type: "object",
      properties: { ... }
    }
  },

  io: {
    inputJsonPath: "...",
    outputJsonPath: "..."
  },

  labels: ["agent", "code-review"]
}
```

### Key Features

- **Structured prompts:** Single JSON-structured prompt (role, task, context, instructions, outputFormat)
- **Sub-agent name:** Identifies the specific agent to use (e.g., "code-reviewer", "quality-scorer")
- **Output schema:** Enforce structured JSON output via schema
- **Metadata-driven:** Agent doesn't need to be installed locally - orchestrator handles dispatch

### Example Use Case

Code review agent that:
1. Receives diff and file list
2. Analyzes for quality, security, best practices
3. Returns structured review with issues categorized by severity
4. Process can check for critical issues and breakpoint if found

### Why This Matters

Agents are **just tasks** - no special API needed. Process code treats agent execution the same as any other task:

```javascript
const review = await ctx.task(codeReviewAgentTask, {
  diffContent: inputs.diff
});
```

---

## Pattern 6: Skill-Based Execution

### Concept

Tasks can have `kind: "skill"` to invoke Claude Code skills. Useful for reusing specialized skills within orchestrated workflows.

### TaskDef Structure

```javascript
{
  kind: "skill",
  title: "Analyze with skill",
  description: "Use specialized skill",

  skill: {
    name: "codebase-analyzer",    // Skill identifier
    context: {                     // Structured context with instructions
      scope: "src/",
      depth: "detailed",
      targetFiles: [...],
      analysisType: "consistency",
      criteria: ["Code consistency", "Naming conventions"],
      instructions: [               // Instructions for the skill
        "Scan specified paths",
        "Check consistency",
        "Analyze patterns",
        "Generate report"
      ]
    }
  },

  io: {
    inputJsonPath: "...",
    outputJsonPath: "..."
  },

  labels: ["skill", "analysis"]
}
```

### Key Features

- **Skill invocation:** Call existing skills as tasks
- **Argument passing:** String args + structured context
- **Reusability:** Skills can be composed into larger workflows
- **Metadata-driven:** Skill name + context is all that's needed

### Example Use Case

Invoke a codebase analyzer skill to:
1. Scan specific file paths
2. Check consistency against criteria
3. Return structured analysis results
4. Process can aggregate results from multiple skill invocations

### Why This Matters

Skills become **composable building blocks**. A workflow can orchestrate multiple skills:

```javascript
const analysis1 = await ctx.task(analyzeSkillTask, { scope: "api/" });
const analysis2 = await ctx.task(analyzeSkillTask, { scope: "ui/" });
const combined = mergeAnalyses(analysis1, analysis2);
```

---

## Pattern 7: Complex Iterative Convergence with Scoring

### Concept

Multi-step process where each iteration:
1. **Analyzes** current state
2. **Scores** quality against criteria (using agent)
3. **Improves** based on recommendations (using agent)
4. **Verifies** improvements
5. **Loops** until convergence (score >= threshold)

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Iterative Convergence Loop                     │
│                                                  │
│  ┌──────────┐     ┌──────────┐                 │
│  │ Analyze  │ --> │  Score   │ (agent-based)   │
│  │ (node)   │     │ (0-100)  │                 │
│  └──────────┘     └────┬─────┘                 │
│                        │                        │
│                 [score >= threshold?]           │
│                   │           │                 │
│                  YES         NO                 │
│                   │           │                 │
│              ┌────┴───┐  ┌───┴─────┐           │
│              │ Return │  │ Improve │ (agent)   │
│              └────────┘  └────┬────┘           │
│                               │                 │
│                          ┌────┴────┐           │
│                          │ Verify  │ (node)    │
│                          └────┬────┘           │
│                               │                 │
│                          [passed?]              │
│                          │      │               │
│                         YES    NO               │
│                          │      │               │
│                     [loop]  [breakpoint]        │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Key Features

1. **Score-based convergence:** Clear threshold (e.g., 85/100)
2. **Multi-criteria evaluation:** Agent evaluates against 5+ criteria
3. **Safety mechanisms:**
   - `maxIterations` prevents infinite loops
   - Breakpoint if minimal improvement (< 5 points)
   - Breakpoint if verification fails
   - Breakpoint if max iterations reached
4. **Progress tracking:** `history` array records each iteration
5. **Labeled tasks:** Each task labeled with iteration number for traceability
6. **Agent-based scoring:** LLM evaluates subjective quality
7. **Structured output:** Agent returns scores with justifications

### Example Iteration Flow

**Iteration 1:**
```
Analyze → Score: 45/85 → Improve → Verify → Loop
```

**Iteration 2:**
```
Analyze → Score: 62/85 → Improve → Verify → Loop
```

**Iteration 3:**
```
Analyze → Score: 68/85 (improvement only +6)
         ↓
    [Breakpoint: "Minimal improvement detected"]
         ↓
    Human reviews → Continues
```

**Iteration 4:**
```
Analyze → Score: 87/85 ✓ Converged!
```

### Breakpoint Routing

Breakpoints support routing fields to control who receives them and how responses are collected:

```javascript
const approval = await ctx.breakpoint({
  question: "Review the security audit results?",
  options: ["Approve", "Request changes"],
  expert: "security-reviewer",       // route to a specific domain expert
  tags: ["security", "audit"],       // categorization tags for filtering
  strategy: "first-response-wins",   // collect strategy (single | first-response-wins | collect-all | quorum)
});
```

Use `expert: 'owner'` to route back to the run requester. The `strategy` field is only meaningful when `expert !== 'owner'`.

### Breakpoint Rejection Handling — Retry/Refine Pattern

Processes must ALWAYS loop back on rejection, never fail. Use `previousFeedback` and `attempt` fields to track retry state:

```javascript
let lastFeedback = null;
for (let attempt = 0; attempt < 3; attempt++) {
  if (lastFeedback) {
    currentResult = await ctx.task(refineTask, { ...args, feedback: lastFeedback, attempt: attempt + 1 });
  }
  const approval = await ctx.breakpoint({
    question: 'Review and approve this step?',
    options: ['Approve', 'Request changes'],
    expert: 'owner',
    tags: ['approval-gate'],
    previousFeedback: lastFeedback || undefined,
    attempt: attempt > 0 ? attempt + 1 : undefined,
  });
  if (approval.approved) break;
  lastFeedback = approval.response || approval.feedback || 'Changes requested';
}
```

### Breakpoint Strategy

Smart breakpoints prevent wasted iterations:

1. **Minimal improvement:** `< 5 points` triggers review
   - Prevents oscillation
   - Human can adjust criteria or accept current state

2. **Verification failure:** Improvements break tests
   - Human reviews what went wrong
   - Can rollback or fix

3. **Max iterations:** Didn't converge in time
   - Human decides: accept or continue with more iterations
   - Prevents infinite loops

### History Tracking

Each iteration records:
```javascript
{
  iteration: 3,
  score: 68,
  analysis: { ... },
  scoring: {
    overallScore: 68,
    criteriaScores: [
      { criterion: "Best practices", score: 75, justification: "..." },
      { criterion: "Edge cases", score: 60, justification: "..." },
      ...
    ],
    recommendations: ["Add null checks", "Improve error messages"]
  },
  improvements: {
    changesMade: ["Added null checks in api.js", ...],
    filesModified: ["api.js", "utils.js"]
  },
  verification: {
    passed: true
  }
}
```

This enables:
- **Debugging:** See exactly what happened each iteration
- **Auditing:** Full trail of decisions and changes
- **Learning:** Analyze convergence patterns

### Agent-Based Scoring

The `scoreTask` uses an agent to evaluate quality:

**Agent Prompt (structured JSON):**
```json
{
  "role": "quality scorer",
  "task": "Evaluate the code against criteria and return a score 0-100",
  "context": {
    "analysis": { ... },
    "criteria": [
      "Code follows best practices",
      "All edge cases handled",
      "Error handling comprehensive",
      "Documentation clear",
      "Performance optimized"
    ],
    "iteration": 3
  },
  "instructions": [
    "Review the analysis results",
    "Score each criterion from 0-100",
    "Provide justification for each score",
    "Calculate overall score (average of criteria scores)",
    "Generate actionable recommendations for improvement"
  ],
  "outputFormat": "JSON with overallScore, criteriaScores array, and recommendations array"
}
```

**Output (structured):**
```json
{
  "overallScore": 68,
  "criteriaScores": [
    {
      "criterion": "Code follows best practices",
      "score": 75,
      "justification": "Good use of async/await, but some magic numbers"
    },
    {
      "criterion": "All edge cases handled",
      "score": 60,
      "justification": "Missing null checks in 3 locations"
    },
    ...
  ],
  "recommendations": [
    "Add null checks in parseInput(), handleRequest(), formatOutput()",
    "Extract magic numbers to named constants",
    "Add JSDoc comments for public API"
  ]
}
```

### Why This Pattern Matters

**Real-world applicability:**
- Code quality improvement
- Design iteration
- Content refinement
- Test coverage optimization
- Performance tuning

**Deterministic + Subjective:**
- Combines objective verification (tests pass)
- With subjective evaluation (code quality)
- Agent provides consistency in scoring

**Resumable:**
- Each iteration is event-sourced
- Can pause and resume
- Full audit trail of convergence

**Safe:**
- Multiple safety mechanisms
- Human oversight at key decision points
- No infinite loops

---

## Integration Examples

### Combining Patterns

You can combine these patterns in sophisticated ways:

**Example: Multi-phase improvement with agent review**

```javascript
export async function process(inputs, ctx) {
  // Phase 1: Automated analysis
  const staticAnalysis = await ctx.task(analyzeTask, inputs);

  // Phase 2: Agent-based code review
  const agentReview = await ctx.task(codeReviewAgentTask, {
    analysis: staticAnalysis,
    files: inputs.files
  });

  // Phase 3: Skill-based specialized check
  const securityCheck = await ctx.task(securitySkillTask, {
    scope: inputs.target,
    findings: agentReview.issues
  });

  // Phase 4: Iterative improvement if issues found
  if (securityCheck.criticalIssues.length > 0) {
    const approval = await ctx.breakpoint({
      reason: "Critical security issues",
      issues: securityCheck.criticalIssues,
      question: "Start iterative improvement?",
      options: ["Approve", "Reject"]
    });
    if (!approval.approved) {
      return { ok: false, reason: "User rejected iterative improvement", feedback: approval.response || approval.feedback };
    }

    // Run convergence loop (Pattern 7)
    const improvement = await ctx.task(iterativeImprovementTask, {
      issues: securityCheck.criticalIssues,
      threshold: 90
    });

    return improvement;
  }

  return { ok: true, review: agentReview };
}
```

This combines:
- Node task (static analysis)
- Agent task (code review)
- Skill task (security check)
- Iterative convergence (improvement loop)
- Breakpoints (human approval)

---

## Effect Execution Hints

Tasks can include an `execution` field to express preferences about how the effect should be dispatched:

```javascript
defineTask('security-scan', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Security vulnerability scan',
  execution: {
    model: 'claude-opus-4-6',       // universal — used by plugins + internal harness
    harness: 'pi',                  // internal harness only — ignored by plugins
    permissions: ['file:read', 'net:fetch'],  // internal harness only
  },
  agent: {
    name: 'security-scanner',
    prompt: {
      role: 'Security engineer',
      task: 'Scan for vulnerabilities',
      context: { ...args },
      instructions: ['Scan dependencies', 'Check for known CVEs'],
      outputFormat: 'JSON'
    },
    outputSchema: { type: 'object', required: ['findings'] }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));
```

**Field scope:**

| Field | Scope | Description |
|-------|-------|-------------|
| `execution.model` | Universal | Preferred model for the task. Used by both plugins and internal harness. |
| `execution.harness` | Internal harness only | Preferred harness CLI. ONLY used by `harness:create-run`. Ignored by plugins. |
| `execution.permissions` | Internal harness only | Free-form permission list. ONLY used by `harness:create-run`. |

**Note:** In plugin SKILL.md files, the `harness` field is ignored. Only `model` is considered for subagent selection.

---

## Task Kind Reference

Based on these patterns, here are the task `kind` values:

| Kind | Description | Executor |
|------|-------------|----------|
| `node` | Node.js script | Local node process |
| `agent` | LLM-powered agent | Agent runtime (Claude Code, etc.) |
| `skill` | Claude Code skill | Skill system |
| `breakpoint` | Human intervention | UI/CLI |
| `sleep` | Time gate | Scheduler |
| `orchestrator_task` | Orchestrator-internal | Orchestrator |

All task kinds use the same `ctx.task()` API - the orchestrator routes based on `kind`.

---

## Best Practices

### When to Use Agent Tasks

✅ **Good use cases:**
- Code review and analysis
- Documentation generation
- Test case generation
- Refactoring suggestions
- Design feedback

❌ **Avoid for:**
- Simple data transformation (use node task)
- Deterministic computation (use node task)
- File I/O operations (use node task)

### When to Use Skill Tasks

✅ **Good use cases:**
- Reusing existing skills in workflows
- Composing multiple specialized tools
- Delegating complex multi-step work

❌ **Avoid for:**
- Simple operations (write new task)
- When you need full control (use node/agent)

### When to Use Iterative Convergence

✅ **Good use cases:**
- Quality improvement loops
- Multi-criteria optimization
- Refinement processes
- Test-driven development

❌ **Avoid for:**
- One-shot operations
- Deterministic algorithms
- Simple validation

---

---

## Pattern 8: Smoke E2E Verification Gate

### Concept

For processes that modify full-stack web applications (Next.js, Remix, Nuxt, SvelteKit, etc.), static verification is not enough. TypeScript compilation passes, unit tests pass, and the final verifier declares success — but the first real page load crashes because of stale dev servers, missing migrations, hardcoded UI stubs, broken click handlers, or dead code in type-safe layers.

The Smoke E2E Gate is a phase that sits between Integration and Testing. It restarts the dev server, seeds a known admin user, runs a small set of Playwright tests that log in and visit every new route, and **hard-fails the run** if any smoke test fails. It is the runtime reality check that static verification cannot provide.

### Motivation (from a real failure)

A 12-phase Next.js + Prisma process declared itself complete at 96/100. Seven significant runtime bugs were found by the user in the first hour:

- Stale Prisma client cached in a dev server running since Friday
- Schema migration silently failed (`exit 1` accepted as "passed: false")
- Hardcoded UI notifications that looked real but had no API wiring
- "View Report" button with a click handler that set state but never navigated
- Dead code in `pdf-renderer.ts` bypassed by an inline HTML builder in the route handler
- Flagship feature gated on `severity === 'CRITICAL'` but axe maps `serious` → `MAJOR`, so zero issues ever qualified
- Interactive viewer required a field that was never populated

**All seven** would have been caught by a 30-second smoke suite that logs in and visits the new routes. None would have been caught by the pre-existing verification (TS compile + unit tests + file-existence grep).

### TaskDef Structure

```javascript
import { defineTask } from '@a5c-ai/babysitter-sdk';

export const smokeE2eTask = defineTask('smoke-e2e', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Smoke E2E — runtime reality check',
  agent: {
    name: 'e2e-testing',
    prompt: {
      role: 'E2E Reality Tester — you verify the app ACTUALLY WORKS, not just compiles',
      task: 'Run smoke E2E tests against a freshly-restarted dev server to catch runtime bugs that static checks miss',
      context: {
        projectDir: args.projectDir,
        known_failure_modes: [
          'Dev server has stale Prisma client cached from before schema changes',
          'Migrations silently failed due to missing DATABASE_URL',
          'Hardcoded UI stubs that look real but have no API wiring',
          'Click handlers that set state but never fetch or navigate',
          'Dead code in type-safe layers that are never reached at runtime'
        ]
      },
      instructions: [
        '1. Kill any running dev server: `pgrep -f "next dev.*<projectDir>" | xargs kill 2>/dev/null; sleep 2`',
        '2. Restart dev server in background and wait for "Ready in" in the log (up to 30s)',
        '3. Seed a SYSTEM_ADMIN test user with a known password',
        '4. Create smoke spec directory `tests/e2e/smoke/` if it does not exist',
        '5. Create or verify smoke specs covering (at minimum):',
        '   - login page renders, accepts credentials, redirects to dashboard',
        '   - dashboard loads without runtime error overlay',
        '   - every new route from the plan loads without error',
        '   - any new buttons have working click handlers (click → assert URL or DOM changed)',
        '6. Run: `npx playwright test tests/e2e/smoke/ --project=chromium --reporter=json`',
        '7. Parse the JSON result to count passed/failed tests',
        '8. Return { passed, totalTests, failedTests, failures, artifacts }',
        '9. DO NOT return passed:true unless every smoke test actually passed'
      ],
      outputFormat: 'JSON matching the output schema below'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'totalTests', 'failedTests', 'failures', 'artifacts'],
      properties: {
        passed: { type: 'boolean' },
        totalTests: { type: 'number' },
        failedTests: { type: 'number' },
        failures: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`
  },
  labels: ['smoke', 'e2e', 'verification', 'runtime']
}));
```

### Usage in Process

Place the smoke phase **between Integration and Testing** phases, and **hard-fail the process** on any smoke failure. Do not let the run continue to declare success on a broken build.

```javascript
export async function process(inputs, ctx) {
  // ... earlier phases: planning, schema, features, integration ...

  // Phase 9.5: Smoke E2E — runtime reality check
  ctx.log('info', 'Phase 9.5: Smoke E2E — runtime reality check');

  const smokeResult = await ctx.task(smokeE2eTask, {
    projectDir: inputs.projectDir,
    features
  });

  if (!smokeResult.passed) {
    throw new Error(
      `Phase 9.5 Smoke E2E FAILED. ` +
      `${smokeResult.failedTests}/${smokeResult.totalTests} tests failed. ` +
      `Do not proceed until the app actually works when a user clicks. ` +
      `Failures: ${JSON.stringify(smokeResult.failures)}`
    );
  }

  // ... later phases: testing, security, final verification ...
}
```

### Paired Final Verification Rules

The Smoke E2E Gate is most effective when the Final Verification phase grades based on the smoke result, not on static signals. Replace "count passing unit tests" with:

- If ANY smoke test failed: score is AT MOST 50 regardless of other metrics
- If the smoke suite cannot run at all (dev server dead, etc): score is 0
- If unit tests fail but smokes pass: score capped at 75
- If both suites fully pass: score up to 95 (never 100 — there's always improvement)
- TypeScript compilation, accessibility checks, etc. contribute at most a +5 bonus **only when smoke tests pass**

### Minimum Viable Smoke Suite

For a Next.js + Prisma project, a viable smoke suite is 3–5 tests:

```typescript
// tests/e2e/smoke/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test('home redirects to login for unauthenticated users', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await expect(page).toHaveURL(/login/);
});

test('login page renders', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('authenticated dashboard loads without prisma error', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', process.env.SMOKE_USER_EMAIL!);
  await page.fill('input[type="password"]', process.env.SMOKE_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });

  const content = await page.content();
  expect(content).not.toContain('Runtime TypeError');
  expect(content).not.toContain('Cannot read properties of undefined');
});
```

Add one smoke test per new top-level route introduced by the process. The goal is not coverage — it is "does the page render as an authenticated user without a red error overlay."

### When to Use Smoke E2E Gate

✅ **Good use cases:**
- Full-stack web processes (Next.js, Remix, Nuxt, SvelteKit, Astro)
- Any process that modifies both database schema and UI
- Processes that claim to wire up new navigation routes
- Refactors that span multiple layers (DB → API → UI)

❌ **Avoid for:**
- Pure library refactors with no runtime (unit tests are sufficient)
- Static site generators where there is no interactive runtime
- Processes where the user will manually verify — the gate adds overhead for solo dev work

### Anti-patterns to avoid

- **Stub smoke tests** marked `test.fixme` that require "auth/DB seeding": these provide the illusion of verification. Either the test actually runs or it doesn't count.
- **`|| true` around migration steps**: swallowing exit codes lets broken schema state cascade into the smoke phase, producing confusing failures. Fail hard in Phase 2.
- **Running smokes against a stale dev server**: the kill-restart-wait sequence is non-negotiable. Module caching in Node.js means regenerating Prisma client files on disk does nothing for a running process.
- **Scoring >50 with any smoke failure**: don't let the verifier invent a high score when a real user's click would crash. Hard-cap the score.

---

## Summary

These four patterns extend babysitter's capabilities:

1. **Agent tasks** - LLM-powered work with structured I/O
2. **Skill tasks** - Composable skill invocation
3. **Iterative convergence** - Score-based improvement loops with safety mechanisms
4. **Smoke E2E gate** - Runtime reality check that hard-fails on any failure

All patterns use the same SDK API (`ctx.task()`), maintaining consistency while enabling sophisticated workflows. The Smoke E2E Gate pattern pairs especially well with Iterative Convergence when used as the quality-gate for UI-heavy refinement loops.
