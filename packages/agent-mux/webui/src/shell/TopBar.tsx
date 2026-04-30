import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom-v6';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useConnection, useGateway } from '@a5c-ai/agent-mux-ui';
import { Button } from '@a5c-ai/compendium';
import { Command, Keyboard, PlayCircle } from 'lucide-react';

import { titleForPath } from './navigation.js';

function topBarMeta(pathname: string): { eyebrow: string; subtitle: string } {
  if (pathname.startsWith('/sessions/pending/')) {
    return {
      eyebrow: 'Handoff',
      subtitle: 'Waiting for the bootstrap run to promote into a durable session.',
    };
  }
  if (/^\/runs\/[^/]+$/.test(pathname)) {
    return {
      eyebrow: 'Handoff',
      subtitle: 'This route exists only long enough to redirect the run into its session chat.',
    };
  }
  if (pathname.startsWith('/sessions/')) {
    return {
      eyebrow: 'Conversation',
      subtitle: 'Keep the chat primary while execution context and runtime stay alongside it.',
    };
  }
  if (pathname === '/sessions') {
    return {
      eyebrow: 'Sessions',
      subtitle: 'Scan live and paused conversations, then jump back into the right thread.',
    };
  }
  if (pathname.startsWith('/workspaces')) {
    return {
      eyebrow: 'Workspace',
      subtitle: 'Stay close to the session, runtime, and lifecycle controls for the selected worktree.',
    };
  }
  if (pathname.startsWith('/projects/')) {
    return {
      eyebrow: 'Planning',
      subtitle: 'Run the board, issues, reviews, and linked workspaces from the same product surface.',
    };
  }
  if (pathname.startsWith('/runs')) {
    return {
      eyebrow: 'Execution',
      subtitle: 'Inspect runs, approvals, and breakpoints without losing track of the active plan.',
    };
  }
  if (pathname === '/inbox') {
    return {
      eyebrow: 'Attention',
      subtitle: 'Handle breakpoints, approvals, and workspace recovery work that needs intervention.',
    };
  }
  return {
    eyebrow: 'Workbench',
    subtitle: 'Plan, execute, and recover work from one connected operator surface.',
  };
}

export function TopBar(props: { pathname: string; onOpenPalette(): void }): JSX.Element {
  const navigate = useNavigate();
  const connection = useConnection();
  const { store } = useGateway();
  const sessions = useStore(store, useShallow((state) => Object.values(state.sessions.byId)));
  const runs = useStore(store, useShallow((state) => Object.values(state.runs.byId)));
  const meta = useMemo(() => topBarMeta(props.pathname), [props.pathname]);
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'active').length,
    [sessions],
  );
  const runningRuns = useMemo(
    () => runs.filter((run) => run.status === 'running').length,
    [runs],
  );

  return (
    <header className="app-topbar">
      <div className="app-topbar__copy">
        <p className="app-topbar__eyebrow">{meta.eyebrow}</p>
        <h2>{titleForPath(props.pathname)}</h2>
        <p className="app-topbar__subtitle">{meta.subtitle}</p>
      </div>

      <div className="app-topbar__actions">
        <div className="app-topbar__chips">
          <span className="connection-pill app-topbar__chip">
            {activeSessions} live sessions
          </span>
          <span className="connection-pill app-topbar__chip">
            {runningRuns} running runs
          </span>
          <span className={`connection-pill connection-${connection.status}`}>{connection.status}</span>
        </div>

        <div className="app-topbar__buttons">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => window.dispatchEvent(new Event('open-shortcuts-help'))}
          >
            <Keyboard className="h-4 w-4" />
            Shortcuts
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={props.onOpenPalette}>
            <Command className="h-4 w-4" />
            Command palette
          </Button>
          <Button type="button" size="sm" onClick={() => navigate('/sessions/new')}>
            <PlayCircle className="h-4 w-4" />
            New session
          </Button>
        </div>
      </div>
    </header>
  );
}
