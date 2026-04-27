import { describe, expect, it } from "vitest";
import {
  getAgentVersionSlug,
  getFallbackHarnessMetadata,
  getUiAgentOntologyEntry,
  getUiAgentOntologyList,
  listAgentVersions,
  listFallbackHarnessMetadata,
  getHarnessImages,
  lookupHarnessImage,
} from "./index";

describe("agent-catalog sdk contract", () => {
  it("keeps fallback harness metadata alias-safe and clone-safe", () => {
    const canonical = getFallbackHarnessMetadata("claude-code");
    const alias = getFallbackHarnessMetadata("claude");

    expect(canonical).toBeDefined();
    expect(alias).toEqual(canonical);
    expect(listFallbackHarnessMetadata()["claude-code"]).toEqual(canonical);

    alias!.capabilities.supportsMCP = false;

    expect(getFallbackHarnessMetadata("claude")?.capabilities.supportsMCP).toBe(canonical!.capabilities.supportsMCP);
  });

  it("keeps harness image lookup aligned with canonical aliases and cloned return values", () => {
    const canonical = lookupHarnessImage("claude-code");
    const alias = lookupHarnessImage("claude");

    expect(canonical).toBeDefined();
    expect(alias).toEqual(canonical);
    expect(getHarnessImages().find((entry) => entry.harness === canonical!.harness)).toEqual(canonical);

    alias!.image = "mutated:image";

    expect(lookupHarnessImage("claude")?.image).toBe(canonical!.image);
  });

  it("round-trips UI ontology slugs between the list and detail sdk helpers", () => {
    const agent = listAgentVersions().find((entry) => entry.capabilityIds.length > 0) ?? listAgentVersions()[0];
    expect(agent).toBeDefined();

    const slug = getAgentVersionSlug(agent!);
    const listEntry = getUiAgentOntologyList().find((entry) => entry.slug === slug);
    const detail = getUiAgentOntologyEntry(slug);

    expect(listEntry).toBeDefined();
    expect(detail).toBeDefined();
    expect(detail).toMatchObject({
      slug,
      agentId: agent!.agentId,
      versionRange: agent!.versionRange,
      name: listEntry!.name,
    });
  });
});
