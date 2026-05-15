'use client';

import { useState, useRef, useCallback, useMemo } from 'react';

const WORKFLOW_COLUMNS = [
  { id: 'todo', label: 'Todo', color: '#6b7280', wipLimit: null },
  { id: 'in-progress', label: 'In Progress', color: '#eab308', wipLimit: 5 },
  { id: 'review', label: 'Review', color: '#3b82f6', wipLimit: 3 },
  { id: 'done', label: 'Done', color: '#22c55e', wipLimit: null },
];

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, undefined: 4 };

function priorityColor(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    case 'low': return '#22c55e';
    default: return '#9ca3af';
  }
}

function CardDetailModal({ item, onClose, columnColor }) {
  const name = item.metadata?.name || item.spec?.title || 'Untitled';
  const title = item.spec?.title || name;
  const description = item.spec?.description || item.spec?.body || null;
  const assignee = item.spec?.assignee || null;
  const priority = item.spec?.priority || null;
  const labels = item.spec?.labels || [];
  const storyPoints = item.spec?.storyPoints || item.spec?.points || null;
  const createdAt = item.metadata?.creationTimestamp || item.spec?.createdAt || null;
  const updatedAt = item.status?.updatedAt || item.spec?.updatedAt || null;
  const workspaceRef = item.workspaceRef || item.spec?.workspaceRef || null;
  const workspacePvcStatus = item.workspacePvcStatus || item.spec?.workspacePvcStatus || null;
  const sessionRef = item.sessionRef || item.spec?.sessionRef || null;
  const sessionStatus = item.sessionStatus || item.spec?.sessionStatus || null;
  const dispatchRunRef = item.dispatchRunRef || item.spec?.dispatchRunRef || null;
  const agentName = item.agentName || item.spec?.agentName || (item.status?.agentActive ? 'Agent active' : null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Card detail: ${title}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '0.75rem',
          width: '100%',
          maxWidth: '36rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            borderTop: `4px solid ${columnColor}`,
            padding: '1.25rem 1.5rem 1rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.4 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close card detail"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: '#6b7280',
              padding: '0.125rem 0.25rem',
              borderRadius: '0.25rem',
              flexShrink: 0,
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {description ? (
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.6 }}>{description}</p>
          ) : (
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>No description provided.</p>
          )}
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.375rem 1rem', fontSize: '0.8125rem' }}>
            {assignee ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Assignee</dt>
                <dd style={{ margin: 0 }}>{assignee}</dd>
              </>
            ) : null}
            {priority ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Priority</dt>
                <dd style={{ margin: 0 }}>
                  <span style={{ color: priorityColor(priority), fontWeight: 600 }}>{priority}</span>
                </dd>
              </>
            ) : null}
            {storyPoints != null ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Story points</dt>
                <dd style={{ margin: 0 }}>{storyPoints}</dd>
              </>
            ) : null}
            {workspaceRef ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Workspace</dt>
                <dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <code style={{ fontSize: '0.75rem' }}>{workspaceRef}</code>
                  {workspacePvcStatus ? (
                    <span style={{
                      fontSize: '0.625rem',
                      padding: '0.0625rem 0.375rem',
                      borderRadius: '9999px',
                      background: workspacePvcStatus === 'Bound' ? '#dcfce7' : '#fef3c7',
                      color: workspacePvcStatus === 'Bound' ? '#16a34a' : '#92400e',
                      fontWeight: 600,
                    }}>
                      {workspacePvcStatus}
                    </span>
                  ) : null}
                </dd>
              </>
            ) : null}
            {sessionRef ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Session</dt>
                <dd style={{ margin: 0 }}>
                  <a href={`/agents/sessions/${sessionRef}`} style={{ color: '#2563eb', fontSize: '0.75rem' }}>
                    {sessionRef.slice(0, 16)}…
                  </a>
                  {sessionStatus ? <span style={{ marginLeft: '0.375rem', color: '#9ca3af', fontSize: '0.6875rem' }}>{sessionStatus}</span> : null}
                </dd>
              </>
            ) : null}
            {dispatchRunRef ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Run</dt>
                <dd style={{ margin: 0 }}>
                  <a href={`/agents/runs/${dispatchRunRef}`} style={{ color: '#7c3aed', fontSize: '0.75rem' }}>
                    {dispatchRunRef.slice(0, 16)}…
                  </a>
                </dd>
              </>
            ) : null}
            {agentName ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Agent</dt>
                <dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#059669' }}>
                  <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '9999px', background: '#10b981', flexShrink: 0, animation: 'kanbanPulse 2s infinite' }} />
                  {agentName}
                </dd>
              </>
            ) : null}
            {createdAt ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Created</dt>
                <dd style={{ margin: 0 }}>{createdAt}</dd>
              </>
            ) : null}
            {updatedAt ? (
              <>
                <dt style={{ color: '#6b7280', fontWeight: 600 }}>Updated</dt>
                <dd style={{ margin: 0 }}>{updatedAt}</dd>
              </>
            ) : null}
          </dl>
          {labels.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {labels.map((label) => (
                <span
                  key={label}
                  className="pill neutral"
                  style={{ fontSize: '0.6875rem' }}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          {(item.status?.linkedSessions || item.status?.linkedWorkspaces) ? (
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem', display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
              {item.status?.linkedSessions ? <span>{item.status.linkedSessions} sessions</span> : null}
              {item.status?.linkedWorkspaces ? <span>{item.status.linkedWorkspaces} workspaces</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StartWorkDialog({ item, onConfirm, onCancel, org }) {
  const [loading, setLoading] = useState(false);
  const name = item.spec?.title || item.metadata?.name || 'this item';
  const repoRef = item.spec?.repoRef || item.spec?.repository || null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(item);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          maxWidth: '28rem',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>
          Start work on &quot;{name}&quot;?
        </h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          This will create or claim a KrateWorkspace for{' '}
          {repoRef ? `repository ${repoRef}` : 'this item'} and link it to the board card.
        </p>
        {repoRef ? (
          <div style={{ margin: '0 0 1rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: '0.375rem', fontSize: '0.8125rem' }}>
            <strong>Repository:</strong> <code>{repoRef}</code>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {loading ? 'Creating…' : 'Create workspace'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ item, columnColor, onDragStart, onDragEnd, isDragging, onCardClick, onStartWork }) {
  const name = item.metadata?.name || item.spec?.title;
  const title = item.spec?.title || name || 'Untitled';
  const priority = item.spec?.priority;
  const assignee = item.spec?.assignee;
  const labels = item.spec?.labels || [];
  const storyPoints = item.spec?.storyPoints || item.spec?.points;

  // Workspace/session/run/agent refs
  const workspaceRef = item.workspaceRef || item.spec?.workspaceRef || null;
  const workspacePvcStatus = item.workspacePvcStatus || item.spec?.workspacePvcStatus || null;
  const sessionRef = item.sessionRef || item.spec?.sessionRef || null;
  const sessionStatus = item.sessionStatus || item.spec?.sessionStatus || null;
  const dispatchRunRef = item.dispatchRunRef || item.spec?.dispatchRunRef || null;
  const agentName = item.agentName || item.spec?.agentName || (item.status?.agentActive ? 'Agent active' : null);
  const hasWorkspace = !!workspaceRef;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(item)}
      className="kanbanCard"
      tabIndex={0}
      role="button"
      aria-label={`Card: ${title}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(item); } }}
      style={{
        background: '#fff',
        borderRadius: '0.375rem',
        padding: '0.625rem 0.75rem',
        borderLeft: `4px solid ${columnColor}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        userSelect: 'none',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)'; }}
    >
      <strong style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem', lineHeight: 1.4 }}>{title}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: labels.length ? '0.25rem' : 0 }}>
        {priority ? (
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: priorityColor(priority) }}>
            {priority}
          </span>
        ) : null}
        {labels.slice(0, 3).map((label) => (
          <span key={label} className="pill neutral" style={{ fontSize: '0.6875rem' }}>{label}</span>
        ))}
      </div>

      {/* Workspace badge */}
      {workspaceRef ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.6875rem' }}>
          <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '0.0625rem 0.375rem', borderRadius: '9999px', fontWeight: 600, flexShrink: 0 }}>
            WS
          </span>
          <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {workspaceRef}
          </span>
          <span style={{
            fontSize: '0.5625rem',
            padding: '0.0625rem 0.25rem',
            borderRadius: '9999px',
            background: workspacePvcStatus === 'Bound' ? '#dcfce7' : '#fef3c7',
            color: workspacePvcStatus === 'Bound' ? '#16a34a' : '#92400e',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {workspacePvcStatus || 'Pending'}
          </span>
        </div>
      ) : null}

      {/* Session link */}
      {sessionRef ? (
        <a
          href={`/agents/sessions/${sessionRef}`}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.6875rem', color: '#2563eb', textDecoration: 'none' }}
        >
          <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '0.0625rem 0.375rem', borderRadius: '9999px', fontWeight: 600, flexShrink: 0 }}>Session</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {sessionRef.slice(0, 12)}…
          </span>
          {sessionStatus ? (
            <span style={{ fontSize: '0.5625rem', color: '#6b7280', flexShrink: 0 }}>{sessionStatus}</span>
          ) : null}
        </a>
      ) : null}

      {/* Run link */}
      {dispatchRunRef ? (
        <a
          href={`/agents/runs/${dispatchRunRef}`}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem', fontSize: '0.6875rem', color: '#7c3aed', textDecoration: 'none' }}
        >
          <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '0.0625rem 0.375rem', borderRadius: '9999px', fontWeight: 600, flexShrink: 0 }}>Run</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dispatchRunRef.slice(0, 14)}
          </span>
        </a>
      ) : null}

      {/* Agent indicator */}
      {agentName ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.6875rem', color: '#059669' }}>
          <span style={{
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '9999px',
            background: '#10b981',
            flexShrink: 0,
            animation: 'kanbanPulse 2s ease-in-out infinite',
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentName}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
        {assignee ? (
          <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>{assignee}</small>
        ) : <span />}
        {storyPoints != null ? (
          <span
            style={{
              background: '#f3f4f6',
              borderRadius: '9999px',
              padding: '0.0625rem 0.375rem',
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: '#374151',
            }}
          >
            {storyPoints}
          </span>
        ) : null}
      </div>

      {/* Start Work button — shown when no workspace and column is not done */}
      {onStartWork && !hasWorkspace && item._column !== 'done' ? (
        <button
          onClick={(e) => { e.stopPropagation(); onStartWork(item); }}
          style={{
            marginTop: '0.375rem',
            padding: '0.1875rem 0.5rem',
            fontSize: '0.6875rem',
            background: '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'center',
          }}
        >
          Start Work
        </button>
      ) : null}
    </div>
  );
}

function AddCardRow({ onAdd }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  function submit() {
    const t = title.trim();
    if (t) { onAdd(t); }
    setTitle('');
    setAdding(false);
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setAdding(false); setTitle(''); }
          }}
          placeholder="Card title..."
          style={{
            width: '100%',
            padding: '0.375rem 0.5rem',
            fontSize: '0.8125rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button
            onClick={submit}
            style={{
              flex: 1,
              padding: '0.25rem',
              fontSize: '0.75rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setTitle(''); }}
            style={{
              flex: 1,
              padding: '0.25rem',
              fontSize: '0.75rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setAdding(true)}
      style={{
        width: '100%',
        padding: '0.375rem',
        fontSize: '0.75rem',
        background: 'transparent',
        color: '#9ca3af',
        border: '1px dashed #d1d5db',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#374151'; e.currentTarget.style.borderColor = '#9ca3af'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#d1d5db'; }}
    >
      + Add card
    </button>
  );
}

function Swimlane({ label, items, columnColor, draggingId, onDragStart, onDragEnd, onCardClick, onStartWork }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '0.125rem 0',
          marginBottom: '0.25rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {label} ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {items.map((item) => (
          <KanbanCard
            key={item.metadata?.name || item.spec?.title}
            item={item}
            columnColor={columnColor}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={draggingId === (item.metadata?.name || item.spec?.title)}
            onCardClick={onCardClick}
            onStartWork={onStartWork}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({
  col,
  items,
  draggingId,
  dragOverCol,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardClick,
  onAddCard,
  onStartWork,
  groupBy,
}) {
  const isOver = dragOverCol === col.id;
  const wipExceeded = col.wipLimit != null && items.length > col.wipLimit;
  const totalPoints = items.reduce((sum, item) => {
    const pts = item.spec?.storyPoints || item.spec?.points;
    return sum + (pts != null ? Number(pts) : 0);
  }, 0);

  const grouped = useMemo(() => {
    if (groupBy === 'none' || !groupBy) return null;
    const groups = {};
    items.forEach((item) => {
      const key = (groupBy === 'assignee' ? item.spec?.assignee : item.spec?.priority) || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    if (groupBy === 'priority') {
      return Object.entries(groups).sort(([a], [b]) => {
        return (PRIORITY_ORDER[a.toLowerCase()] ?? 4) - (PRIORITY_ORDER[b.toLowerCase()] ?? 4);
      });
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [items, groupBy]);

  return (
    <section
      className="kanbanColumn"
      onDragOver={(e) => onDragOver(e, col.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, col.id)}
      style={{
        background: isOver ? 'var(--surface-hover, #f0f4ff)' : 'var(--surface-muted, #f9fafb)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        border: wipExceeded
          ? '2px solid #f97316'
          : isOver
          ? `2px solid ${col.color}`
          : '2px solid transparent',
        transition: 'border-color 0.15s ease, background 0.15s ease',
        minHeight: '12rem',
      }}
    >
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{col.label}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {wipExceeded ? (
            <span
              title={`WIP limit exceeded (limit: ${col.wipLimit})`}
              style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 700 }}
            >
              WIP!
            </span>
          ) : null}
          <span
            style={{
              background: wipExceeded ? '#f97316' : col.color,
              color: '#fff',
              borderRadius: '9999px',
              padding: '0.125rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {items.length}
            {col.wipLimit != null ? `/${col.wipLimit}` : ''}
          </span>
        </div>
      </div>

      {/* Column stats */}
      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.6875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
        <span>{items.length} card{items.length !== 1 ? 's' : ''}</span>
        {totalPoints > 0 ? <span>{totalPoints} pts</span> : null}
        {col.wipLimit != null ? (
          <span style={{ color: wipExceeded ? '#f97316' : '#9ca3af' }}>
            limit {col.wipLimit}
          </span>
        ) : null}
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <p
          style={{
            color: '#9ca3af',
            fontSize: '0.8125rem',
            textAlign: 'center',
            margin: 'auto 0',
            padding: '1rem 0',
          }}
        >
          No items
        </p>
      ) : grouped ? (
        grouped.map(([groupLabel, groupItems]) => (
          <Swimlane
            key={groupLabel}
            label={groupLabel}
            items={groupItems}
            columnColor={col.color}
            draggingId={draggingId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardClick={onCardClick}
            onStartWork={onStartWork}
          />
        ))
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {items.map((item) => (
            <KanbanCard
              key={item.metadata?.name || item.spec?.title}
              item={item}
              columnColor={col.color}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggingId === (item.metadata?.name || item.spec?.title)}
              onCardClick={onCardClick}
              onStartWork={onStartWork}
            />
          ))}
        </div>
      )}

      {/* Add card */}
      <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
        <AddCardRow onAdd={(title) => onAddCard(col.id, title)} />
      </div>
    </section>
  );
}

export function EnhancedKanbanBoard({
  initialIssues = [],
  org = 'default',
  project,
  wipLimits = {},
  workspaces = [],
  sessions = [],
}) {
  const [issues, setIssues] = useState(() =>
    initialIssues.map((item) => ({
      ...item,
      _column: item.status?.column || 'todo',
    }))
  );
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [searchText, setSearchText] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [pendingWorkspaceItem, setPendingWorkspaceItem] = useState(null);
  const dragItemRef = useRef(null);

  const projectName = project?.metadata?.name;

  // Derive unique assignees and labels for filter dropdowns
  const allAssignees = useMemo(() => {
    const set = new Set();
    issues.forEach((item) => { if (item.spec?.assignee) set.add(item.spec.assignee); });
    return Array.from(set).sort();
  }, [issues]);

  const allLabels = useMemo(() => {
    const set = new Set();
    issues.forEach((item) => { (item.spec?.labels || []).forEach((l) => set.add(l)); });
    return Array.from(set).sort();
  }, [issues]);

  // Apply filters
  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      if (filterAssignee && item.spec?.assignee !== filterAssignee) return false;
      if (filterLabel && !(item.spec?.labels || []).includes(filterLabel)) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const title = (item.spec?.title || item.metadata?.name || '').toLowerCase();
        const desc = (item.spec?.description || '').toLowerCase();
        if (!title.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    });
  }, [issues, filterAssignee, filterLabel, searchText]);

  const columns = WORKFLOW_COLUMNS.map((col) => ({
    ...col,
    wipLimit: wipLimits[col.id] ?? col.wipLimit,
    items: filteredIssues.filter((item) => item._column === col.id),
  }));

  const handleDragStart = useCallback((e, item) => {
    const id = item.metadata?.name || item.spec?.title;
    dragItemRef.current = item;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverCol(null);
    dragItemRef.current = null;
  }, []);

  const handleDragOver = useCallback((e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colId);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e, targetColId) => {
      e.preventDefault();
      const item = dragItemRef.current;
      if (!item) return;

      const id = item.metadata?.name || item.spec?.title;
      const prevColumn = item._column;
      if (prevColumn === targetColId) {
        setDraggingId(null);
        setDragOverCol(null);
        dragItemRef.current = null;
        return;
      }

      setIssues((prev) =>
        prev.map((i) => {
          const iId = i.metadata?.name || i.spec?.title;
          if (iId === id) {
            return { ...i, _column: targetColId, status: { ...(i.status || {}), column: targetColId } };
          }
          return i;
        })
      );
      setDraggingId(null);
      setDragOverCol(null);
      dragItemRef.current = null;

      // Offer to create workspace when moving to in-progress without one
      if (targetColId === 'in-progress' && !item.workspaceRef && !item.spec?.workspaceRef) {
        setPendingWorkspaceItem({ ...item, _column: targetColId });
      }

      if (projectName) {
        fetch(`/api/orgs/${encodeURIComponent(org)}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiVersion: 'krate.a5c.ai/v1alpha1',
            kind: 'AgentBoardItem',
            metadata: { name: id },
            status: { column: targetColId },
            _patch: true,
            _projectRef: projectName,
          }),
        }).catch(() => {
          setIssues((prev) =>
            prev.map((i) => {
              const iId = i.metadata?.name || i.spec?.title;
              if (iId === id) {
                return { ...i, _column: prevColumn, status: { ...(i.status || {}), column: prevColumn } };
              }
              return i;
            })
          );
        });
      }
    },
    [org, projectName]
  );

  const handleAddCard = useCallback((columnId, title) => {
    const newItem = {
      metadata: { name: `card-${Date.now()}` },
      spec: { title },
      status: { column: columnId },
      _column: columnId,
      _local: true,
    };
    setIssues((prev) => [...prev, newItem]);
  }, []);

  const handleCardClick = useCallback((item) => {
    setSelectedCard(item);
  }, []);

  // Handle Start Work — creates a KrateWorkspace and links it to the card
  const handleStartWork = useCallback(
    async (item) => {
      const itemId = item.metadata?.name || item.spec?.title || `item-${Date.now()}`;
      const workspaceName = `ws-${itemId.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}`;
      const repoRef = item.spec?.repoRef || item.spec?.repository || null;

      try {
        await fetch(`/api/orgs/${encodeURIComponent(org)}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiVersion: 'krate.a5c.ai/v1alpha1',
            kind: 'KrateWorkspace',
            metadata: {
              name: workspaceName,
              labels: { 'krate.a5c.ai/board-item': itemId },
            },
            spec: {
              boardItemRef: itemId,
              ...(repoRef ? { repositoryRef: repoRef } : {}),
              ...(projectName ? { projectRef: projectName } : {}),
            },
          }),
        });

        // Update the card locally with the workspace ref
        setIssues((prev) =>
          prev.map((i) => {
            const iId = i.metadata?.name || i.spec?.title;
            if (iId === itemId) {
              return {
                ...i,
                workspaceRef: workspaceName,
                workspacePvcStatus: 'Pending',
              };
            }
            return i;
          })
        );
      } catch {
        // Silently ignore — workspace creation is best-effort
      } finally {
        setPendingWorkspaceItem(null);
      }
    },
    [org, projectName]
  );

  const handleStartWorkFromButton = useCallback((item) => {
    setPendingWorkspaceItem(item);
  }, []);

  const getColumnColor = (colId) => WORKFLOW_COLUMNS.find((c) => c.id === colId)?.color || '#6b7280';

  const hasActiveFilter = filterAssignee || filterLabel || searchText;

  return (
    <div>
      {/* Keyframe animation for agent pulse indicator */}
      <style>{`
        @keyframes kanbanPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          placeholder="Search cards..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            padding: '0.375rem 0.625rem',
            fontSize: '0.8125rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            outline: 'none',
            minWidth: '10rem',
          }}
        />
        {allAssignees.length > 0 ? (
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            style={{
              padding: '0.375rem 0.625rem',
              fontSize: '0.8125rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: '#fff',
            }}
          >
            <option value="">All assignees</option>
            {allAssignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : null}
        {allLabels.length > 0 ? (
          <select
            value={filterLabel}
            onChange={(e) => setFilterLabel(e.target.value)}
            style={{
              padding: '0.375rem 0.625rem',
              fontSize: '0.8125rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: '#fff',
            }}
          >
            <option value="">All labels</option>
            {allLabels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        ) : null}
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          style={{
            padding: '0.375rem 0.625rem',
            fontSize: '0.8125rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            background: '#fff',
          }}
        >
          <option value="none">No grouping</option>
          <option value="assignee">Group by assignee</option>
          <option value="priority">Group by priority</option>
        </select>
        {hasActiveFilter ? (
          <button
            onClick={() => { setFilterAssignee(''); setFilterLabel(''); setSearchText(''); }}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.75rem',
              background: '#fee2e2',
              color: '#991b1b',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        ) : null}
        {hasActiveFilter ? (
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Showing {filteredIssues.length} of {issues.length} cards
          </span>
        ) : null}
      </div>

      {/* Board */}
      <div
        className="kanbanBoard"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', minHeight: '20rem' }}
      >
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            items={col.items}
            draggingId={draggingId}
            dragOverCol={dragOverCol}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onCardClick={handleCardClick}
            onAddCard={handleAddCard}
            onStartWork={handleStartWorkFromButton}
            groupBy={groupBy}
          />
        ))}
        {issues.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
            <p style={{ fontSize: '0.875rem' }}>Link issues to this project to populate the board</p>
          </div>
        ) : null}
      </div>

      {/* Card detail modal */}
      {selectedCard ? (
        <CardDetailModal
          item={selectedCard}
          columnColor={getColumnColor(selectedCard._column)}
          onClose={() => setSelectedCard(null)}
        />
      ) : null}

      {/* Start Work dialog */}
      {pendingWorkspaceItem ? (
        <StartWorkDialog
          item={pendingWorkspaceItem}
          org={org}
          onConfirm={handleStartWork}
          onCancel={() => setPendingWorkspaceItem(null)}
        />
      ) : null}
    </div>
  );
}
