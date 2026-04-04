import { useState, useEffect, useCallback } from 'react'
import { fetchKeywords, addKeyword, deleteKeyword, fetchAudit, fetchConfig, updateArchiveDays } from '../api'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'audit', label: 'Audit Log' },
]

const AUDIT_ACTIONS = [
  '', 'status_change', 'severity_change', 'note_added', 'ticket_raised',
  'source_added', 'source_deleted', 'source_disabled', 'manual_refresh',
  'keyword_added', 'keyword_removed',
]

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z')
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab({ user }) {
  const [days, setDays] = useState(null)
  const [inputDays, setInputDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchConfig()
      .then(cfg => {
        setDays(cfg.archive_after_days)
        setInputDays(String(cfg.archive_after_days))
      })
      .catch(() => setError('Failed to load config'))
  }, [])

  const handleSave = async () => {
    const val = parseInt(inputDays, 10)
    if (isNaN(val) || val < 10) {
      setError('Minimum value is 10 days')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const cfg = await updateArchiveDays(val, user)
      setDays(cfg.archive_after_days)
      setInputDays(String(cfg.archive_after_days))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '480px' }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>
        Auto-Archive Threshold
      </h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0', lineHeight: '1.5' }}>
        INGESTED articles older than this many days are automatically archived. Minimum 10 days.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <input
          type="number"
          min={10}
          value={inputDays}
          onChange={e => { setInputDays(e.target.value); setError(null); setSaved(false) }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={{
            width: '100px',
            padding: '0.4rem 0.6rem',
            border: `1px solid ${error ? '#E11D48' : 'var(--border)'}`,
            borderRadius: '6px',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>days</span>
        <button
          onClick={handleSave}
          disabled={saving || inputDays === String(days)}
          style={{
            padding: '0.4rem 1rem',
            background: saved ? '#059669' : 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: '500',
            cursor: saving || inputDays === String(days) ? 'default' : 'pointer',
            opacity: saving || inputDays === String(days) ? 0.6 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#E11D48' }}>{error}</p>
      )}

      {days !== null && (
        <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Current value: {days} days
        </p>
      )}

      <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>
          Daily Digest
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: '1.5' }}>
          Print-ready summary of all active items (To Address + Ticket Raised), grouped by severity.
        </p>
        <a
          href="/digest"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.4rem 1rem',
            background: 'var(--accent-subtle)',
            color: 'var(--accent-text)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: '500',
            textDecoration: 'none',
          }}
        >
          Open Digest ↗
        </a>
      </div>
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

  const handleDelete = async (id) => {
    try {
      await deleteKeyword(id, user)
      setConfirmDelete(null)
      await load()
    } catch {
      // silent
    }
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0', lineHeight: '1.5' }}>
        Terms are matched case-insensitively against article title and summary at ingest time.
        Matching articles are flagged in the feed.
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
            fontWeight: '500',
            cursor: adding || !newTerm.trim() ? 'default' : 'pointer',
            opacity: adding || !newTerm.trim() ? 0.6 : 1,
          }}
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addError && (
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: '#E11D48' }}>{addError}</p>
      )}

      {/* Keyword list */}
      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0' }}>Loading…</p>
      ) : keywords.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0', fontStyle: 'italic' }}>
          No keywords yet. Add one above.
        </p>
      ) : (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          marginTop: '0.75rem',
        }}>
          {keywords.map((kw, i) => (
            <div
              key={kw.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.875rem',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                background: 'var(--bg-card)',
              }}
            >
              <span style={{
                fontFamily: 'monospace',
                fontSize: '0.8375rem',
                color: 'var(--text-primary)',
                fontWeight: '500',
              }}>
                {kw.term}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  by {kw.created_by}
                </span>
                {confirmDelete === kw.id ? (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={() => handleDelete(kw.id)}
                      style={{
                        padding: '0.25rem 0.6rem',
                        background: '#E11D48',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{
                        padding: '0.25rem 0.6rem',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(kw.id)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                    title={`Remove "${kw.term}"`}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditTab({ onNavigateToArticle }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ user: '', action: '', since: '', until: '' })
  const [applied, setApplied] = useState({ user: '', action: '', since: '', until: '' })

  const load = useCallback(async (f) => {
    setLoading(true)
    try {
      const data = await fetchAudit({
        user: f.user || undefined,
        action: f.action || undefined,
        since: f.since ? f.since + 'T00:00:00' : undefined,
        until: f.until ? f.until + 'T23:59:59' : undefined,
        limit: 500,
      })
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(applied) }, [load, applied])

  const handleApply = () => setApplied({ ...filters })
  const handleClear = () => {
    const empty = { user: '', action: '', since: '', until: '' }
    setFilters(empty)
    setApplied(empty)
  }

  const inputStyle = {
    padding: '0.35rem 0.55rem',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: '0.8rem',
  }

  const hasFilters = applied.user || applied.action || applied.since || applied.until

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User</label>
          <input
            type="text"
            placeholder="analyst name"
            value={filters.user}
            onChange={e => setFilters(f => ({ ...f, user: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleApply()}
            style={{ ...inputStyle, width: '160px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</label>
          <select
            value={filters.action}
            onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
            style={{ ...inputStyle, width: '180px' }}
          >
            {AUDIT_ACTIONS.map(a => (
              <option key={a} value={a}>{a || 'All actions'}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</label>
          <input
            type="date"
            value={filters.since}
            onChange={e => setFilters(f => ({ ...f, since: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
          <input
            type="date"
            value={filters.until}
            onChange={e => setFilters(f => ({ ...f, until: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <button
          onClick={handleApply}
          style={{
            padding: '0.35rem 0.875rem',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
        {hasFilters && (
          <button
            onClick={handleClear}
            style={{
              padding: '0.35rem 0.75rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
        {!loading && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto', alignSelf: 'center' }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0' }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0', fontStyle: 'italic' }}>
          No audit entries match the current filters.
        </p>
      ) : (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-sidebar)' }}>
                {['Timestamp', 'User', 'Action', 'Target', 'Detail'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.875rem',
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr
                  key={e.id}
                  style={{
                    borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                    background: 'var(--bg-card)',
                  }}
                >
                  <td style={{ padding: '0.5rem 0.875rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {formatTimestamp(e.timestamp)}
                  </td>
                  <td style={{ padding: '0.5rem 0.875rem', whiteSpace: 'nowrap', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {e.user}
                  </td>
                  <td style={{ padding: '0.5rem 0.875rem', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-hover)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}>
                      {e.action}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.875rem', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {e.target_type === 'article' && e.target_id ? (
                      <button
                        onClick={() => onNavigateToArticle(e.target_id)}
                        title="Go to article in feed"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--accent)',
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted',
                          textUnderlineOffset: '2px',
                        }}
                      >
                        article#{e.target_id}
                      </button>
                    ) : e.target_type && e.target_id ? (
                      <span style={{ color: 'var(--text-muted)' }}>{e.target_type}#{e.target_id}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem 0.875rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {e.detail}
                    {e.article_title && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                        | {e.article_title}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main SettingsPage ─────────────────────────────────────────────────────────

export default function SettingsPage({ user, onNavigateToArticle }) {
  const [tab, setTab] = useState('general')

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px' }}>
      <h1 style={{
        fontSize: '1.125rem',
        fontWeight: '600',
        color: 'var(--text-primary)',
        margin: '0 0 1.5rem 0',
      }}>
        Settings
      </h1>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: '1px solid var(--border)',
        marginBottom: '1.75rem',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.6rem 1.25rem',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent-text)' : 'var(--text-secondary)',
              fontWeight: tab === t.key ? '600' : '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'general' && <GeneralTab user={user} />}
      {tab === 'keywords' && <KeywordsTab user={user} />}
      {tab === 'audit' && <AuditTab onNavigateToArticle={onNavigateToArticle} />}
    </div>
  )
}
