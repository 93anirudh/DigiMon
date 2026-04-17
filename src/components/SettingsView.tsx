import { useEffect, useState } from 'react'
import { McpMarketplace } from './McpMarketplace'
import { WhatsAppSetup } from './WhatsAppSetup'

function ApiKeyInput() {
  const [val, setVal] = useState('')
  const [saved, setSaved] = useState(false)
  const [visible, setVisible] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    window.electronAPI.storeGet('gemini_api_key').then(k => { if (k) setVal(k) })
  }, [])

  const save = async () => {
    if (!val.trim()) return
    setTesting(true); setTestResult(null)
    const test = await window.electronAPI.testApiKey(val.trim())
    setTesting(false)
    setTestResult(test)
    if (test.ok) {
      await window.electronAPI.storeSet('gemini_api_key', val.trim())
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div>
      <div className="field-label">Gemini API Key</div>
      <div className="field-hint">
        Get your key at aistudio.google.com/apikey · Pay-as-you-go pricing applies
      </div>
      <div className="field-row">
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="text-input"
            type={visible ? 'text' : 'password'}
            value={val}
            onChange={e => { setVal(e.target.value); setTestResult(null) }}
            placeholder="AIza…"
            onKeyDown={e => e.key === 'Enter' && save()}
            style={{ width: '100%', paddingRight: 36 }}
          />
          <button
            onClick={() => setVisible(v => !v)}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              background: 'none', border: 'none',
              color: 'var(--text3)', cursor: 'pointer', fontSize: 12,
            }}
          >{visible ? '◻' : '◼'}</button>
        </div>
        <button
          className={`btn-save ${saved ? 'saved' : ''}`}
          onClick={save}
          disabled={testing}
        >
          {testing ? 'Testing…' : saved ? '✓ Saved' : 'Verify & Save'}
        </button>
      </div>
      {testResult && !testResult.ok && (
        <div className="setup-result err" style={{ marginTop: 8 }}>✗ {testResult.error}</div>
      )}
    </div>
  )
}

type Tab = 'general' | 'integrations'

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className="settings-shell">
      <div className="settings-header">
        <div className="settings-title">Settings</div>
        <div className="settings-sub">Configure integrations and advanced options</div>
      </div>

      <div className="settings-tabs">
        <button className={`settings-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
          General
        </button>
        <button className={`settings-tab ${tab === 'integrations' ? 'active' : ''}`} onClick={() => setTab('integrations')}>
          Integrations
        </button>
      </div>

      <div className="settings-body">
        {tab === 'general' && <GeneralTab />}
        {tab === 'integrations' && <IntegrationsTab />}
      </div>
    </div>
  )
}

function GeneralTab() {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">About the AI</div>
        <div className="settings-card">
          <div className="settings-card-body">
            <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.65 }}>
              DigiMon uses Google's Gemini models. The default is <strong>Gemini 3 Pro</strong>
              for best quality. If rate limits or network issues hit, DigiMon silently falls back
              to <strong>Gemini 2.5 Pro</strong>, then <strong>Gemini 2.5 Flash</strong>.
              You can also click the model pill in any chat to switch manually.
            </p>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Keyboard Shortcuts</div>
        <div className="settings-card">
          <div className="settings-card-body">
            {[
              ['New conversation', 'Ctrl + N'],
              ['Open settings', 'Ctrl + ,'],
              ['Close settings', 'Escape'],
              ['Send message', 'Enter'],
              ['New line in message', 'Shift + Enter'],
            ].map(([action, key]) => (
              <div key={action} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{action}</span>
                <kbd style={{
                  padding: '3px 8px', borderRadius: 'var(--r-sm)',
                  background: 'var(--surface2)', border: '1px solid var(--border-md)',
                  fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font)',
                }}>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <button
          onClick={() => setAdvancedOpen(v => !v)}
          style={{
            width: '100%', textAlign: 'left',
            background: 'transparent', border: '1px solid var(--border-md)',
            borderRadius: 'var(--r-sm)', padding: '10px 14px',
            color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500,
          }}
        >
          <span>
            <span style={{ color: 'var(--accent)', marginRight: 6 }}>⚙</span>
            Advanced — API Key
          </span>
          <span style={{ color: 'var(--text3)' }}>{advancedOpen ? '▲' : '▼'}</span>
        </button>

        {advancedOpen && (
          <div style={{ marginTop: 12 }}>
            <div className="settings-card">
              <div className="settings-card-body">
                <ApiKeyInput />
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>
              Your key is stored locally in your AppData folder, never transmitted anywhere except to Google directly.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function IntegrationsTab() {
  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">WhatsApp</div>
        <WhatsAppSetup />
      </div>

      <div className="settings-section">
        <div className="settings-section-title">MCP Integrations</div>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
          Extend what DigiMon can do. Click <strong>Enable</strong> to install and test-connect;
          the integration activates automatically when you ask for something that needs it.
        </p>
        <div style={{ height: 520 }}>
          <McpMarketplace />
        </div>
      </div>
    </>
  )
}
