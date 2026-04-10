import { useState } from 'react'

const SEV_DOT = {
  critical: 'var(--sev-critical)',
  high:     'var(--sev-high)',
  medium:   'var(--sev-medium)',
  low:      'var(--sev-low)',
  unset:    'var(--sev-unset)',
}

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical', dot: SEV_DOT.critical },
  { value: 'high',     label: 'High',     dot: SEV_DOT.high },
  { value: 'medium',   label: 'Medium',   dot: SEV_DOT.medium },
  { value: 'low',      label: 'Low',      dot: SEV_DOT.low },
  { value: 'unset',    label: 'Unset',    dot: SEV_DOT.unset },
]

const STATUS_OPTIONS = [
  { value: 'INGESTED',      label: 'Ingested' },
  { value: 'TO_ADDRESS',    label: 'To Address' },
  { value: 'TICKET_RAISED', label: 'Ticket Raised' },
  { value: 'RESOLVED',      label: 'Resolved' },
  { value: 'IRRELEVANT',    label: 'Irrelevant' },
]

const TIER_OPTIONS = [
  { value: '1', label: 'Tier 1' },
  { value: '2', label: 'Tier 2' },
  { value: '3', label: 'Tier 3' },
  { value: '4', label: 'Tier 4' },
  { value: '5', label: 'Tier 5' },
]

const KEYWORD_MODE_OPTIONS = [
  { value: 'all',          label: 'All articles' },
  { value: 'keyword_only', label: 'Keyword matches only' },
  { value: 'highlight',    label: 'Highlight matches' },
]

function hasActiveFilters(f) {
  return (
    f.severity.length > 0 ||
    f.status.length > 0 ||
    f.tier.length > 0 ||
    f.sources.length > 0 ||
    f.keywords.length > 0 ||
    f.keywordMode !== 'all' ||
    f.showIrrelevant ||
    f.showArchived
  )
}

export default function Sidebar({ open, filters, onFilterChange, sources, keywords }) {
  const [sourceSearch, setSourceSearch] = useState('')

  function set(key, value) {
    onFilterChange(prev => ({ ...prev, [key]: value }))
  }

  function toggleMulti(key, value) {
    onFilterChange(prev => {
      const arr = prev[key]
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      }
    })
  }

  function clearAll() {
    onFilterChange({
      severity: [],
      status: [],
      tier: [],
      sources: [],
      keywords: [],
      keywordMode: 'all',
      showIrrelevant: false,
      showArchived: false,
    })
    setSourceSearch('')
  }

  const filteredSources = (sources || []).filter(s =>
    s.name.toLowerCase().includes(sourceSearch.toLowerCase())
  )

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

          <MultiFilterSection
            title="Severity"
            options={SEVERITY_OPTIONS}
            selected={filters.severity}
            onToggle={v => toggleMulti('severity', v)}
            onClear={() => set('severity', [])}
          />

          <MultiFilterSection
            title="Status"
            options={STATUS_OPTIONS}
            selected={filters.status}
            onToggle={v => toggleMulti('status', v)}
            onClear={() => set('status', [])}
          />

          <MultiFilterSection
            title="Source Tier"
            options={TIER_OPTIONS}
            selected={filters.tier}
            onToggle={v => toggleMulti('tier', v)}
            onClear={() => set('tier', [])}
          />

          {/* Source filter */}
          <FilterSection title="Source">
            <input
              type="text"
              placeholder="Search sources…"
              value={sourceSearch}
              onChange={e => setSourceSearch(e.target.value)}
              className="w-full text-xs px-2 py-1 rounded border mb-1.5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            {/* "All sources" clears selection */}
            <button
              onClick={() => { set('sources', []); setSourceSearch('') }}
              className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs mb-0.5 transition-colors"
              style={{
                background: !filters.sources.length ? 'var(--accent-subtle)' : 'transparent',
                color: !filters.sources.length ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: !filters.sources.length ? '500' : '400',
              }}
            >
              All sources
              {filters.sources.length > 0 && (
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {filters.sources.length}
                </span>
              )}
            </button>
            {/* Source list */}
            <div style={{ maxHeight: '11rem', overflowY: 'auto' }}>
              {filteredSources.map(src => {
                const active = filters.sources.includes(src.id)
                return (
                  <button
                    key={src.id}
                    onClick={() => toggleMulti('sources', src.id)}
                    className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-xs transition-colors"
                    style={{
                      background: active ? 'var(--accent-subtle)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: active ? '500' : '400',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: active ? 'var(--accent)' : 'var(--border)' }}
                    />
                    <span className="truncate flex-1">{src.name}</span>
                    <span
                      className="text-[10px] font-mono flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      T{src.tier}
                    </span>
                  </button>
                )
              })}
              {filteredSources.length === 0 && (
                <p className="text-xs px-2 py-1" style={{ color: 'var(--text-muted)' }}>
                  No sources found
                </p>
              )}
            </div>
          </FilterSection>

          {/* Keyword mode + filter */}
          <FilterSection title="Keywords">
            {KEYWORD_MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => set('keywordMode', opt.value)}
                className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs transition-colors"
                style={{
                  background: filters.keywordMode === opt.value ? 'var(--accent-subtle)' : 'transparent',
                  color: filters.keywordMode === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: filters.keywordMode === opt.value ? '500' : '400',
                }}
              >
                {opt.label}
              </button>
            ))}

            {/* Keyword multi-select — only shown when there are keywords */}
            {keywords && keywords.length > 0 && (
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                <button
                  onClick={() => set('keywords', [])}
                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs transition-colors"
                  style={{
                    background: !filters.keywords.length ? 'var(--accent-subtle)' : 'transparent',
                    color: !filters.keywords.length ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: !filters.keywords.length ? '500' : '400',
                  }}
                >
                  All keywords
                  {filters.keywords.length > 0 && (
                    <span
                      className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {filters.keywords.length}
                    </span>
                  )}
                </button>
                <div style={{ maxHeight: '9rem', overflowY: 'auto' }}>
                  {keywords.filter(k => k.is_active).map(kw => {
                    const active = filters.keywords.includes(kw.term)
                    return (
                      <button
                        key={kw.id}
                        onClick={() => toggleMulti('keywords', kw.term)}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-xs transition-colors"
                        style={{
                          background: active ? 'var(--accent-subtle)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: active ? '500' : '400',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: active ? 'var(--accent)' : 'var(--border)' }}
                        />
                        <span className="truncate flex-1 font-mono">{kw.term}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
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

function MultiFilterSection({ title, options, selected, onToggle, onClear }) {
  const allActive = selected.length === 0
  return (
    <FilterSection title={title}>
      <button
        onClick={onClear}
        className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs transition-colors"
        style={{
          background: allActive ? 'var(--accent-subtle)' : 'transparent',
          color: allActive ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: allActive ? '500' : '400',
        }}
      >
        All
        {selected.length > 0 && (
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {selected.length}
          </span>
        )}
      </button>
      {options.map(opt => {
        const active = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs transition-colors"
            style={{
              background: active ? 'var(--accent-subtle)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: active ? '500' : '400',
            }}
          >
            {opt.dot && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: opt.dot }}
              />
            )}
            <span className="flex-1">{opt.label}</span>
            {active && (
              <span style={{ color: 'var(--accent)', fontSize: '0.65rem' }}>✓</span>
            )}
          </button>
        )
      })}
    </FilterSection>
  )
}

function CheckOption({ label, checked, onChange }) {
  return (
    <label
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs select-none"
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
