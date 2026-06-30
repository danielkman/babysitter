// Twin custom backend B. Shares `type: 'twin'` with twin-a-backend.ts but is a
// DISTINCT module instance whose reply() posts to a DIFFERENT marker URL ("B").
// If the runtime resolved the reply backend by `type` it could wrongly dispatch a
// B-owned token to A (or vice versa); resolving by sourceId prevents that.
export default {
  type: 'twin',
  async poll(ctx: any) {
    const { source } = ctx;
    return {
      events: [
        {
          id: 'twin-b:1',
          content: 'from B',
          meta: { who: 'B' },
          payload: { kind: 'twin' },
          routing: { which: 'B', endpoint: source.config.endpoint }
        }
      ],
      state: { cursor: 'b', seen: ['twin-b:1'] }
    };
  },
  async reply({ routing, text, http }: any) {
    const res = await http(`${routing.endpoint}/B/replies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, which: 'B' })
    });
    return { ok: res?.status >= 200 && res?.status < 300, ref: 'B' };
  }
};
