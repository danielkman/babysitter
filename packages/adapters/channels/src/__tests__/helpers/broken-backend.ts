// A deliberately BROKEN custom backend used by tests: it is missing the required
// `reply` hook. registry.load() -> defineBackend() must throw for this module, so
// createRuntime() (which eagerly resolves custom-path backends) fails at startup
// rather than at the first tick (finding §2).
export default {
  type: 'broken-custom',
  async poll() {
    return { events: [], state: { cursor: null, seen: [] } };
  }
  // NOTE: no `reply` — defineBackend rejects this.
};
