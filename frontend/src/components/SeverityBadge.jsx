const SEV_CONFIG = {
  unset:    { label: 'Unset',    bg: 'var(--sev-unset-bg)',    color: 'var(--sev-unset)' },
  low:      { label: 'Low',      bg: 'var(--sev-low-bg)',      color: 'var(--sev-low)' },
  medium:   { label: 'Medium',   bg: 'var(--sev-medium-bg)',   color: 'var(--sev-medium)' },
  high:     { label: 'High',     bg: 'var(--sev-high-bg)',     color: 'var(--sev-high)' },
  critical: { label: 'Critical', bg: 'var(--sev-critical-bg)', color: 'var(--sev-critical)' },
}

export default function SeverityBadge({ severity }) {
  const cfg = SEV_CONFIG[severity] ?? SEV_CONFIG.unset
  if (severity === 'unset') return null
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}
