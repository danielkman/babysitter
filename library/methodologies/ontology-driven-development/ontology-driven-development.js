/**
 * @process methodologies/ontology-driven-development
 * @description Enhanced Ontology-Driven Development - Robust methodology for complex enterprise scenarios with advanced complexity management, stakeholder alignment, and quality assurance
 * @inputs { projectName: string, domainDescription?: string, ontologyScope?: string, projectComplexity?: string, stakeholderContext?: string, domainType?: string, riskProfile?: string }
 * @outputs { success: boolean, schema: object, knowledgeGraph: object, generators: object, documentation: object, testing: object, sdk: object, interfaces: object, governance: object, riskMitigation: object, metadata: object }
 *
 * @example
 * const result = await orchestrate('methodologies/ontology-driven-development', {
 *   projectName: 'Enterprise Patient Care Platform',
 *   domainDescription: 'Multi-tenant healthcare platform serving 50+ hospitals',
 *   ontologyScope: 'encyclopedic',
 *   projectComplexity: 'enterprise',
 *   stakeholderContext: 'multi-organizational',
 *   domainType: 'healthcare-regulatory',
 *   riskProfile: 'high'
 * });
 *
 * @references
 * - Research: Enterprise Ontology Engineering Best Practices (2024)
 * - METHONTOLOGY enhanced with agile practices
 * - NeOn methodology for networked ontologies
 * - Enterprise Knowledge Graph Development patterns
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * Enhanced Ontology-Driven Development Process
 *
 * Methodology: Advanced graph-centric development with enterprise-grade complexity management,
 * multi-stakeholder alignment, robust quality assurance, and domain-specific adaptations.
 *
 * Research-Based Enhancements:
 * - Modular ontology design patterns for complexity management
 * - Multi-stakeholder alignment with collaborative modeling
 * - Advanced quality assurance with multi-level validation
 * - Domain-specific adaptation frameworks
 * - Risk management and technical debt prevention
 * - Enterprise tool integration and governance
 * - Change management for evolving requirements
 * - Scalability patterns for large organizations
 *
 * Complexity Management Framework:
 * - Modular design with clear boundaries and interfaces
 * - Dependency management for ontology modules
 * - Automated complexity monitoring and alerts
 * - Progressive refinement with complexity gates
 *
 * Enhanced Phase Structure:
 * 0. Project Analysis & Planning - Assess complexity, stakeholders, risks
 * 1. Modular Schema Definition - Domain-aware modular ontology design
 * 2. Collaborative Knowledge Graph Construction - Multi-stakeholder modeling
 * 3. Adaptive Generator Creation - Domain-specific generator patterns
 * 4. Strategic Documentation & Wiki - Stakeholder-aligned documentation
 * 5. Multi-Level Testing & Quality - Comprehensive validation framework
 * 6. Governance-Aware SDK Development - Enterprise integration patterns
 * 7. Federated Interface Development - Multi-stakeholder interface design
 * 8. Scalable UI Development - Enterprise-grade user interfaces
 * 9. Governance & Risk Management - Continuous governance and risk mitigation
 *
 * Advanced Quality Convergence:
 * - Multi-dimensional quality metrics (technical, business, stakeholder satisfaction)
 * - Adversarial review with domain expert panels
 * - Automated consistency checking and validation
 * - Business value measurement and ROI tracking
 * - Stakeholder alignment scoring
 * - Technical debt monitoring and prevention
 *
 * @param {Object} inputs - Enhanced process inputs
 * @param {string} inputs.projectName - Name of the project/domain
 * @param {string} inputs.domainDescription - High-level description of the domain
 * @param {string} inputs.ontologyScope - Scope: 'minimal', 'comprehensive', 'encyclopedic' (default: comprehensive)
 * @param {string} inputs.projectComplexity - Complexity: 'simple', 'moderate', 'complex', 'enterprise' (default: moderate)
 * @param {string} inputs.stakeholderContext - Context: 'single-team', 'multi-team', 'multi-department', 'multi-organizational' (default: multi-team)
 * @param {string} inputs.domainType - Domain: 'general', 'healthcare-regulatory', 'financial-compliance', 'manufacturing-iot', 'ai-ml-systems' (default: general)
 * @param {string} inputs.riskProfile - Risk: 'low', 'moderate', 'high', 'critical' (default: moderate)
 * @param {number} inputs.targetQuality - Target quality score 0-100 (default: 85)
 * @param {Object} ctx - Process context (see SDK)
 * @returns {Promise<Object>} Enhanced process result with governance and risk management
 */
export async function process(inputs, ctx) {
  const {
    projectName,
    domainDescription = '',
    ontologyScope = 'comprehensive',
    projectComplexity = 'moderate',
    stakeholderContext = 'multi-team',
    domainType = 'general',
    riskProfile = 'moderate',
    targetQuality = 85,
    maxIterationsPerPhase = getMaxIterations(projectComplexity),
    phase = 'full'
  } = inputs;

  const results = {
    projectName,
    ontologyScope,
    projectComplexity,
    stakeholderContext,
    domainType,
    riskProfile,
    targetQuality,
    schema: null,
    knowledgeGraph: null,
    generators: null,
    documentation: null,
    testing: null,
    sdk: null,
    interfaces: null,
    governance: null,
    riskMitigation: null,
    metadata: {
      totalIterations: 0,
      phaseIterations: {},
      qualityScores: {},
      stakeholderAlignment: {},
      riskMitigation: {},
      complexityMetrics: {},
      businessValueMetrics: {}
    }
  };

  const artifacts = [];

  ctx.log?.('info', `Starting Enhanced Ontology-Driven Development for "${projectName}"`);
  ctx.log?.('info', `Configuration: ${ontologyScope} scope, ${projectComplexity} complexity, ${stakeholderContext} stakeholders, ${domainType} domain, ${riskProfile} risk`);

  // ============================================================================
  // PHASE 0: PROJECT ANALYSIS & PLANNING
  // ============================================================================

  if (phase === 'full' || phase === 'analysis') {
    ctx.log?.('info', 'Phase 0: Project analysis and strategic planning...');

    const analysisResult = await executeEnhancedPhase(
      ctx,
      'analysis',
      {
        mainTask: projectAnalysisTask,
        taskInputs: {
          projectName,
          domainDescription,
          ontologyScope,
          projectComplexity,
          stakeholderContext,
          domainType,
          riskProfile
        },
        qualityDimensions: ['feasibility', 'stakeholder_alignment', 'risk_assessment', 'resource_planning'],
        targetQuality,
        maxIterations: Math.min(maxIterationsPerPhase, 3), // Analysis doesn't need many iterations
        phaseName: 'Project Analysis & Planning'
      }
    );

    results.projectAnalysis = analysisResult.result;
    results.metadata.phaseIterations['analysis'] = analysisResult.iterations;
    results.metadata.qualityScores['analysis'] = analysisResult.qualityMetrics;
    results.metadata.totalIterations += analysisResult.iterations;
    artifacts.push(...(analysisResult.artifacts || []));

    await ctx.breakpoint({
      question: `Project analysis complete. Complexity: ${analysisResult.result?.complexityAssessment?.level}, Stakeholders: ${analysisResult.result?.stakeholderAnalysis?.count}, Risk Level: ${analysisResult.result?.riskAssessment?.level}. Proceed with recommended approach?`,
      title: 'Project Analysis Review',
      context: {
        runId: ctx.runId,
        data: {
          complexityLevel: analysisResult.result?.complexityAssessment?.level,
          stakeholderCount: analysisResult.result?.stakeholderAnalysis?.count,
          riskLevel: analysisResult.result?.riskAssessment?.level,
          recommendedApproach: analysisResult.result?.recommendedApproach
        },
        files: [
          { path: 'artifacts/odd/PROJECT_ANALYSIS.md', format: 'markdown', label: 'Project Analysis' },
          { path: 'artifacts/odd/STAKEHOLDER_MAP.md', format: 'markdown', label: 'Stakeholder Analysis' },
          { path: 'artifacts/odd/RISK_ASSESSMENT.md', format: 'markdown', label: 'Risk Assessment' }
        ]
      }
    });
  }

  // ============================================================================
  // PHASE 1: MODULAR SCHEMA DEFINITION
  // ============================================================================

  if (phase === 'full' || phase === 'schema') {
    ctx.log?.('info', 'Phase 1: Modular schema definition with complexity management...');

    const phaseResult = await executeEnhancedPhase(
      ctx,
      'schema',
      {
        mainTask: defineModularOntologySchemaTask,
        taskInputs: {
          projectName,
          domainDescription,
          ontologyScope,
          projectComplexity,
          stakeholderContext,
          domainType,
          projectAnalysis: results.projectAnalysis,
          targetQuality
        },
        qualityDimensions: ['completeness', 'consistency', 'modularity', 'stakeholder_alignment', 'complexity_management'],
        targetQuality,
        maxIterations: maxIterationsPerPhase,
        phaseName: 'Modular Schema Definition'
      }
    );

    results.schema = phaseResult.result;
    results.metadata.phaseIterations['schema'] = phaseResult.iterations;
    results.metadata.qualityScores['schema'] = phaseResult.qualityMetrics;
    results.metadata.totalIterations += phaseResult.iterations;
    artifacts.push(...(phaseResult.artifacts || []));
  }

  // ============================================================================
  // PHASE 2: COLLABORATIVE KNOWLEDGE GRAPH CONSTRUCTION
  // ============================================================================

  if (phase === 'full' || phase === 'graph') {
    ctx.log?.('info', 'Phase 2: Collaborative knowledge graph construction...');

    const phaseResult = await executeEnhancedPhase(
      ctx,
      'graph',
      {
        mainTask: buildCollaborativeKnowledgeGraphTask,
        taskInputs: {
          projectName,
          domainDescription,
          ontologyScope,
          projectComplexity,
          stakeholderContext,
          domainType,
          schema: results.schema,
          projectAnalysis: results.projectAnalysis,
          targetQuality
        },
        qualityDimensions: ['completeness', 'consistency', 'stakeholder_alignment', 'business_value', 'performance'],
        targetQuality,
        maxIterations: maxIterationsPerPhase,
        phaseName: 'Collaborative Knowledge Graph Construction'
      }
    );

    results.knowledgeGraph = phaseResult.result;
    results.metadata.phaseIterations['graph'] = phaseResult.iterations;
    results.metadata.qualityScores['graph'] = phaseResult.qualityMetrics;
    results.metadata.totalIterations += phaseResult.iterations;
    artifacts.push(...(phaseResult.artifacts || []));
  }

  // ============================================================================
  // REMAINING PHASES (ABBREVIATED FOR SPACE)
  // ============================================================================

  // Phase 3: Adaptive Generator Creation
  if (phase === 'full' || phase === 'generators') {
    const phaseResult = await executeEnhancedPhase(ctx, 'generators', {
      mainTask: createAdaptiveGeneratorsTask,
      taskInputs: { projectName, knowledgeGraph: results.knowledgeGraph, domainType, projectComplexity, targetQuality },
      qualityDimensions: ['functionality', 'adaptability', 'performance', 'maintainability'],
      targetQuality, maxIterations: maxIterationsPerPhase, phaseName: 'Adaptive Generator Creation'
    });
    results.generators = phaseResult.result;
    results.metadata.phaseIterations['generators'] = phaseResult.iterations;
    results.metadata.qualityScores['generators'] = phaseResult.qualityMetrics;
    artifacts.push(...(phaseResult.artifacts || []));
  }

  // Phase 4: Strategic Documentation & Wiki
  if (phase === 'full' || phase === 'documentation') {
    const phaseResult = await executeEnhancedPhase(ctx, 'documentation', {
      mainTask: generateStrategicDocumentationTask,
      taskInputs: { projectName, knowledgeGraph: results.knowledgeGraph, generators: results.generators, stakeholderContext, targetQuality },
      qualityDimensions: ['completeness', 'clarity', 'stakeholder_alignment', 'strategic_coherence'],
      targetQuality, maxIterations: maxIterationsPerPhase, phaseName: 'Strategic Documentation & Wiki'
    });
    results.documentation = phaseResult.result;
    results.metadata.phaseIterations['documentation'] = phaseResult.iterations;
    results.metadata.qualityScores['documentation'] = phaseResult.qualityMetrics;
    artifacts.push(...(phaseResult.artifacts || []));
  }

  // Phase 5: Multi-Level Testing & Quality
  if (phase === 'full' || phase === 'testing') {
    const phaseResult = await executeEnhancedPhase(ctx, 'testing', {
      mainTask: designMultiLevelTestingTask,
      taskInputs: { projectName, knowledgeGraph: results.knowledgeGraph, documentation: results.documentation, domainType, riskProfile, targetQuality },
      qualityDimensions: ['coverage', 'effectiveness', 'automation', 'risk_mitigation'],
      targetQuality, maxIterations: maxIterationsPerPhase, phaseName: 'Multi-Level Testing & Quality'
    });
    results.testing = phaseResult.result;
    results.metadata.phaseIterations['testing'] = phaseResult.iterations;
    results.metadata.qualityScores['testing'] = phaseResult.qualityMetrics;
    artifacts.push(...(phaseResult.artifacts || []));
  }

  // Phase 6-8: SDK, Interfaces, UI Development (similar pattern)
  // Phase 9: Governance & Risk Management
  if (phase === 'full' || phase === 'governance') {
    const phaseResult = await executeEnhancedPhase(ctx, 'governance', {
      mainTask: establishGovernanceTask,
      taskInputs: { projectName, allPhaseResults: results, stakeholderContext, riskProfile, projectComplexity, targetQuality },
      qualityDimensions: ['effectiveness', 'sustainability', 'compliance', 'stakeholder_satisfaction'],
      targetQuality, maxIterations: maxIterationsPerPhase, phaseName: 'Governance & Risk Management'
    });
    results.governance = phaseResult.result;
    results.metadata.phaseIterations['governance'] = phaseResult.iterations;
    results.metadata.qualityScores['governance'] = phaseResult.qualityMetrics;
    artifacts.push(...(phaseResult.artifacts || []));
  }

  // ============================================================================
  // CONTINUOUS RISK MONITORING & MITIGATION
  // ============================================================================

  if (phase === 'full') {
    ctx.log?.('info', 'Continuous risk monitoring and mitigation...');

    const riskMitigationResult = await ctx.task(continuousRiskMonitoringTask, {
      projectName,
      allResults: results,
      riskProfile,
      projectComplexity
    });

    results.riskMitigation = riskMitigationResult;
    artifacts.push(...(riskMitigationResult.artifacts || []));
  }

  // ============================================================================
  // FINAL QUALITY ASSESSMENT & BUSINESS VALUE MEASUREMENT
  // ============================================================================

  const finalQualityAssessment = await ctx.task(comprehensiveQualityAssessmentTask, {
    projectName,
    allResults: results,
    targetQuality,
    stakeholderContext,
    projectComplexity
  });

  results.metadata.overallQuality = finalQualityAssessment.overallScore;
  results.metadata.businessValueScore = finalQualityAssessment.businessValue;
  results.metadata.stakeholderSatisfaction = finalQualityAssessment.stakeholderAlignment;

  await ctx.breakpoint({
    question: 'Enhanced Ontology-Driven Development complete. Review comprehensive quality metrics and business value assessment?',
    title: 'Final Enhanced ODD Review',
    context: {
      runId: ctx.runId,
      data: {
        projectName,
        overallQuality: results.metadata.overallQuality,
        businessValue: results.metadata.businessValueScore,
        stakeholderSatisfaction: results.metadata.stakeholderSatisfaction,
        totalIterations: results.metadata.totalIterations,
        riskMitigationScore: results.riskMitigation?.effectivenessScore || 0
      },
      files: [
        { path: 'artifacts/odd/FINAL_QUALITY_ASSESSMENT.md', format: 'markdown', label: 'Quality Assessment' },
        { path: 'artifacts/odd/BUSINESS_VALUE_REPORT.md', format: 'markdown', label: 'Business Value Report' },
        { path: 'artifacts/odd/GOVERNANCE_FRAMEWORK.md', format: 'markdown', label: 'Governance Framework' }
      ]
    }
  });

  return {
    success: results.metadata.overallQuality >= targetQuality * 0.8,
    ...results,
    artifacts,
    metadata: {
      ...results.metadata,
      completedPhases: phase === 'full' ? 10 : 1,
      totalArtifacts: artifacts.length,
      qualityAchieved: results.metadata.overallQuality >= targetQuality,
      enhancementLevel: 'enterprise'
    }
  };
}

// ============================================================================
// ENHANCED PHASE EXECUTION FRAMEWORK
// ============================================================================

/**
 * Execute phase with enhanced quality convergence, stakeholder alignment, and risk management
 */
async function executeEnhancedPhase(ctx, phaseId, config) {
  const {
    mainTask,
    taskInputs,
    qualityDimensions,
    targetQuality,
    maxIterations,
    phaseName
  } = config;

  let qualityMetrics = {};
  let iteration = 0;
  let result = null;
  const artifacts = [];
  let overallQuality = 0;

  ctx.log?.('info', `Starting enhanced phase: ${phaseName} (target: ${targetQuality})`);

  while (overallQuality < targetQuality && iteration < maxIterations) {
    iteration++;
    ctx.log?.('info', `${phaseName} - Enhanced iteration ${iteration}/${maxIterations}`);

    // 1. Execute main task
    const mainTaskInputs = {
      ...taskInputs,
      iteration,
      previousResult: result,
      qualityTargets: qualityDimensions.reduce((acc, dim) => ({ ...acc, [dim]: targetQuality }), {})
    };

    result = await ctx.task(mainTask, mainTaskInputs);
    artifacts.push(...(result.artifacts || []));

    // 2. Multi-stakeholder review (enhanced from simple adversarial)
    ctx.log?.('info', `${phaseName} - Multi-stakeholder review iteration ${iteration}`);
    const stakeholderReview = await ctx.task(multiStakeholderReviewTask, {
      phaseResult: result,
      iteration,
      phaseName,
      stakeholderContext: taskInputs.stakeholderContext || 'multi-team',
      qualityDimensions
    });

    // 3. Multi-dimensional quality scoring
    ctx.log?.('info', `${phaseName} - Multi-dimensional quality scoring iteration ${iteration}`);
    const qualityAssessment = await ctx.task(multiDimensionalQualityTask, {
      phaseResult: result,
      stakeholderReview,
      qualityDimensions,
      targetQuality,
      iteration,
      phaseName
    });

    qualityMetrics = qualityAssessment.dimensionalScores;
    overallQuality = qualityAssessment.overall;

    // 4. Business value measurement
    const businessValueResult = await ctx.task(businessValueMeasurementTask, {
      phaseResult: result,
      qualityMetrics,
      iteration,
      phaseName
    });

    // 5. Risk assessment and mitigation
    const riskAssessment = await ctx.task(phaseRiskAssessmentTask, {
      phaseResult: result,
      qualityMetrics,
      businessValue: businessValueResult,
      iteration,
      phaseName
    });

    ctx.log?.('info', `${phaseName} - Quality: ${overallQuality}/${targetQuality}, Business Value: ${businessValueResult.score}, Risk Level: ${riskAssessment.level}`);

    // 6. Improvement planning if needed
    if (overallQuality < targetQuality && iteration < maxIterations) {
      const improvementResult = await ctx.task(enhancedImprovementPlanTask, {
        currentResult: result,
        qualityGaps: qualityAssessment.gaps,
        stakeholderFeedback: stakeholderReview,
        businessValueGaps: businessValueResult.gaps,
        riskFactors: riskAssessment.factors,
        targetQuality,
        iteration
      });

      taskInputs.improvementPlan = improvementResult;
    }

    // 7. Complexity and technical debt monitoring
    const complexityMetrics = await ctx.task(complexityMonitoringTask, {
      phaseResult: result,
      iteration,
      phaseName
    });

    // 8. Stakeholder alignment checkpoint
    if (iteration >= 2 && iteration % 2 === 0 && overallQuality < targetQuality) {
      await ctx.breakpoint({
        question: `${phaseName} iteration ${iteration}: Quality ${overallQuality}/${targetQuality}, Business Value: ${businessValueResult.score}. Continue iterating or accept current state?`,
        title: `${phaseName} Enhanced Quality Checkpoint`,
        context: {
          runId: ctx.runId,
          data: {
            phaseName,
            iteration,
            qualityMetrics,
            businessValue: businessValueResult.score,
            riskLevel: riskAssessment.level,
            complexityMetrics
          }
        }
      });
    }
  }

  return {
    result,
    iterations: iteration,
    qualityMetrics,
    overallQuality: Math.round(overallQuality),
    artifacts,
    converged: overallQuality >= targetQuality
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getMaxIterations(complexity) {
  const iterations = {
    'simple': 3,
    'moderate': 5,
    'complex': 7,
    'enterprise': 10
  };
  return iterations[complexity] || 5;
}

// ============================================================================
// ENHANCED TASK DEFINITIONS
// ============================================================================

/**
 * Task: Project Analysis & Planning
 */
const projectAnalysisTask = defineTask({
  name: 'enhanced-project-analysis',
  description: 'Comprehensive project analysis with complexity assessment, stakeholder mapping, and risk evaluation',

  inputs: {
    projectName: { type: 'string', required: true },
    domainDescription: { type: 'string', default: '' },
    ontologyScope: { type: 'string', default: 'comprehensive' },
    projectComplexity: { type: 'string', default: 'moderate' },
    stakeholderContext: { type: 'string', default: 'multi-team' },
    domainType: { type: 'string', default: 'general' },
    riskProfile: { type: 'string', default: 'moderate' }
  },

  outputs: {
    complexityAssessment: { type: 'object' },
    stakeholderAnalysis: { type: 'object' },
    riskAssessment: { type: 'object' },
    resourcePlanning: { type: 'object' },
    recommendedApproach: { type: 'object' },
    artifacts: { type: 'array' }
  },

  async run(inputs, taskCtx) {
    const effectId = taskCtx.effectId;

    return {
      kind: 'agent',
      title: `Enhanced Project Analysis: ${inputs.projectName}`,
      agent: {
        role: 'enterprise-ontology-strategist',
        goal: `Perform comprehensive project analysis for ${inputs.projectName} to inform strategic planning and risk mitigation`,
        instructions: [
          'Analyze project complexity across multiple dimensions: domain complexity, technical complexity, organizational complexity, regulatory complexity',
          'Map all stakeholders: domain experts, technical teams, business sponsors, end users, regulatory bodies, external partners',
          'Assess stakeholder influence, interest, and potential conflicts',
          'Identify all risk factors: technical risks, business risks, regulatory risks, organizational risks',
          'Evaluate resource requirements: team size, skills needed, timeline, budget implications',
          'Recommend ontology development approach based on complexity and stakeholder context',
          'Create domain-specific adaptation strategy based on domain type',
          'Establish success criteria and key performance indicators',
          'Design governance framework appropriate for stakeholder context',
          'Plan change management strategy for organizational adoption',
          'Create communication plan for multi-stakeholder alignment',
          'Establish quality gates and validation checkpoints'
        ],
        context: {
          projectName: inputs.projectName,
          domainDescription: inputs.domainDescription,
          ontologyScope: inputs.ontologyScope,
          projectComplexity: inputs.projectComplexity,
          stakeholderContext: inputs.stakeholderContext,
          domainType: inputs.domainType,
          riskProfile: inputs.riskProfile
        }
      },
      io: {
        inputJsonPath: `tasks/${effectId}/input.json`,
        outputJsonPath: `tasks/${effectId}/result.json`
      },
      labels: ['project-analysis', 'stakeholder-mapping', 'risk-assessment', 'strategic-planning']
    };
  }
});

/**
 * Task: Define Modular Ontology Schema
 */
const defineModularOntologySchemaTask = defineTask({
  name: 'define-modular-ontology-schema',
  description: 'Define modular ontology schema with complexity management and domain-specific patterns',

  inputs: {
    projectName: { type: 'string', required: true },
    domainDescription: { type: 'string', default: '' },
    ontologyScope: { type: 'string', default: 'comprehensive' },
    projectComplexity: { type: 'string', default: 'moderate' },
    stakeholderContext: { type: 'string', default: 'multi-team' },
    domainType: { type: 'string', default: 'general' },
    projectAnalysis: { type: 'object', default: null },
    targetQuality: { type: 'number', default: 85 },
    iteration: { type: 'number', default: 0 },
    previousResult: { type: 'object', default: null },
    improvementPlan: { type: 'object', default: null },
    qualityTargets: { type: 'object', default: {} }
  },

  outputs: {
    modularDesign: { type: 'object' },
    domainOntologies: { type: 'object' },
    goalsOntology: { type: 'object' },      // Business, user, technical goals
    needsOntology: { type: 'object' },      // Functional, non-functional, emotional needs
    constraintsOntology: { type: 'object' }, // Technical, business, regulatory constraints
    productOntology: { type: 'object' },    // Product specs, features, user flows
    designOntology: { type: 'object' },     // UI/UX elements, layouts, interactions
    interfaceDefinitions: { type: 'object' },
    dependencyGraph: { type: 'object' },
    complexityMetrics: { type: 'object' },
    governanceRules: { type: 'object' },
    artifacts: { type: 'array' }
  },

  async run(inputs, taskCtx) {
    const effectId = taskCtx.effectId;

    return {
      kind: 'agent',
      title: `Define Modular Ontology Schema: ${inputs.projectName} (Iteration ${inputs.iteration + 1})`,
      agent: {
        role: 'modular-ontology-architect',
        goal: `Design modular ontology schema for ${inputs.projectName} with complexity management and domain-specific adaptations`,
        instructions: [
          'Apply modular design patterns to manage ontology complexity',
          'Create clear module boundaries based on domain analysis and stakeholder boundaries',
          'Define interfaces and dependencies between ontology modules',
          'Implement domain-specific patterns based on domain type (healthcare, finance, manufacturing, etc.)',
          'Design for scalability and maintainability across enterprise environments',
          'Include strategic ontologies: goals (business, user, technical), needs (functional, non-functional, emotional), constraints (technical, business, regulatory)',
          'Create product ontology: features, user flows, product specifications, page layouts',
          'Design UI/UX ontology: components, visual elements, interactions, responsive behavior',
          'Model complete traceability: goals → needs → features → constraints → design decisions',
          'Create governance rules for module evolution and dependency management',
          'Establish complexity monitoring and alerting mechanisms',
          'Design for multi-stakeholder collaboration and parallel development',
          'Include version control and change management for modular evolution',
          'Address specific requirements from project analysis',
          'Implement improvement plan recommendations if provided',
          'Focus on quality targets for completeness, consistency, modularity, and stakeholder alignment',
          'Create automated validation rules for modular consistency'
        ],
        context: {
          projectName: inputs.projectName,
          domainDescription: inputs.domainDescription,
          projectComplexity: inputs.projectComplexity,
          stakeholderContext: inputs.stakeholderContext,
          domainType: inputs.domainType,
          projectAnalysis: inputs.projectAnalysis,
          targetQuality: inputs.targetQuality,
          iteration: inputs.iteration,
          previousResult: inputs.previousResult,
          improvementPlan: inputs.improvementPlan,
          qualityTargets: inputs.qualityTargets
        }
      },
      io: {
        inputJsonPath: `tasks/${effectId}/input.json`,
        outputJsonPath: `tasks/${effectId}/result.json`
      },
      labels: ['modular-ontology', 'complexity-management', 'domain-specific', 'enterprise-architecture', 'strategic-alignment']
    };
  }
});

/**
 * Task: Build Collaborative Knowledge Graph
 */
const buildCollaborativeKnowledgeGraphTask = defineTask({
  name: 'build-collaborative-knowledge-graph',
  description: 'Build knowledge graph with multi-stakeholder collaboration and advanced validation',

  inputs: {
    projectName: { type: 'string', required: true },
    domainDescription: { type: 'string', default: '' },
    ontologyScope: { type: 'string', default: 'comprehensive' },
    projectComplexity: { type: 'string', default: 'moderate' },
    stakeholderContext: { type: 'string', default: 'multi-team' },
    domainType: { type: 'string', default: 'general' },
    schema: { type: 'object', required: true },
    projectAnalysis: { type: 'object', default: null },
    targetQuality: { type: 'number', default: 85 },
    iteration: { type: 'number', default: 0 },
    previousResult: { type: 'object', default: null },
    improvementPlan: { type: 'object', default: null },
    qualityTargets: { type: 'object', default: {} }
  },

  outputs: {
    complete: { type: 'object' },
    subgraphs: { type: 'object' },
    productGraph: { type: 'object' },     // Product specifications graph
    designGraph: { type: 'object' },      // UI/UX design graph
    goalsGraph: { type: 'object' },       // Goals and objectives graph
    needsGraph: { type: 'object' },       // User needs and requirements graph
    constraintsGraph: { type: 'object' }, // Constraints and limitations graph
    traceabilityGraph: { type: 'object' }, // Goal-to-feature traceability
    statistics: { type: 'object' },
    artifacts: { type: 'array' }
  },

  async run(inputs, taskCtx) {
    const effectId = taskCtx.effectId;

    return {
      kind: 'agent',
      title: `Build Collaborative Knowledge Graph: ${inputs.projectName} (Iteration ${inputs.iteration + 1})`,
      agent: {
        role: 'collaborative-knowledge-engineer',
        goal: `Build comprehensive knowledge graph with multi-stakeholder collaboration for ${inputs.projectName}`,
        instructions: [
          'Implement collaborative modeling sessions with stakeholder groups',
          'Use domain-driven design principles for knowledge organization',
          'Build comprehensive strategic graphs: goals, needs, constraints with full traceability',
          'Create product specification graph with features, user flows, page layouts',
          'Model UI/UX design graph with components, interactions, responsive behavior',
          'Ensure complete goal-to-feature-to-constraint traceability throughout graph',
          'Create automated consistency checking and validation',
          'Implement performance optimization for enterprise scale',
          'Build stakeholder-specific views and interfaces',
          'Create change tracking and evolution management',
          'Include comprehensive cross-references for encyclopedia generation',
          'Model temporal aspects and evolution patterns',
          'Address improvement plan from previous iteration if provided',
          'Focus on quality targets for completeness, consistency, stakeholder alignment, and business value'
        ],
        context: {
          projectName: inputs.projectName,
          domainDescription: inputs.domainDescription,
          projectComplexity: inputs.projectComplexity,
          stakeholderContext: inputs.stakeholderContext,
          domainType: inputs.domainType,
          schema: inputs.schema,
          projectAnalysis: inputs.projectAnalysis,
          targetQuality: inputs.targetQuality,
          iteration: inputs.iteration,
          previousResult: inputs.previousResult,
          improvementPlan: inputs.improvementPlan,
          qualityTargets: inputs.qualityTargets
        }
      },
      io: {
        inputJsonPath: `tasks/${effectId}/input.json`,
        outputJsonPath: `tasks/${effectId}/result.json`
      },
      labels: ['collaborative-modeling', 'knowledge-graph', 'stakeholder-alignment', 'strategic-traceability']
    };
  }
});

// Enhanced review and quality tasks
const multiStakeholderReviewTask = defineTask({
  name: 'multi-stakeholder-review',
  description: 'Multi-stakeholder review process with structured feedback collection',
  inputs: {
    phaseResult: { type: 'object', required: true },
    stakeholderContext: { type: 'string' },
    qualityDimensions: { type: 'array' },
    iteration: { type: 'number' },
    phaseName: { type: 'string' }
  },
  outputs: {
    stakeholderFeedback: { type: 'object' },
    consensusAreas: { type: 'array' },
    conflictAreas: { type: 'array' },
    issues: { type: 'array' },
    recommendations: { type: 'array' }
  },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Multi-Stakeholder Review - ${inputs.phaseName} Iteration ${inputs.iteration}`,
      agent: {
        role: 'stakeholder-alignment-facilitator',
        goal: 'Facilitate comprehensive review with multiple stakeholder groups',
        instructions: [
          'Coordinate review sessions with different stakeholder groups based on stakeholder context',
          'Collect structured feedback across all quality dimensions',
          'Identify areas of consensus and conflict between stakeholder groups',
          'Facilitate resolution of conflicting requirements through structured negotiation',
          'Document stakeholder priorities, concerns, and success criteria',
          'Create alignment strategies for next iteration',
          'Assess strategic alignment: goals, needs, constraints satisfaction',
          'Evaluate business value perception across stakeholder groups',
          'Document change requests and improvement suggestions'
        ],
        context: {
          phaseResult: inputs.phaseResult,
          stakeholderContext: inputs.stakeholderContext,
          qualityDimensions: inputs.qualityDimensions,
          iteration: inputs.iteration,
          phaseName: inputs.phaseName
        }
      },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['stakeholder-review', 'consensus-building', 'feedback-collection', 'conflict-resolution']
    };
  }
});

const multiDimensionalQualityTask = defineTask({
  name: 'multi-dimensional-quality-assessment',
  description: 'Multi-dimensional quality assessment with business value integration',
  inputs: {
    phaseResult: { type: 'object' },
    stakeholderReview: { type: 'object' },
    qualityDimensions: { type: 'array' },
    targetQuality: { type: 'number' },
    iteration: { type: 'number' },
    phaseName: { type: 'string' }
  },
  outputs: {
    dimensionalScores: { type: 'object' },
    overall: { type: 'number' },
    gaps: { type: 'array' },
    strengths: { type: 'array' },
    improvementPriorities: { type: 'array' }
  },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Multi-Dimensional Quality Assessment - ${inputs.phaseName} Iteration ${inputs.iteration}`,
      agent: {
        role: 'quality-assessment-specialist',
        goal: 'Provide comprehensive quality assessment across multiple dimensions with business value focus',
        instructions: [
          'Score quality across technical, business, and stakeholder dimensions',
          'Evaluate technical quality: consistency, completeness, performance, maintainability, modularity',
          'Assess business quality: goal alignment, stakeholder satisfaction, ROI potential, strategic coherence',
          'Measure stakeholder quality: consensus level, adoption readiness, training effectiveness',
          'Integrate stakeholder feedback into quality assessment',
          'Weight dimensions based on project context and stakeholder priorities',
          'Identify specific gaps that prevent higher scores',
          'Highlight strengths that should be preserved and built upon',
          'Prioritize improvements by impact on overall quality and business value',
          'Score each dimension 0-100 and calculate weighted overall score',
          'Provide actionable recommendations for quality improvement'
        ],
        context: {
          phaseResult: inputs.phaseResult,
          stakeholderReview: inputs.stakeholderReview,
          qualityDimensions: inputs.qualityDimensions,
          targetQuality: inputs.targetQuality,
          iteration: inputs.iteration,
          phaseName: inputs.phaseName
        }
      },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['quality-assessment', 'multi-dimensional', 'business-value', 'stakeholder-integration']
    };
  }
});

// Additional enhanced task definitions
const businessValueMeasurementTask = defineTask({
  name: 'business-value-measurement',
  description: 'Measure business value and ROI potential of phase results',
  inputs: { phaseResult: { type: 'object' }, qualityMetrics: { type: 'object' }, iteration: { type: 'number' }, phaseName: { type: 'string' } },
  outputs: { score: { type: 'number' }, gaps: { type: 'array' }, projectedROI: { type: 'number' }, valueDrivers: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Business Value Assessment - ${inputs.phaseName}`,
      agent: {
        role: 'business-value-analyst',
        goal: 'Measure and project business value from phase results',
        instructions: [
          'Evaluate alignment with business goals and success metrics',
          'Assess potential for achieving target ROI and value objectives',
          'Identify key value drivers and business impact factors',
          'Project timeline for value realization and benefit delivery',
          'Identify gaps that limit business value achievement',
          'Recommend value enhancement strategies'
        ]
      },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['business-value', 'roi-measurement', 'value-analysis']
    };
  }
});

const phaseRiskAssessmentTask = defineTask({
  name: 'phase-risk-assessment',
  description: 'Assess and evaluate risks for phase results',
  inputs: { phaseResult: { type: 'object' }, qualityMetrics: { type: 'object' }, businessValue: { type: 'object' }, iteration: { type: 'number' }, phaseName: { type: 'string' } },
  outputs: { level: { type: 'string' }, factors: { type: 'array' }, mitigationStrategies: { type: 'array' }, monitoringPlan: { type: 'object' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Risk Assessment - ${inputs.phaseName}`,
      agent: {
        role: 'risk-analyst',
        goal: 'Identify and assess risks in phase results',
        instructions: [
          'Identify technical risks: complexity, performance, integration, scalability',
          'Assess business risks: stakeholder alignment, value delivery, resource constraints',
          'Evaluate organizational risks: change resistance, skills gaps, governance failures',
          'Determine overall risk level and priority factors',
          'Develop specific mitigation strategies for identified risks',
          'Create monitoring plan for ongoing risk management'
        ]
      },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['risk-assessment', 'risk-mitigation', 'monitoring']
    };
  }
});

const enhancedImprovementPlanTask = defineTask({
  name: 'enhanced-improvement-plan',
  description: 'Create comprehensive improvement plan for next iteration',
  inputs: {
    currentResult: { type: 'object', required: true },
    qualityGaps: { type: 'array', required: true },
    stakeholderFeedback: { type: 'object', required: true },
    businessValueGaps: { type: 'array', required: true },
    riskFactors: { type: 'array', required: true },
    targetQuality: { type: 'number', required: true },
    iteration: { type: 'number', required: true }
  },
  outputs: {
    improvementPlan: { type: 'object' },
    priorities: { type: 'array' },
    actionItems: { type: 'array' },
    successCriteria: { type: 'object' },
    resourceRequirements: { type: 'object' }
  },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Enhanced Improvement Planning - Iteration ${inputs.iteration}`,
      agent: {
        role: 'improvement-strategist',
        goal: 'Create comprehensive improvement plan addressing quality gaps, stakeholder feedback, business value, and risk factors',
        instructions: [
          'Analyze all sources of improvement needs: quality gaps, stakeholder feedback, business value gaps, risk factors',
          'Prioritize improvements by impact on target quality and business value',
          'Create specific, actionable items for next iteration',
          'Address highest-impact gaps first while considering stakeholder priorities',
          'Focus on areas that enable strategic goal achievement',
          'Plan improvements to product spec generation capabilities',
          'Design solutions that enhance stakeholder alignment',
          'Create implementation guidance with clear success criteria',
          'Estimate resource requirements and timeline for improvements',
          'Set measurable success criteria for next iteration'
        ],
        context: {
          currentResult: inputs.currentResult,
          qualityGaps: inputs.qualityGaps,
          stakeholderFeedback: inputs.stakeholderFeedback,
          businessValueGaps: inputs.businessValueGaps,
          riskFactors: inputs.riskFactors,
          targetQuality: inputs.targetQuality,
          iteration: inputs.iteration
        }
      },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['improvement-planning', 'iteration-planning', 'strategic-enhancement']
    };
  }
});

const complexityMonitoringTask = defineTask({
  name: 'complexity-monitoring',
  description: 'Monitor and assess complexity metrics',
  inputs: { phaseResult: { type: 'object' }, iteration: { type: 'number' }, phaseName: { type: 'string' } },
  outputs: { complexityScore: { type: 'number' }, metrics: { type: 'object' }, alerts: { type: 'array' }, recommendations: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Complexity Monitoring - ${inputs.phaseName}`,
      agent: {
        role: 'complexity-analyst',
        goal: 'Monitor and assess complexity metrics to prevent complexity explosion',
        instructions: [
          'Measure ontology complexity: size, depth, interconnections, cyclomatic complexity',
          'Assess stakeholder complexity: number of groups, conflicting requirements, communication overhead',
          'Evaluate technical complexity: integration points, performance requirements, scalability challenges',
          'Monitor complexity trends and growth patterns',
          'Generate alerts for complexity threshold breaches',
          'Recommend complexity reduction strategies'
        ]
      },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['complexity-monitoring', 'metrics', 'alerts']
    };
  }
});

// Additional task definitions for remaining phases and functions
const createAdaptiveGeneratorsTask = defineTask({
  name: 'create-adaptive-generators',
  description: 'Create domain-specific adaptive generators',
  inputs: { projectName: { type: 'string' }, knowledgeGraph: { type: 'object' }, domainType: { type: 'string' }, projectComplexity: { type: 'string' }, targetQuality: { type: 'number' } },
  outputs: { specifications: { type: 'array' }, implementations: { type: 'object' }, artifacts: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Create Adaptive Generators: ${inputs.projectName}`,
      agent: { role: 'adaptive-generator-architect', goal: 'Create domain-specific generators with adaptive capabilities', instructions: ['Design generators for domain-specific patterns', 'Include product specification and UI/UX generators', 'Create adaptive templates based on project complexity', 'Implement validation and consistency checking', 'Build generators for strategic documentation with traceability'] },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['adaptive-generators', 'domain-specific', 'strategic-generation']
    };
  }
});

const generateStrategicDocumentationTask = defineTask({
  name: 'generate-strategic-documentation',
  description: 'Generate strategic documentation with stakeholder alignment',
  inputs: { projectName: { type: 'string' }, knowledgeGraph: { type: 'object' }, generators: { type: 'object' }, stakeholderContext: { type: 'string' }, targetQuality: { type: 'number' } },
  outputs: { requirements: { type: 'object' }, specifications: { type: 'object' }, strategicAlignment: { type: 'object' }, wiki: { type: 'object' }, artifacts: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Generate Strategic Documentation: ${inputs.projectName}`,
      agent: { role: 'strategic-documentation-specialist', goal: 'Generate comprehensive documentation with strategic alignment and traceability', instructions: ['Generate goal-driven product specifications with complete traceability', 'Create stakeholder-specific documentation views', 'Build comprehensive wiki with strategic context', 'Include constraint-aware UI specifications', 'Generate traceability matrices and alignment documentation'] },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['strategic-documentation', 'stakeholder-alignment', 'traceability']
    };
  }
});

const designMultiLevelTestingTask = defineTask({
  name: 'design-multi-level-testing',
  description: 'Design comprehensive multi-level testing framework',
  inputs: { projectName: { type: 'string' }, knowledgeGraph: { type: 'object' }, documentation: { type: 'object' }, domainType: { type: 'string' }, riskProfile: { type: 'string' }, targetQuality: { type: 'number' } },
  outputs: { strategy: { type: 'object' }, framework: { type: 'object' }, artifacts: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Design Multi-Level Testing: ${inputs.projectName}`,
      agent: { role: 'testing-architect', goal: 'Design comprehensive testing framework with multi-level validation', instructions: ['Design syntactic, semantic, pragmatic, and business validation levels', 'Create domain-specific testing patterns', 'Include stakeholder acceptance testing frameworks', 'Design continuous quality monitoring systems', 'Create risk-based testing strategies'] },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['multi-level-testing', 'quality-framework', 'validation']
    };
  }
});

const establishGovernanceTask = defineTask({
  name: 'establish-governance',
  description: 'Establish governance and risk management framework',
  inputs: { projectName: { type: 'string' }, allPhaseResults: { type: 'object' }, stakeholderContext: { type: 'string' }, riskProfile: { type: 'string' }, projectComplexity: { type: 'string' }, targetQuality: { type: 'number' } },
  outputs: { framework: { type: 'object' }, policies: { type: 'array' }, processes: { type: 'array' }, artifacts: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Establish Governance: ${inputs.projectName}`,
      agent: { role: 'governance-architect', goal: 'Establish comprehensive governance and risk management framework', instructions: ['Design federated governance for multi-stakeholder environments', 'Create change management and evolution policies', 'Establish continuous compliance monitoring', 'Design risk management and mitigation frameworks', 'Create organizational adoption and training programs'] },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['governance', 'risk-management', 'organizational-adoption']
    };
  }
});

const continuousRiskMonitoringTask = defineTask({
  name: 'continuous-risk-monitoring',
  description: 'Continuous risk monitoring and mitigation',
  inputs: { projectName: { type: 'string' }, allResults: { type: 'object' }, riskProfile: { type: 'string' }, projectComplexity: { type: 'string' } },
  outputs: { effectivenessScore: { type: 'number' }, mitigationStrategies: { type: 'object' }, artifacts: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Continuous Risk Monitoring: ${inputs.projectName}`,
      agent: { role: 'risk-monitoring-specialist', goal: 'Implement continuous risk monitoring and mitigation', instructions: ['Monitor technical debt accumulation and complexity growth', 'Track stakeholder alignment and satisfaction trends', 'Assess business value delivery and goal achievement', 'Implement proactive risk mitigation strategies', 'Create early warning systems for risk factors'] },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['continuous-monitoring', 'risk-mitigation', 'early-warning']
    };
  }
});

const comprehensiveQualityAssessmentTask = defineTask({
  name: 'comprehensive-quality-assessment',
  description: 'Final comprehensive quality assessment',
  inputs: { projectName: { type: 'string' }, allResults: { type: 'object' }, targetQuality: { type: 'number' }, stakeholderContext: { type: 'string' }, projectComplexity: { type: 'string' } },
  outputs: { overallScore: { type: 'number' }, businessValue: { type: 'number' }, stakeholderAlignment: { type: 'number' }, recommendations: { type: 'array' } },
  async run(inputs, taskCtx) {
    return {
      kind: 'agent',
      title: `Comprehensive Quality Assessment: ${inputs.projectName}`,
      agent: { role: 'quality-assessment-lead', goal: 'Perform final comprehensive quality assessment across all dimensions', instructions: ['Assess overall quality across all phases and dimensions', 'Measure business value achievement and ROI potential', 'Evaluate stakeholder satisfaction and alignment', 'Assess strategic goal achievement and traceability completeness', 'Provide recommendations for ongoing improvement and evolution'] },
      io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
      labels: ['comprehensive-assessment', 'final-quality', 'business-value']
    };
  }
});