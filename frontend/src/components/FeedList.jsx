import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import TICard from './TICard'

export default function FeedList({ articles, sourceMap, loading }) {
  const parentRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 175,
    overscan: 5,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading feed…</span>
      </div>
    )
  }

  if (!articles.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          No items match your filters
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Try adjusting the sidebar filters or triggering a refresh.
        </span>
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto"
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
      {/* Count header */}
      <div className="px-6 pt-4 pb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {articles.length} item{articles.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Virtual list */}
      <div
        className="px-6"
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map(vItem => (
          <div
            key={vItem.key}
            data-index={vItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              paddingBottom: '0.75rem',
              transform: `translateY(${vItem.start}px)`,
            }}
          >
            <TICard
              article={articles[vItem.index]}
              source={sourceMap[articles[vItem.index]?.source_id]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
