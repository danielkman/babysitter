/**
 * @process kanban/workspace-details-sidebar-parity
 * @description Spec-driven implementation process for workspace details sidebar parity with adversarial checks and no shell subtasks.
 * @inputs { feature: string, packageRoot: string, references: string[], adversarialChecks: string[] }
 * @outputs { success: boolean, plan: object, tests: object, implementation: object, verification: object, adversarialReview: object }
 */

import { defineTask } from "@a5c-ai/babysitter-sdk";

const scopeTask = defineTask("scope-sidebar-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Scope workspace sidebar parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior frontend architect running spec-driven parity work",
      task: "Map the required workspace-details-sidebar parity surface into concrete implementation and verification requirements.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        references: args.references,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        `Read the referenced process guides: ${JSON.stringify(args.references)}.`,
        `Read the current implementation under "${args.packageRoot}".`,
        "Translate the requested parity surface into concrete acceptance criteria.",
        "Call out section ordering, visibility, and interaction-state requirements explicitly.",
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

const testDesignTask = defineTask("design-adversarial-tests", (args, taskCtx) => ({
  kind: "agent",
  title: `Design adversarial tests for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior test engineer focused on parity regressions",
      task: "Design the failing-first test plan for workspace sidebar parity.",
      context: {
        feature: args.feature,
        acceptanceCriteria: args.acceptanceCriteria,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        "Design targeted tests for git summary states, runtime disconnects, notes-empty behavior, editor-action failures, and section ordering.",
        "Prefer existing package-local test patterns and fixtures.",
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

const implementTask = defineTask("implement-sidebar-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Implement workspace sidebar parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior TypeScript engineer implementing a compact operational sidebar",
      task: "Implement the sidebar parity surface and its supporting data model.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        acceptanceCriteria: args.acceptanceCriteria,
        testPlan: args.testPlan,
      },
      instructions: [
        `Work only inside "${args.packageRoot}" unless a dependent shared type requires an explicit update.`,
        "Keep the implementation compact and operationally focused.",
        "Add empty, loading, and error states for each sidebar subsection.",
        "Persist notes behavior where needed and ensure quick-action failures stay visible to the operator.",
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

const verificationTask = defineTask("verify-layout-and-states", (args, taskCtx) => ({
  kind: "agent",
  title: `Verify workspace layout and interaction states for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Adversarial QA reviewer",
      task: "Verify the implementation against the parity contract and adversarial conditions.",
      context: {
        feature: args.feature,
        acceptanceCriteria: args.acceptanceCriteria,
        implementation: args.implementation,
        adversarialChecks: args.adversarialChecks,
      },
      instructions: [
        "Check section ordering, visibility, empty/loading/error states, and quick-action behavior.",
        "Explicitly review missing repo metadata, disconnected runtime, no-note state, and editor-action failures.",
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
  const scope = await ctx.task(scopeTask, {
    feature: inputs.feature,
    packageRoot: inputs.packageRoot,
    references: inputs.references ?? [],
    adversarialChecks: inputs.adversarialChecks ?? [],
  });

  const testPlan = await ctx.task(testDesignTask, {
    feature: inputs.feature,
    acceptanceCriteria: scope.acceptanceCriteria,
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
    implementation,
    adversarialChecks: inputs.adversarialChecks ?? [],
  });

  return {
    success: Boolean(verification.passes),
    plan: scope,
    tests: testPlan,
    implementation,
    verification,
    adversarialReview: {
      requestedChecks: inputs.adversarialChecks ?? [],
      coveredChecks: verification.coveredChecks ?? [],
      remainingGaps: verification.remainingGaps ?? [],
    },
    metadata: {
      processId: "kanban/workspace-details-sidebar-parity",
      timestamp: ctx.now(),
      shellTasks: 0,
      breakpoints: 0,
    },
  };
}
