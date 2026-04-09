const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export function fetchArticle(id) {
  return request(`/articles/${id}`)
}

export function fetchArticles({ showIrrelevant = false, showArchived = false, limit = 500 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (showIrrelevant) params.set('show_irrelevant', 'true')
  if (showArchived) params.set('show_archived', 'true')
  return request(`/articles?${params}`)
}

export function fetchSources({ showArchived = false } = {}) {
  const params = new URLSearchParams()
  if (showArchived) params.set('show_archived', 'true')
  const qs = params.toString()
  return request(`/sources${qs ? '?' + qs : ''}`)
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

export function disableSource(id, analyst) {
  return request(`/sources/${id}/disable`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ analyst }),
  })
}

export function enableSource(id, analyst) {
  return request(`/sources/${id}/enable`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ analyst }),
  })
}

export function archiveSource(id, analyst) {
  return request(`/sources/${id}/archive`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ analyst }),
  })
}

export function unarchiveSource(id, analyst) {
  return request(`/sources/${id}/unarchive`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ analyst }),
  })
}

export function testSource(id) {
  return request(`/sources/${id}/test`, { method: 'POST' })
}

// Keywords
export function fetchKeywords() {
  return request('/keywords')
}

export function addKeyword(term, analyst) {
  return request('/keywords', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ term, analyst }),
  })
}

export function toggleKeyword(id, analyst) {
  return request(`/keywords/${id}/toggle`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ analyst }),
  })
}

export function deleteKeyword(id, analyst) {
  return request(`/keywords/${id}?analyst=${encodeURIComponent(analyst)}`, {
    method: 'DELETE',
  })
}

// Audit log
export function fetchAudit({ user, action, since, until, limit = 200, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (user) params.set('user', user)
  if (action) params.set('action', action)
  if (since) params.set('since', since)
  if (until) params.set('until', until)
  return request(`/audit?${params}`)
}

// App config
export function fetchConfig() {
  return request('/config')
}

export function updateArchiveDays(value, analyst) {
  return request('/config/archive_after_days', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ value, analyst }),
  })
}

// Data portability
export function getExportUrl(analyst) {
  return `${BASE}/export?analyst=${encodeURIComponent(analyst)}`
}

export function getExportConfigUrl(analyst) {
  return `${BASE}/export/config?analyst=${encodeURIComponent(analyst)}`
}

export async function previewImport(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/import/preview`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function confirmImport(file, analyst) {
  const form = new FormData()
  form.append('file', file)
  form.append('analyst', analyst)
  const res = await fetch(`${BASE}/import`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export function clearAllTIs(password, analyst) {
  return request('/clear', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ password, analyst }),
  })
}
