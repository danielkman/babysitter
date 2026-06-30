// Twin custom backend A. Shares `type: 'twin'` with twin-b-backend.ts but is a
// DISTINCT module instance whose reply() posts to a marker URL identifying it as
// "A". Used to prove the runtime resolves the reply backend from the token's OWN
// sourceId (not by scanning sources for a matching `type`), so two custom backends
// that share a type can never cross-dispatch.
export default {
  type: 'twin',
  async poll(ctx: any) {
    const { source } = ctx;
    return {
      events: [
        {
          id: 'twin-a:1',
          content: 'from A',
          meta: { who: 'A' },
          payload: { kind: 'twin' },
          routing: { which: 'A', endpoint: source.config.endpoint }
        }
      ],
      state: { cursor: 'a', seen: ['twin-a:1'] }
    };
  },
  async reply({ routing, text, http }: any) {
    // Posts to <endpoint>/A so the test can assert it was THIS backend.
    const res = await http(`${routing.endpoint}/A/replies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, which: 'A' })
    });
    return { ok: res?.status >= 200 && res?.status < 300, ref: 'A' };
  }
};
