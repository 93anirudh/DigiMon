import { useEffect, useState } from 'react'
import { McpMarketplace } from './McpMarketplace'

// ── Reusable key input ────────────────────────────────
function ApiKeyInput({
  label, hint, storeKey, placeholder
}: {
  label: string; hint: string; storeKey: string; placeholder: string
}) {
  const [val, setVal] = useState('')
  const [saved, setSaved] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.electronAPI.storeGet(storeKey).then(k => { if (k) setVal(k) })
  }, [storeKey])

  const save = async () => {
    if (!val.trim()) return
    await window.electronAPI.storeSet(storeKey, val.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="field-hint">{hint}</div>
      <div className="field-row">
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="text-input"
            type={visible ? 'text' : 'password'}
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder={placeholder}
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
          >
            {visible ? '◻' : '◼'}
          </button>
        </div>
        <button className={`btn-save ${saved ? 'saved' : ''}`} onClick={save}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────
type Tab = 'ai' | 'integrations'

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('ai')

  return (
    <div className="settings-shell">
      <div className="settings-header">
        <div className="settings-title">Settings</div>
        <div className="settings-sub">Configure your AI engine and connected tools</div>
      </div>

      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === 'ai' ? 'active' : ''}`}
          onClick={() => setTab('ai')}
        >
          AI Model
        </button>
        <button
          className={`settings-tab ${tab === 'integrations' ? 'active' : ''}`}
          onClick={() => setTab('integrations')}
        >
          Integrations
        </button>
      </div>

      <div className="settings-body">
        {tab === 'ai' && <AiTab />}
        {tab === 'integrations' && <IntegrationsTab />}
      </div>
    </div>
  )
}

function AiTab() {
  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">API Keys</div>
        <div className="settings-card">
          <div className="settings-card-body">
            <ApiKeyInput
              label="Gemini API Key (Primary)"
              hint="Get your free key at aistudio.google.com/apikey · This is the primary model"
              storeKey="gemini_api_key"
              placeholder="AIza…"
            />
            <hr className="settings-divider" />
            <ApiKeyInput
              label="Grok API Key (Fallback)"
              hint="Get your key at console.x.ai · Used automatically when Gemini hits its quota limit"
              storeKey="grok_api_key"
              placeholder="xai-…"
            />
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>
          All API keys are stored locally on your machine inside your AppData folder.
          They are never transmitted to any external service except the AI providers directly.
          When Gemini hits its quota, Practice OS will ask before switching to Grok.
        </p>
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
    </>
  )
}

function IntegrationsTab() {
  return (
    <div className="settings-section">
      <div className="settings-section-title">MCP Tool Integrations</div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
        Connect external tools to extend the AI's capabilities.
        API keys for each tool are stored locally and never shared.
        Toggling a server automatically reconnects all active integrations.
      </p>
      <div style={{ height: 520 }}>
        <McpMarketplace />
      </div>
    </div>
  )
}
