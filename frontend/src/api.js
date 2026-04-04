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

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function patchArticleStatus(id, status, user, { ticketId, notes } = {}) {
  return request(`/articles/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status, user, ticket_id: ticketId ?? null, notes: notes ?? null }),
  })
}

export function patchArticleSeverity(id, severity, user) {
  return request(`/articles/${id}/severity`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ severity, user }),
  })
}

export function patchArticleNotes(id, note, user) {
  return request(`/articles/${id}/notes`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ note, user }),
  })
}

export function fetchArticleHistory(id) {
  const params = new URLSearchParams({ target_type: 'article', target_id: String(id), limit: '50' })
  return request(`/audit?${params}`)
}

export function previewSource(url, feedType = 'rss') {
  return request('/sources/preview', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ url, feed_type: feedType }),
  })
}

export function addSource(name, url, tier, feedType, analyst) {
  return request('/sources', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, url, tier, feed_type: feedType, analyst }),
  })
}

export function deleteSource(id, analyst) {
  return request(`/sources/${id}?analyst=${encodeURIComponent(analyst)}`, {
    method: 'DELETE',
  })
}

export function testSource(id) {
  return request(`/sources/${id}/test`, { method: 'POST' })
}
