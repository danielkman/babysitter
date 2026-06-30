/**
 * Mirrored kradle AGENT-IDENTITY kinds (the real "who / how-where" model).
 *
 * Faithful, field-by-field mirror of the REAL kradle CRD schemas in
 * `packages/kradle/charts/crds/agent-resources.yaml` (ground truth — NOT prose
 * docs). These replace Commander's invented game-creature/roster concept with
 * kradle's actual identity resources:
 *
 *   - AgentPersona      — reusable identity ("who"): displayName, role, soul,
 *                         personality, appearance, voiceProfile, skill/knowledge.
 *   - AgentSoul         — behavioral doc (content) linked to a persona.
 *   - AgentAppearance   — visual identity (avatar/theme/emoji/badge).
 *   - AgentVoiceProfile — TTS/STT identity.
 *   - AgentDefinition   — the DEPLOYMENT BINDING pairing a Persona to a Stack
 *                         ("how/where"). THIS is kradle's "agent definition".
 *
 * Every spec is `x-kubernetes-preserve-unknown-fields: true` in the CRD; we
 * model the documented keys and keep the bag open via {@link KradlePreserveUnknown}
 * (same pattern as `kradle-config.ts`). Required CRD fields are non-optional
 * here; everything else is optional. We do NOT import `@a5c-ai/kradle-sdk` — we
 * mirror it (AC7). No invented fields.
 */

import type { KradleResource, KradlePreserveUnknown } from './kradle-resources';

// ---------------------------------------------------------------------------
// AgentPersona (`agent-resources.yaml:178-237`)
// Required: organizationRef, displayName
// ---------------------------------------------------------------------------

/**
 * `AgentPersona.spec.role` — the persona's role facet (preserve-unknown body).
 * Documented keys (`title`/`domain`) per the identity model.
 */
export interface AgentPersonaRole extends KradlePreserveUnknown {
  title?: string;
  domain?: string;
}

/**
 * `AgentPersona.spec.soul` — inline soul reference/body (preserve-unknown).
 * May carry a `personaRef`/`format`/`content` or point at an `AgentSoul`.
 */
export interface AgentPersonaSoul extends KradlePreserveUnknown {
  format?: string;
  content?: string;
  /** Reference to a standalone `AgentSoul` resource. */
  soulRef?: string;
}

/**
 * `AgentPersona.spec` — the reusable identity ("who"). Required:
 * `organizationRef, displayName`. The `appearance`/`voiceProfile` may be inlined
 * here OR carried by standalone `AgentAppearance`/`AgentVoiceProfile` resources
 * that reference the persona via `personaRef` (resolved by the mapper).
 */
export interface AgentPersonaSpec extends KradlePreserveUnknown {
  /** Required: org slug. */
  organizationRef: string;
  /** Required: human-facing persona name (the board/session identity). */
  displayName: string;
  /** Short one-line characterization. */
  tagline?: string;
  /** Inline behavioral doc / soul reference. */
  soul?: AgentPersonaSoul;
  /** Free-form personality bag (preserve-unknown). */
  personality?: KradlePreserveUnknown;
  /** Role facet (`title`/`domain`). */
  role?: AgentPersonaRole;
  /** → `AgentSkill` names. */
  skillRefs?: string[];
  /** → knowledge/memory source names. */
  knowledgeRefs?: string[];
  /** Inline visual identity (else carried by a standalone `AgentAppearance`). */
  appearance?: AgentAppearanceSpec;
  /** Inline voice identity (else carried by a standalone `AgentVoiceProfile`). */
  voiceProfile?: AgentVoiceProfileSpec;
}

export type AgentPersona = KradleResource<'AgentPersona', AgentPersonaSpec>;

// ---------------------------------------------------------------------------
// AgentSoul (`agent-resources.yaml:239-277`)
// Required: organizationRef, content
// ---------------------------------------------------------------------------

/**
 * `AgentSoul.spec` — the behavioral document. Required: `organizationRef,
 * content`. `personaRef` links it back to the owning persona.
 */
export interface AgentSoulSpec extends KradlePreserveUnknown {
  /** Required: org slug. */
  organizationRef: string;
  /** Required: the behavioral doc body. */
  content: string;
  /** → owning `AgentPersona` name. */
  personaRef?: string;
  /** Content format hint (e.g. `markdown`). */
  format?: string;
}

export type AgentSoul = KradleResource<'AgentSoul', AgentSoulSpec>;

// ---------------------------------------------------------------------------
// AgentAppearance (`agent-resources.yaml:279-323`)
// Required: organizationRef
// ---------------------------------------------------------------------------

/**
 * `AgentAppearance.spec` — the visual identity. Required: `organizationRef`.
 * `personaRef` links it to a persona (when standalone, not inlined on the
 * persona). `avatar`/`theme`/`badge` are preserve-unknown; `emoji` is a string.
 */
export interface AgentAppearanceSpec extends KradlePreserveUnknown {
  /** Required: org slug (when standalone). Optional when inlined on a persona. */
  organizationRef?: string;
  /** → owning `AgentPersona` name (when standalone). */
  personaRef?: string;
  /** Avatar source (preserve-unknown body: url/source/etc). */
  avatar?: KradlePreserveUnknown;
  /** Color/theme tokens (preserve-unknown). */
  theme?: KradlePreserveUnknown;
  /** Short emoji glyph used as the lightweight board identity. */
  emoji?: string;
  /** Badge descriptor (preserve-unknown). */
  badge?: KradlePreserveUnknown;
}

export type AgentAppearance = KradleResource<'AgentAppearance', AgentAppearanceSpec>;

// ---------------------------------------------------------------------------
// AgentVoiceProfile (`agent-resources.yaml:325-372`)
// Required: organizationRef, ttsProvider
// ---------------------------------------------------------------------------

/**
 * `AgentVoiceProfile.spec` — the voice identity. Required: `organizationRef,
 * ttsProvider`. `personaRef` links it to a persona (when standalone).
 */
export interface AgentVoiceProfileSpec extends KradlePreserveUnknown {
  /** Required: org slug (when standalone). Optional when inlined on a persona. */
  organizationRef?: string;
  /** Required: TTS provider id. */
  ttsProvider: string;
  /** → owning `AgentPersona` name (when standalone). */
  personaRef?: string;
  /** Provider-specific TTS config (preserve-unknown: voice id, rate, etc). */
  ttsConfig?: KradlePreserveUnknown;
  /** Speech-style descriptor (preserve-unknown). */
  speechStyle?: KradlePreserveUnknown;
  /** Optional STT provider id. */
  sttProvider?: string;
  /** Provider-specific STT config (preserve-unknown). */
  sttConfig?: KradlePreserveUnknown;
}

export type AgentVoiceProfile = KradleResource<'AgentVoiceProfile', AgentVoiceProfileSpec>;

// ---------------------------------------------------------------------------
// AgentDefinition (`agent-resources.yaml:374-426`)
// Required: organizationRef, personaRef, stackRef
// ---------------------------------------------------------------------------

/**
 * `AgentDefinition.spec` — the DEPLOYMENT BINDING that pairs a {@link AgentPersona}
 * ("who") to an `AgentStack` ("how/where"). Required: `organizationRef,
 * personaRef, stackRef`. This is kradle's real "agent definition" — the thing the
 * dispatch route accepts as `{agentDefinition: <name>}` (the persona-identity
 * dispatch path; the legacy `{agentStack}` path is the fallback).
 *
 * `scope`/`meetingConfig`/`limits` are preserve-unknown; `roleContext` is a
 * string; `triggerRefs` → `AgentTriggerRule` names.
 */
export interface AgentDefinitionSpec extends KradlePreserveUnknown {
  /** Required: org slug. */
  organizationRef: string;
  /** Required: → the `AgentPersona` providing identity ("who"). */
  personaRef: string;
  /** Required: → the `AgentStack` providing execution ("how/where"). */
  stackRef: string;
  /** Where/under-what this binding applies (preserve-unknown: repos, labels…). */
  scope?: KradlePreserveUnknown;
  /** Deployment-specific role framing layered over the persona's role. */
  roleContext?: string;
  /** → `AgentTriggerRule` names that dispatch via this definition. */
  triggerRefs?: string[];
  /** Meeting (Jitsi) participation config (preserve-unknown). */
  meetingConfig?: KradlePreserveUnknown;
  /** Per-definition execution limits (preserve-unknown: budget, turns…). */
  limits?: KradlePreserveUnknown;
}

export type AgentDefinition = KradleResource<'AgentDefinition', AgentDefinitionSpec>;
