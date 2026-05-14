'use client';
import { useState } from 'react';

export function StackActions({ org, stackName }) {
  const [status, setStatus] = useState('idle');

  async function handleDispatch() {
    setStatus('dispatching');
    const res = await fetch(`/api/orgs/${org}/agents/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackRef: stackName }),
    });
    setStatus(res.ok ? 'dispatched' : 'error');
    setTimeout(() => setStatus('idle'), 2000);
  }

  async function handleDelete() {
    if (!confirm(`Delete stack "${stackName}"?`)) return;
    setStatus('deleting');
    await fetch(`/api/orgs/${org}/resources/AgentStack/${stackName}`, { method: 'DELETE' });
    window.location.reload();
  }

  return (
    <span style={{ display: 'flex', gap: 8 }}>
      <button onClick={handleDispatch} disabled={status !== 'idle'}>
        {status === 'dispatching' ? 'Dispatching...' : status === 'dispatched' ? 'Dispatched!' : status === 'error' ? 'Error' : 'Dispatch'}
      </button>
      <button onClick={handleDelete} style={{ color: '#ef4444' }} disabled={status === 'deleting'}>
        {status === 'deleting' ? 'Deleting...' : 'Delete'}
      </button>
    </span>
  );
}
