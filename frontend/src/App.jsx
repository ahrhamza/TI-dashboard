import { useState, useEffect, useCallback, useMemo } from 'react'
import TopNav from './components/TopNav'
import Sidebar from './components/Sidebar'
import FeedList from './components/FeedList'
import SourcesTable from './components/SourcesTable'
import SettingsPage from './components/SettingsPage'
import UserPrompt from './components/UserPrompt'
import { useUser } from './hooks/useUser'
import { fetchArticle, fetchArticles, fetchSources, fetchKeywords, triggerRefresh } from './api'

export default function App() {
  const { name, saveName, hasName } = useUser()
  const [showRename, setShowRename] = useState(false)

  // Page routing
  const [page, setPage] = useState('feed') // 'feed' | 'sources' | 'settings'

  // Theme
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('socfeed_theme') === 'dark'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('socfeed_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Timestamp display preference — persisted per analyst in localStorage
  const [tsMode, setTsMode] = useState(() => {
    return localStorage.getItem('socfeed_ts_mode') || 'both'
  })
  const handleTsModeChange = (mode) => {
    setTsMode(mode)
    localStorage.setItem('socfeed_ts_mode', mode)
  }

  // Data
  const [articles, setArticles] = useState([])
  const [sources, setSources] = useState([])
  const [keywords, setKeywords] = useState([]) // array of term strings
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Filters — showIrrelevant/showArchived drive API calls; rest are client-side
  const [filters, setFilters] = useState({
    severity: [],        // array of selected severity strings
    status: [],          // array of selected status strings
    tier: [],            // array of selected tier strings ('1'–'5')
    sources: [],         // array of selected source IDs (numbers)
    keywordMode: 'all',  // 'all' | 'keyword_only' | 'highlight'
    showIrrelevant: false,
    showArchived: false,
  })

  // Spotlight — used when navigating to a specific article from the audit log.
  const [spotlightId, setSpotlightId] = useState(null)
  const [pinnedArticle, setPinnedArticle] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const [arts, srcs, kwds] = await Promise.all([
        fetchArticles({
          showIrrelevant: filters.showIrrelevant || filters.status.includes('IRRELEVANT'),
          showArchived: filters.showArchived,
        }),
        fetchSources(),
        fetchKeywords(),
      ])
      setArticles(arts)
      setSources(srcs)
      setKeywords(kwds.map(k => k.term))
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  // status is a dep so switching to/from IRRELEVANT filter triggers a fresh fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.showIrrelevant, filters.showArchived, filters.status])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleArticleUpdate = (updatedArticle) => {
    setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a))
    if (pinnedArticle?.id === updatedArticle.id) setPinnedArticle(updatedArticle)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await triggerRefresh()
      await loadData()
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const navigateToArticle = useCallback(async (id) => {
    setPage('feed')
    setSpotlightId(id)

    const inList = articles.find(a => a.id === id)
    if (!inList) {
      try {
        const fetched = await fetchArticle(id)
        setPinnedArticle(fetched)
      } catch {
        setPinnedArticle(null)
      }
    } else {
      setPinnedArticle(null)
    }
  }, [articles])

  const clearSpotlight = useCallback(() => {
    setSpotlightId(null)
    setPinnedArticle(null)
  }, [])

  const handlePageChange = (newPage) => {
    if (newPage !== 'feed') {
      setSpotlightId(null)
      setPinnedArticle(null)
    }
    setPage(newPage)
  }

  const sourceMap = useMemo(
    () => Object.fromEntries(sources.map(s => [s.id, s])),
    [sources],
  )

  const filteredArticles = useMemo(() => {
    const filtered = articles.filter(a => {
      // Always include the spotlit article regardless of active filters
      if (spotlightId && a.id === spotlightId) return true
      if (filters.severity.length && !filters.severity.includes(a.severity)) return false
      if (filters.status.length && !filters.status.includes(a.status)) return false
      if (filters.keywordMode === 'keyword_only' && !a.keyword_matches) return false
      if (filters.tier.length) {
        const src = sourceMap[a.source_id]
        if (!src || !filters.tier.includes(String(src.tier))) return false
      }
      if (filters.sources.length && !filters.sources.includes(a.source_id)) return false
      return true
    })

    // If the spotlit article was fetched on-demand (not in main list), inject it
    // at its natural chronological position.
    if (pinnedArticle && !filtered.find(a => a.id === pinnedArticle.id)) {
      const pinDate = pinnedArticle.published_at || pinnedArticle.ingested_at || ''
      const insertAt = filtered.findIndex(
        a => (a.published_at || a.ingested_at || '') < pinDate
      )
      if (insertAt >= 0) {
        return [...filtered.slice(0, insertAt), pinnedArticle, ...filtered.slice(insertAt)]
      }
      return [...filtered, pinnedArticle]
    }

    return filtered
  }, [articles, filters.severity, filters.status, filters.tier, filters.keywordMode, filters.sources, sourceMap, spotlightId, pinnedArticle])

  // Only pass keywords to cards when highlight mode is active
  const highlightKeywords = filters.keywordMode === 'highlight' ? keywords : []

  return (
    <div style={{ background: 'var(--bg-page)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      {/* Name capture modals */}
      {(!hasName || showRename) && (
        <UserPrompt
          existingName={showRename ? name : ''}
          onSave={newName => {
            saveName(newName)
            setShowRename(false)
          }}
        />
      )}

      <TopNav
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        lastRefreshed={lastRefreshed}
        analystName={name}
        onChangeName={() => setShowRename(true)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        currentPage={page}
        onPageChange={handlePageChange}
        tsMode={tsMode}
        onTsModeChange={handleTsModeChange}
      />

      <div className="flex" style={{ paddingTop: '3.5rem' }}>
        {/* Feed page: sidebar + virtualised list */}
        {page === 'feed' && (
          <>
            <Sidebar
              open={sidebarOpen}
              filters={filters}
              onFilterChange={setFilters}
              sources={sources}
            />
            <main
              style={{
                flex: 1,
                minWidth: 0,
                marginLeft: sidebarOpen ? '16rem' : '0',
                transition: 'margin-left 0.2s ease',
              }}
            >
              <FeedList
                articles={filteredArticles}
                sourceMap={sourceMap}
                loading={loading}
                user={name}
                onUpdate={handleArticleUpdate}
                spotlightId={spotlightId}
                onDismissSpotlight={clearSpotlight}
                highlightKeywords={highlightKeywords}
                tsMode={tsMode}
              />
            </main>
          </>
        )}

        {/* Sources page */}
        {page === 'sources' && (
          <main style={{ flex: 1, minWidth: 0 }}>
            <SourcesTable
              user={name}
              onSourcesChange={loadData}
            />
          </main>
        )}

        {/* Settings page */}
        {page === 'settings' && (
          <main style={{ flex: 1, minWidth: 0 }}>
            <SettingsPage user={name} onNavigateToArticle={navigateToArticle} onClearSuccess={loadData} />
          </main>
        )}
      </div>
    </div>
  )
}
