import { useState } from 'react'
import { previewSource, addSource } from '../api'

function parseUTC(dateStr) {
  if (!dateStr) return null
  const s = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z'
  return new Date(s)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = parseUTC(dateStr)
  if (!d || isNaN(d)) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputStyle = {
  width: '100%',
  padding: '0.4rem 0.6rem',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.8125rem',
  outline: 'none',
}

const labelStyle = {
  fontSize: '0.75rem',
  fontWeight: '500',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '0.25rem',
}

export default function AddSourceFlow({ analyst, onAdded, onCancel }) {
  const [url, setUrl] = useState('')
  const [feedType, setFeedType] = useState('rss')
  const [step, setStep] = useState('url') // 'url' | 'preview'
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [name, setName] = useState('')
  const [tier, setTier] = useState(3)
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  async function handlePreview(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setLoadingPreview(true)
    setPreviewError('')
    try {
      const data = await previewSource(trimmed, feedType)
      setPreview(data)
      setStep('preview')
      // Auto-suggest name from domain
      try {
        const domain = new URL(trimmed).hostname.replace(/^www\./, '')
        setName(domain)
      } catch {}
    } catch (err) {
      setPreviewError(err.message.replace(/^API \d+: /, ''))
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setAddError('')
    try {
      const source = await addSource(name.trim(), url.trim(), tier, feedType, analyst)
      onAdded(source)
    } catch (err) {
      setAddError(err.message.replace(/^API \d+: /, ''))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        padding: '1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
          Add Source
        </span>
        <button
          onClick={onCancel}
          style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Step 1 — URL input */}
      <form onSubmit={handlePreview}>
        <div className="flex gap-2 items-end">
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Feed URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              style={inputStyle}
              disabled={step === 'preview' || loadingPreview}
              autoFocus
            />
          </div>
          <div style={{ width: 80 }}>
            <label style={labelStyle}>Type</label>
            <select
              value={feedType}
              onChange={e => setFeedType(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              disabled={step === 'preview' || loadingPreview}
            >
              <option value="rss">RSS</option>
              <option value="json">JSON</option>
            </select>
          </div>
          {step === 'url' && (
            <button
              type="submit"
              disabled={!url.trim() || loadingPreview}
              style={{
                padding: '0.4rem 0.75rem',
                background: 'var(--accent)',
                color: 'white',
                borderRadius: 6,
                fontSize: '0.8125rem',
                fontWeight: 500,
                opacity: (!url.trim() || loadingPreview) ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {loadingPreview ? 'Fetching…' : 'Preview'}
            </button>
          )}
          {step === 'preview' && (
            <button
              type="button"
              onClick={() => { setStep('url'); setPreview(null); setPreviewError('') }}
              style={{
                padding: '0.4rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              Change URL
            </button>
          )}
        </div>
        {previewError && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#E11D48' }}>
            {previewError}
          </p>
        )}
      </form>

      {/* Step 2 — Preview + confirm */}
      {step === 'preview' && preview && (
        <div style={{ marginTop: '1rem' }}>
          {/* Sample articles */}
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {preview.entries.length > 0
              ? `${preview.total_found} items found — showing ${preview.entries.length} sample${preview.entries.length !== 1 ? 's' : ''}`
              : 'Feed returned no items.'}
          </p>
          {preview.entries.length > 0 && (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 6,
                overflow: 'hidden',
                marginBottom: '1rem',
              }}
            >
              {preview.entries.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.6rem 0.75rem',
                    borderBottom: i < preview.entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    background: 'var(--bg-page)',
                  }}
                >
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'var(--accent)',
                      display: 'block',
                      marginBottom: entry.summary ? '0.2rem' : 0,
                    }}
                  >
                    {entry.title}
                  </a>
                  {entry.summary && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      {entry.summary}
                    </p>
                  )}
                  {entry.published_at && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                      {formatDate(entry.published_at)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Name + tier + confirm */}
          <form onSubmit={handleAdd}>
            <div className="flex gap-3 items-end">
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Source name <span style={{ color: '#E11D48' }}>*</span></label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Krebs on Security"
                  style={inputStyle}
                  disabled={adding}
                />
              </div>
              <div style={{ width: 110 }}>
                <label style={labelStyle}>Tier (1–5)</label>
                <select
                  value={tier}
                  onChange={e => setTier(Number(e.target.value))}
                  style={{ ...inputStyle, width: '100%' }}
                  disabled={adding}
                >
                  <option value={1}>1 — Authoritative</option>
                  <option value={2}>2 — Official</option>
                  <option value={3}>3 — Reputable</option>
                  <option value={4}>4 — Community</option>
                  <option value={5}>5 — Low signal</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!name.trim() || adding}
                style={{
                  padding: '0.4rem 0.875rem',
                  background: 'var(--accent)',
                  color: 'white',
                  borderRadius: 6,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  opacity: (!name.trim() || adding) ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {adding ? 'Adding…' : 'Add Source'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  padding: '0.4rem 0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
            </div>
            {addError && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#E11D48' }}>
                {addError}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
