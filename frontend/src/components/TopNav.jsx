function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="2.5" />
      <line x1="7.5" y1="1" x2="7.5" y2="3" />
      <line x1="7.5" y1="12" x2="7.5" y2="14" />
      <line x1="1" y1="7.5" x2="3" y2="7.5" />
      <line x1="12" y1="7.5" x2="14" y2="7.5" />
      <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
      <line x1="10.54" y1="10.54" x2="11.95" y2="11.95" />
      <line x1="3.05" y1="11.95" x2="4.46" y2="10.54" />
      <line x1="10.54" y1="4.46" x2="11.95" y2="3.05" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.5 10A6 6 0 1 1 5 2.5a4.5 4.5 0 0 0 7.5 7.5z" />
    </svg>
  )
}

function RefreshIcon({ spinning }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 13 13" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'spin' : ''}
    >
      <path d="M11.5 2v3.5h-3.5" />
      <path d="M1.5 11V7.5H5" />
      <path d="M2.5 5.5A5 5 0 0 1 11.5 5.5" />
      <path d="M10.5 7.5A5 5 0 0 1 1.5 7.5" />
    </svg>
  )
}

function formatLastRefreshed(date) {
  if (!date) return null
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function TopNav({
  darkMode,
  onToggleDark,
  onRefresh,
  refreshing,
  lastRefreshed,
  analystName,
  onChangeName,
  sidebarOpen,
  onToggleSidebar,
  currentPage,
  onPageChange,
}) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 border-b"
      style={{
        height: '3.5rem',
        background: 'var(--bg-nav)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Sidebar toggle — only on Feed page */}
      {currentPage === 'feed' && (
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <MenuIcon />
        </button>
      )}

      {/* Logo */}
      <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
        SOCFeed
      </span>

      {/* Nav links */}
      <nav className="flex items-center gap-0.5 ml-3">
        {[
          { key: 'feed',     label: 'Feed' },
          { key: 'sources',  label: 'Sources' },
          { key: 'settings', label: 'Settings' },
        ].map(({ key, label }) => {
          const active = currentPage === key
          return (
            <button
              key={key}
              onClick={() => onPageChange(key)}
              className="px-3 py-1.5 rounded text-sm transition-colors"
              style={{
                color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                background: active ? 'var(--accent-subtle)' : 'transparent',
                fontWeight: active ? '500' : '400',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </nav>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-3">
        {/* Last refreshed */}
        {lastRefreshed && (
          <span
            className="text-xs tabular-nums hidden sm:block"
            style={{ color: 'var(--text-muted)' }}
            title={lastRefreshed.toLocaleString()}
          >
            Updated {formatLastRefreshed(lastRefreshed)}
          </span>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-opacity"
          style={{
            background: 'var(--accent)',
            color: 'white',
            opacity: refreshing ? 0.7 : 1,
          }}
          title="Trigger feed refresh"
        >
          <RefreshIcon spinning={refreshing} />
          <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDark}
          className="p-1.5 rounded-md transition-colors"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Analyst name */}
        {analystName && (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="hidden md:inline">Viewing as:</span>
            <button
              onClick={onChangeName}
              className="font-medium hover:underline"
              style={{ color: 'var(--text-secondary)' }}
              title="Change name"
            >
              {analystName}
            </button>
            <span
              className="hidden md:inline cursor-pointer hover:underline"
              style={{ color: 'var(--accent)' }}
              onClick={onChangeName}
            >
              — change
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
