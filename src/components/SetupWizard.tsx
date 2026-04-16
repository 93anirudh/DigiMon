import { useState } from 'react'

interface Props {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState<'intro' | 'key'>('intro')
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const handleSave = async () => {
    if (!key.trim()) return
    setTesting(true)
    setResult(null)

    const test = await window.electronAPI.testApiKey('gemini', key.trim())
    if (test.ok) {
      await window.electronAPI.storeSet('gemini_api_key', key.trim())
      setTesting(false)
      setResult({ ok: true })
      setTimeout(onComplete, 600)
    } else {
      setTesting(false)
      setResult({ ok: false, error: test.error })
    }
  }

  if (step === 'intro') {
    return (
      <div className="overlay">
        <div className="modal setup-modal">
          <div className="setup-logo">🏛️</div>
          <div className="setup-title">Welcome to DigiMon</div>
          <div className="setup-sub">
            A local desktop agent for Indian CA firms. Runs entirely on your machine — no data leaves except to the AI you choose.
          </div>

          <div className="setup-features">
            <div className="setup-feature">
              <span className="setup-feature-icon">⚡</span>
              <div>
                <div className="setup-feature-title">Automate repetitive work</div>
                <div className="setup-feature-desc">GST, TDS, Tally exports, reconciliation, audit checklists</div>
              </div>
            </div>
            <div className="setup-feature">
              <span className="setup-feature-icon">🔒</span>
              <div>
                <div className="setup-feature-title">Your data stays local</div>
                <div className="setup-feature-desc">Files read on your PC, nothing uploaded to any server</div>
              </div>
            </div>
            <div className="setup-feature">
              <span className="setup-feature-icon">🛡️</span>
              <div>
                <div className="setup-feature-title">Asks before destructive actions</div>
                <div className="setup-feature-desc">Delete, move, install — always shows the command first</div>
              </div>
            </div>
          </div>

          <button className="btn-primary" style={{ width: '100%' }} onClick={() => setStep('key')}>
            Get started →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay">
      <div className="modal setup-modal">
        <div className="setup-title" style={{ marginTop: 0 }}>One more step</div>
        <div className="setup-sub">
          DigiMon needs an AI key to work. Gemini is free and takes 30 seconds to get.
        </div>

        <ol className="setup-steps">
          <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a></li>
          <li>Click "Create API key" (sign in with any Google account)</li>
          <li>Copy the key and paste below</li>
        </ol>

        <div className="field-label" style={{ marginTop: 14 }}>Gemini API Key</div>
        <input
          type="password"
          className="text-input"
          style={{ width: '100%' }}
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="AIza…"
          disabled={testing}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />

        {result?.ok && (
          <div className="setup-result ok">✓ Key works. Taking you in…</div>
        )}
        {result && !result.ok && (
          <div className="setup-result err">✗ {result.error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-ghost" onClick={() => setStep('intro')} disabled={testing}>
            ← Back
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={handleSave}
            disabled={testing || !key.trim()}
          >
            {testing ? 'Testing…' : 'Verify & continue'}
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text3)', textAlign: 'center' }}>
          Your key stays on this machine in an encrypted file.
        </div>
      </div>
    </div>
  )
}
