import { useState } from 'react'

export default function UserPrompt({ onSave, existingName = '' }) {
  const [name, setName] = useState(existingName)
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter your name to continue.')
      return
    }
    onSave(trimmed)
  }

  const isRename = !!existingName

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-lg shadow-lg"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="p-8">
          <div className="mb-6">
            <h2
              className="text-base font-semibold mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              {isRename ? 'Change your name' : 'Welcome to SOCFeed'}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {isRename
                ? 'Update the name shown in the audit log for your actions.'
                : 'Enter your name so your actions are attributed correctly in the audit log.'}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="e.g. Sarah"
              autoFocus
              className="w-full px-3 py-2 rounded-md text-sm outline-none transition-shadow"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => (e.target.style.boxShadow = '0 0 0 2px var(--accent)')}
              onBlur={e => (e.target.style.boxShadow = 'none')}
            />
            {error && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--sev-critical)' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="w-full mt-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              {isRename ? 'Save' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
