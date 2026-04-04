const STATUS_CONFIG = {
  INGESTED:      { label: 'Ingested',      color: 'var(--status-ingested-color)',    bg: 'var(--status-ingested-bg)' },
  TO_ADDRESS:    { label: 'To Address',    color: 'var(--status-to-address-color)',  bg: 'var(--status-to-address-bg)' },
  TICKET_RAISED: { label: 'Ticket Raised', color: 'var(--status-ticket-color)',      bg: 'var(--status-ticket-bg)' },
  RESOLVED:      { label: 'Resolved',      color: 'var(--status-resolved-color)',    bg: 'var(--status-resolved-bg)' },
  IRRELEVANT:    { label: 'Irrelevant',    color: 'var(--status-irrelevant-color)',  bg: 'var(--status-irrelevant-bg)' },
}

function parseUTC(dateStr) {
  if (!dateStr) return null
  const s = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z'
  return new Date(s)
}

function timeInState(changedAt) {
  if (!changedAt) return null
  const diff = Date.now() - parseUTC(changedAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export default function LifecyclePill({ status, changedAt }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.INGESTED
  const elapsed = timeInState(changedAt)

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
      {elapsed && (
        <span className="opacity-70">· {elapsed}</span>
      )}
    </span>
  )
}
