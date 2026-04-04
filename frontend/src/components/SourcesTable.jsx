import { useState, useMemo, Fragment } from 'react'
import SourceHealthIcon from './SourceHealthIcon'
import AddSourceFlow from './AddSourceFlow'
import { deleteSource, testSource } from '../api'

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
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.4rem',
        borderRadius: 4,
        fontSize: '0.7rem',
        fontWeight: 600,
        background: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      T{tier}
    </span>
  )
}

function StatusBadge({ isActive, consecutiveFailures }) {
  let label, color, bg
  if (!isActive || consecutiveFailures >= 3) {
    label = 'Disabled'; color = '#E11D48'; bg = '#FFF1F2'
  } else if (consecutiveFailures >= 1) {
    label = 'Degraded'; color = '#D97706'; bg = '#FFFBEB'
  } else {
    label = 'Active'; color = '#059669'; bg = '#F0FDF4'
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.45rem',
        borderRadius: 4,
        fontSize: '0.7rem',
        fontWeight: 500,
        color,
        background: bg,
      }}
    >
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
        <div
          key={i}
          style={{
            marginBottom: i < data.entries.length - 1 ? '0.5rem' : 0,
            paddingBottom: i < data.entries.length - 1 ? '0.5rem' : 0,
            borderBottom: i < data.entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--accent)' }}
          >
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

export default function SourcesTable({ sources, user, onSourcesChange }) {
  const [filter, setFilter] = useState('all') // 'all' | 'active' | 'inactive' | 'failing'
  const [showAdd, setShowAdd] = useState(false)
  const [deletingId, setDeletingId] = useState(null) // id pending confirmation
  const [deletingInProgress, setDeletingInProgress] = useState(false)
  const [testingId, setTestingId] = useState(null) // id currently being tested
  const [testResults, setTestResults] = useState({}) // id -> { data, error }

  const filtered = useMemo(() => {
    return sources.filter(s => {
      if (filter === 'active') return s.is_active && s.consecutive_failures < 3
      if (filter === 'inactive') return !s.is_active
      if (filter === 'failing') return s.consecutive_failures >= 3
      return true
    })
  }, [sources, filter])

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
    setTestResults(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function handleDelete(source) {
    setDeletingInProgress(true)
    try {
      await deleteSource(source.id, user)
      setDeletingId(null)
      onSourcesChange()
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeletingInProgress(false)
    }
  }

  function handleAdded() {
    setShowAdd(false)
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
    <div style={{ padding: '1.5rem 1.75rem', maxWidth: 1200 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Sources
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
            {sources.length} source{sources.length !== 1 ? 's' : ''} configured
          </p>
        </div>
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
      </div>

      {/* Add source flow */}
      {showAdd && (
        <AddSourceFlow
          analyst={user}
          onAdded={handleAdded}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Inactive' },
          { key: 'failing', label: 'Failing' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={filterBtnStyle(filter === key)}
          >
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
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No sources match this filter.
                  </td>
                </tr>
              )}
              {filtered.map(source => {
                const isDeleting = deletingId === source.id
                const testResult = testResults[source.id]
                const isTesting = testingId === source.id

                return (
                  <Fragment key={source.id}>
                    <tr
                      style={{
                        background: isDeleting ? 'var(--bg-hover)' : 'var(--bg-card)',
                        opacity: !source.is_active && deletingId !== source.id ? 0.65 : 1,
                      }}
                    >
                      {/* Health dot */}
                      <td style={{ ...tdStyle, paddingLeft: '0.875rem', paddingRight: 0 }}>
                        <SourceHealthIcon
                          consecutiveFailures={source.consecutive_failures}
                          isActive={source.is_active}
                        />
                      </td>

                      {/* Name + URL */}
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{source.name}</div>
                        <div
                          title={source.url}
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                            maxWidth: 260,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                          >
                            {source.url}
                          </a>
                        </div>
                        <TierBadge tier={source.tier} />
                      </td>

                      {/* Feed type */}
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {source.feed_type.toUpperCase()}
                      </td>

                      {/* TI count */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {source.ti_count ?? 0}
                      </td>

                      {/* Last entry count */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {source.last_entry_count ?? '—'}
                      </td>

                      {/* Last fetched */}
                      <td
                        style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                        title={formatDateTime(source.last_fetched_at)}
                      >
                        {relativeTime(source.last_fetched_at)}
                      </td>

                      {/* Last success */}
                      <td
                        style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                        title={formatDateTime(source.last_success_at)}
                      >
                        {relativeTime(source.last_success_at)}
                      </td>

                      {/* Consecutive failures */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: source.consecutive_failures >= 3 ? '#E11D48'
                            : source.consecutive_failures >= 1 ? '#D97706'
                            : 'var(--text-muted)',
                        }}
                      >
                        {source.consecutive_failures}
                      </td>

                      {/* Status badge */}
                      <td style={tdStyle}>
                        <StatusBadge
                          isActive={source.is_active}
                          consecutiveFailures={source.consecutive_failures}
                        />
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, paddingRight: '0.875rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!isDeleting ? (
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
                              title="Re-fetch feed and show sample items"
                            >
                              {isTesting ? 'Testing…' : testResult ? 'Hide' : 'Test'}
                            </button>
                            {source.is_active && (
                              <button
                                onClick={() => setDeletingId(source.id)}
                                style={{ fontSize: '0.75rem', color: '#E11D48', fontWeight: 500 }}
                                title="Soft-delete this source"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        ) : (
                          /* Delete confirmation row */
                          <div className="flex items-center justify-end gap-2">
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Stop ingestion?
                            </span>
                            <button
                              onClick={() => handleDelete(source)}
                              disabled={deletingInProgress}
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: 'white',
                                background: '#E11D48',
                                padding: '0.2rem 0.55rem',
                                borderRadius: 4,
                                opacity: deletingInProgress ? 0.6 : 1,
                              }}
                            >
                              {deletingInProgress ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Inline confirmation dialog row */}
                    {isDeleting && (
                      <tr style={{ background: 'var(--bg-hover)' }}>
                        <td colSpan={10} style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                            This will stop future ingestion from <strong>{source.name}</strong>. Historical TIs are preserved.
                          </p>
                        </td>
                      </tr>
                    )}

                    {/* Inline test preview row */}
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
