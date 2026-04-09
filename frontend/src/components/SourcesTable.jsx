import { useState, useMemo, useEffect, useCallback, Fragment } from 'react'
import SourceHealthIcon from './SourceHealthIcon'
import AddSourceFlow from './AddSourceFlow'
import {
  fetchSources, disableSource, enableSource, archiveSource, unarchiveSource, testSource,
  fetchKeywords, addKeyword, toggleKeyword, deleteKeyword,
} from '../api'

function parseUTC(dateStr) {
  if (!dateStr) return null
  const s = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z'
  return new Date(s)
}

function relativeTime(dateStr) {
  if (!dateStr) return '—'
  const d = parseUTC(dateStr)
  if (!d || isNaN(d)) return '—'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return 'just now'
  if (diff < 60000) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = parseUTC(dateStr)
  if (!d || isNaN(d)) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function TierBadge({ tier }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.1rem 0.4rem',
      borderRadius: 4,
      fontSize: '0.7rem',
      fontWeight: 600,
      background: 'var(--bg-hover)',
      color: 'var(--text-secondary)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      T{tier}
    </span>
  )
}

function StatusBadge({ isActive, isArchived, consecutiveFailures }) {
  let label, color, bg
  if (isArchived) {
    label = 'Archived'; color = '#6B7280'; bg = 'var(--bg-hover)'
  } else if (consecutiveFailures >= 3) {
    label = 'Failing'; color = '#E11D48'; bg = '#FFF1F2'
  } else if (!isActive) {
    label = 'Disabled'; color = '#D97706'; bg = '#FFFBEB'
  } else if (consecutiveFailures >= 1) {
    label = 'Degraded'; color = '#D97706'; bg = '#FFFBEB'
  } else {
    label = 'Active'; color = '#059669'; bg = '#F0FDF4'
  }
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.1rem 0.45rem',
      borderRadius: 4,
      fontSize: '0.7rem',
      fontWeight: 500,
      color,
      background: bg,
    }}>
      {label}
    </span>
  )
}

function PreviewPanel({ data, error, onClose }) {
  if (error) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-page)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#E11D48', fontWeight: 500 }}>Fetch failed</span>
          <button onClick={onClose} style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Close</button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{error}</p>
      </div>
    )
  }
  if (!data) return null
  return (
    <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-page)', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {data.total_found} items found — {data.entries.length} sample{data.entries.length !== 1 ? 's' : ''}
        </span>
        <button onClick={onClose} style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Close</button>
      </div>
      {data.entries.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Feed returned no items.</p>
      )}
      {data.entries.map((entry, i) => (
        <div key={i} style={{
          marginBottom: i < data.entries.length - 1 ? '0.5rem' : 0,
          paddingBottom: i < data.entries.length - 1 ? '0.5rem' : 0,
          borderBottom: i < data.entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <a href={entry.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--accent)' }}>
            {entry.title}
          </a>
          {entry.summary && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>
              {entry.summary}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Keywords Tab ──────────────────────────────────────────────────────────────

function KeywordsTab({ user }) {
  const [keywords, setKeywords] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTerm, setNewTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(async () => {
    try {
      const kws = await fetchKeywords()
      setKeywords(kws)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const term = newTerm.trim()
    if (!term) return
    setAdding(true)
    setAddError(null)
    try {
      await addKeyword(term, user)
      setNewTerm('')
      await load()
    } catch (e) {
      const msg = e.message || ''
      setAddError(msg.includes('409') ? `"${term}" already exists` : 'Failed to add keyword')
    } finally {
      setAdding(false)
    }
  }

  const handleToggle = async (kw) => {
    try {
      await toggleKeyword(kw.id, user)
      await load()
    } catch {
      // silent
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteKeyword(id, user)
      setConfirmDelete(null)
      await load()
    } catch {
      // silent
    }
  }

  const active = keywords.filter(k => k.is_active)
  const disabled = keywords.filter(k => !k.is_active)

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0', lineHeight: '1.5' }}>
        Matched case-insensitively against article title and summary at ingest. Disabled keywords are retained but not matched.
      </p>

      {/* Add form */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="e.g. APT28, ransomware, CVE-2026"
          value={newTerm}
          onChange={e => { setNewTerm(e.target.value); setAddError(null) }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{
            flex: 1,
            padding: '0.4rem 0.6rem',
            border: `1px solid ${addError ? '#E11D48' : 'var(--border)'}`,
            borderRadius: '6px',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTerm.trim()}
          style={{
            padding: '0.4rem 1rem',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: adding || !newTerm.trim() ? 'default' : 'pointer',
            opacity: adding || !newTerm.trim() ? 0.6 : 1,
          }}
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addError && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#E11D48' }}>{addError}</p>
      )}

      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0' }}>Loading…</p>
      ) : keywords.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0', fontStyle: 'italic' }}>
          No keywords yet.
        </p>
      ) : (
        <>
          <KeywordList
            keywords={active}
            heading={`Active (${active.length})`}
            user={user}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
          {disabled.length > 0 && (
            <KeywordList
              keywords={disabled}
              heading={`Disabled (${disabled.length})`}
              user={user}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              onToggle={handleToggle}
              onDelete={handleDelete}
              muted
            />
          )}
        </>
      )}
    </div>
  )
}

function KeywordList({ keywords, heading, confirmDelete, setConfirmDelete, onToggle, onDelete, muted }) {
  if (keywords.length === 0) return null
  return (
    <div style={{ marginBottom: '1rem' }}>
      <p style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--text-muted)',
        margin: '0 0 0.4rem',
      }}>
        {heading}
      </p>
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {keywords.map((kw, i) => (
          <div key={kw.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.6rem 0.875rem',
            borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
            background: 'var(--bg-card)',
            opacity: muted ? 0.6 : 1,
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '0.8375rem',
              color: 'var(--text-primary)',
              fontWeight: 500,
              textDecoration: muted ? 'line-through' : 'none',
            }}>
              {kw.term}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>by {kw.created_by}</span>
              <button
                onClick={() => onToggle(kw)}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: muted ? '#059669' : '#D97706',
                }}
                title={muted ? 'Enable this keyword' : 'Disable this keyword'}
              >
                {muted ? 'Enable' : 'Disable'}
              </button>
              {confirmDelete === kw.id ? (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => onDelete(kw.id)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: '#E11D48',
                      color: 'white',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(kw.id)}
                  style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sources Tab ───────────────────────────────────────────────────────────────

const thStyle = {
  padding: '0.5rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  background: 'var(--bg-sidebar)',
}

const tdStyle = {
  padding: '0.625rem 0.75rem',
  fontSize: '0.8125rem',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle',
}

function SourcesTab({ user, onSourcesChange }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'active' | 'disabled' | 'failing' | 'archived'
  const [showAdd, setShowAdd] = useState(false)

  const [confirmingId, setConfirmingId] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [testingId, setTestingId] = useState(null)
  const [testResults, setTestResults] = useState({})

  const needsArchived = filter === 'archived'

  const load = useCallback(async (showArchived) => {
    try {
      const data = await fetchSources({ showArchived })
      setSources(data)
    } catch (err) {
      console.error('Failed to load sources:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(needsArchived)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  function handleFilterChange(key) {
    setFilter(key)
    cancelConfirm()
  }

  const filtered = useMemo(() => {
    if (filter === 'archived') return sources.filter(s => s.is_archived)
    const base = sources.filter(s => !s.is_archived)
    if (filter === 'active') return base.filter(s => s.is_active && s.consecutive_failures < 3)
    if (filter === 'disabled') return base.filter(s => !s.is_active)
    if (filter === 'failing') return base.filter(s => s.consecutive_failures >= 3)
    return base
  }, [sources, filter])

  const nonArchivedCount = sources.filter(s => !s.is_archived).length
  const archivedCount = sources.filter(s => s.is_archived).length

  async function handleTest(source) {
    setTestingId(source.id)
    setTestResults(prev => ({ ...prev, [source.id]: null }))
    try {
      const data = await testSource(source.id)
      setTestResults(prev => ({ ...prev, [source.id]: { data, error: null } }))
    } catch (err) {
      const msg = err.message.replace(/^API \d+: /, '')
      setTestResults(prev => ({ ...prev, [source.id]: { data: null, error: msg } }))
    } finally {
      setTestingId(null)
    }
  }

  function handleClosePreview(id) {
    setTestResults(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function startConfirm(id, action) {
    setConfirmingId(id)
    setConfirmAction(action)
  }

  function cancelConfirm() {
    setConfirmingId(null)
    setConfirmAction(null)
  }

  async function runAction(fn, source) {
    setActionInProgress(true)
    try {
      await fn(source.id, user)
      cancelConfirm()
      await load(filter === 'archived')
      onSourcesChange()
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setActionInProgress(false)
    }
  }

  async function handleEnable(source) {
    try {
      await enableSource(source.id, user)
      await load(filter === 'archived')
      onSourcesChange()
    } catch (err) {
      console.error('Enable failed:', err)
    }
  }

  async function handleUnarchive(source) {
    try {
      await unarchiveSource(source.id, user)
      await load(true) // reload archived view
      onSourcesChange()
    } catch (err) {
      console.error('Unarchive failed:', err)
    }
  }

  function handleAdded() {
    setShowAdd(false)
    load(false)
    onSourcesChange()
  }

  const filterBtnStyle = (active) => ({
    padding: '0.3rem 0.65rem',
    borderRadius: 5,
    fontSize: '0.75rem',
    fontWeight: active ? 500 : 400,
    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-subtle)' : 'transparent',
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    cursor: 'pointer',
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          {filter === 'archived'
            ? `${archivedCount} archived source${archivedCount !== 1 ? 's' : ''}`
            : `${nonArchivedCount} source${nonArchivedCount !== 1 ? 's' : ''} configured`}
        </p>
        {filter !== 'archived' && (
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{
              padding: '0.4rem 0.875rem',
              background: showAdd ? 'var(--bg-hover)' : 'var(--accent)',
              color: showAdd ? 'var(--text-secondary)' : 'white',
              border: showAdd ? '1px solid var(--border)' : 'none',
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showAdd ? 'Cancel' : '+ Add Source'}
          </button>
        )}
      </div>

      {showAdd && filter !== 'archived' && (
        <AddSourceFlow analyst={user} onAdded={handleAdded} onCancel={() => setShowAdd(false)} />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'disabled', label: 'Disabled' },
          { key: 'failing', label: 'Failing' },
          { key: 'archived', label: archivedCount > 0 ? `Archived (${archivedCount})` : 'Archived' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => handleFilterChange(key)} style={filterBtnStyle(filter === key)}>
            {label}
          </button>
        ))}
        {filter !== 'all' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 28, paddingLeft: '0.875rem' }}></th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>TIs</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Entries</th>
                <th style={thStyle}>Last Fetched</th>
                <th style={thStyle}>Last Success</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Failures</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right', paddingRight: '0.875rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    {filter === 'archived' ? 'No archived sources.' : 'No sources match this filter.'}
                  </td>
                </tr>
              ) : filtered.map(source => {
                const isConfirming = confirmingId === source.id
                const testResult = testResults[source.id]
                const isTesting = testingId === source.id

                return (
                  <Fragment key={source.id}>
                    <tr style={{
                      background: isConfirming ? 'var(--bg-hover)' : 'var(--bg-card)',
                      opacity: (source.is_archived || (!source.is_active && !isConfirming)) ? 0.65 : 1,
                    }}>
                      <td style={{ ...tdStyle, paddingLeft: '0.875rem', paddingRight: 0 }}>
                        <SourceHealthIcon
                          consecutiveFailures={source.consecutive_failures}
                          isActive={source.is_active}
                        />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{source.name}</div>
                        <div title={source.url} style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          <a href={source.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                            {source.url}
                          </a>
                        </div>
                        <TierBadge tier={source.tier} />
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {source.feed_type.toUpperCase()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {source.ti_count ?? 0}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {source.last_entry_count ?? '—'}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                        title={formatDateTime(source.last_fetched_at)}>
                        {relativeTime(source.last_fetched_at)}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                        title={formatDateTime(source.last_success_at)}>
                        {relativeTime(source.last_success_at)}
                      </td>
                      <td style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: source.consecutive_failures >= 3 ? '#E11D48'
                          : source.consecutive_failures >= 1 ? '#D97706'
                          : 'var(--text-muted)',
                      }}>
                        {source.consecutive_failures}
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge
                          isActive={source.is_active}
                          isArchived={source.is_archived}
                          consecutiveFailures={source.consecutive_failures}
                        />
                      </td>
                      <td style={{ ...tdStyle, paddingRight: '0.875rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {source.is_archived ? (
                          <button
                            onClick={() => handleUnarchive(source)}
                            style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500 }}
                          >
                            Restore
                          </button>
                        ) : !isConfirming ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => testResult ? handleClosePreview(source.id) : handleTest(source)}
                              disabled={isTesting}
                              style={{
                                fontSize: '0.75rem',
                                color: testResult ? 'var(--text-muted)' : 'var(--accent)',
                                fontWeight: 500,
                                opacity: isTesting ? 0.6 : 1,
                              }}
                            >
                              {isTesting ? 'Testing…' : testResult ? 'Hide' : 'Test'}
                            </button>
                            {source.is_active ? (
                              <button
                                onClick={() => startConfirm(source.id, 'disable')}
                                style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 500 }}
                              >
                                Disable
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEnable(source)}
                                style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 500 }}
                              >
                                Enable
                              </button>
                            )}
                            <button
                              onClick={() => startConfirm(source.id, 'archive')}
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}
                            >
                              Archive
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => confirmAction === 'disable'
                                ? runAction(disableSource, source)
                                : runAction(archiveSource, source)}
                              disabled={actionInProgress}
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: 'white',
                                background: confirmAction === 'archive' ? '#6B7280' : '#D97706',
                                padding: '0.2rem 0.55rem',
                                borderRadius: 4,
                                opacity: actionInProgress ? 0.6 : 1,
                              }}
                            >
                              {actionInProgress ? '…' : 'Confirm'}
                            </button>
                            <button onClick={cancelConfirm} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {isConfirming && (
                      <tr style={{ background: 'var(--bg-hover)' }}>
                        <td colSpan={10} style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                            {confirmAction === 'disable'
                              ? <>Pause ingestion from <strong>{source.name}</strong>? You can re-enable it at any time.</>
                              : <>Archive <strong>{source.name}</strong>? It will be hidden from this list and ingestion will stop. You can restore it later.</>}
                          </p>
                        </td>
                      </tr>
                    )}

                    {testResult && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                          <PreviewPanel
                            data={testResult.data}
                            error={testResult.error}
                            onClose={() => handleClosePreview(source.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SourcesTable({ user, onSourcesChange }) {
  const [tab, setTab] = useState('sources') // 'sources' | 'keywords'

  const tabBtnStyle = (active) => ({
    padding: '0.45rem 0.875rem',
    borderBottom: '2px solid',
    borderColor: active ? 'var(--accent)' : 'transparent',
    fontSize: '0.875rem',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    background: 'transparent',
    cursor: 'pointer',
    marginBottom: '-1px',
  })

  return (
    <div style={{ padding: '1.5rem 1.75rem', maxWidth: 1200 }}>
      {/* Page header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Sources
        </h1>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        marginBottom: '1.5rem',
      }}>
        <button onClick={() => setTab('sources')} style={tabBtnStyle(tab === 'sources')}>Sources</button>
        <button onClick={() => setTab('keywords')} style={tabBtnStyle(tab === 'keywords')}>Keywords</button>
      </div>

      {tab === 'sources' && (
        <SourcesTab user={user} onSourcesChange={onSourcesChange} />
      )}
      {tab === 'keywords' && (
        <KeywordsTab user={user} />
      )}
    </div>
  )
}
