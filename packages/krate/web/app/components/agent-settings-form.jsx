'use client';

import { useState } from 'react';

const ADAPTER_TYPES = ['subprocess', 'remote', 'programmatic'];
const TRANSPORT_TYPES = ['stdio', 'websocket', 'http', 'unix'];
const ADAPTER_CAPABILITIES = ['chat', 'tools', 'streaming', 'files', 'code-execution'];
const PROVIDER_TYPES = ['anthropic', 'openai', 'gemini', 'azure-openai', 'bedrock', 'vertex', 'custom'];
const AUTH_TYPES = ['token', 'oauth', 'none'];

const labelStyle = { display: 'block', fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.25rem' };
const inputStyle = { width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' };
const selectStyle = { ...inputStyle, background: '#fff' };
const fieldGroupStyle = { display: 'flex', flexDirection: 'column', gap: '1rem' };
const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' };
const buttonStyle = { padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 };
const primaryStyle = { ...buttonStyle, backgroundColor: '#2563eb', color: '#fff' };
const dangerStyle = { ...buttonStyle, backgroundColor: '#dc2626', color: '#fff' };
const secondaryStyle = { ...buttonStyle, backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
const disabledStyle = { ...primaryStyle, opacity: 0.5, cursor: 'not-allowed' };

function StatusMsg({ status, message }) {
  if (!message) return null;
  const color = status === 'success' ? '#16a34a' : '#dc2626';
  return <span style={{ fontSize: 13, color, fontWeight: 600 }}>{message}</span>;
}

// ─── Gateway Section ───────────────────────────────────────────────────────────

function GatewaySection({ org, gateway }) {
  const existing = gateway;
  const existingName = existing?.metadata?.name || 'default';
  const [url, setUrl] = useState(existing?.spec?.gatewayUrl || existing?.spec?.url || '');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus('saving');
    setMessage('');

    const resource = {
      apiVersion: 'krate.a5c.ai/v1alpha1',
      kind: 'AgentGatewayConfig',
      metadata: { name: existingName },
      spec: { organizationRef: org, gatewayUrl: url.trim() },
    };

    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus('error');
        setMessage(data.message || data.reason || 'Failed to save gateway config');
      } else {
        setStatus('success');
        setMessage('Gateway configuration saved.');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Network error');
    }
  }

  async function handleTestConnection() {
    if (!url.trim()) return;
    setStatus('testing');
    setMessage('Testing connection...');
    try {
      const res = await fetch(url.trim().replace(/\/$/, '') + '/healthz', { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setStatus('success');
        setMessage('Connection successful — gateway is reachable.');
      } else {
        setStatus('error');
        setMessage(`Gateway returned HTTP ${res.status}.`);
      }
    } catch {
      setStatus('error');
      setMessage('Could not reach gateway URL. Check the URL and network access.');
    }
  }

  const canSave = url.trim() && status !== 'saving';
  const gatewayStatusTone = existing
    ? (existing.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'good' : 'neutral')
    : 'neutral';
  const gatewayStatusLabel = existing
    ? (existing.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'Not Ready')
    : 'Not configured';
  const statusDotColor = gatewayStatusTone === 'good' ? '#22c55e' : '#9ca3af';

  return (
    <form onSubmit={handleSave}>
      <div className="card" style={{ borderLeft: `3px solid ${statusDotColor}` }}>
        <div className="cardTitle">
          <h2>Gateway connection</h2>
          <span className={`pill ${gatewayStatusTone === 'good' ? 'good' : 'neutral'}`}>{gatewayStatusLabel}</span>
        </div>
        <div style={fieldGroupStyle}>
          <div>
            <label style={labelStyle}>Gateway URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://agent-mux.example.com"
              style={inputStyle}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              The base URL of your Agent Mux gateway. Must be reachable from the Krate server.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '0.25rem' }}>
            <button type="submit" disabled={!canSave} style={!canSave ? disabledStyle : primaryStyle}>
              {status === 'saving' ? 'Saving...' : 'Save gateway config'}
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!url.trim() || status === 'testing'}
              style={!url.trim() ? { ...secondaryStyle, opacity: 0.5, cursor: 'not-allowed' } : secondaryStyle}
            >
              {status === 'testing' ? 'Testing...' : 'Test connection'}
            </button>
            <StatusMsg status={status} message={message} />
          </div>
        </div>
      </div>
    </form>
  );
}

// ─── Adapter Section ───────────────────────────────────────────────────────────

function AdapterRow({ org, adapter, onDeleted }) {
  const name = adapter.metadata?.name;
  const [delStatus, setDelStatus] = useState('idle');

  async function handleDelete() {
    if (!confirm(`Delete adapter "${name}"?`)) return;
    setDelStatus('deleting');
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/resources/AgentAdapter/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDeleted(name);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to delete adapter');
        setDelStatus('idle');
      }
    } catch (err) {
      alert(err.message || 'Network error');
      setDelStatus('idle');
    }
  }

  const phaseTone = (phase) => {
    if (!phase || phase === 'Pending') return '#9ca3af';
    if (phase === 'Active' || phase === 'Ready') return '#22c55e';
    if (phase === 'Failed') return '#ef4444';
    return '#9ca3af';
  };

  return (
    <div className="resourceRow" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <strong style={{ flex: '1 1 auto' }}>{name}</strong>
      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{adapter.spec?.adapterType || 'subprocess'}</span>
      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{adapter.spec?.transport || 'default'}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem' }}>
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: phaseTone(adapter.status?.phase) }} />
        {adapter.status?.phase || 'Pending'}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={delStatus === 'deleting'}
        style={{ ...secondaryStyle, padding: '4px 12px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
      >
        {delStatus === 'deleting' ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}

function AddAdapterForm({ org, onCreated }) {
  const [name, setName] = useState('');
  const [adapterType, setAdapterType] = useState('subprocess');
  const [transport, setTransport] = useState('stdio');
  const [capabilities, setCapabilities] = useState(['chat']);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  function toggleCapability(c) {
    setCapabilities(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus('saving');
    setMessage('');

    const resource = {
      apiVersion: 'krate.a5c.ai/v1alpha1',
      kind: 'AgentAdapter',
      metadata: { name: name.trim() },
      spec: {
        organizationRef: org,
        adapterType,
        transport,
        ...(capabilities.length ? { capabilities } : {}),
      },
    };

    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus('error');
        setMessage(data.message || data.reason || 'Failed to create adapter');
      } else {
        setStatus('success');
        setMessage(`Adapter "${name.trim()}" created.`);
        onCreated(data);
        setName('');
        setAdapterType('subprocess');
        setTransport('stdio');
        setCapabilities(['chat']);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Network error');
    }
  }

  const canSubmit = name.trim() && status !== 'saving';

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginTop: '0.75rem' }}>
        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 700 }}>New adapter</h4>
        <div style={fieldGroupStyle}>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="my-adapter" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Adapter type</label>
              <select value={adapterType} onChange={e => setAdapterType(e.target.value)} style={selectStyle}>
                {ADAPTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Transport</label>
            <select value={transport} onChange={e => setTransport(e.target.value)} style={selectStyle}>
              {TRANSPORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Capabilities</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {ADAPTER_CAPABILITIES.map(c => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={capabilities.includes(c)} onChange={() => toggleCapability(c)} />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button type="submit" disabled={!canSubmit} style={!canSubmit ? disabledStyle : primaryStyle}>
              {status === 'saving' ? 'Creating...' : 'Create adapter'}
            </button>
            <StatusMsg status={status} message={message} />
          </div>
        </div>
      </div>
    </form>
  );
}

function AdaptersSection({ org, initialAdapters }) {
  const [adapters, setAdapters] = useState(initialAdapters);
  const [showForm, setShowForm] = useState(false);

  function handleDeleted(name) {
    setAdapters(prev => prev.filter(a => a.metadata?.name !== name));
  }

  function handleCreated(newAdapter) {
    setAdapters(prev => [...prev, newAdapter]);
    setShowForm(false);
  }

  return (
    <div className="card">
      <div className="cardTitle">
        <h2>Adapters</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`pill ${adapters.length ? 'good' : 'neutral'}`}>{adapters.length} adapters</span>
          <button type="button" onClick={() => setShowForm(v => !v)} style={{ ...secondaryStyle, padding: '4px 14px', fontSize: 13 }}>
            {showForm ? 'Cancel' : '+ Add adapter'}
          </button>
        </div>
      </div>
      {adapters.length > 0 ? (
        <div className="resourceTable">
          {adapters.map(adapter => (
            <AdapterRow key={adapter.metadata?.name} org={org} adapter={adapter} onDeleted={handleDeleted} />
          ))}
        </div>
      ) : !showForm ? (
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          <p>No adapters configured. Click <strong>+ Add adapter</strong> to define how the workspace connects to agent runtimes.</p>
        </div>
      ) : null}
      {showForm && <AddAdapterForm org={org} onCreated={handleCreated} />}
    </div>
  );
}

// ─── Provider Section ──────────────────────────────────────────────────────────

function ProviderRow({ org, provider, onDeleted }) {
  const name = provider.metadata?.name;
  const [delStatus, setDelStatus] = useState('idle');

  async function handleDelete() {
    if (!confirm(`Delete provider "${name}"?`)) return;
    setDelStatus('deleting');
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/resources/AgentProviderConfig/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDeleted(name);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to delete provider');
        setDelStatus('idle');
      }
    } catch (err) {
      alert(err.message || 'Network error');
      setDelStatus('idle');
    }
  }

  const phaseTone = (phase) => {
    if (!phase || phase === 'Pending') return '#9ca3af';
    if (phase === 'Active' || phase === 'Ready' || phase === 'Configured') return '#22c55e';
    if (phase === 'Failed') return '#ef4444';
    return '#9ca3af';
  };

  return (
    <div className="resourceRow" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <strong style={{ flex: '1 1 auto' }}>{name}</strong>
      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{provider.spec?.provider || 'unknown'}</span>
      <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>
        {provider.spec?.authType || 'token'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem' }}>
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: phaseTone(provider.status?.phase) }} />
        {provider.status?.phase || 'Pending'}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={delStatus === 'deleting'}
        style={{ ...secondaryStyle, padding: '4px 12px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
      >
        {delStatus === 'deleting' ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}

function AddProviderForm({ org, onCreated }) {
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState('anthropic');
  const [authType, setAuthType] = useState('token');
  const [endpoint, setEndpoint] = useState('');
  const [credentialRef, setCredentialRef] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus('saving');
    setMessage('');

    const resource = {
      apiVersion: 'krate.a5c.ai/v1alpha1',
      kind: 'AgentProviderConfig',
      metadata: { name: name.trim() },
      spec: {
        organizationRef: org,
        provider: providerType,
        authType,
        ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
        ...(credentialRef.trim() ? { credentialRef: credentialRef.trim() } : {}),
      },
    };

    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus('error');
        setMessage(data.message || data.reason || 'Failed to create provider');
      } else {
        setStatus('success');
        setMessage(`Provider "${name.trim()}" created.`);
        onCreated(data);
        setName('');
        setProviderType('anthropic');
        setAuthType('token');
        setEndpoint('');
        setCredentialRef('');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Network error');
    }
  }

  const canSubmit = name.trim() && status !== 'saving';

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginTop: '0.75rem' }}>
        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 700 }}>New provider</h4>
        <div style={fieldGroupStyle}>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="my-provider" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Provider</label>
              <select value={providerType} onChange={e => setProviderType(e.target.value)} style={selectStyle}>
                {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Auth type</label>
              <select value={authType} onChange={e => setAuthType(e.target.value)} style={selectStyle}>
                {AUTH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Credential secret ref <small style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</small></label>
              <input type="text" value={credentialRef} onChange={e => setCredentialRef(e.target.value)} placeholder="my-api-key-secret" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Endpoint URL <small style={{ fontWeight: 400, color: '#6b7280' }}>(optional — override default API base)</small></label>
            <input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://api.anthropic.com/v1" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button type="submit" disabled={!canSubmit} style={!canSubmit ? disabledStyle : primaryStyle}>
              {status === 'saving' ? 'Creating...' : 'Create provider'}
            </button>
            <StatusMsg status={status} message={message} />
          </div>
        </div>
      </div>
    </form>
  );
}

function ProvidersSection({ org, initialProviders }) {
  const [providers, setProviders] = useState(initialProviders);
  const [showForm, setShowForm] = useState(false);

  function handleDeleted(name) {
    setProviders(prev => prev.filter(p => p.metadata?.name !== name));
  }

  function handleCreated(newProvider) {
    setProviders(prev => [...prev, newProvider]);
    setShowForm(false);
  }

  return (
    <div className="card">
      <div className="cardTitle">
        <h2>Providers</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`pill ${providers.length ? 'good' : 'neutral'}`}>{providers.length} providers</span>
          <button type="button" onClick={() => setShowForm(v => !v)} style={{ ...secondaryStyle, padding: '4px 14px', fontSize: 13 }}>
            {showForm ? 'Cancel' : '+ Add provider'}
          </button>
        </div>
      </div>
      {providers.length > 0 ? (
        <div className="resourceTable">
          {providers.map(provider => (
            <ProviderRow key={provider.metadata?.name} org={org} provider={provider} onDeleted={handleDeleted} />
          ))}
        </div>
      ) : !showForm ? (
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          <p>No providers configured. Click <strong>+ Add provider</strong> to define LLM access credentials and default models.</p>
        </div>
      ) : null}
      {showForm && <AddProviderForm org={org} onCreated={handleCreated} />}
    </div>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────────

export function AgentSettingsForm({ org, gateway, adapters, providers }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <GatewaySection org={org} gateway={gateway} />
      <AdaptersSection org={org} initialAdapters={adapters} />
      <ProvidersSection org={org} initialProviders={providers} />
    </div>
  );
}
