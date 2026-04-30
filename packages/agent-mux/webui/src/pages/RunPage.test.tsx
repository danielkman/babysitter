import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/test-utils';

import { SessionPendingPage } from './RunPage.js';

const mockUseRun = vi.fn();

vi.mock('react-router-dom-v6', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom-v6')>('react-router-dom-v6');
  return {
    ...actual,
    useParams: () => ({ runId: 'run-123' }),
  };
});

vi.mock('@a5c-ai/agent-mux-ui', () => ({
  useRun: (runId: string) => mockUseRun(runId),
}));

describe('SessionPendingPage', () => {
  it('renders the run handoff surface while waiting for a session id', () => {
    mockUseRun.mockReturnValue({
      runId: 'run-123',
      agent: 'codex',
      status: 'queued',
    });

    render(<SessionPendingPage />);

    expect(screen.getByText('Waiting for this run to bind to its session.')).toBeInTheDocument();
    expect(screen.getByText('run-123')).toBeInTheDocument();
    expect(screen.getByText('queued')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open sessions' })).toHaveAttribute('href', '/sessions');
    expect(screen.getByRole('link', { name: 'Open workspaces' })).toHaveAttribute('href', '/workspaces');
  });
});
