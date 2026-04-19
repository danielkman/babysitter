import { describe, it, expect, beforeEach } from "vitest";
import {
  getAmuxClient,
  isAmuxAvailable,
  _resetAmuxClientCache,
} from "../amuxClientFactory";

beforeEach(() => {
  _resetAmuxClientCache();
});

describe("getAmuxClient", () => {
  it("returns a client instance (@a5c-ai/agent-mux is a real dependency)", async () => {
    const client = await getAmuxClient();
    expect(client).not.toBeNull();
    expect(client).toBeDefined();
  });

  it("caches the client across calls", async () => {
    const first = await getAmuxClient();
    const second = await getAmuxClient();
    expect(first).toBe(second);
  });
});

describe("isAmuxAvailable", () => {
  it("returns true (@a5c-ai/agent-mux is installed)", async () => {
    const available = await isAmuxAvailable();
    expect(available).toBe(true);
  });
});

describe("_resetAmuxClientCache", () => {
  it("allows re-creation after reset", async () => {
    const first = await getAmuxClient();
    _resetAmuxClientCache();
    const second = await getAmuxClient();
    expect(first).not.toBe(second);
    expect(second).not.toBeNull();
  });
});
