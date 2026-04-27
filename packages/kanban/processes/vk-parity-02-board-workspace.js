/**
 * @process kanban/vk-parity-02-board-workspace
 * @description Expand the board surface into a routed planning workspace with view parity, richer filters, and bulk actions.
 * @inputs { feature: string, packageRoot: string, scope: string[], constraints: string[] }
 * @outputs { success: boolean, scope: object, implementation: object, verification: object, metadata: object }
 */

function defineTask(id, impl) {
  return {
    id,
    async build(args, ctx) {
      return await impl(args, ctx);
    },
  };
}

const scopeTask = defineTask("scope-board-workspace-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Scope board workspace parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior product engineer",
      task: "Map the requested board workspace parity into concrete implementation requirements.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        scope: args.scope ?? [],
        constraints: args.constraints ?? [],
      },
      instructions: [
        `Read the current implementation under "${args.packageRoot}".`,
        "Translate the requested parity into concrete UI, routing, interaction, and verification requirements.",
        "Call out the minimum viable route model, shared view model, and bulk action surface needed.",
        "Return JSON with acceptanceCriteria, filesToTouch, and risks.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["acceptanceCriteria", "filesToTouch", "risks"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const implementTask = defineTask("implement-board-workspace-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Implement board workspace parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Senior frontend engineer",
      task: "Implement the project-scoped planning workspace and missing board interactions.",
      context: {
        feature: args.feature,
        packageRoot: args.packageRoot,
        acceptanceCriteria: args.acceptanceCriteria,
      },
      instructions: [
        `Work inside "${args.packageRoot}" unless a directly dependent shared type or test needs a minimal update.`,
        "Promote the planning workspace to routed project pages instead of a dashboard-first landing page.",
        "Keep board and list views driven by one filtered/sorted selection model.",
        "Add multi-select, bulk actions, richer filters, and lightweight board customization.",
        "Return JSON with filesModified, capabilitiesAdded, and followUps.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["filesModified", "capabilitiesAdded", "followUps"],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const verifyTask = defineTask("verify-board-workspace-parity", (args, taskCtx) => ({
  kind: "agent",
  title: `Verify board workspace parity for ${args.feature}`,
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Adversarial QA reviewer",
      task: "Verify the planning workspace against the requested parity surface.",
      context: {
        feature: args.feature,
        acceptanceCriteria: args.acceptanceCriteria,
        implementation: args.implementation,
      },
      instructions: [
        "Check route coverage, board/list parity, filter behavior, multi-select, bulk actions, and policy-aware move behavior.",
        "Confirm verification coverage and call out any remaining gaps explicitly.",
        "Return JSON with verdict, coveredChecks, testEvidence, and remainingGaps.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["verdict", "coveredChecks", "testEvidence", "remainingGaps"],
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
    scope: inputs.scope ?? [],
    constraints: inputs.constraints ?? [],
  });

  const implementation = await ctx.task(implementTask, {
    feature: inputs.feature,
    packageRoot: inputs.packageRoot,
    acceptanceCriteria: scope.acceptanceCriteria,
  });

  const verification = await ctx.task(verifyTask, {
    feature: inputs.feature,
    acceptanceCriteria: scope.acceptanceCriteria,
    implementation,
  });

  return {
    success: verification.verdict === "pass" && (verification.remainingGaps?.length ?? 0) === 0,
    scope,
    implementation,
    verification,
    metadata: {
      processId: "kanban/vk-parity-02-board-workspace",
      timestamp: ctx.now(),
      shellTasks: 0,
      breakpoints: 0,
    },
  };
}
