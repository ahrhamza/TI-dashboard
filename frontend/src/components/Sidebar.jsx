const SEV_DOT = {
  critical: 'var(--sev-critical)',
  high:     'var(--sev-high)',
  medium:   'var(--sev-medium)',
  low:      'var(--sev-low)',
  unset:    'var(--sev-unset)',
}

const SEVERITY_OPTIONS = [
  { value: '',         label: 'All' },
  { value: 'critical', label: 'Critical', dot: SEV_DOT.critical },
  { value: 'high',     label: 'High',     dot: SEV_DOT.high },
  { value: 'medium',   label: 'Medium',   dot: SEV_DOT.medium },
  { value: 'low',      label: 'Low',      dot: SEV_DOT.low },
  { value: 'unset',    label: 'Unset',    dot: SEV_DOT.unset },
]

const STATUS_OPTIONS = [
  { value: '',              label: 'All' },
  { value: 'INGESTED',      label: 'Ingested' },
  { value: 'TO_ADDRESS',    label: 'To Address' },
  { value: 'TICKET_RAISED', label: 'Ticket Raised' },
  { value: 'RESOLVED',      label: 'Resolved' },
]

const TIER_OPTIONS = [
  { value: '', label: 'All' },
  { value: '1', label: 'Tier 1' },
  { value: '2', label: 'Tier 2' },
  { value: '3', label: 'Tier 3' },
  { value: '4', label: 'Tier 4' },
  { value: '5', label: 'Tier 5' },
]

function hasActiveFilters(f) {
  return f.severity || f.status || f.tier || f.keywordFlag || f.showIrrelevant || f.showArchived
}

export default function Sidebar({ open, filters, onFilterChange }) {
  function set(key, value) {
    onFilterChange(prev => ({ ...prev, [key]: value }))
  }

  function clearAll() {
    onFilterChange({
      severity: '',
      status: '',
      tier: '',
      keywordFlag: false,
      showIrrelevant: false,
      showArchived: false,
    })
  }

  return (
    <aside
      className="fixed top-14 left-0 bottom-0 overflow-x-hidden overflow-y-auto z-30"
      style={{
        width: open ? '16rem' : '0',
        transition: 'width 0.2s ease',
        background: 'var(--bg-sidebar)',
        borderRight: open ? '1px solid var(--border)' : 'none',
      }}
    >
      {/* Render content only when open to avoid tab-focus issues */}
      {open && (
        <div style={{ minWidth: '16rem' }} className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              Filters
            </span>
            {hasActiveFilters(filters) && (
              <button
                onClick={clearAll}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Clear all
              </button>
            )}
          </div>

          <FilterSection title="Severity">
            {SEVERITY_OPTIONS.map(opt => (
              <RadioOption
                key={opt.value}
                label={opt.label}
                dot={opt.dot}
                active={filters.severity === opt.value}
                onClick={() => set('severity', opt.value)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Status">
            {STATUS_OPTIONS.map(opt => (
              <RadioOption
                key={opt.value}
                label={opt.label}
                active={filters.status === opt.value}
                onClick={() => set('status', opt.value)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Source Tier">
            {TIER_OPTIONS.map(opt => (
              <RadioOption
                key={opt.value}
                label={opt.label}
                active={filters.tier === opt.value}
                onClick={() => set('tier', opt.value)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Flags">
            <CheckOption
              label="Keyword matches only"
              checked={filters.keywordFlag}
              onChange={v => set('keywordFlag', v)}
            />
          </FilterSection>

          <FilterSection title="Hidden Items">
            <CheckOption
              label="Show irrelevant"
              checked={filters.showIrrelevant}
              onChange={v => set('showIrrelevant', v)}
            />
            <CheckOption
              label="Show archived"
              checked={filters.showArchived}
              onChange={v => set('showArchived', v)}
            />
          </FilterSection>
        </div>
      )}
    </aside>
  )
}

function FilterSection({ title, children }) {
  return (
    <div className="mb-5">
      <div
        className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

function RadioOption({ label, active, onClick, dot }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-sm transition-colors"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: active ? '500' : '400',
      }}
    >
      {dot && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: dot }}
        />
      )}
      {label}
    </button>
  )
}

function CheckOption({ label, checked, onChange }) {
  return (
    <label
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm select-none"
      style={{ color: 'var(--text-secondary)' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded w-3.5 h-3.5 flex-shrink-0"
        style={{ accentColor: 'var(--accent)' }}
      />
      {label}
    </label>
  )
}
