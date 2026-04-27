import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  getCatalogDiscoverySnapshot,
  getCatalogDomainByName,
  getCatalogProcessById,
  getCatalogSkillBySlug,
  getCatalogSpecializationByName,
  listCatalogDomains,
  listCatalogProcesses,
  listCatalogSkills,
  listCatalogSpecializations,
  refreshCatalogDiscoverySnapshot,
  searchCatalogDiscovery,
} from "@a5c-ai/agent-catalog";
import { GET as getAnalytics } from "./analytics/route";
import { GET as getDomains } from "./domains/route";
import { GET as getDomainDetail } from "./domains/[slug]/route";
import { GET as getProcesses } from "./processes/route";
import { GET as getProcessDetail } from "./processes/[id]/route";
import { POST as postReindex } from "./reindex/route";
import { GET as getSearch } from "./search/route";
import { GET as getSkills } from "./skills/route";
import { GET as getSkillDetail } from "./skills/[slug]/route";
import { GET as getSpecializations } from "./specializations/route";
import { GET as getSpecializationDetail } from "./specializations/[slug]/route";

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function sortByString<T>(
  values: readonly T[],
  select: (value: T) => string,
  direction: "asc" | "desc" = "asc",
): T[] {
  const factor = direction === "desc" ? -1 : 1;
  return [...values].sort((left, right) => select(left).toLowerCase().localeCompare(select(right).toLowerCase()) * factor);
}

function paginationMeta(total: number, limit: number, offset: number, pageSize: number) {
  return {
    total,
    limit,
    offset,
    hasMore: offset + pageSize < total,
  };
}

const CONTRACT_TIMEOUT_MS = 60_000;

describe("catalog api agent-catalog integration contract", () => {
  it("projects graph-backed discovery search results through the search route", async () => {
    const skill = getCatalogDiscoverySnapshot().skills.find((entry) => entry.domainName) ?? getCatalogDiscoverySnapshot().skills[0];
    expect(skill).toBeDefined();

    const limit = 3;
    const response = await getSearch(
      new NextRequest(
        `http://localhost/api/search?q=${encodeURIComponent(skill!.name)}&type=skill&limit=${limit}`,
      ),
    );
    const body = await readJson<{
      success: boolean;
      data: Array<Record<string, unknown>>;
      meta: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(response);
    const expected = searchCatalogDiscovery(skill!.name, ["skill"]).slice(0, limit).map((result) => ({
      type: result.type,
      id: result.id,
      name: result.name,
      description: result.description,
      path: result.path,
      slug: result.slug,
      score: result.score,
    }));

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: expected,
      meta: paginationMeta(searchCatalogDiscovery(skill!.name, ["skill"]).length, limit, 0, expected.length),
    });
  }, CONTRACT_TIMEOUT_MS);

  it("keeps the skills list and detail routes aligned with discovery helpers", async () => {
    const skill = listCatalogSkills().find((entry) => entry.domainName) ?? listCatalogSkills()[0];
    expect(skill).toBeDefined();

    const filtered = listCatalogSkills()
      .filter((entry) => entry.domainName === skill!.domainName)
      .map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        name: entry.name,
        description: entry.description,
        filePath: entry.filePath,
        directory: entry.directory,
        specializationId: null,
        specializationName: entry.specializationName,
        domainId: null,
        domainName: entry.domainName,
        allowedTools: entry.allowedTools,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));
    const expectedList = sortByString(filtered, (entry) => entry.name).slice(0, Math.min(5, filtered.length));

    const listResponse = await getSkills(
      new NextRequest(
        `http://localhost/api/skills?domain=${encodeURIComponent(skill!.domainName ?? "")}&sort=name&limit=${expectedList.length}`,
      ),
    );
    const listBody = await readJson<{
      success: boolean;
      data: typeof expectedList;
      meta: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(listResponse);

    expect(listResponse.status).toBe(200);
    expect(listBody).toEqual({
      success: true,
      data: expectedList,
      meta: paginationMeta(filtered.length, expectedList.length, 0, expectedList.length),
    });

    const detailResponse = await getSkillDetail(new NextRequest(`http://localhost/api/skills/${skill!.slug}`), {
      params: Promise.resolve({ slug: skill!.slug }),
    });
    const detailBody = await readJson<{ success: boolean; data: Record<string, unknown> }>(detailResponse);

    expect(detailResponse.status).toBe(200);
    expect(detailBody).toEqual({
      success: true,
      data: {
        id: skill!.id,
        slug: skill!.slug,
        name: skill!.name,
        description: skill!.description,
        filePath: skill!.filePath,
        directory: skill!.directory,
        specializationId: null,
        specializationName: skill!.specializationName,
        domainId: null,
        domainName: skill!.domainName,
        allowedTools: skill!.allowedTools,
        createdAt: skill!.createdAt,
        updatedAt: skill!.updatedAt,
        content: getCatalogSkillBySlug(skill!.slug)!.content,
        frontmatter: getCatalogSkillBySlug(skill!.slug)!.frontmatter,
      },
    });
  }, CONTRACT_TIMEOUT_MS);

  it("keeps the processes list and detail routes aligned with discovery helpers", async () => {
    const process = listCatalogProcesses().find((entry) => entry.category) ?? listCatalogProcesses()[0];
    expect(process).toBeDefined();

    const filtered = listCatalogProcesses()
      .filter((entry) => entry.category === process!.category)
      .map((entry) => ({
        id: entry.id,
        processId: entry.processId,
        description: entry.description,
        category: entry.category,
        filePath: entry.filePath,
        taskCount: entry.tasks.length,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));
    const expectedList = sortByString(filtered, (entry) => entry.processId).slice(0, Math.min(5, filtered.length));

    const listResponse = await getProcesses(
      new NextRequest(
        `http://localhost/api/processes?category=${encodeURIComponent(process!.category ?? "")}&sort=processId&limit=${expectedList.length}`,
      ),
    );
    const listBody = await readJson<{
      success: boolean;
      data: typeof expectedList;
      meta: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(listResponse);

    expect(listResponse.status).toBe(200);
    expect(listBody).toEqual({
      success: true,
      data: expectedList,
      meta: paginationMeta(filtered.length, expectedList.length, 0, expectedList.length),
    });

    const detailResponse = await getProcessDetail(new NextRequest(`http://localhost/api/processes/${process!.id}`), {
      params: Promise.resolve({ id: String(process!.id) }),
    });
    const detailBody = await readJson<{ success: boolean; data: Record<string, unknown> }>(detailResponse);
    const detail = getCatalogProcessById(process!.id)!;

    expect(detailResponse.status).toBe(200);
    expect(detailBody).toEqual({
      success: true,
      data: {
        id: detail.id,
        processId: detail.processId,
        description: detail.description,
        category: detail.category,
        filePath: detail.filePath,
        taskCount: detail.tasks.length,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        inputs: detail.inputs,
        outputs: detail.outputs,
        tasks: detail.tasks.map((task) => ({ ...task })),
        frontmatter: detail.frontmatter,
      },
    });
  });

  it("keeps the domains and specializations routes aligned with discovery helpers", async () => {
    const domain = listCatalogDomains().find((entry) => entry.category) ?? listCatalogDomains()[0];
    const specialization =
      listCatalogSpecializations().find((entry) => entry.domainName === domain?.name) ?? listCatalogSpecializations()[0];

    expect(domain).toBeDefined();
    expect(specialization).toBeDefined();

    const domainFiltered = listCatalogDomains()
      .filter((entry) => entry.category === domain!.category)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path,
        category: entry.category,
        specializationCount: entry.specializationCount,
        agentCount: entry.agentCount,
        skillCount: entry.skillCount,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));
    const expectedDomains = sortByString(domainFiltered, (entry) => entry.name).slice(0, Math.min(5, domainFiltered.length));

    const domainsResponse = await getDomains(
      new NextRequest(
        `http://localhost/api/domains?category=${encodeURIComponent(domain!.category ?? "")}&limit=${expectedDomains.length}`,
      ),
    );
    const domainsBody = await readJson<{
      success: boolean;
      data: typeof expectedDomains;
      meta: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(domainsResponse);

    expect(domainsResponse.status).toBe(200);
    expect(domainsBody).toEqual({
      success: true,
      data: expectedDomains,
      meta: paginationMeta(domainFiltered.length, expectedDomains.length, 0, expectedDomains.length),
    });

    const domainDetailResponse = await getDomainDetail(new NextRequest(`http://localhost/api/domains/${domain!.name}`), {
      params: Promise.resolve({ slug: domain!.name }),
    });
    const domainDetailBody = await readJson<{ success: boolean; data: Record<string, unknown> }>(domainDetailResponse);
    const domainDetail = getCatalogDomainByName(domain!.name)!;

    expect(domainDetailResponse.status).toBe(200);
    expect(domainDetailBody).toEqual({
      success: true,
      data: {
        id: domainDetail.id,
        name: domainDetail.name,
        path: domainDetail.path,
        category: domainDetail.category,
        specializationCount: domainDetail.specializationCount,
        agentCount: domainDetail.agentCount,
        skillCount: domainDetail.skillCount,
        createdAt: domainDetail.createdAt,
        updatedAt: domainDetail.updatedAt,
        readmePath: domainDetail.readmePath,
        referencesPath: domainDetail.referencesPath,
        specializations: domainDetail.specializations,
      },
    });

    const specializationFiltered = listCatalogSpecializations()
      .filter((entry) => entry.domainName === specialization!.domainName)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path,
        domainId: null,
        domainName: entry.domainName,
        agentCount: entry.agentCount,
        skillCount: entry.skillCount,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));
    const expectedSpecializations = sortByString(specializationFiltered, (entry) => entry.name).slice(
      0,
      Math.min(5, specializationFiltered.length),
    );

    const specializationsResponse = await getSpecializations(
      new NextRequest(
        `http://localhost/api/specializations?domain=${encodeURIComponent(specialization!.domainName ?? "")}&limit=${expectedSpecializations.length}`,
      ),
    );
    const specializationsBody = await readJson<{
      success: boolean;
      data: typeof expectedSpecializations;
      meta: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(specializationsResponse);

    expect(specializationsResponse.status).toBe(200);
    expect(specializationsBody).toEqual({
      success: true,
      data: expectedSpecializations,
      meta: paginationMeta(specializationFiltered.length, expectedSpecializations.length, 0, expectedSpecializations.length),
    });

    const specializationDetailResponse = await getSpecializationDetail(
      new NextRequest(`http://localhost/api/specializations/${specialization!.name}`),
      {
        params: Promise.resolve({ slug: specialization!.name }),
      },
    );
    const specializationDetailBody = await readJson<{ success: boolean; data: Record<string, unknown> }>(
      specializationDetailResponse,
    );
    const specializationDetail = getCatalogSpecializationByName(specialization!.name)!;

    expect(specializationDetailResponse.status).toBe(200);
    expect(specializationDetailBody).toEqual({
      success: true,
      data: {
        id: specializationDetail.id,
        name: specializationDetail.name,
        path: specializationDetail.path,
        domainId: null,
        domainName: specializationDetail.domainName,
        agentCount: specializationDetail.agentCount,
        skillCount: specializationDetail.skillCount,
        createdAt: specializationDetail.createdAt,
        updatedAt: specializationDetail.updatedAt,
        readmePath: specializationDetail.readmePath,
        referencesPath: specializationDetail.referencesPath,
        agents: specializationDetail.agents,
        skills: specializationDetail.skills,
      },
    });
  });

  it("keeps analytics and reindex responses aligned with the live discovery snapshot", async () => {
    const snapshot = getCatalogDiscoverySnapshot();
    const analyticsResponse = await getAnalytics(new NextRequest("http://localhost/api/analytics"));
    const analyticsBody = await readJson<{ success: boolean; data: Record<string, unknown> }>(analyticsResponse);

    const byDomain = snapshot.domains
      .map((domain) => ({
        name: domain.name,
        count: domain.agentCount + domain.skillCount,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
    const byCategoryCounts = new Map<string, number>();
    for (const process of snapshot.processes) {
      if (!process.category) {
        continue;
      }
      byCategoryCounts.set(process.category, (byCategoryCounts.get(process.category) ?? 0) + 1);
    }
    const byCategory = Array.from(byCategoryCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
    const byType = [
      { name: "agents", count: snapshot.counts.agents },
      { name: "skills", count: snapshot.counts.skills },
      { name: "processes", count: snapshot.counts.processes },
      { name: "domains", count: snapshot.counts.domains },
      { name: "specializations", count: snapshot.counts.specializations },
    ];
    const recentActivity = [
      ...snapshot.agents.map((agent) => ({ type: "agent", id: agent.id, name: agent.name, updatedAt: agent.updatedAt })),
      ...snapshot.skills.map((skill) => ({
        type: "skill",
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        updatedAt: skill.updatedAt,
      })),
      ...snapshot.processes.map((process) => ({
        type: "process",
        id: process.id,
        name: process.processId,
        updatedAt: process.updatedAt,
      })),
      ...snapshot.domains.map((domain) => ({ type: "domain", id: domain.id, name: domain.name, updatedAt: domain.updatedAt })),
      ...snapshot.specializations.map((specialization) => ({
        type: "specialization",
        id: specialization.id,
        name: specialization.name,
        updatedAt: specialization.updatedAt,
      })),
    ]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 20);

    expect(analyticsResponse.status).toBe(200);
    expect(analyticsBody).toEqual({
      success: true,
      data: {
        counts: {
          domains: snapshot.counts.domains,
          specializations: snapshot.counts.specializations,
          agents: snapshot.counts.agents,
          skills: snapshot.counts.skills,
          processes: snapshot.counts.processes,
          total:
            snapshot.counts.domains +
            snapshot.counts.specializations +
            snapshot.counts.agents +
            snapshot.counts.skills +
            snapshot.counts.processes,
        },
        distributions: {
          byDomain,
          byCategory,
          byType,
        },
        recentActivity,
        databaseSize: snapshot.databaseSize,
        lastIndexedAt: snapshot.generatedAt,
      },
    });

    const reindexed = refreshCatalogDiscoverySnapshot();
    const reindexResponse = await postReindex(
      new NextRequest("http://localhost/api/reindex", {
        method: "POST",
        body: JSON.stringify({ force: true }),
      }),
    );
    const reindexBody = await readJson<{
      success: boolean;
      data: {
        success: boolean;
        statistics: Record<string, number>;
        errors: unknown[];
      };
    }>(reindexResponse);

    expect(reindexResponse.status).toBe(200);
    expect(reindexBody.data.success).toBe(true);
    expect(reindexBody.data.statistics).toMatchObject({
      domainsIndexed: reindexed.counts.domains,
      specializationsIndexed: reindexed.counts.specializations,
      agentsIndexed: reindexed.counts.agents,
      skillsIndexed: reindexed.counts.skills,
      processesIndexed: reindexed.counts.processes,
      filesProcessed: reindexed.counts.agents + reindexed.counts.skills + reindexed.counts.processes,
      errors: 0,
    });
    expect(reindexBody.data.statistics.duration).toBeGreaterThanOrEqual(0);
    expect(reindexBody.data.errors).toEqual([]);
  }, CONTRACT_TIMEOUT_MS);
});
