import React, { useDeferredValue, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Link } from 'react-router-dom-v6';
import { Search } from 'lucide-react';
import { useGateway } from '@a5c-ai/agent-mux-ui';

import { PageHeroGrid, PageSection, PageShell } from '../components/shared/page-shell.js';

type SessionCost = {
  totalUsd?: number;
};

type SessionRow = {
  sessionId: string;
  agent: string;
  status: string;
  activeRunId: string | null;
  latestRunId: string | null;
  updatedAt: number;
  title: string | null;
  turnCount: number | null;
  messageCount: number | null;
  costTotalUsd: number | null;
  workspacePath: string | null;
};

type SessionFilter = 'all' | 'active' | 'inactive';

function formatUsd(totalUsd: number | null): string | null {
  if (totalUsd == null || !Number.isFinite(totalUsd)) {
    return null;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: totalUsd >= 1 ? 2 : 4,
    maximumFractionDigits: 4,
  }).format(totalUsd);
}

function readWorkspacePath(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.currentPath === 'string' && record.currentPath.length > 0) {
    return record.currentPath;
  }
  if (typeof record.workspaceDefaultCwd === 'string' && record.workspaceDefaultCwd.length > 0) {
    return record.workspaceDefaultCwd;
  }
  if (typeof record.workspaceRootPath === 'string' && record.workspaceRootPath.length > 0) {
    return record.workspaceRootPath;
  }
  return null;
}

function formatUpdatedAt(updatedAt: number): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return 'No heartbeat yet';
  }
  return new Date(updatedAt).toLocaleString();
}

function formatSessionVolume(session: SessionRow): string {
  const parts: string[] = [];
  if (session.messageCount != null) {
    parts.push(`${session.messageCount} messages`);
  }
  if (session.turnCount != null) {
    parts.push(`${session.turnCount} turns`);
  }
  const costLabel = formatUsd(session.costTotalUsd);
  if (costLabel) {
    parts.push(costLabel);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No turns recorded yet';
}

function workspaceHref(path: string): string {
  return `/workspaces?workspace=${encodeURIComponent(path)}`;
}

function SessionSpotlightCard(props: { session: SessionRow }) {
  const runId = props.session.activeRunId ?? props.session.latestRunId;

  return (
    <article className="session-browser__spotlight-card" data-testid={`session-card-${props.session.sessionId}`}>
      <div className="session-browser__spotlight-header">
        <div>
          <p className="session-browser__eyebrow">{props.session.status === 'active' ? 'Live session' : 'Recent session'}</p>
          <h3>{props.session.title ?? props.session.sessionId}</h3>
        </div>
        <div className="status-stack">
          <span className={`status-badge status-${props.session.status}`}>{props.session.status}</span>
          <span className="meta-chip">{props.session.agent}</span>
        </div>
      </div>
      <p className="muted-copy">{formatSessionVolume(props.session)}</p>
      <div className="session-browser__meta-row">
        <span className="page-chip page-chip--muted">{props.session.sessionId}</span>
        <span className="page-chip page-chip--muted">Updated {formatUpdatedAt(props.session.updatedAt)}</span>
      </div>
      {props.session.workspacePath ? (
        <div className="session-browser__path" title={props.session.workspacePath}>
          {props.session.workspacePath}
        </div>
      ) : null}
      <div className="session-browser__actions">
        <Link to={`/sessions/${props.session.sessionId}`} className="session-browser__action session-browser__action--primary">
          {props.session.status === 'active' ? 'Open live chat' : 'Resume chat'}
        </Link>
        {props.session.workspacePath ? (
          <Link to={workspaceHref(props.session.workspacePath)} className="session-browser__action">
            Open workspace
          </Link>
        ) : null}
        {runId ? (
          <Link to={`/runs/${runId}`} className="session-browser__action">
            Open run
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function SessionRowCard(props: { session: SessionRow }) {
  const runId = props.session.activeRunId ?? props.session.latestRunId;

  return (
    <article className="session-browser__row" data-testid={`session-row-${props.session.sessionId}`}>
      <div className="session-browser__row-main">
        <div className="session-browser__row-copy">
          <div className="session-browser__row-topline">
            <h3>{props.session.title ?? props.session.sessionId}</h3>
            <span className={`status-badge status-${props.session.status}`}>{props.session.status}</span>
            <span className="meta-chip">{props.session.agent}</span>
          </div>
          <div className="session-browser__meta-row">
            <span className="page-chip page-chip--muted">{props.session.sessionId}</span>
            <span className="page-chip page-chip--muted">{formatSessionVolume(props.session)}</span>
            <span className="page-chip page-chip--muted">Updated {formatUpdatedAt(props.session.updatedAt)}</span>
          </div>
          {props.session.workspacePath ? (
            <div className="session-browser__path" title={props.session.workspacePath}>
              {props.session.workspacePath}
            </div>
          ) : null}
        </div>

        <div className="session-browser__actions">
          <Link to={`/sessions/${props.session.sessionId}`} className="session-browser__action session-browser__action--primary">
            {props.session.status === 'active' ? 'Open live chat' : 'Open chat'}
          </Link>
          {props.session.workspacePath ? (
            <Link to={workspaceHref(props.session.workspacePath)} className="session-browser__action">
              Workspace
            </Link>
          ) : null}
          {runId ? (
            <Link to={`/runs/${runId}`} className="session-browser__action">
              Run
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function SessionsPage(): JSX.Element {
  const { store } = useGateway();
  const sessions = useStore(store, useShallow((state) => Object.values(state.sessions.byId)));
  const runs = useStore(store, useShallow((state) => Object.values(state.runs.byId)));
  const eventBuffers = useStore(store, (state) => state.events.byRunId);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<SessionFilter>('all');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase();

  const rows = useMemo<SessionRow[]>(
    () =>
      sessions
        .map((session) => {
          const sessionId = String(session.sessionId);
          const fallbackCostTotalUsd = runs
            .filter((run) => String(run.sessionId ?? '') === sessionId)
            .reduce((sum, run) => {
              const runId = String(run.runId ?? '');
              const buffer = eventBuffers[runId];
              if (!buffer) {
                return sum;
              }
              return sum + buffer.events.reduce((runSum, event) => {
                if (event.type !== 'cost') {
                  return runSum;
                }
                const cost = event.cost;
                if (!cost || typeof cost !== 'object') {
                  return runSum;
                }
                return runSum + Number((cost as SessionCost).totalUsd ?? 0);
              }, 0);
            }, 0);

          return {
            sessionId,
            agent: String(session.agent ?? 'unknown'),
            status: String(session.status ?? 'inactive'),
            activeRunId: typeof session.activeRunId === 'string' ? session.activeRunId : null,
            latestRunId: typeof session.latestRunId === 'string' ? session.latestRunId : null,
            updatedAt: Number(session.updatedAt ?? 0),
            title: typeof session.title === 'string' ? session.title : null,
            turnCount: typeof session.turnCount === 'number' ? session.turnCount : null,
            messageCount: typeof session.messageCount === 'number' ? session.messageCount : null,
            costTotalUsd:
              session.cost && typeof session.cost === 'object' && typeof (session.cost as SessionCost).totalUsd === 'number'
                ? (session.cost as SessionCost).totalUsd ?? null
                : fallbackCostTotalUsd > 0
                  ? fallbackCostTotalUsd
                  : null,
            workspacePath:
              typeof session.cwd === 'string' && session.cwd.length > 0
                ? session.cwd
                : readWorkspacePath(session.workspace),
          };
        })
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [eventBuffers, runs, sessions],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((session) => {
        if (filter === 'active' && session.status !== 'active') {
          return false;
        }
        if (filter === 'inactive' && session.status === 'active') {
          return false;
        }
        if (normalizedSearchTerm.length === 0) {
          return true;
        }
        const searchDocument = [
          session.sessionId,
          session.title ?? '',
          session.agent,
          session.status,
          session.workspacePath ?? '',
          session.activeRunId ?? '',
          session.latestRunId ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return searchDocument.includes(normalizedSearchTerm);
      }),
    [filter, normalizedSearchTerm, rows],
  );

  const activeSessions = rows.filter((session) => session.status === 'active');
  const inactiveSessions = rows.filter((session) => session.status !== 'active');
  const visibleActiveSessions = filteredRows.filter((session) => session.status === 'active');
  const visibleInactiveSessions = filteredRows.filter((session) => session.status !== 'active');
  const totalCost = rows.reduce((sum, session) => sum + (session.costTotalUsd ?? 0), 0);
  const workspaceBoundCount = rows.filter((session) => session.workspacePath != null).length;
  const spotlightActive = visibleActiveSessions.slice(0, 3);
  const spotlightRecent = visibleInactiveSessions.slice(0, 3);

  return (
    <PageShell>
      <PageSection>
        <PageHeroGrid className="session-browser__hero-grid">
          <div className="session-browser__hero-copy">
            <p className="page-kicker">Sessions</p>
            <h1 className="page-title page-title--secondary">Sessions are conversation workspaces, not a run log.</h1>
            <p className="page-copy page-copy--wide">
              Jump straight into live chat, reopen paused threads, or pivot into the linked workspace and active run
              without hunting through separate screens.
            </p>
            <div className="page-actions">
              <Link to="/sessions/new" className="session-browser__action session-browser__action--primary">
                Start session
              </Link>
              <Link to="/workspaces" className="session-browser__action">
                Browse workspaces
              </Link>
            </div>
          </div>

          <div className="session-browser__hero-kpis">
            <div className="summary-card">
              <span className="summary-label">Live now</span>
              <strong>{activeSessions.length}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Paused</span>
              <strong>{inactiveSessions.length}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Workspace-linked</span>
              <strong>{workspaceBoundCount}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Observed cost</span>
              <strong>{rows.length > 0 ? formatUsd(totalCost) ?? 'unavailable' : 'No usage yet'}</strong>
            </div>
          </div>
        </PageHeroGrid>
      </PageSection>

      <PageSection inset>
        <div className="session-browser__controls">
          <label className="session-browser__search" aria-label="Search sessions">
            <Search className="h-4 w-4" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search session id, title, agent, workspace, or run id"
            />
          </label>

          <div className="session-browser__filters" role="tablist" aria-label="Session filters">
            {([
              ['all', `All sessions (${rows.length})`],
              ['active', `Active (${activeSessions.length})`],
              ['inactive', `Inactive (${inactiveSessions.length})`],
            ] as const).map(([nextFilter, label]) => (
              <button
                key={nextFilter}
                type="button"
                role="tab"
                aria-selected={filter === nextFilter}
                className={`session-browser__filter ${filter === nextFilter ? 'session-browser__filter--active' : ''}`}
                onClick={() => setFilter(nextFilter)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="session-browser__visible-count">
            {filteredRows.length} visible
          </div>
        </div>
      </PageSection>

      <PageHeroGrid className="session-browser__spotlight-grid">
        <PageSection>
          <div className="session-browser__section-header">
            <div>
              <p className="page-kicker page-kicker--compact">Live</p>
              <h2 className="page-title page-title--secondary">Active chats that can be resumed immediately</h2>
            </div>
          </div>
          <div className="session-browser__spotlight-list">
            {spotlightActive.map((session) => (
              <SessionSpotlightCard key={session.sessionId} session={session} />
            ))}
            {spotlightActive.length === 0 ? (
              <div className="empty-card">
                <strong>No active sessions match the current filter.</strong>
                <p className="muted-copy">Start a new session or widen the current search to reopen live work.</p>
              </div>
            ) : null}
          </div>
        </PageSection>

        <PageSection>
          <div className="session-browser__section-header">
            <div>
              <p className="page-kicker page-kicker--compact">Recent</p>
              <h2 className="page-title page-title--secondary">Paused threads worth picking back up</h2>
            </div>
          </div>
          <div className="session-browser__spotlight-list">
            {spotlightRecent.map((session) => (
              <SessionSpotlightCard key={session.sessionId} session={session} />
            ))}
            {spotlightRecent.length === 0 ? (
              <div className="empty-card">
                <strong>No inactive sessions match the current filter.</strong>
                <p className="muted-copy">Completed or paused sessions will collect here for quick resume.</p>
              </div>
            ) : null}
          </div>
        </PageSection>
      </PageHeroGrid>

      <PageSection>
        <div className="session-browser__section-header">
          <div>
            <p className="page-kicker page-kicker--compact">Directory</p>
            <h2 className="page-title page-title--secondary">All tracked sessions</h2>
            <p className="page-copy">
              Keep scanning on one surface. Open the chat when you need the transcript, or jump directly to the linked workspace and latest run.
            </p>
          </div>
        </div>

        <div className="session-browser__row-list">
          {filteredRows.map((session) => (
            <SessionRowCard key={session.sessionId} session={session} />
          ))}
          {filteredRows.length === 0 ? (
            <div className="empty-card">
              <strong>No sessions match the current filter.</strong>
              <p className="muted-copy">Adjust the search or status filter to widen the results.</p>
            </div>
          ) : null}
        </div>
      </PageSection>
    </PageShell>
  );
}
