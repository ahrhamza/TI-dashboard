import { useState } from 'react'
import SeverityBadge from './SeverityBadge'
import LifecyclePill from './LifecyclePill'
import {
  patchArticleStatus,
  patchArticleSeverity,
  patchArticleNotes,
  fetchArticleHistory,
} from '../api'

const SEV_BORDER = {
  unset:    '#CBD5E1',
  low:      '#64748B',
  medium:   '#D97706',
  high:     '#EA580C',
  critical: '#E11D48',
}

const HELPDESK_URL = 'https://ithelpdesk.albatha.com/WorkOrder.do?woMode=viewWO&woID='

// Backend returns naive UTC strings (no timezone suffix).
// Appending 'Z' tells JS to parse as UTC rather than local time.
function parseUTC(dateStr) {
  if (!dateStr) return null
  const s = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z'
  return new Date(s)
}

function relativeTime(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - parseUTC(dateStr).getTime()
  if (diff < 60000) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return parseUTC(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// If ticketId is purely numeric (optionally prefixed with #), return the work order URL.
function ticketUrl(ticketId) {
  if (!ticketId) return null
  const digits = ticketId.replace(/^#/, '').trim()
  if (/^\d+$/.test(digits)) return HELPDESK_URL + digits
  return null
}

// Render a ticket ID — hyperlink if numeric, plain text otherwise.
function TicketLink({ ticketId, className, style }) {
  const url = ticketUrl(ticketId)
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={{ ...style, textDecoration: 'underline' }}
      >
        {ticketId}
      </a>
    )
  }
  return <span className={className} style={style}>{ticketId}</span>
}

// Derive which primary forward-action button to show based on current status.
// "Mark Irrelevant" is always available for non-irrelevant items (handled separately).
function getForwardAction(status) {
  switch (status) {
    case 'INGESTED':      return { label: 'To Address',   next: 'TO_ADDRESS'    }
    case 'TO_ADDRESS':    return { label: 'Raise Ticket', next: 'TICKET_RAISED' }
    case 'TICKET_RAISED': return { label: 'Resolve',      next: 'RESOLVED'      }
    case 'IRRELEVANT':    return { label: 'To Address',   next: 'TO_ADDRESS'    }
    default:              return null
  }
}

export default function TICard({ article, source, user, onUpdate }) {
  const [saving, setSaving]             = useState(false)
  // 'TICKET_RAISED' | 'RESOLVED' | null — inline status prompt state
  const [pendingStatus, setPending]     = useState(null)
  const [ticketInput, setTicketInput]   = useState('')
  const [closureInput, setClosure]      = useState('')
  const [showNote, setShowNote]         = useState(false)
  const [noteText, setNoteText]         = useState('')
  const [showHistory, setShowHistory]   = useState(false)
  const [history, setHistory]           = useState(null)
  const [histLoading, setHistLoading]   = useState(false)
  // Inline edit-ticket state
  const [editingTicket, setEditTicket]  = useState(false)
  const [ticketEdit, setTicketEdit]     = useState('')

  const borderColor = SEV_BORDER[article.severity] ?? SEV_BORDER.unset
  const keywords = article.keyword_matches
    ? article.keyword_matches.split(',').map(k => k.trim()).filter(Boolean)
    : []

  const isIrrelevant = article.status === 'IRRELEVANT'
  const forwardAction = getForwardAction(article.status)

  // ── API helpers ──────────────────────────────────────────────────────────────

  async function doStatus(status, extra = {}) {
    setSaving(true)
    try {
      const updated = await patchArticleStatus(article.id, status, user, extra)
      onUpdate(updated)
      setPending(null)
      setTicketInput('')
      setClosure('')
      // Invalidate history so it reloads next time the panel is opened
      setHistory(null)
    } catch (err) {
      console.error('Status update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function doSeverity(severity) {
    if (severity === article.severity) return
    setSaving(true)
    try {
      const updated = await patchArticleSeverity(article.id, severity, user)
      onUpdate(updated)
    } catch (err) {
      console.error('Severity update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function doNote() {
    if (!noteText.trim()) return
    setSaving(true)
    try {
      const updated = await patchArticleNotes(article.id, noteText.trim(), user)
      onUpdate(updated)
      setNoteText('')
      setShowNote(false)
      setHistory(null)
    } catch (err) {
      console.error('Note update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function doEditTicket() {
    if (!ticketEdit.trim()) return
    setSaving(true)
    try {
      const updated = await patchArticleStatus(article.id, 'TICKET_RAISED', user, { ticketId: ticketEdit.trim() })
      onUpdate(updated)
      setEditTicket(false)
      setTicketEdit('')
      setHistory(null)
    } catch (err) {
      console.error('Ticket update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function toggleHistory() {
    const next = !showHistory
    setShowHistory(next)
    if (next && history === null) {
      setHistLoading(true)
      try {
        const data = await fetchArticleHistory(article.id)
        // API returns newest-first; reverse to show oldest-first for a timeline
        setHistory([...data].reverse())
      } catch (err) {
        console.error('History fetch failed:', err)
        setHistory([])
      } finally {
        setHistLoading(false)
      }
    }
  }

  // When the user clicks a forward button that needs extra input, set pending
  function handleForwardClick() {
    if (!forwardAction) return
    if (forwardAction.next === 'TICKET_RAISED') {
      setPending('TICKET_RAISED')
    } else if (forwardAction.next === 'RESOLVED') {
      setPending('RESOLVED')
    } else {
      doStatus(forwardAction.next)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${borderColor}`,
        opacity: isIrrelevant ? 0.55 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {source?.name ?? `Source ${article.source_id}`}
        </span>

        {source && (
          <span
            className="px-1.5 py-0.5 rounded font-mono text-[10px] font-medium"
            style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            T{source.tier}
          </span>
        )}

        <SeverityBadge severity={article.severity} />

        {keywords.map(kw => (
          <span
            key={kw}
            className="px-1.5 py-0.5 rounded text-[11px] font-medium"
            style={{ background: 'var(--sev-medium-bg)', color: 'var(--sev-medium)' }}
          >
            ⚑ {kw}
          </span>
        ))}

        {article.seen_in_sources > 1 && (
          <span
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            {article.seen_in_sources} sources
          </span>
        )}

        <span
          className="ml-auto text-xs tabular-nums cursor-default"
          style={{ color: 'var(--text-muted)' }}
          title={formatDateTime(article.published_at)}
        >
          {relativeTime(article.published_at)}
        </span>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm font-medium leading-snug hover:underline"
          style={{ color: 'var(--text-primary)' }}
        >
          {article.title}
        </a>

        {article.summary && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {article.summary}
          </p>
        )}

        {/* Ticket ID display + inline edit */}
        {article.ticket_id && (
          <div className="mt-1.5 flex items-center gap-2">
            {editingTicket ? (
              <>
                <input
                  type="text"
                  value={ticketEdit}
                  onChange={e => setTicketEdit(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && ticketEdit.trim()) doEditTicket()
                    if (e.key === 'Escape') { setEditTicket(false); setTicketEdit('') }
                  }}
                  placeholder="Ticket ID"
                  className="text-xs px-2 py-0.5 rounded border font-mono"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    width: '10rem',
                  }}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                <button
                  onClick={doEditTicket}
                  disabled={!ticketEdit.trim() || saving}
                  className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity: (!ticketEdit.trim() || saving) ? 0.5 : 1,
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditTicket(false); setTicketEdit('') }}
                  className="text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  Ticket:{' '}
                  <TicketLink
                    ticketId={article.ticket_id}
                    className="font-mono"
                    style={{ color: 'var(--accent)' }}
                  />
                </span>
                {article.status === 'TICKET_RAISED' && (
                  <button
                    onClick={() => { setEditTicket(true); setTicketEdit(article.ticket_id) }}
                    className="text-[11px] hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {article.notes && (
          <p
            className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap pl-2"
            style={{
              color: 'var(--text-secondary)',
              borderLeft: '2px solid var(--border)',
            }}
          >
            {article.notes}
          </p>
        )}
      </div>

      {/* ── Inline: Ticket ID prompt ────────────────────────────────────────── */}
      {pendingStatus === 'TICKET_RAISED' && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Ticket ID (required)"
            value={ticketInput}
            onChange={e => setTicketInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && ticketInput.trim())
                doStatus('TICKET_RAISED', { ticketId: ticketInput.trim() })
              if (e.key === 'Escape') { setPending(null); setTicketInput('') }
            }}
            className="text-xs px-2.5 py-1.5 rounded border flex-1 font-mono"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-page)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button
            onClick={() => ticketInput.trim() && doStatus('TICKET_RAISED', { ticketId: ticketInput.trim() })}
            disabled={!ticketInput.trim() || saving}
            className="text-xs px-2.5 py-1.5 rounded font-medium"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: (!ticketInput.trim() || saving) ? 0.5 : 1,
            }}
          >
            Confirm
          </button>
          <button
            onClick={() => { setPending(null); setTicketInput('') }}
            className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Inline: Closure notes prompt ───────────────────────────────────── */}
      {pendingStatus === 'RESOLVED' && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          <textarea
            placeholder="Closure notes (optional)"
            value={closureInput}
            onChange={e => setClosure(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setPending(null); setClosure('') }
            }}
            rows={2}
            className="text-xs px-2.5 py-1.5 rounded border w-full resize-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-page)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => doStatus('RESOLVED', { notes: closureInput })}
              disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded font-medium"
              style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.5 : 1 }}
            >
              Mark Resolved
            </button>
            <button
              onClick={() => { setPending(null); setClosure('') }}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Inline: Note textarea ───────────────────────────────────────────── */}
      {showNote && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          <textarea
            placeholder="Add note…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setShowNote(false); setNoteText('') }
            }}
            rows={2}
            className="text-xs px-2.5 py-1.5 rounded border w-full resize-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-page)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={doNote}
              disabled={!noteText.trim() || saving}
              className="text-xs px-2.5 py-1.5 rounded font-medium"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                opacity: (!noteText.trim() || saving) ? 0.5 : 1,
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setShowNote(false); setNoteText('') }}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Action row ─────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-2 flex items-center gap-2 flex-wrap border-t"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Mark Irrelevant — shown for all non-irrelevant statuses */}
        {!isIrrelevant && (
          <button
            onClick={() => doStatus('IRRELEVANT')}
            disabled={saving}
            className="text-xs px-2.5 py-1 rounded border"
            style={{
              color: 'var(--text-muted)',
              borderColor: 'var(--border)',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Irrelevant
          </button>
        )}

        {/* Forward action (or restart from IRRELEVANT) */}
        {forwardAction && (
          <button
            onClick={handleForwardClick}
            disabled={saving || !!pendingStatus}
            className="text-xs px-2.5 py-1 rounded border font-medium"
            style={{
              color: 'var(--accent)',
              borderColor: 'var(--accent)',
              opacity: (saving || !!pendingStatus) ? 0.5 : 1,
            }}
          >
            {forwardAction.label}
          </button>
        )}

        {/* Severity selector */}
        <select
          value={article.severity}
          onChange={e => doSeverity(e.target.value)}
          disabled={saving}
          className="text-xs px-2 py-1 rounded border"
          style={{
            color: 'var(--text-secondary)',
            borderColor: 'var(--border)',
            background: 'var(--bg-card)',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          <option value="unset">Severity</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>

        {/* Note toggle */}
        <button
          onClick={() => setShowNote(v => !v)}
          className="text-xs px-2.5 py-1 rounded"
          style={{ color: showNote ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          ✎ Note
        </button>

        {/* History toggle */}
        <button
          onClick={toggleHistory}
          className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--text-muted)' }}
        >
          {showHistory ? '▲' : '▼'} History
        </button>

        <div className="ml-auto">
          <LifecyclePill
            status={article.status}
            changedAt={article.status_changed_at}
          />
        </div>
      </div>

      {/* ── History section ─────────────────────────────────────────────────── */}
      {showHistory && (
        <div
          className="px-4 pb-3 pt-2 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {histLoading ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : !history?.length ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No history yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {history.map(entry => (
                <HistoryEntry key={entry.id} entry={entry} article={article} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryEntry({ entry, article }) {
  // For TICKET_RAISED transitions, append the ticket ID with optional hyperlink
  const isTicketRaised = entry.detail.includes('TICKET_RAISED')
  const ticketId = isTicketRaised ? article.ticket_id : null

  return (
    <div
      className="flex items-baseline gap-3 text-xs"
      style={{ color: 'var(--text-muted)' }}
    >
      <span
        className="tabular-nums shrink-0"
        title={formatDateTime(entry.timestamp)}
      >
        {relativeTime(entry.timestamp)}
      </span>
      <span
        className="font-medium shrink-0"
        style={{ color: 'var(--text-secondary)' }}
      >
        {entry.user}
      </span>
      <span>
        {entry.detail}
        {ticketId && (
          <>
            {' · '}
            <TicketLink
              ticketId={ticketId}
              className="font-mono"
              style={{ color: 'var(--accent)' }}
            />
          </>
        )}
      </span>
    </div>
  )
}
