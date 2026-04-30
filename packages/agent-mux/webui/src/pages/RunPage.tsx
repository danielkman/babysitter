import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom-v6';
import { useRun } from '@a5c-ai/agent-mux-ui';

import { PageHeroGrid, PageSection, PageShell } from '../components/shared/page-shell.js';

export function SessionPendingPage(): JSX.Element {
  const params = useParams<{ runId: string }>();
  const runId = params.runId ?? '';
  const run = useRun(runId);
  const agent = String(run?.agent ?? 'unknown');
  const status = String(run?.status ?? 'starting');

  if (typeof run?.sessionId === 'string' && run.sessionId.length > 0) {
    return <Navigate to={`/sessions/${run.sessionId}`} replace />;
  }

  return (
    <PageShell>
      <PageSection>
        <PageHeroGrid className="session-browser__hero-grid">
          <div>
            <p className="page-kicker">Run handoff</p>
            <h1 className="page-title page-title--secondary">
              Waiting for this run to bind to its session.
            </h1>
            <p className="page-copy page-copy--wide">
              The browser is holding this bootstrap route only long enough for the gateway to attach
              the run to a durable session id. As soon as that happens, this page redirects into the
              live session chat automatically.
            </p>
            <div className="page-actions">
              <Link to="/sessions" className="session-browser__action session-browser__action--primary">
                Open sessions
              </Link>
              <Link to="/projects" className="session-browser__action">
                Open projects
              </Link>
            </div>
          </div>

          <div className="session-browser__hero-kpis">
            <div className="summary-card">
              <span className="summary-label">Run id</span>
              <strong>{runId || 'pending session'}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Agent</span>
              <strong>{agent}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">State</span>
              <strong>{status}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Next hop</span>
              <strong>Session chat</strong>
            </div>
          </div>
        </PageHeroGrid>
      </PageSection>

      <PageSection inset>
        <div className="session-browser__section-header">
          <div>
            <p className="page-kicker page-kicker--compact">What Happens Next</p>
            <h2 className="page-title page-title--secondary">Runs are only the transport bootstrap.</h2>
            <p className="page-copy">
              Once the harness publishes the final `sessionId`, the session route becomes the real
              working surface. That keeps transcript, approvals, runtime context, and follow-up turns
              on one stable screen instead of forcing users to stay on a run-centric detail view.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="summary-card">
            <span className="summary-label">Until then</span>
            <strong>Keep this route lightweight</strong>
            <p className="muted-copy">It exists to hand off into the session, not to become the primary UI.</p>
          </div>
          <div className="summary-card">
            <span className="summary-label">If it stalls</span>
            <strong>Check the session list</strong>
            <p className="muted-copy">The session may already be visible there even if this route has not redirected yet.</p>
          </div>
          <div className="summary-card">
            <span className="summary-label">If it fails</span>
            <strong>Return to projects or workspaces</strong>
            <p className="muted-copy">Recovery, retries, and workflow context live in those surfaces.</p>
          </div>
        </div>

        <div className="page-actions">
          <Link to="/sessions" className="session-browser__action">
            Back to sessions
          </Link>
          <Link to="/workspaces" className="session-browser__action">
            Open workspaces
          </Link>
        </div>
      </PageSection>
    </PageShell>
  );
}
