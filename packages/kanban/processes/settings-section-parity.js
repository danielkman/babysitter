/**
 * @process kanban/settings-section-parity
 * @description Spec-driven implementation process for kanban settings-section parity with first-class navigation, page-level state coverage, adversarial verification, no shell subtasks, and no breakpoints.
 * @inputs { feature: string, packageRoot: string, references: string[], requiredSections: string[], adversarialChecks: string[] }
 * @outputs { success: boolean, interview: object, plan: object, tests: object, implementation: object, verification: object, completeness: object, adversarialReview: object }
 */

function defineTask(id, build) {
  return Object.freeze({
    id,
    build,
  });
}

function evaluateCompleteness(identifiedIssues, coveredChecks) {
  const issues = identifiedIssues.map((issue) => ({
    id: issue.id,
    status: coveredChecks.has(issue.id) ? "addressed" : "unaddressed",
    justification: coveredChecks.has(issue.id)
      ? `Covered during verification for ${issue.id}.`
      : `Verification did not confirm ${issue.id}.`,
  }));
  const addressedCount = issues.filter((issue) => issue.status === "addressed").length;
  return {
    allAddressed: issues.length > 0 && addressedCount === issues.length,
    summary:
      addressedCount === issues.length
        ? `${issues.length} issue(s) evaluated, ${addressedCount} addressed. All issues addressed.`
        : `${issues.length} issue(s) evaluated, ${addressedCount} addressed, ${issues.length - addressedCount} unaddressed. Completeness gate NOT passed.`,
    issues,
  };
}

const interviewTask = defineTask("interview-settings-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Interview settings parity scope for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior product engineer translating a parity ticket into an executable implementation brief",
      task: "Extract the true settings-surface intent, constraints, and review expectations from the ticket and local references.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        references: args.references,
        requiredSections: args.requiredSections,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        "Read the referenced process and methodology files listed in the input.",
        `Read the current implementation under "${args.packageRoot}".`,
        "Summarize the requested parity surfaces, state-model expectations, and explicit non-negotiables.",
        "Treat section-specific loading, unsaved-change handling, and page-level state coverage as first-class requirements rather than implementation details.",
        "Return JSON with clarifiedIntent, nonNegotiables, and likelyFailureModes.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["clarifiedIntent", "nonNegotiables", "likelyFailureModes"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const scopeTask = defineTask("scope-settings-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Scope settings-section parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior frontend architect defining a settings state contract",
      task: "Translate the settings parity ticket into executable acceptance criteria and state-model rules.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        interview: args.interview,
        requiredSections: args.requiredSections,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        `Work from the implementation under "${args.packageRoot}".`,
        "Make the left-nav section model explicit.",
        "Make section-specific loading/error/empty states explicit.",
        "Make dirty-switch handling, missing context recovery, and validation failure presentation explicit.",
        "Return JSON with acceptanceCriteria, filesToInspect, and risks.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["acceptanceCriteria", "filesToInspect", "risks"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const testDesignTask = defineTask("design-settings-parity-tests", (args, taskCtx) => ({
  kind: "agent",
  title: `Design settings parity adversarial tests for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior QA engineer specializing in state-heavy settings regressions",
      task: "Design the smallest high-signal verification plan for settings-section parity.",
      context: {
        feature: args.feature,
        acceptanceCriteria: args.acceptanceCriteria,
        requiredSections: args.requiredSections,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        "Cover section switching with dirty drafts, missing host/project/org context, invalid agent configuration saves, invalid MCP server saves, and section-level loading states.",
        "Require page-level assertions, not just isolated form-field assertions.",
        "Prefer the existing settings page test patterns and mocks in the package.",
        "Return JSON with unitTests, integrationChecks, and expectedFailureModes.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["unitTests", "integrationChecks", "expectedFailureModes"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const implementTask = defineTask("implement-settings-section-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Implement settings-section parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior TypeScript engineer implementing a stateful settings surface",
      task: "Implement the settings-section parity surface, supporting state model, and persistence seams.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        acceptanceCriteria: args.acceptanceCriteria,
        testPlan: args.testPlan,
      },
      instructions: [
        `Work inside "${args.packageRoot}" unless a dependent shared package seam is strictly required.`,
        "Keep the settings sections first-class and navigable.",
        "Do not collapse page-level state into isolated local form behavior.",
        "Preserve or relocate existing settings capabilities instead of regressing them.",
        "Return JSON with filesModified, behaviorsImplemented, and unresolvedRisks.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["filesModified", "behaviorsImplemented", "unresolvedRisks"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const verificationTask = defineTask("verify-settings-section-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Verify settings-section parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Adversarial QA reviewer validating section-state parity",
      task: "Verify the implementation against the settings parity contract and requested adversarial checks.",
      context: {
        feature: args.feature,
        acceptanceCriteria: args.acceptanceCriteria,
        requiredSections: args.requiredSections,
        implementation: args.implementation,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        "Use the exact adversarial check ids from the input when reporting coveredChecks and remainingGaps.",
        "Require proof for section navigation, dirty handling, missing context states, and validation failures.",
        "Call out any missing page-level coverage explicitly.",
        "Return JSON with verdict, passes, coveredChecks, and remainingGaps.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["verdict", "passes", "coveredChecks", "remainingGaps"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

export async function process(inputs, ctx) {
  const interview = await ctx.task(interviewTask, {
    feature: inputs.feature,
    packageRoot: inputs.packageRoot,
    references: inputs.references ?? [],
    requiredSections: inputs.requiredSections ?? [],
    adversarialChecks: inputs.adversarialChecks ?? [],
  });

  const scope = await ctx.task(scopeTask, {
    feature: inputs.feature,
    packageRoot: inputs.packageRoot,
    interview,
    requiredSections: inputs.requiredSections ?? [],
    adversarialChecks: inputs.adversarialChecks ?? [],
  });

  const testPlan = await ctx.task(testDesignTask, {
    feature: inputs.feature,
    acceptanceCriteria: scope.acceptanceCriteria,
    requiredSections: inputs.requiredSections ?? [],
    adversarialChecks: inputs.adversarialChecks ?? [],
  });

  const implementation = await ctx.task(implementTask, {
    feature: inputs.feature,
    packageRoot: inputs.packageRoot,
    acceptanceCriteria: scope.acceptanceCriteria,
    testPlan,
  });

  const verification = await ctx.task(verificationTask, {
    feature: inputs.feature,
    acceptanceCriteria: scope.acceptanceCriteria,
    requiredSections: inputs.requiredSections ?? [],
    implementation,
    adversarialChecks: inputs.adversarialChecks ?? [],
  });

  const requiredChecks = [
    ...(inputs.requiredSections ?? []).map((sectionId) => `section-${sectionId}`),
    ...(inputs.adversarialChecks ?? []),
    "page-level-state-coverage",
  ];
  const coveredChecks = new Set(verification.coveredChecks ?? []);

  const completeness = evaluateCompleteness(
    requiredChecks.map((id) => ({
      id,
      description: `Parity check ${id}`,
      severity: "high",
    })),
    coveredChecks,
  );

  return {
    success: Boolean(verification.passes) && Boolean(completeness.allAddressed),
    interview,
    plan: scope,
    tests: testPlan,
    implementation,
    verification,
    completeness,
    adversarialReview: {
      requestedChecks: requiredChecks,
      coveredChecks: verification.coveredChecks ?? [],
      remainingGaps: verification.remainingGaps ?? [],
    },
    metadata: {
      processId: "kanban/settings-section-parity",
      timestamp: ctx.now(),
      shellTasks: 0,
      breakpoints: 0,
    },
  };
}
