'use client';

import { useState, useCallback } from 'react';

// ---- File tree ----

const MOCK_FILE_TREE = [
  {
    name: 'src',
    type: 'dir',
    children: [
      {
        name: 'components',
        type: 'dir',
        children: [
          { name: 'App.tsx', type: 'file' },
          { name: 'Header.tsx', type: 'file' },
        ],
      },
      { name: 'index.ts', type: 'file' },
      { name: 'utils.ts', type: 'file' },
    ],
  },
  {
    name: 'tests',
    type: 'dir',
    children: [
      { name: 'app.test.ts', type: 'file' },
    ],
  },
  { name: 'package.json', type: 'file' },
  { name: 'tsconfig.json', type: 'file' },
  { name: 'README.md', type: 'file' },
];

function FileIcon({ type, expanded }) {
  if (type === 'dir') {
    return (
      <span
        aria-hidden="true"
        style={{ fontSize: '0.75rem', marginRight: '0.25rem', color: '#6b7280' }}
      >
        {expanded ? '▾' : '▸'}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: '0.75rem', marginRight: '0.25rem', color: '#9ca3af', display: 'inline-block', width: '0.75rem' }}
    >
      &mdash;
    </span>
  );
}

function FileTreeNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth === 0);

  const isDir = node.type === 'dir';
  const indent = depth * 12;

  return (
    <div>
      <div
        role={isDir ? 'button' : undefined}
        tabIndex={isDir ? 0 : undefined}
        aria-expanded={isDir ? expanded : undefined}
        onClick={isDir ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={isDir ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } } : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: `${indent + 4}px`,
          paddingTop: '0.1875rem',
          paddingBottom: '0.1875rem',
          fontSize: '0.8125rem',
          cursor: isDir ? 'pointer' : 'default',
          borderRadius: '0.25rem',
          color: isDir ? '#111827' : '#374151',
          fontWeight: isDir ? 600 : 400,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <FileIcon type={node.type} expanded={expanded} />
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{node.name}</span>
      </div>
      {isDir && expanded && node.children ? (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileSidebar({ fileTree, sidebarOpen, onToggle }) {
  return (
    <div
      style={{
        width: sidebarOpen ? '14rem' : '2.25rem',
        minWidth: sidebarOpen ? '14rem' : '2.25rem',
        flexShrink: 0,
        borderRight: '1px solid #e5e7eb',
        background: '#f9fafb',
        borderRadius: '0.5rem 0 0 0.5rem',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.625rem',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        {sidebarOpen ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Files
          </span>
        ) : null}
        <button
          onClick={onToggle}
          aria-label={sidebarOpen ? 'Collapse file tree' : 'Expand file tree'}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '0.125rem 0.25rem',
            borderRadius: '0.25rem',
            fontSize: '0.875rem',
            color: '#6b7280',
            marginLeft: sidebarOpen ? 'auto' : 0,
          }}
        >
          {sidebarOpen ? '«' : '»'}
        </button>
      </div>
      {sidebarOpen ? (
        <div style={{ overflowY: 'auto', flex: 1, padding: '0.375rem 0.25rem' }}>
          {(fileTree || MOCK_FILE_TREE).map((node) => (
            <FileTreeNode key={node.name} node={node} depth={0} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---- Git status indicator ----

function GitStatusBar({ branch, dirty, ahead, behind }) {
  const displayBranch = branch || 'unknown';
  const isDirty = dirty != null ? dirty : false;
  const aheadCount = ahead ?? 0;
  const behindCount = behind ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.375rem 0.625rem',
        background: '#f3f4f6',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <span style={{ color: '#6b7280' }} aria-hidden="true">
        &#x2387;
      </span>
      <span style={{ fontWeight: 600, color: '#111827' }}>{displayBranch}</span>
      {isDirty ? (
        <span
          title="Uncommitted changes"
          style={{
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '0.25rem',
            padding: '0.0625rem 0.375rem',
            fontWeight: 700,
            fontSize: '0.6875rem',
          }}
        >
          dirty
        </span>
      ) : (
        <span
          style={{
            background: '#d1fae5',
            color: '#065f46',
            borderRadius: '0.25rem',
            padding: '0.0625rem 0.375rem',
            fontWeight: 700,
            fontSize: '0.6875rem',
          }}
        >
          clean
        </span>
      )}
      {aheadCount > 0 ? (
        <span style={{ color: '#2563eb' }} title={`${aheadCount} commit(s) ahead of remote`}>
          &uarr;{aheadCount}
        </span>
      ) : null}
      {behindCount > 0 ? (
        <span style={{ color: '#dc2626' }} title={`${behindCount} commit(s) behind remote`}>
          &darr;{behindCount}
        </span>
      ) : null}
      {aheadCount === 0 && behindCount === 0 ? (
        <span style={{ color: '#9ca3af' }}>up to date</span>
      ) : null}
    </div>
  );
}

// ---- Terminal placeholder ----

function TerminalPlaceholder({ sessionHref }) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  function handleConnect() {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      if (sessionHref) {
        window.open(sessionHref, '_blank', 'noopener,noreferrer');
      } else {
        setConnected(true);
      }
    }, 600);
  }

  return (
    <div
      style={{
        background: '#111827',
        borderRadius: '0.5rem',
        padding: '1rem',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.8125rem',
        color: '#d1d5db',
        minHeight: '7rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '0.75rem',
      }}
    >
      <div>
        <div style={{ color: '#6b7280', marginBottom: '0.5rem', fontSize: '0.6875rem' }}>
          TERMINAL
        </div>
        {connected ? (
          <div>
            <span style={{ color: '#22c55e' }}>$</span>
            <span style={{ marginLeft: '0.5rem', color: '#d1d5db' }}>agent@workspace:~$</span>
            <span
              style={{
                display: 'inline-block',
                width: '0.5rem',
                height: '1em',
                background: '#22c55e',
                marginLeft: '0.25rem',
                verticalAlign: 'text-bottom',
                animation: 'none',
              }}
            />
          </div>
        ) : (
          <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
            No active terminal session. Connect to start a live terminal.
          </div>
        )}
      </div>
      {!connected ? (
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            alignSelf: 'flex-start',
            padding: '0.375rem 0.75rem',
            fontSize: '0.75rem',
            background: connecting ? '#374151' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: connecting ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {connecting ? 'Connecting...' : 'Connect terminal'}
        </button>
      ) : (
        <button
          onClick={() => setConnected(false)}
          style={{
            alignSelf: 'flex-start',
            padding: '0.375rem 0.75rem',
            fontSize: '0.75rem',
            background: '#374151',
            color: '#d1d5db',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}

// ---- Resource usage stats ----

function ResourceUsageBar({ label, value, max, unit = '%', color = '#3b82f6' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : value;
  const barColor = pct > 85 ? '#ef4444' : pct > 60 ? '#f97316' : color;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#374151',
          marginBottom: '0.25rem',
        }}
      >
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>
          {value}{unit}{max ? ` / ${max}${unit}` : ''}
        </span>
      </div>
      <div
        style={{
          height: '0.375rem',
          background: '#e5e7eb',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: '9999px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function ResourceStats({ cpu, memory, disk }) {
  const cpuVal = cpu ?? 12;
  const memUsed = memory?.used ?? 1.2;
  const memTotal = memory?.total ?? 4;
  const diskUsed = disk?.used ?? 8;
  const diskTotal = disk?.total ?? 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <ResourceUsageBar label="CPU" value={cpuVal} unit="%" color="#3b82f6" />
      <ResourceUsageBar label="Memory" value={memUsed} max={memTotal} unit=" GB" color="#8b5cf6" />
      <ResourceUsageBar label="Disk" value={diskUsed} max={diskTotal} unit=" GB" color="#06b6d4" />
    </div>
  );
}

// ---- Codespace section ----

function CodespaceStatusBadge({ status }) {
  const display = status || 'Stopped';
  const bg = display === 'Running' ? '#d1fae5' : display === 'Starting' ? '#fef3c7' : display === 'Stopping' ? '#fef3c7' : '#f3f4f6';
  const fg = display === 'Running' ? '#065f46' : display === 'Starting' ? '#92400e' : display === 'Stopping' ? '#92400e' : '#6b7280';

  return (
    <span
      style={{
        background: bg,
        color: fg,
        borderRadius: '0.25rem',
        padding: '0.0625rem 0.375rem',
        fontWeight: 700,
        fontSize: '0.6875rem',
      }}
    >
      {display}
    </span>
  );
}

function CodespaceSection({ codespace, workspaceName, org, onLaunch, onStop }) {
  const [selectedImage, setSelectedImage] = useState('codercom/code-server:latest');
  const [confirmStop, setConfirmStop] = useState(false);

  const images = [
    { value: 'codercom/code-server:latest', label: 'code-server' },
    { value: 'gitpod/openvscode-server:latest', label: 'openvscode-server' },
  ];

  const btnBase = {
    padding: '0.375rem 0.75rem',
    fontSize: '0.75rem',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  const isRunning = codespace?.running === true;
  const isStarting = codespace?.phase === 'Starting' || codespace?.phase === 'Pending';
  const isStopping = codespace?.phase === 'Stopping';

  const formatUptime = (startTime) => {
    if (!startTime) return '--';
    const start = new Date(startTime);
    const now = new Date();
    const diff = Math.floor((now - start) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: '#374151',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        Codespace
        <CodespaceStatusBadge status={isRunning ? 'Running' : isStarting ? 'Starting' : isStopping ? 'Stopping' : 'Stopped'} />
      </div>

      {!isRunning && !isStarting && !isStopping ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={selectedImage}
            onChange={(e) => setSelectedImage(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              background: '#fff',
            }}
          >
            {images.map((img) => (
              <option key={img.value} value={img.value}>{img.label}</option>
            ))}
          </select>
          <button
            onClick={() => onLaunch?.({ image: selectedImage })}
            style={{ ...btnBase, background: '#22c55e', color: '#fff' }}
          >
            Launch Codespace
          </button>
        </div>
      ) : null}

      {isRunning ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: '#374151',
              flexWrap: 'wrap',
            }}
          >
            <span><strong>Uptime:</strong> {formatUptime(codespace.startTime)}</span>
            {codespace.cpu != null ? <span><strong>CPU:</strong> {codespace.cpu}</span> : null}
            {codespace.memory != null ? <span><strong>Memory:</strong> {codespace.memory}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {codespace.url ? (
              <a
                href={codespace.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...btnBase,
                  background: '#2563eb',
                  color: '#fff',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Open in Browser
              </a>
            ) : null}
            {!confirmStop ? (
              <button
                onClick={() => setConfirmStop(true)}
                style={{ ...btnBase, background: '#ef4444', color: '#fff' }}
              >
                Stop Codespace
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Confirm?</span>
                <button
                  onClick={() => { setConfirmStop(false); onStop?.(); }}
                  style={{ ...btnBase, background: '#ef4444', color: '#fff' }}
                >
                  Yes, Stop
                </button>
                <button
                  onClick={() => setConfirmStop(false)}
                  style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {(isStarting || isStopping) ? (
        <div style={{ fontSize: '0.75rem', color: '#92400e' }}>
          {isStarting ? 'Starting codespace...' : 'Stopping codespace...'}
        </div>
      ) : null}
    </div>
  );
}

// ---- Associations manager ----

function AssociationsSection({ associations = [], onAdd, onRemove }) {
  const [newKind, setNewKind] = useState('User');
  const [newName, setNewName] = useState('');

  const kinds = ['User', 'AgentDispatchRun', 'AgentSession'];

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd?.({ kind: newKind, name: newName.trim() });
    setNewName('');
  };

  const btnBase = {
    padding: '0.25rem 0.5rem',
    fontSize: '0.6875rem',
    border: 'none',
    borderRadius: '0.25rem',
    cursor: 'pointer',
  };

  const kindColors = {
    User: { bg: '#dbeafe', fg: '#1e40af' },
    AgentDispatchRun: { bg: '#fce7f3', fg: '#9d174d' },
    AgentSession: { bg: '#e0e7ff', fg: '#3730a3' },
  };

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: '#374151',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.5rem',
        }}
      >
        Associated
      </div>

      {associations.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
          {associations.map((a, i) => {
            const colors = kindColors[a.kind] || { bg: '#f3f4f6', fg: '#6b7280' };
            return (
              <div
                key={`${a.kind}-${a.name}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.25rem 0.5rem',
                  background: '#f9fafb',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span
                    style={{
                      background: colors.bg,
                      color: colors.fg,
                      borderRadius: '0.25rem',
                      padding: '0.0625rem 0.25rem',
                      fontWeight: 600,
                      fontSize: '0.625rem',
                    }}
                  >
                    {a.kind}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#111827' }}>{a.name}</span>
                </div>
                <button
                  onClick={() => onRemove?.(a)}
                  style={{ ...btnBase, background: '#fee2e2', color: '#991b1b' }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
          No associations
        </div>
      )}

      {/* Add association form */}
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value)}
          style={{
            padding: '0.25rem 0.375rem',
            fontSize: '0.75rem',
            borderRadius: '0.25rem',
            border: '1px solid #d1d5db',
            background: '#fff',
          }}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Name"
          style={{
            padding: '0.25rem 0.375rem',
            fontSize: '0.75rem',
            borderRadius: '0.25rem',
            border: '1px solid #d1d5db',
            flex: 1,
            minWidth: '8rem',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          style={{
            ...btnBase,
            background: newName.trim() ? '#2563eb' : '#d1d5db',
            color: '#fff',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---- Run history section ----

function RunPhaseBadge({ phase }) {
  const display = phase || 'Unknown';
  const colorMap = {
    Running: { bg: '#dbeafe', fg: '#1e40af' },
    Queued: { bg: '#fef3c7', fg: '#92400e' },
    Pending: { bg: '#fef3c7', fg: '#92400e' },
    Dispatched: { bg: '#e0e7ff', fg: '#3730a3' },
    Succeeded: { bg: '#d1fae5', fg: '#065f46' },
    Failed: { bg: '#fee2e2', fg: '#991b1b' },
    Cancelled: { bg: '#e5e7eb', fg: '#374151' },
  };
  const colors = colorMap[display] || { bg: '#f3f4f6', fg: '#6b7280' };

  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        borderRadius: '0.25rem',
        padding: '0.0625rem 0.375rem',
        fontWeight: 700,
        fontSize: '0.625rem',
      }}
    >
      {display}
    </span>
  );
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RunHistorySection({ active = [], history = [], org }) {
  const [tab, setTab] = useState('active');

  const tabStyle = (selected) => ({
    padding: '0.25rem 0.625rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    border: 'none',
    borderBottom: selected ? '2px solid #2563eb' : '2px solid transparent',
    background: 'none',
    color: selected ? '#2563eb' : '#6b7280',
    cursor: 'pointer',
  });

  const runs = tab === 'active' ? active : history;

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: '#374151',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.5rem',
        }}
      >
        Runs
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid #e5e7eb', marginBottom: '0.5rem' }}>
        <button onClick={() => setTab('active')} style={tabStyle(tab === 'active')}>
          Active ({active.length})
        </button>
        <button onClick={() => setTab('history')} style={tabStyle(tab === 'history')}>
          History ({history.length})
        </button>
      </div>

      {runs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {runs.map((run) => {
            const name = run.metadata?.name || 'unknown';
            const stack = run.spec?.agentStack || '--';
            const phase = run.status?.phase || 'Unknown';
            const started = run.status?.createdAt || run.metadata?.creationTimestamp;
            const duration = run.status?.duration || null;
            const href = org ? `/orgs/${org}/agents/runs/${name}` : null;

            return (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.375rem 0.5rem',
                  background: '#f9fafb',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
                  <RunPhaseBadge phase={phase} />
                  {href ? (
                    <a
                      href={href}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        color: '#2563eb',
                        textDecoration: 'none',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </a>
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>{name}</span>
                  )}
                  <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono, monospace)' }}>{stack}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', color: '#9ca3af', fontSize: '0.6875rem' }}>
                  <span>{formatRelativeTime(started)}</span>
                  {duration ? <span>{duration}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {tab === 'active' ? 'No active runs' : 'No run history'}
        </div>
      )}
    </div>
  );
}

// ---- Main workspace panel ----

// ---- PVC status badge ----

function PvcStatusBadge({ status }) {
  const display = status || 'Unknown';
  const bg = display === 'Bound' ? '#d1fae5' : display === 'Pending' ? '#fef3c7' : display === 'Released' ? '#e5e7eb' : '#f3f4f6';
  const fg = display === 'Bound' ? '#065f46' : display === 'Pending' ? '#92400e' : display === 'Released' ? '#374151' : '#6b7280';

  return (
    <span
      style={{
        background: bg,
        color: fg,
        borderRadius: '0.25rem',
        padding: '0.0625rem 0.375rem',
        fontWeight: 700,
        fontSize: '0.6875rem',
      }}
    >
      PVC: {display}
    </span>
  );
}

// ---- Workspace action buttons ----

function WorkspaceActions({ phase, onSync, onRelease, onDelete }) {
  const btnBase = {
    padding: '0.375rem 0.75rem',
    fontSize: '0.75rem',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {(phase === 'Ready' || phase === 'InUse') ? (
        <button onClick={onSync} style={{ ...btnBase, background: '#2563eb', color: '#fff' }}>
          Sync
        </button>
      ) : null}
      {phase === 'InUse' ? (
        <button onClick={onRelease} style={{ ...btnBase, background: '#f59e0b', color: '#fff' }}>
          Release
        </button>
      ) : null}
      {(phase !== 'Terminating') ? (
        <button onClick={onDelete} style={{ ...btnBase, background: '#ef4444', color: '#fff' }}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

export function WorkspacePanel({
  workspace = null,
  runtime = null,
  session = null,
  org = 'default',
  codespace = null,
  associations = null,
  activeRuns = null,
  historyRuns = null,
  onLaunchCodespace = null,
  onStopCodespace = null,
  onAddAssociation = null,
  onRemoveAssociation = null,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const wsName = workspace?.metadata?.name || 'Workspace';
  const repository = workspace?.spec?.repository || null;
  const phase = workspace?.status?.phase || 'Unknown';

  // Volume info
  const volumeSpec = workspace?.spec?.volumeSpec || {};
  const pvcName = workspace?.spec?.pvcName || null;
  const volumeStatus = workspace?.status?.volumeStatus || 'Unknown';
  const capacity = volumeSpec.capacity || '10Gi';
  const storageClassName = volumeSpec.storageClassName || 'standard';

  // Run binding
  const runRef = workspace?.status?.runRef || null;

  // Git info
  const gitBranch = workspace?.spec?.branch || runtime?.spec?.gitBranch || workspace?.status?.gitBranch || null;
  const gitDirty = runtime?.spec?.gitDirty ?? workspace?.status?.gitDirty ?? null;
  const gitAhead = runtime?.spec?.gitAhead ?? workspace?.status?.gitAhead ?? null;
  const gitBehind = runtime?.spec?.gitBehind ?? workspace?.status?.gitBehind ?? null;

  // File tree from runtime
  const fileTree = runtime?.spec?.fileTree || null;

  // Resource usage
  const cpuPct = runtime?.status?.cpu ?? runtime?.spec?.cpu ?? null;
  const memoryInfo = runtime?.status?.memory || runtime?.spec?.memory || null;
  const diskInfo = runtime?.status?.disk || runtime?.spec?.disk || null;

  // Session link
  const sessionName = session?.metadata?.name || null;
  const sessionHref = sessionName ? `/orgs/${org}/agents/sessions/${sessionName}` : null;

  const phaseColor = phase === 'Ready' ? '#22c55e' : phase === 'InUse' ? '#3b82f6' : phase === 'Pending' ? '#f59e0b' : phase === 'Terminating' ? '#ef4444' : phase === 'Archived' ? '#6b7280' : '#9ca3af';

  const handleSync = useCallback(() => {
    // Intent — dispatched to controller
  }, []);
  const handleRelease = useCallback(() => {
    // Intent — dispatched to controller
  }, []);
  const handleDelete = useCallback(() => {
    // Intent — dispatched to controller
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        height: '100%',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{wsName}</h2>
          <span
            style={{
              background: phaseColor,
              color: '#fff',
              borderRadius: '9999px',
              padding: '0.125rem 0.5rem',
              fontSize: '0.6875rem',
              fontWeight: 700,
            }}
          >
            {phase}
          </span>
          <PvcStatusBadge status={volumeStatus} />
        </div>
        {repository ? (
          <span style={{ fontSize: '0.8125rem', color: '#6b7280', fontFamily: 'var(--font-mono, monospace)' }}>
            {repository}
          </span>
        ) : null}
      </div>

      {/* Volume info bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.5rem 0.75rem',
          background: '#f9fafb',
          borderRadius: '0.375rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono, monospace)',
          flexWrap: 'wrap',
        }}
      >
        {pvcName ? (
          <span><strong>PVC:</strong> {pvcName}</span>
        ) : null}
        <span><strong>Capacity:</strong> {capacity}</span>
        <span><strong>Storage class:</strong> {storageClassName}</span>
        {runRef ? (
          <span style={{ color: '#2563eb' }}><strong>Mounted by:</strong> {runRef}</span>
        ) : (
          <span style={{ color: '#9ca3af' }}>Not mounted</span>
        )}
      </div>

      {/* Git status */}
      {(gitBranch || gitDirty != null) ? (
        <GitStatusBar
          branch={gitBranch}
          dirty={gitDirty}
          ahead={gitAhead}
          behind={gitBehind}
        />
      ) : null}

      {/* Actions */}
      <WorkspaceActions
        phase={phase}
        onSync={handleSync}
        onRelease={handleRelease}
        onDelete={handleDelete}
      />

      {/* Codespace section */}
      <CodespaceSection
        codespace={codespace}
        workspaceName={wsName}
        org={org}
        onLaunch={onLaunchCodespace}
        onStop={onStopCodespace}
      />

      {/* Associations manager */}
      <AssociationsSection
        associations={associations ?? workspace?.spec?.associations ?? []}
        onAdd={onAddAssociation}
        onRemove={onRemoveAssociation}
      />

      {/* Run history */}
      <RunHistorySection
        active={activeRuns ?? []}
        history={historyRuns ?? []}
        org={org}
      />

      {/* Main area: sidebar + content */}
      <div
        style={{
          display: 'flex',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          minHeight: '18rem',
          flex: 1,
        }}
      >
        <FileSidebar
          fileTree={fileTree}
          sidebarOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
        />

        {/* Right panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            padding: '0.75rem',
            minWidth: 0,
          }}
        >
          {/* Active session / mounted-by info */}
          {sessionName ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                background: '#eff6ff',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
              }}
            >
              <span style={{ color: '#1d4ed8', fontWeight: 600 }}>Active session</span>
              <a
                href={sessionHref}
                style={{ color: '#2563eb', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}
              >
                {sessionName} &rarr;
              </a>
            </div>
          ) : (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                background: '#f9fafb',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
                color: '#9ca3af',
              }}
            >
              No active session bound
            </div>
          )}

          {/* Terminal */}
          <TerminalPlaceholder sessionHref={sessionHref} />

          {/* Resource usage */}
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Resource usage
            </div>
            <ResourceStats cpu={cpuPct} memory={memoryInfo} disk={diskInfo} />
          </div>
        </div>
      </div>
    </div>
  );
}
