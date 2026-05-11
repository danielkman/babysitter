export const AGENT_MUX_CLIENT_BOUNDARY = {
  role: 'agent-mux-client',
  scope: 'Thin adapter for Agent Mux capabilities, launch, and session status',
  owns: ['gateway connection', 'capability queries', 'session launch'],
  delegatesTo: [],
  mustNotOwn: ['secret values', 'permission review', 'resource persistence']
};

export function createAgentMuxClient(options = {}) {
  const { gateway = '', enabled = false } = options;

  return {
    role: 'agent-mux-client',

    isAvailable() {
      return enabled && !!gateway;
    },

    async queryCapabilities(adapter) {
      if (!this.isAvailable()) return null;
      // In MVP, return a stub capabilities object
      // Real implementation will HTTP fetch from gateway
      return { adapter, tools: [], models: [], skills: [] };
    },

    async launchSession({ stack, contextBundle, permissionSnapshot, workspace }) {
      if (!this.isAvailable()) return null;
      // In MVP, return a stub session
      // Real implementation will POST to gateway
      const runId = `amux-${Date.now()}`;
      const sessionId = `session-${Date.now()}`;
      return { runId, sessionId };
    },

    async getSessionStatus(sessionId) {
      if (!this.isAvailable()) return null;
      return { phase: 'unknown', events: [], artifacts: [] };
    }
  };
}
