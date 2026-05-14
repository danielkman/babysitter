'use client';

import { useState } from 'react';

/**
 * SecretManager — list secrets with grants, create new secrets, delete secrets.
 *
 * @param {{ org: string, secrets?: object[], grants?: object[] }} props
 */
export function SecretManager({ org = 'default', secrets = [], grants = [] }) {
  const [secretList, setSecretList] = useState(secrets);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Key-value pairs for the create form
  const [newName, setNewName] = useState('');
  const [kvPairs, setKvPairs] = useState([{ key: '', value: '' }]);
  const [grantedTo, setGrantedTo] = useState('');

  function addKvPair() {
    setKvPairs((prev) => [...prev, { key: '', value: '' }]);
  }

  function removeKvPair(index) {
    setKvPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateKvPair(index, field, value) {
    setKvPairs((prev) => prev.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair)));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError('Secret name is required');
      return;
    }
    const data = {};
    for (const pair of kvPairs) {
      if (pair.key.trim()) data[pair.key.trim()] = pair.value;
    }
    setCreateLoading(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/secrets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          data,
          grantedTo: grantedTo.trim() || undefined,
          permissions: ['read']
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.message || err.error || 'Create failed');
      }
      const created = await res.json();
      const secretName = created.resource?.spec?.secretName || newName.trim();
      setSecretList((prev) => [
        ...prev,
        { name: secretName, type: 'Opaque', createdAt: new Date().toISOString(), grants: [] }
      ]);
      setNewName('');
      setKvPairs([{ key: '', value: '' }]);
      setGrantedTo('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDelete(secretName) {
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/secrets/${encodeURIComponent(secretName)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.message || err.error || 'Delete failed');
      }
      setSecretList((prev) => prev.filter((s) => s.name !== secretName));
    } catch (err) {
      // Surface error to user without crashing
      setCreateError(`Delete failed: ${err.message}`);
    } finally {
      setPendingDelete(null);
    }
  }

  // Build a map of secretName → agents that have grants
  const grantsBySecret = {};
  for (const grant of grants) {
    const sName = grant.spec?.secretName || grant.spec?.secretRef;
    if (sName) {
      if (!grantsBySecret[sName]) grantsBySecret[sName] = [];
      grantsBySecret[sName].push(grant.spec?.grantedTo || grant.spec?.subject || 'unknown');
    }
  }

  return (
    <div className="secretManager">
      <div className="cardTitle">
        <h2>Secrets</h2>
        <button
          className="button"
          onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); }}
          aria-expanded={showCreateForm}
        >
          {showCreateForm ? 'Cancel' : 'Create Secret'}
        </button>
      </div>

      {createError && (
        <div className="errorBanner" role="alert">{createError}</div>
      )}

      {showCreateForm && (
        <form className="secretCreateForm card" onSubmit={handleCreate} aria-label="Create new secret">
          <h3>New Secret</h3>
          <div className="formRow">
            <label htmlFor="secret-name">Name</label>
            <input
              id="secret-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="my-api-key"
              required
              autoComplete="off"
            />
          </div>

          <fieldset>
            <legend>Key-value pairs</legend>
            {kvPairs.map((pair, i) => (
              <div className="kvRow" key={i}>
                <input
                  type="text"
                  placeholder="KEY"
                  value={pair.key}
                  onChange={(e) => updateKvPair(i, 'key', e.target.value)}
                  aria-label={`Key ${i + 1}`}
                />
                <input
                  type="password"
                  placeholder="value"
                  value={pair.value}
                  onChange={(e) => updateKvPair(i, 'value', e.target.value)}
                  aria-label={`Value ${i + 1}`}
                />
                {kvPairs.length > 1 && (
                  <button type="button" className="buttonSmall danger" onClick={() => removeKvPair(i)} aria-label={`Remove row ${i + 1}`}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="buttonSmall" onClick={addKvPair}>
              + Add key
            </button>
          </fieldset>

          <div className="formRow">
            <label htmlFor="granted-to">Grant access to agent (optional)</label>
            <input
              id="granted-to"
              type="text"
              value={grantedTo}
              onChange={(e) => setGrantedTo(e.target.value)}
              placeholder="agent-stack-name"
            />
          </div>

          <div className="formActions">
            <button type="submit" className="button" disabled={createLoading}>
              {createLoading ? 'Creating…' : 'Create Secret'}
            </button>
          </div>
        </form>
      )}

      {secretList.length === 0 ? (
        <p className="emptyText">No secrets yet. Create one above to grant agents access to credentials.</p>
      ) : (
        <ul className="resourceList secretList" aria-label="Secrets">
          {secretList.map((secret) => {
            const agentGrants = grantsBySecret[secret.name] || secret.grants || [];
            const isDeletePending = pendingDelete === secret.name;
            return (
              <li key={secret.name} className="secretRow">
                <div className="secretInfo">
                  <strong className="secretName">{secret.name}</strong>
                  <span className="secretType pill neutral">{secret.type || 'Opaque'}</span>
                  {secret.createdAt && (
                    <small className="secretDate">Created {new Date(secret.createdAt).toLocaleDateString()}</small>
                  )}
                </div>
                {agentGrants.length > 0 && (
                  <div className="secretGrants" aria-label="Agents with access">
                    <span className="grantsLabel">Granted to:</span>
                    {agentGrants.map((agent) => (
                      <span key={agent} className="pill good agentGrant">{agent}</span>
                    ))}
                  </div>
                )}
                <div className="secretActions">
                  {isDeletePending ? (
                    <>
                      <span className="confirmText">Delete &ldquo;{secret.name}&rdquo;?</span>
                      <button className="buttonSmall danger" onClick={() => handleDelete(secret.name)}>Confirm</button>
                      <button className="buttonSmall" onClick={() => setPendingDelete(null)}>Cancel</button>
                    </>
                  ) : (
                    <button
                      className="buttonSmall danger"
                      onClick={() => setPendingDelete(secret.name)}
                      aria-label={`Delete secret ${secret.name}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
