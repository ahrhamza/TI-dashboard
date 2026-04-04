import SeverityBadge from './SeverityBadge'
import LifecyclePill from './LifecyclePill'

const SEV_BORDER = {
  unset:    '#CBD5E1',
  low:      '#64748B',
  medium:   '#D97706',
  high:     '#EA580C',
  critical: '#E11D48',
}

function relativeTime(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
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
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TICard({ article, source }) {
  const borderColor = SEV_BORDER[article.severity] ?? SEV_BORDER.unset
  const keywords = article.keyword_matches
    ? article.keyword_matches.split(',').map(k => k.trim()).filter(Boolean)
    : []

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      {/* Header row */}
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

      {/* Body */}
      <div className="px-4 pb-3">
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
      </div>

      {/* Action row */}
      <div
        className="px-4 py-2 flex items-center gap-2 flex-wrap border-t"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          disabled
          className="text-xs px-2.5 py-1 rounded border cursor-not-allowed opacity-40 select-none"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
        >
          Mark Irrelevant
        </button>
        <button
          disabled
          className="text-xs px-2.5 py-1 rounded border cursor-not-allowed opacity-40 select-none"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
        >
          To Address
        </button>
        <button
          disabled
          className="text-xs px-2.5 py-1 rounded border cursor-not-allowed opacity-40 select-none"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
        >
          Severity ▾
        </button>
        <button
          disabled
          className="text-xs px-2.5 py-1 rounded cursor-not-allowed opacity-40 select-none"
          style={{ color: 'var(--text-secondary)' }}
          title="Notes (Phase 2b)"
        >
          ✎ Note
        </button>

        <div className="ml-auto">
          <LifecyclePill
            status={article.status}
            changedAt={article.status_changed_at}
          />
        </div>
      </div>
    </div>
  )
}
