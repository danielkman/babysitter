import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAmuxClient,
  isAmuxAvailable,
  _resetAmuxClientCache,
} from "../amuxClientFactory";

// ---------------------------------------------------------------------------
// Reset cached client between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetAmuxClientCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getAmuxClient", () => {
  it("returns null when @agent-mux/core is not installed", async () => {
    const client = await getAmuxClient();
    // In the test environment @agent-mux/core is not installed,
    // so the dynamic import should fail and return null.
    expect(client).toBeNull();
  });

  it("caches the null result across calls", async () => {
    const first = await getAmuxClient();
    const second = await getAmuxClient();
    expect(first).toBeNull();
    expect(second).toBeNull();
    // Both should be the same cached null
    expect(first).toBe(second);
  });
});

describe("isAmuxAvailable", () => {
  it("returns false when @agent-mux/core is not installed", async () => {
    const available = await isAmuxAvailable();
    expect(available).toBe(false);
  });
});

describe("_resetAmuxClientCache", () => {
  it("allows re-evaluation after reset", async () => {
    // First call caches null
    await getAmuxClient();
    // Reset
    _resetAmuxClientCache();
    // Next call should re-attempt the import (and still fail)
    const client = await getAmuxClient();
    expect(client).toBeNull();
  });
});
