const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export function fetchArticles({ showIrrelevant = false, showArchived = false, limit = 500 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (showIrrelevant) params.set('show_irrelevant', 'true')
  if (showArchived) params.set('show_archived', 'true')
  return request(`/articles?${params}`)
}

export function fetchSources() {
  return request('/sources')
}

export async function triggerRefresh() {
  const res = await fetch(`${BASE}/refresh`, { method: 'POST' })
  if (!res.ok) throw new Error('Refresh failed')
  return res.json()
}
