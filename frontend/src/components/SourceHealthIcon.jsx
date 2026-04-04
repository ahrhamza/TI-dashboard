export default function SourceHealthIcon({ consecutiveFailures, isActive }) {
  let color, label

  if (!isActive || consecutiveFailures >= 3) {
    color = '#E11D48'
    label = `Failing — auto-disabled (${consecutiveFailures} consecutive failure${consecutiveFailures !== 1 ? 's' : ''})`
  } else if (consecutiveFailures >= 1) {
    color = '#D97706'
    label = `Degraded — ${consecutiveFailures} consecutive failure${consecutiveFailures !== 1 ? 's' : ''}`
  } else {
    color = '#059669'
    label = 'Healthy'
  }

  return (
    <span
      title={label}
      aria-label={label}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}
