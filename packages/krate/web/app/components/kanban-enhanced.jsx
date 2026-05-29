'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { KanbanCard } from './kanban-card.jsx';
import { KanbanColumn } from './kanban-column.jsx';
import { KanbanFilters } from './kanban-filters.jsx';
import {
  WORKFLOW_COLUMNS,
  KANBAN_PULSE_STYLE,
  createDragHandlers,
  CardDetailModal,
  StartWorkDialog,
} from './kanban-enhanced-helpers.jsx';

// ---- Board orchestrator ----

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

  const { handleDragStart, handleDragEnd, handleDragOver, handleDragLeave } = useMemo(
    () => createDragHandlers({ dragItemRef, setDraggingId, setDragOverCol }),
    []
  );

  const allAssignees = useMemo(() => {
    const set = new Set();
    issues.forEach((item) => { if (item.spec?.assignee) set.add(item.spec?.assignee); });
    return Array.from(set).sort();
  }, [issues]);

  const allLabels = useMemo(() => {
    const set = new Set();
    issues.forEach((item) => { (item.spec?.labels || []).forEach((l) => set.add(l)); });
    return Array.from(set).sort();
  }, [issues]);

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

      // Persist column change to backend
      const issueName = item.metadata?.name;
      if (issueName && org) {
        fetch(`/api/orgs/${encodeURIComponent(org)}/resources/Issue/${encodeURIComponent(issueName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: { column: targetColId } }),
        }).catch((err) => console.warn('[krate]', err.message || err));
      }

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
        }).catch((err) => {
          console.warn('[krate] board item column update failed:', err.message ?? err);
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
      } catch (err) {
        console.warn('[krate] workspace creation failed:', err.message ?? err);
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

  return (
    <div>
      {/* Keyframe animation for agent pulse indicator */}
      <style>{KANBAN_PULSE_STYLE}</style>

      <KanbanFilters
        searchText={searchText}
        onSearchChange={setSearchText}
        filterAssignee={filterAssignee}
        onAssigneeChange={setFilterAssignee}
        filterLabel={filterLabel}
        onLabelChange={setFilterLabel}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        allAssignees={allAssignees}
        allLabels={allLabels}
        filteredCount={filteredIssues.length}
        totalCount={issues.length}
        onClearFilters={() => { setFilterAssignee(''); setFilterLabel(''); setSearchText(''); }}
      />

      {/* Board */}
      <div
        className="kanbanBoard"
        role="region"
        aria-label="Kanban board"
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
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
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
