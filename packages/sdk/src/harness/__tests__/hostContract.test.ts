/**
 * Tests for the Host Contract Layer (GAP-REMOTE-007).
 *
 * Covers:
 *   - resolveHostCapabilities(adapter): maps HarnessAdapter → HostCapabilityManifest
 *   - validateHostContract(manifest, requirements?): compliance checking
 *   - buildManifestFromDiscovery(discovery): constructs manifest from discovery results
 *   - Default manifests for known harnesses
 *
 */

import { describe, it, expect, vi } from "vitest";

import type {
  HarnessAdapter,
  HarnessDiscoveryResult,
} from "../types";
import { HarnessCapability as Cap } from "../types";

import {
  resolveHostCapabilities,
  validateHostContract,
  buildManifestFromDiscovery,
} from "../hostContract";

import type {
  HostCapabilityManifest,
  HostContractViolation,
  HostContractValidationResult,
} from "../hostContract";

// ---------------------------------------------------------------------------
// Helpers — minimal adapter stubs
// ---------------------------------------------------------------------------

function stubAdapter(overrides: Partial<HarnessAdapter> & { name: string }): HarnessAdapter {
  return {
    isActive: () => false,
    resolveSessionId: () => undefined,
    resolveStateDir: () => undefined,
    resolvePluginRoot: () => undefined,
    bindSession: vi.fn().mockResolvedValue({ harness: overrides.name, sessionId: "s1" }),
    handleStopHook: vi.fn().mockResolvedValue(0),
    handleSessionStartHook: vi.fn().mockResolvedValue(0),
    findHookDispatcherPath: () => null,
    ...overrides,
  };
}

function stubDiscovery(overrides: Partial<HarnessDiscoveryResult> = {}): HarnessDiscoveryResult {
  return {
    name: "test-harness",
    installed: true,
    cliCommand: "test-harness",
    configFound: false,
    capabilities: [],
    platform: "linux",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. resolveHostCapabilities — claude-code adapter
// ---------------------------------------------------------------------------

describe("resolveHostCapabilities", () => {
  it("returns correct manifest for claude-code adapter", () => {
    const adapter = stubAdapter({
      name: "claude-code",
      getCapabilities: () => [
        Cap.Programmatic,
        Cap.SessionBinding,
        Cap.StopHook,
        Cap.Mcp,
        Cap.HeadlessPrompt,
      ],
      isActive: () => true,
    });

    const manifest = resolveHostCapabilities(adapter);

    expect(manifest.harnessName).toBe("claude-code");
    expect(manifest.capabilities).toContain(Cap.Programmatic);
    expect(manifest.capabilities).toContain(Cap.SessionBinding);
    expect(manifest.capabilities).toContain(Cap.StopHook);
    expect(manifest.capabilities).toContain(Cap.Mcp);
    expect(manifest.lifecycle.supportsSessionBinding).toBe(true);
    expect(manifest.lifecycle.supportsStopHook).toBe(true);
    expect(manifest.communication.protocol).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 2. resolveHostCapabilities — codex adapter
  // ---------------------------------------------------------------------------

  it("returns correct manifest for codex adapter", () => {
    const adapter = stubAdapter({
      name: "codex",
      getCapabilities: () => [Cap.Programmatic, Cap.HeadlessPrompt],
    });

    const manifest = resolveHostCapabilities(adapter);

    expect(manifest.harnessName).toBe("codex");
    expect(manifest.capabilities).toContain(Cap.Programmatic);
    expect(manifest.capabilities).toContain(Cap.HeadlessPrompt);
    // Codex does NOT support session-binding or stop-hook
    expect(manifest.lifecycle.supportsSessionBinding).toBe(false);
    expect(manifest.lifecycle.supportsStopHook).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. resolveHostCapabilities — unknown adapter with defaults
  // ---------------------------------------------------------------------------

  it("handles unknown adapter with sensible defaults", () => {
    const adapter = stubAdapter({ name: "unknown-harness" });

    const manifest = resolveHostCapabilities(adapter);

    expect(manifest.harnessName).toBe("unknown-harness");
    expect(manifest.capabilities).toEqual([]);
    expect(manifest.lifecycle.supportsSessionBinding).toBe(false);
    expect(manifest.lifecycle.supportsStopHook).toBe(false);
    expect(manifest.lifecycle.supportsGracefulShutdown).toBe(false);
    expect(manifest.lifecycle.supportsHealthCheck).toBe(false);
    expect(manifest.communication.supportsStreaming).toBe(false);
    expect(manifest.communication.supportsJsonMode).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4-7. validateHostContract
// ---------------------------------------------------------------------------

describe("validateHostContract", () => {
  function validManifest(): HostCapabilityManifest {
    return {
      harnessName: "claude-code",
      version: "1.0.0",
      capabilities: [Cap.Programmatic, Cap.SessionBinding, Cap.StopHook, Cap.Mcp],
      supportedModels: ["claude-opus-4-5", "claude-sonnet-4"],
      communication: {
        protocol: "stdio",
        supportsStreaming: true,
        supportsJsonMode: true,
      },
      lifecycle: {
        supportsSessionBinding: true,
        supportsStopHook: true,
        supportsGracefulShutdown: true,
        supportsHealthCheck: false,
      },
      limits: {
        maxConcurrentSessions: 5,
        maxPromptTokens: 200000,
        timeoutMs: 120000,
      },
    };
  }

  // 4. passes for valid manifest
  it("passes for a fully valid manifest", () => {
    const result: HostContractValidationResult = validateHostContract(validManifest());

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.capabilities).toBeDefined();
  });

  // 5. detects missing required fields
  it("detects missing required fields", () => {
    const manifest = validManifest();
    // Intentionally remove harnessName to break the contract
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manifest as any).harnessName = undefined;

    const result = validateHostContract(manifest);

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);

    const nameViolation = result.violations.find(
      (v: HostContractViolation) => v.field === "harnessName",
    );
    expect(nameViolation).toBeDefined();
    expect(nameViolation!.severity).toBe("error");
  });

  // 6. detects capability/lifecycle inconsistency
  it("detects capability-lifecycle inconsistency", () => {
    const manifest = validManifest();
    // Claim SessionBinding capability but deny it in lifecycle
    manifest.capabilities = [Cap.SessionBinding];
    manifest.lifecycle.supportsSessionBinding = false;

    const result = validateHostContract(manifest);

    expect(result.valid).toBe(false);
    const violation = result.violations.find(
      (v: HostContractViolation) =>
        v.field === "lifecycle.supportsSessionBinding" ||
        v.field.includes("SessionBinding"),
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("error");
  });

  // 7. checks against TaskRequirements when provided
  it("checks against task requirements when provided", () => {
    const manifest = validManifest();
    // Remove Mcp capability
    manifest.capabilities = [Cap.Programmatic];

    const requirements = {
      requiredCapabilities: [Cap.Programmatic, Cap.Mcp],
      minTimeoutMs: 60000,
    };

    const result = validateHostContract(manifest, requirements);

    expect(result.valid).toBe(false);

    const capViolation = result.violations.find(
      (v: HostContractViolation) => v.requirement?.includes("Mcp") || v.requirement?.includes("mcp"),
    );
    expect(capViolation).toBeDefined();
    expect(capViolation!.severity).toBe("error");
  });

  it("validates timeout requirement against manifest limits", () => {
    const manifest = validManifest();
    manifest.limits = { timeoutMs: 30000 };

    const requirements = {
      requiredCapabilities: [],
      minTimeoutMs: 60000,
    };

    const result = validateHostContract(manifest, requirements);

    expect(result.valid).toBe(false);
    const timeoutViolation = result.violations.find(
      (v: HostContractViolation) => v.field.includes("timeout") || v.field.includes("Timeout"),
    );
    expect(timeoutViolation).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8-9. buildManifestFromDiscovery
// ---------------------------------------------------------------------------

describe("buildManifestFromDiscovery", () => {
  // 8. maps full discovery result to manifest
  it("maps discovery result to manifest", () => {
    const discovery = stubDiscovery({
      name: "claude-code",
      installed: true,
      version: "2.1.0",
      capabilities: [Cap.Programmatic, Cap.SessionBinding, Cap.StopHook, Cap.Mcp],
    });

    const manifest = buildManifestFromDiscovery(discovery);

    expect(manifest.harnessName).toBe("claude-code");
    expect(manifest.version).toBe("2.1.0");
    expect(manifest.capabilities).toEqual([
      Cap.Programmatic,
      Cap.SessionBinding,
      Cap.StopHook,
      Cap.Mcp,
    ]);
    expect(manifest.lifecycle.supportsSessionBinding).toBe(true);
    expect(manifest.lifecycle.supportsStopHook).toBe(true);
  });

  // 9. handles partial discovery data gracefully
  it("handles partial discovery data", () => {
    const discovery = stubDiscovery({
      name: "minimal-harness",
      installed: true,
      version: undefined,
      capabilities: [],
    });

    const manifest = buildManifestFromDiscovery(discovery);

    expect(manifest.harnessName).toBe("minimal-harness");
    expect(manifest.version).toBeUndefined();
    expect(manifest.capabilities).toEqual([]);
    expect(manifest.lifecycle.supportsSessionBinding).toBe(false);
    expect(manifest.lifecycle.supportsStopHook).toBe(false);
    expect(manifest.communication.protocol).toBeDefined();
  });

  it("handles uninstalled harness discovery result", () => {
    const discovery = stubDiscovery({
      name: "missing-harness",
      installed: false,
      capabilities: [],
    });

    const manifest = buildManifestFromDiscovery(discovery);

    expect(manifest.harnessName).toBe("missing-harness");
    expect(manifest.capabilities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Default manifests for known harnesses
// ---------------------------------------------------------------------------

describe("default manifests for known harnesses", () => {
  it("claude-code adapter resolves to manifest with expected lifecycle flags", () => {
    const adapter = stubAdapter({
      name: "claude-code",
      getCapabilities: () => [
        Cap.Programmatic,
        Cap.SessionBinding,
        Cap.StopHook,
        Cap.Mcp,
        Cap.HeadlessPrompt,
      ],
    });

    const manifest = resolveHostCapabilities(adapter);

    expect(manifest.lifecycle.supportsSessionBinding).toBe(true);
    expect(manifest.lifecycle.supportsStopHook).toBe(true);
    expect(manifest.communication.protocol).toBeDefined();
  });

  it("pi adapter resolves to manifest with concurrent effects", () => {
    const adapter = stubAdapter({
      name: "pi",
      getCapabilities: () => [
        Cap.Programmatic,
        Cap.SessionBinding,
        Cap.StopHook,
        Cap.ConcurrentEffects,
      ],
    });

    const manifest = resolveHostCapabilities(adapter);

    expect(manifest.capabilities).toContain(Cap.ConcurrentEffects);
    expect(manifest.lifecycle.supportsSessionBinding).toBe(true);
  });

  it("null/unknown adapter produces minimal but valid manifest", () => {
    const adapter = stubAdapter({ name: "null" });

    const manifest = resolveHostCapabilities(adapter);
    const result = validateHostContract(manifest);

    // A manifest with no capabilities is still structurally valid
    expect(result.valid).toBe(true);
    expect(manifest.capabilities).toEqual([]);
  });
});
