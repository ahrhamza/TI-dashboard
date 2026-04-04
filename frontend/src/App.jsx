import { useState, useEffect, useCallback, useMemo } from 'react'
import TopNav from './components/TopNav'
import Sidebar from './components/Sidebar'
import FeedList from './components/FeedList'
import UserPrompt from './components/UserPrompt'
import { useUser } from './hooks/useUser'
import { fetchArticles, fetchSources, triggerRefresh } from './api'

export default function App() {
  const { name, saveName, hasName } = useUser()
  const [showRename, setShowRename] = useState(false)

  // Theme
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('socfeed_theme') === 'dark'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('socfeed_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Data
  const [articles, setArticles] = useState([])
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Filters — showIrrelevant/showArchived drive API calls; rest are client-side
  const [filters, setFilters] = useState({
    severity: '',
    status: '',
    tier: '',
    keywordFlag: false,
    showIrrelevant: false,
    showArchived: false,
  })

  const loadData = useCallback(async () => {
    try {
      const [arts, srcs] = await Promise.all([
        fetchArticles({
          showIrrelevant: filters.showIrrelevant,
          showArchived: filters.showArchived,
        }),
        fetchSources(),
      ])
      setArticles(arts)
      setSources(srcs)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [filters.showIrrelevant, filters.showArchived])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleArticleUpdate = (updatedArticle) => {
    setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a))
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

  const sourceMap = useMemo(
    () => Object.fromEntries(sources.map(s => [s.id, s])),
    [sources],
  )

  const filteredArticles = useMemo(() => {
    return articles.filter(a => {
      if (filters.severity && a.severity !== filters.severity) return false
      if (filters.status && a.status !== filters.status) return false
      if (filters.keywordFlag && !a.keyword_matches) return false
      if (filters.tier) {
        const src = sourceMap[a.source_id]
        if (!src || src.tier !== parseInt(filters.tier, 10)) return false
      }
      return true
    })
  }, [articles, filters.severity, filters.status, filters.tier, filters.keywordFlag, sourceMap])

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
      />

      <div className="flex" style={{ paddingTop: '3.5rem' }}>
        <Sidebar
          open={sidebarOpen}
          filters={filters}
          onFilterChange={setFilters}
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
          />
        </main>
      </div>
    </div>
  )
}
